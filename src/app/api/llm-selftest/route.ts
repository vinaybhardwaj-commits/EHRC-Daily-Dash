/* ──────────────────────────────────────────────────────────────────
   LLM self-test (admin / cron gated)
   Pings Gemini 2.5-pro, Gemini 2.5-flash (both on Vertex) AND Ollama
   INDEPENDENTLY of the GEMINI_* routing flags, so V can confirm Vertex
   works before flipping GEMINI_ALL. Mirrors ETA's /api/admin/llm-selftest.

   Call: GET /api/llm-selftest  with  Authorization: Bearer <SERVICE_OBSERVATIONS_SECRET | CRON_SECRET>
   ────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cron-auth';
import {
  llm,
  LLM_MODELS,
  geminiConfigured,
  getGeminiChatClient,
  vertexModelName,
  GEMINI_MODEL,
  GEMINI_FLASH_MODEL,
} from '@/lib/llm';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PING = [{ role: 'user' as const, content: 'Reply with the single word: ok' }];

interface PingResult {
  ok: boolean;
  model: string;
  ms: number;
  sample?: string;
  error?: string;
}

async function pingGemini(model: string): Promise<PingResult> {
  const started = Date.now();
  try {
    const client = await getGeminiChatClient();
    const r = await client.chat.completions.create({
      model: vertexModelName(model),
      messages: PING,
      max_tokens: 4096, // pad for 2.5 hidden "thinking" tokens
      temperature: 0,
    });
    const text = r.choices[0]?.message?.content?.trim() || '';
    return { ok: true, model, ms: Date.now() - started, sample: text.slice(0, 40) };
  } catch (e) {
    return { ok: false, model, ms: Date.now() - started, error: String((e as Error).message).slice(0, 200) };
  }
}

async function pingOllama(): Promise<PingResult> {
  const started = Date.now();
  const client = llm();
  if (!client) return { ok: false, model: LLM_MODELS.FAST, ms: 0, error: 'LLM_BASE_URL unset' };
  try {
    const r = await client.chat.completions.create({
      model: LLM_MODELS.FAST,
      messages: PING,
      max_tokens: 16,
      temperature: 0,
    });
    const text = r.choices[0]?.message?.content?.trim() || '';
    return { ok: true, model: LLM_MODELS.FAST, ms: Date.now() - started, sample: text.slice(0, 40) };
  } catch (e) {
    return { ok: false, model: LLM_MODELS.FAST, ms: Date.now() - started, error: String((e as Error).message).slice(0, 200) };
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const configured = geminiConfigured();
  const notConfigured = (model: string): PingResult => ({
    ok: false,
    model,
    ms: 0,
    error: 'gemini not configured (GCP_PROJECT / GCP_SA_KEY missing)',
  });

  const [pro, flash, ollama] = await Promise.all([
    configured ? pingGemini(GEMINI_MODEL) : Promise.resolve(notConfigured(GEMINI_MODEL)),
    configured ? pingGemini(GEMINI_FLASH_MODEL) : Promise.resolve(notConfigured(GEMINI_FLASH_MODEL)),
    pingOllama(),
  ]);

  const flags = {
    GEMINI_ALL: process.env.GEMINI_ALL === '1',
    GEMINI_REASONING: process.env.GEMINI_REASONING === '1',
    GEMINI_UTILITY: process.env.GEMINI_UTILITY === '1',
    GCP_LOCATION: process.env.GCP_LOCATION || 'asia-northeast1',
    GCP_PROJECT_set: !!process.env.GCP_PROJECT,
    GCP_SA_KEY_set: !!process.env.GCP_SA_KEY,
  };

  // Healthy if at least one provider answers; the dashboard never goes dark while
  // Ollama is up even if Vertex is misconfigured.
  const ok = ollama.ok || pro.ok || flash.ok;

  return NextResponse.json({
    ok,
    configured,
    flags,
    providers: { 'gemini:pro': pro, 'gemini:flash': flash, ollama },
  });
}
