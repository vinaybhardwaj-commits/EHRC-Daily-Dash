/* ──────────────────────────────────────────────────────────────────
   Template LLM Adapter — Phase 1 (no external LLM required)
   Uses question_template strings from rubric rules directly
   ────────────────────────────────────────────────────────────────── */

import type { LLMAdapter, DetectedAnomaly, DepartmentRubric, FormQuestion } from '../types';

export class TemplateLLMAdapter implements LLMAdapter {
  async generateQuestions(
    anomalies: DetectedAnomaly[],
    _rubric: DepartmentRubric,
    _formData: Record<string, unknown>
  ): Promise<FormQuestion[]> {
    return anomalies.map((anomaly, idx) => ({
      id: `q-${Date.now()}-${idx}`,
      text: anomaly.fallback_question,
      severity: anomaly.severity,
      related_fields: Object.keys(anomaly.triggered_values),
      source_rule_id: anomaly.rule_id,
    }));
  }

  async isAvailable(): Promise<boolean> {
    return true; // Always available — no external dependency
  }
}
