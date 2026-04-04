/* ──────────────────────────────────────────────────────────────────
   AI Question Engine — Prompt Builder
   Constructs LLM prompts from anomalies + department context
   ────────────────────────────────────────────────────────────────── */

import type { DetectedAnomaly, DepartmentRubric } from './types';

/**
 * Build a system prompt for the LLM to generate follow-up questions.
 */
export function buildSystemPrompt(rubric: DepartmentRubric): string {
  return `You are a hospital operations analyst at EHRC (Even Hospital Race Course Road), a 150-bed multi-specialty hospital in Bangalore, India.

Your role is to review daily department submissions and generate specific, professional follow-up questions when you detect anomalies in the data.

Department: ${rubric.context.department_name}
Typical daily volume: ${rubric.context.typical_daily_volume}
Key concerns: ${rubric.context.key_concerns.join(', ')}
Context: ${rubric.context.historical_context}

RULES FOR GENERATING QUESTIONS:
- Be specific — reference actual numbers from the submission
- Be professional and respectful — these are senior healthcare professionals
- Be concise — one clear question per anomaly, 1-2 sentences max
- If multiple anomalies are related, combine into one question
- Use Indian medical terminology where appropriate (e.g., "lakhs" not "hundred thousands")
- Never be accusatory — frame as clarification requests
- Maximum 3 questions total

RESPONSE FORMAT:
Return ONLY a JSON array of question objects. No markdown, no explanation, no code fences.
Each object has: "text" (the question), "severity" (critical/high/medium/low), "related_fields" (array of field IDs)

Example:
[{"text": "You reported 3 deaths today but the summary field is empty. Could you provide brief details about these cases?", "severity": "critical", "related_fields": ["deaths", "deathDetails"]}]`;
}

/**
 * Build the user prompt with the actual submission data and anomalies.
 */
export function buildUserPrompt(
  formData: Record<string, unknown>,
  anomalies: DetectedAnomaly[],
  historicalSummary?: string
): string {
  // Format the submitted data
  const fieldLines = Object.entries(formData)
    .filter(([key]) => key !== 'date')
    .map(([key, value]) => {
      const displayVal = value === '' || value === null || value === undefined ? '[empty]' : String(value);
      return `  ${key}: ${displayVal}`;
    })
    .join('\n');

  // Format anomalies
  const anomalyLines = anomalies.map((a, i) => {
    let detail = `${i + 1}. [${a.severity.toUpperCase()}] ${a.rule_name}`;
    if (a.deviation_pct) {
      detail += ` (${a.deviation_pct}% deviation from average)`;
    }
    const vals = Object.entries(a.triggered_values)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    detail += `\n   Values: ${vals}`;
    return detail;
  }).join('\n');

  let prompt = `Today's submission (${formData.date || 'today'}):\n${fieldLines}\n\nAnomalies detected:\n${anomalyLines}`;

  if (historicalSummary) {
    prompt += `\n\nHistorical context (last 7 days):\n${historicalSummary}`;
  }

  prompt += '\n\nGenerate follow-up questions for the department head.';

  return prompt;
}

/**
 * Build a brief historical summary string from raw historical data.
 */
export function buildHistoricalSummary(
  historicalData: Record<string, unknown>[],
  relevantFields: string[]
): string {
  if (historicalData.length === 0) return '';

  const summaries: string[] = [];

  for (const field of relevantFields) {
    const values = historicalData
      .map(d => d[field])
      .filter(v => v !== null && v !== undefined && v !== '');

    if (values.length === 0) continue;

    const numericValues = values
      .map(v => typeof v === 'number' ? v : Number(String(v).replace(/,/g, '')))
      .filter(n => !isNaN(n));

    if (numericValues.length > 0) {
      const avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
      const min = Math.min(...numericValues);
      const max = Math.max(...numericValues);
      summaries.push(`${field}: avg=${Math.round(avg * 10) / 10}, range=[${min}-${max}] over ${numericValues.length} days`);
    }
  }

  return summaries.length > 0 ? summaries.join('\n') : '';
}
