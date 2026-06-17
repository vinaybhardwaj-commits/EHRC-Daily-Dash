// src/lib/llm.ts
// Central LLM client.
//   - Default + fallback: Ollama on the Mac Mini via Cloudflare Tunnel (`llm()`).
//   - Hybrid backend (GEMINI.x): `routedChat(tier, params)` routes to Gemini on
//     Vertex (Tokyo / asia-northeast1) when configured + flagged, with automatic
//     soft-fail back to Ollama. All inference stays inside the GCP project/region
//     pinned by GCP_LOCATION (data residency). Pattern mirrors ETA/CAT.
// Uses OpenAI SDK (both Ollama and Vertex expose an OpenAI-compatible API).

import OpenAI from 'openai';
import { getVertexAccessToken } from './gcp-auth';

function getLLMClient(): OpenAI | null {
  const baseURL = process.env.LLM_BASE_URL;
  if (!baseURL) return null;

  return new OpenAI({
    baseURL,
    apiKey: process.env.LLM_API_KEY || 'ollama',
    timeout: 30_000, // 30 second timeout for local inference
  });
}

// Lazy singleton — only created when first accessed
let _client: OpenAI | null | undefined;

export function llm(): OpenAI | null {
  if (_client === undefined) {
    _client = getLLMClient();
  }
  return _client;
}

// Available models on Mac Mini:
// Qwen 2.5 14B is the sole model — used for both complex and fast tasks
export const LLM_MODELS = {
  PRIMARY: 'qwen2.5:14b',   // Complex: briefings, gap analysis, predictions, question gen
  FAST: 'qwen2.5:14b',      // Fast: trend classification, simple categorisation
} as const;

export default llm;

// ─────────────────────────────────────────────────────────────────────────────
// Vertex AI (Gemini) — hybrid backend.
// `llm()` above stays the default + fallback; Gemini is used only when fully
// configured AND a flag opts the tier in. Off by default → production is
// unchanged until GEMINI_ALL / GEMINI_REASONING / GEMINI_UTILITY is set.
// ─────────────────────────────────────────────────────────────────────────────

/** Region — must be one where both 2.5-pro and 2.5-flash are available. */
const GCP_LOCATION = process.env.GCP_LOCATION || 'asia-northeast1'; // Tokyo (matches ETA/CAT)
const GCP_PROJECT = process.env.GCP_PROJECT || '';

/** Reasoning model (SREWS scoring, governance gen, cross-dept synthesis, gap-analysis). */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
/** Utility model (exec/trend summaries, anomaly framing, slash-commands, WA insights). */
export const GEMINI_FLASH_MODEL = process.env.GEMINI_FLASH_MODEL || 'gemini-2.5-flash';

function geminiTimeoutMs(): number {
  return Number(process.env.GEMINI_TIMEOUT_MS) || 60_000;
}

/** True only when every piece needed to call Vertex is present. */
export function geminiConfigured(): boolean {
  return Boolean(GCP_PROJECT && process.env.GCP_SA_KEY);
}

function vertexBaseURL(): string {
  const host =
    GCP_LOCATION === 'global'
      ? 'aiplatform.googleapis.com'
      : `${GCP_LOCATION}-aiplatform.googleapis.com`;
  return `https://${host}/v1beta1/projects/${GCP_PROJECT}/locations/${GCP_LOCATION}/endpoints/openapi`;
}

/** Vertex requires the publisher prefix (google/gemini-2.5-pro). */
export function vertexModelName(model: string): string {
  return model.startsWith('google/') ? model : `google/${model}`;
}

/**
 * OpenAI-SDK client bound to the Vertex OpenAI-compatible endpoint, authenticated
 * with a freshly-minted (cached) access token. Created per call so the bearer is
 * always current; the token itself is cached in gcp-auth.
 */
export async function getGeminiChatClient(): Promise<OpenAI> {
  const token = await getVertexAccessToken();
  return new OpenAI({ baseURL: vertexBaseURL(), apiKey: token, timeout: geminiTimeoutMs() });
}

export type LlmTier = 'reasoning' | 'utility';

/** The Gemini model to use for a tier, or undefined to stay on local Ollama. */
function geminiModelForTier(tier: LlmTier): string | undefined {
  if (!geminiConfigured()) return undefined;
  const all = process.env.GEMINI_ALL === '1';
  if (tier === 'reasoning') {
    return all || process.env.GEMINI_REASONING === '1' ? GEMINI_MODEL : undefined;
  }
  return all || process.env.GEMINI_UTILITY === '1' ? GEMINI_FLASH_MODEL : undefined;
}

/**
 * True if this tier currently routes to Gemini (configured + flagged on). Call
 * sites use this to widen concurrency when there's no single-Mac-Mini bottleneck.
 */
export function isTierOnGemini(tier: LlmTier): boolean {
  return !!geminiModelForTier(tier);
}

type ChatParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
type ChatResult = OpenAI.Chat.Completions.ChatCompletion;

/**
 * Provider-routing chat wrapper. When the tier is flagged on AND Vertex is
 * configured, runs on Gemini (padding max_tokens so 2.5's hidden thinking tokens
 * don't truncate the visible answer) and falls back to local Ollama on ANY error
 * (5xx / timeout / parse) — a Vertex outage must never blank the dashboard. With
 * Gemini off it is byte-for-byte the existing `llm().chat.completions.create`.
 * The `params.model` is the Ollama model used on the fallback path (pass
 * LLM_MODELS.PRIMARY/FAST as today).
 */
export async function routedChat(tier: LlmTier, params: ChatParams): Promise<ChatResult> {
  const geminiModel = geminiModelForTier(tier);
  if (geminiModel) {
    const started = Date.now();
    try {
      const client = await getGeminiChatClient();
      const baseMax = Number(params.max_tokens) || 1024;
      const pad = tier === 'reasoning' ? 8192 : 2048;
      const gParams: ChatParams = {
        ...params,
        model: vertexModelName(geminiModel),
        max_tokens: baseMax + pad,
      };
      const completion = await client.chat.completions.create(gParams);
      console.log(
        `[routedChat] provider=gemini:${tier === 'reasoning' ? 'pro' : 'flash'} model=${geminiModel} ms=${Date.now() - started}`,
      );
      return completion;
    } catch (e) {
      // Log the fallback so silent Mac-Mini usage (e.g. Flash unavailable) is visible.
      console.warn(
        `[routedChat] gemini ${geminiModel} failed → ollama fallback (${Date.now() - started}ms):`,
        String((e as Error).message).slice(0, 200),
      );
    }
  }
  // Ollama (default + fallback).
  const client = llm();
  if (!client) {
    throw new Error('[routedChat] no LLM available: LLM_BASE_URL unset and Gemini off/unconfigured');
  }
  const started = Date.now();
  const completion = await client.chat.completions.create(params);
  console.log(`[routedChat] provider=ollama:${params.model} ms=${Date.now() - started}`);
  return completion;
}
