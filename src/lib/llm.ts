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
// 'qwen2.5:14b'  - High intelligence, slower (~20-30 tok/s)
// 'llama3.1:8b'  - Fast, great for tool use (~60 tok/s)
export const LLM_MODELS = {
  QWEN_14B: 'qwen2.5:14b',
  LLAMA_8B: 'llama3.1:8b',
} as const;

export default llm;
