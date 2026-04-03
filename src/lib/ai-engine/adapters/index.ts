import type { LLMAdapter } from '../types';
import { TemplateLLMAdapter } from './template-adapter';

/* ── Adapter Factory ─────────────────────────────────────────────── */

export function getLLMAdapter(): LLMAdapter {
  // Phase 2: check for Qwen endpoint
  // if (process.env.QWEN_API_URL) return new QwenLLMAdapter();

  return new TemplateLLMAdapter();
}

export { TemplateLLMAdapter };
