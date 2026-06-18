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

/* ── F.1 — gap-analysis writes ───────────────────────────────────── */

export interface NewQuestion {
  dept_slug: string;
  field_spec: SmartFormField;
  rationale: string;
  priority: number;
  recurrence: AdaptiveRecurrence;
  dedupe_key: string;
  source?: string;
}

/**
 * Insert one generated question. Idempotent on the partial unique index
 * (dept_slug, dedupe_key) WHERE status='open' — a re-asked open gap is a no-op.
 * Returns the new id, or null if it conflicted (already open).
 */
export async function insertQuestion(q: NewQuestion): Promise<number | null> {
  const res = await sql`
    INSERT INTO adaptive_form_questions
      (dept_slug, field_spec, rationale, priority, recurrence, dedupe_key, source)
    VALUES (
      ${q.dept_slug}, ${JSON.stringify(q.field_spec)}::jsonb, ${q.rationale},
      ${q.priority}, ${q.recurrence}, ${q.dedupe_key}, ${q.source ?? 'gap_analysis'}
    )
    ON CONFLICT (dept_slug, dedupe_key) WHERE status = 'open' DO NOTHING
    RETURNING id`;
  const id = res.rows[0]?.id as number | undefined;
  if (id) await recordEvent(id, 'published', 'even-ai', { dept: q.dept_slug, dedupe_key: q.dedupe_key });
  return id ?? null;
}

/** How many questions are currently OPEN for a department (flood guard). */
export async function countOpenByDept(slug: string): Promise<number> {
  const res = await sql`
    SELECT COUNT(*)::int AS n FROM adaptive_form_questions
    WHERE dept_slug = ${slug} AND status = 'open'`;
  return Number(res.rows[0]?.n ?? 0);
}

/**
 * Dedupe keys for a dept that were recently answered/expired/retired — so the
 * nightly job doesn't immediately re-ask a gap that was just resolved.
 */
export async function recentlyResolvedDedupeKeys(slug: string, days = 14): Promise<Set<string>> {
  const res = await sql`
    SELECT DISTINCT dedupe_key FROM adaptive_form_questions
    WHERE dept_slug = ${slug}
      AND dedupe_key IS NOT NULL
      AND status IN ('answered','expired','retired')
      AND updated_at > NOW() - make_interval(days => ${days})`;
  return new Set(res.rows.map(r => r.dedupe_key as string));
}

/* ── F.2 — form injection + answer capture ───────────────────────── */

/** Open questions for a department, highest-priority first — for form injection. */
export async function listOpenForDept(slug: string): Promise<AdaptiveQuestion[]> {
  const res = await sql`
    SELECT * FROM adaptive_form_questions
    WHERE dept_slug = ${slug} AND status = 'open'
    ORDER BY priority ASC, created_at ASC`;
  return res.rows as AdaptiveQuestion[];
}

/** Record a HOD's answer to a question and close it (stops recurrence). */
export async function answerQuestion(id: number, value: unknown): Promise<boolean> {
  const res = await sql`
    UPDATE adaptive_form_questions
    SET status = 'answered', answer_value = ${JSON.stringify(value ?? null)}::jsonb,
        answered_date = CURRENT_DATE, updated_at = NOW()
    WHERE id = ${id} AND status = 'open'
    RETURNING id`;
  if (res.rowCount === 0) return false;
  await recordEvent(id, 'answered', 'hod', { value });
  return true;
}

/** F.2b — 'until_answered' questions that expired unanswered recently, for V's
    09:45 escalation digest. (Default 26h window covers the day's lifecycle run.) */
export async function recentlyExpiredUnanswered(hours = 26): Promise<{ dept_slug: string; label: string }[]> {
  const res = await sql`
    SELECT dept_slug, field_spec FROM adaptive_form_questions
    WHERE status = 'expired' AND recurrence = 'until_answered'
      AND updated_at > NOW() - make_interval(hours => ${hours})
    ORDER BY updated_at DESC LIMIT 20`;
  return res.rows.map(r => ({ dept_slug: r.dept_slug as string, label: (r.field_spec as SmartFormField)?.label || '' }));
}
