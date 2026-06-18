/* F.2 — daily lifecycle for injected adaptive questions.
   Runs once per working-day morning. Tracks how many working days each open
   question has been shown and retires it per its recurrence policy:
     - 'once'           → shown one day, then expire.
     - 'until_answered' → recurs up to ADAPTIVE_RECUR_DAYS (default 5) working
                          days; if still unanswered, expire + flag for escalation.
   Answers (which set status='answered') are handled in capture.ts. */

import { sql } from '@vercel/postgres';
import { recordEvent, type AdaptiveQuestion } from './store';

function recurDays(): number {
  const n = Number(process.env.ADAPTIVE_RECUR_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

export interface ExpiredGap { id: number; dept: string; label: string; days: number; }
export interface LifecycleResult {
  shown: number;
  recurred: number;
  expired: number;
  expiredItems: ExpiredGap[];
}

/** Advance the lifecycle for `date` (today, IST). Idempotent within a day. */
export async function advanceDailyLifecycle(date: string): Promise<LifecycleResult> {
  const res = await sql`SELECT * FROM adaptive_form_questions WHERE status = 'open'`;
  const open = res.rows as AdaptiveQuestion[];
  const cap = recurDays();

  let shown = 0, recurred = 0, expired = 0;
  const expiredItems: ExpiredGap[] = [];

  for (const q of open) {
    const label = q.field_spec?.label || `#${q.id}`;

    // First time shown.
    if (!q.first_shown_date) {
      await sql`
        UPDATE adaptive_form_questions
        SET first_shown_date = ${date}, last_shown_date = ${date}, days_shown = 1, updated_at = NOW()
        WHERE id = ${q.id} AND status = 'open'`;
      await recordEvent(q.id, 'shown', 'even-ai', { date });
      shown += 1;
      continue;
    }

    // Already advanced today — skip (idempotent).
    if (q.last_shown_date === date) continue;

    // 'once' — expire after its single shown day.
    if (q.recurrence === 'once') {
      await sql`UPDATE adaptive_form_questions SET status = 'expired', updated_at = NOW() WHERE id = ${q.id} AND status = 'open'`;
      await recordEvent(q.id, 'expired', 'even-ai', { reason: 'once' });
      expired += 1;
      expiredItems.push({ id: q.id, dept: q.dept_slug, label, days: q.days_shown });
      continue;
    }

    // 'until_answered' — expire once it has already been shown `cap` working days.
    if (q.days_shown >= cap) {
      await sql`UPDATE adaptive_form_questions SET status = 'expired', updated_at = NOW() WHERE id = ${q.id} AND status = 'open'`;
      await recordEvent(q.id, 'expired', 'even-ai', { reason: `unanswered_${cap}d`, days: q.days_shown });
      expired += 1;
      expiredItems.push({ id: q.id, dept: q.dept_slug, label, days: q.days_shown });
      continue;
    }

    // Otherwise recur for another working day.
    await sql`
      UPDATE adaptive_form_questions
      SET days_shown = days_shown + 1, last_shown_date = ${date}, updated_at = NOW()
      WHERE id = ${q.id} AND status = 'open'`;
    await recordEvent(q.id, 'recurred', 'even-ai', { date, days: q.days_shown + 1 });
    recurred += 1;
  }

  return { shown, recurred, expired, expiredItems };
}
