/* ──────────────────────────────────────────────────────────────────
   Adaptive Forms Intelligence — data store (F.0)
   The nightly Gemini-Pro gap-analysis (F.1) writes candidate questions;
   the form renderer (F.2) injects open ones into the right HOD's daily
   form. F.0 ships only: kill switch, caps, list/counts, audit, admin veto.
   ────────────────────────────────────────────────────────────────── */

import { sql } from '@vercel/postgres';
import type { SmartFormField } from '@/lib/form-engine/types';

export type AdaptiveStatus = 'open' | 'answered' | 'expired' | 'retired';
export type AdaptiveRecurrence = 'once' | 'until_answered';

export interface AdaptiveQuestion {
  id: number;
  dept_slug: string;
  field_spec: SmartFormField;       // any of the form engine's 16 field types
  rationale: string | null;         // why the gap matters — shown to V, never the HOD
  priority: number;                 // 1 (highest) .. 5
  status: AdaptiveStatus;
  recurrence: AdaptiveRecurrence;
  first_shown_date: string | null;
  last_shown_date: string | null;
  days_shown: number;
  answered_date: string | null;
  answer_value: unknown;
  dedupe_key: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

/**
 * Master kill switch. The whole Adaptive Forms engine is inert unless this is
 * '1' — independent of MESSAGING_ENABLED and GEMINI_ALL. Unset + redeploy =
 * engine dark (no gap-analysis, no form injection).
 */
export function adaptiveFormsEnabled(): boolean {
  return process.env.ADAPTIVE_FORMS_ENABLED === '1';
}

/** Flood guard: max simultaneously-open AI questions per department. */
export function maxPerDept(): number {
  const n = Number(process.env.ADAPTIVE_MAX_PER_DEPT);
  return Number.isFinite(n) && n > 0 ? n : 2;
}

export interface ListOpts {
  status?: AdaptiveStatus;
  deptSlug?: string;
  limit?: number;
}

const SELECT_COLS = `id, dept_slug, field_spec, rationale, priority, status, recurrence,
  first_shown_date, last_shown_date, days_shown, answered_date, answer_value,
  dedupe_key, source, created_at, updated_at`;

/** List questions, newest/open-first, with optional status + department filters. */
export async function listQuestions(opts: ListOpts = {}): Promise<AdaptiveQuestion[]> {
  const where: string[] = [];
  const params: string[] = [];
  if (opts.status) {
    params.push(opts.status);
    where.push(`status = $${params.length}`);
  }
  if (opts.deptSlug) {
    params.push(opts.deptSlug);
    where.push(`dept_slug = $${params.length}`);
  }
  const limit = Math.min(opts.limit ?? 200, 500);
  const text = `
    SELECT ${SELECT_COLS}
    FROM adaptive_form_questions
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY (status = 'open') DESC, priority ASC, created_at DESC
    LIMIT ${limit}`;
  const res = await sql.query(text, params);
  return res.rows as AdaptiveQuestion[];
}

/** Count of questions grouped by status — drives the console summary. */
export async function statusCounts(): Promise<Record<string, number>> {
  const res = await sql`SELECT status, COUNT(*)::int AS n FROM adaptive_form_questions GROUP BY status`;
  const out: Record<string, number> = {};
  for (const r of res.rows) out[r.status as string] = Number(r.n);
  return out;
}

/** Append a lifecycle event to the immutable audit trail. */
export async function recordEvent(
  questionId: number,
  event: string,
  actor = 'even-ai',
  detail?: unknown,
): Promise<void> {
  await sql`
    INSERT INTO adaptive_question_events (question_id, event, actor, detail)
    VALUES (${questionId}, ${event}, ${actor}, ${detail ? JSON.stringify(detail) : null}::jsonb)`;
}

/**
 * Admin veto. Retire an OPEN question immediately so it stops appearing on the
 * HOD's form. Returns false if the question wasn't open (already answered/etc.).
 */
export async function retireQuestion(id: number, actor: string): Promise<boolean> {
  const res = await sql`
    UPDATE adaptive_form_questions
    SET status = 'retired', updated_at = NOW()
    WHERE id = ${id} AND status = 'open'
    RETURNING id`;
  if (res.rowCount === 0) return false;
  await recordEvent(id, 'retired_by_admin', actor);
  return true;
}
