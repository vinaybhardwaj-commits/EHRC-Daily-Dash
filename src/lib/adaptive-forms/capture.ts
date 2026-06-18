/* F.2 — capture HOD answers to injected adaptive questions on form submit.
   Injected fields are keyed `aiq_<questionId>` (see /api/ai-intelligence/
   form-questions). Anything answered closes that question (stops recurrence).
   Never throws into the submit path — failures are logged, submit unaffected. */

import { answerQuestion } from './store';

const AIQ_RE = /^aiq_(\d+)$/;

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

export async function captureAdaptiveAnswers(
  fields: Record<string, unknown>,
): Promise<{ answered: number }> {
  let answered = 0;
  for (const [key, value] of Object.entries(fields)) {
    const m = AIQ_RE.exec(key);
    if (!m || isEmpty(value)) continue;
    try {
      if (await answerQuestion(Number(m[1]), value)) answered += 1;
    } catch (e) {
      console.error('[adaptive capture] failed for', key, e);
    }
  }
  return { answered };
}
