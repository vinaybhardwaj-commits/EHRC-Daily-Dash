/* ──────────────────────────────────────────────────────────────────
   Qwen LLM Adapter — Phase 2
   Calls Qwen 2.5 14B via Ollama + Cloudflare Tunnel
   Falls back to template adapter on failure
   ────────────────────────────────────────────────────────────────── */

import type { LLMAdapter, DetectedAnomaly, DepartmentRubric, FormQuestion } from '../types';
import { buildSystemPrompt, buildUserPrompt, buildHistoricalSummary } from '../prompt-builder';
import { llm, LLM_MODELS } from '@/lib/llm';
import { TemplateLLMAdapter } from './template-adapter';

const templateFallback = new TemplateLLMAdapter();

export class QwenLLMAdapter implements LLMAdapter {
  async generateQuestions(
    anomalies: DetectedAnomaly[],
    rubric: DepartmentRubric,
    formData: Record<string, unknown>
  ): Promise<FormQuestion[]> {
    const client = llm();

    if (!client) {
      console.log('[QwenAdapter] No LLM client available, falling back to templates');
      return templateFallback.generateQuestions(anomalies, rubric, formData);
    }

    try {
      // Gather relevant fields from all anomalies for historical summary
      const relevantFields = [
        ...new Set(anomalies.flatMap(a => Object.keys(a.triggered_values))),
      ];

      const historicalSummary = anomalies.some(a => a.historical_values)
        ? anomalies
            .filter(a => a.historical_avg !== undefined)
            .map(a => {
              const field = Object.keys(a.triggered_values)[0];
              return `${field}: 7-day avg=${Math.round((a.historical_avg ?? 0) * 10) / 10}, today=${a.triggered_values[field]}`;
            })
            .join('\n')
        : '';

      const systemPrompt = buildSystemPrompt(rubric);
      const userPrompt = buildUserPrompt(formData, anomalies, historicalSummary);

      const response = await client.chat.completions.create({
        model: LLM_MODELS.PRIMARY,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content || '';

      // Parse JSON response from LLM
      const questions = parseQuestionsFromLLM(content, anomalies);

      if (questions.length > 0) {
        console.log(`[QwenAdapter] Generated ${questions.length} questions via Qwen`);
        return questions;
      }

      // If parsing failed, fall back to templates
      console.log('[QwenAdapter] Failed to parse LLM response, falling back to templates');
      return templateFallback.generateQuestions(anomalies, rubric, formData);
    } catch (err) {
      console.error('[QwenAdapter] LLM call failed, falling back to templates:', err);
      return templateFallback.generateQuestions(anomalies, rubric, formData);
    }
  }

  async isAvailable(): Promise<boolean> {
    const client = llm();
    if (!client) return false;

    try {
      // Quick ping — use the fast model
      const response = await client.chat.completions.create({
        model: LLM_MODELS.FAST,
        messages: [{ role: 'user', content: 'Say OK' }],
        max_tokens: 5,
      });
      return !!response.choices[0]?.message?.content;
    } catch {
      return false;
    }
  }
}

/**
 * Parse the LLM's JSON response into FormQuestion objects.
 * Handles various output quirks (code fences, partial JSON, etc.)
 */
function parseQuestionsFromLLM(
  content: string,
  anomalies: DetectedAnomaly[]
): FormQuestion[] {
  // Strip markdown code fences if present
  let cleaned = content
    .replace(/^```json\n?/, '')
    .replace(/^```\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  // Try to find a JSON array in the response
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    cleaned = arrayMatch[0];
  }

  try {
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .slice(0, 3) // Max 3 questions
      .map((q: Record<string, unknown>, idx: number) => {
        const text = String(q.text || q.question || '').trim();
        if (!text) return null;

        // Try to match severity from LLM output, fall back to anomaly severity
        const severity = (['critical', 'high', 'medium', 'low'].includes(String(q.severity))
          ? String(q.severity)
          : anomalies[idx]?.severity || 'medium') as FormQuestion['severity'];

        const relatedFields = Array.isArray(q.related_fields)
          ? q.related_fields.map(String)
          : anomalies[idx]
            ? Object.keys(anomalies[idx].triggered_values)
            : [];

        return {
          id: `qwen-${Date.now()}-${idx}`,
          text,
          severity,
          related_fields: relatedFields,
          source_rule_id: anomalies[idx]?.rule_id || `llm-${idx}`,
        } satisfies FormQuestion;
      })
      .filter((q): q is FormQuestion => q !== null);
  } catch {
    return [];
  }
}
