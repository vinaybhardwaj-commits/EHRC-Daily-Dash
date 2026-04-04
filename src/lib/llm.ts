// src/lib/llm.ts
// Central LLM client — points to Ollama on Mac Mini via Cloudflare Tunnel
// Uses OpenAI SDK (Ollama is OpenAI-compatible)

import OpenAI from 'openai';

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
