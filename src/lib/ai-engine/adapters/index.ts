import type { LLMAdapter } from '../types';
import { TemplateLLMAdapter } from './template-adapter';
import { QwenLLMAdapter } from './qwen-adapter';

/* ── Adapter Factory ─────────────────────────────────────────────── */

export function getLLMAdapter(): LLMAdapter {
  // Use Qwen if LLM_BASE_URL is configured (Mac Mini + Cloudflare Tunnel)
  if (process.env.LLM_BASE_URL) {
    return new QwenLLMAdapter();
  }

  // Fallback: template mode (always available, no external dependency)
  return new TemplateLLMAdapter();
}

export { TemplateLLMAdapter, QwenLLMAdapter };
