// src/lib/governance/watchlist.ts
// GV.5 — IPC post-op surveillance watchlist.
//
// Every operated patient enters the watchlist at surgery and gets a daily
// wound check on the Infection Control form for `window_days` (default 5)
// post-op days. Checks accumulate per patient AND per operating surgeon;
// 'Infected' escalates the row and auto-files a patient_safety incident.

import { sql } from '@vercel/postgres';
import type { SmartFormSection } from '@/lib/form-engine/types';
import type { CaseContext } from './generator';
import { GENERATOR_VERSION } from './generator';

const DEFAULT_WINDOW_DAYS = 5;

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400_000);
}

/** Add yesterday's operated patients to the watchlist (idempotent). */
export async function populateWatchlist(forDate: string): Promise<number> {
  const casesDate = new Date(new Date(forDate + 'T00:00:00Z').getTime() - 86400_000).toISOString().slice(0, 10);
  const rows = await sql`
    SELECT case_ref, patient_name, uhid, procedure_name, surgeon_raw, surgeon_physician_id, case_date::text AS case_date
    FROM ot_case_log
    WHERE case_date = ${casesDate} AND cancelled = false AND patient_name IS NOT NULL
  `;
  let added = 0;
  for (const r of rows.rows) {
    const patientRef = (r.uhid as string) || `${String(r.patient_name).trim().toLowerCase().replace(/\s+/g, '-')}|${r.case_date}`;
    const ins = await sql`
      INSERT INTO governance_watchlist
        (patient_ref, patient_name, procedure_name, surgeon_physician_id, surgeon_raw, surgery_date, window_days, status)
      VALUES (${patientRef}, ${r.patient_name}, ${r.procedure_name}, ${r.surgeon_physician_id}, ${r.surgeon_raw}, ${r.case_date}, ${DEFAULT_WINDOW_DAYS}, 'open')
      ON CONFLICT (patient_ref, surgery_date) DO NOTHING
    `;
    added += ins.rowCount ?? 0;
  }
  return added;
}

/** Close rows whose surveillance window has elapsed (not escalated ones). */
export async function autoCloseExpired(forDate: string): Promise<number> {
  const r = await sql`
    UPDATE governance_watchlist
    SET status = 'closed', closed_at = now()
    WHERE status = 'open'
      AND surgery_date + (window_days || ' days')::interval < ${forDate}::date
  `;
  return r.rowCount ?? 0;
}

/** Build today's IPC checklist sections from open + escalated rows. */
export async function generateIpcQuestions(forDate: string): Promise<{ forDate: string; patients: number; added: number; closed: number }> {
  const added = await populateWatchlist(forDate);
  const closed = await autoCloseExpired(forDate);

  const rows = await sql`
    SELECT id, patient_ref, patient_name, procedure_name, surgeon_raw, surgeon_physician_id,
           surgery_date::text AS surgery_date, status
    FROM governance_watchlist
    WHERE status IN ('open', 'escalated')
    ORDER BY surgery_date DESC, id
    LIMIT 25
  `;

  const sections: SmartFormSection[] = [];
  const context: { cases: Record<string, CaseContext & { watchlist_id: number; pod: number }> } = { cases: {} };
  rows.rows.forEach((r, i) => {
    const key = `w${i}`;
    const id = (metric: string) => `gov__ipc__${key}__${metric}`;
    const pod = daysBetween(r.surgery_date as string, forDate);
    const needsNote = { field: id('woundStatus'), operator: 'in' as const, value: ['Redness / discharge (concern)', 'Infected'] };
    sections.push({
      id: `gov-ipc-${key}`,
      title: `POD ${pod} — ${r.patient_name}`,
      description: [r.procedure_name, r.surgeon_raw && `Surgeon: ${r.surgeon_raw}`, `Surgery ${r.surgery_date}`, r.status === 'escalated' ? '⚠ previously escalated' : null]
        .filter(Boolean).join(' · '),
      fields: [
        { id: id('woundStatus'), label: 'Wound / infection status today', type: 'radio',
          options: ['Clean & dry', 'Redness / discharge (concern)', 'Infected', 'Not seen today'] },
        { id: id('notes'), label: 'Details (site, signs, action taken)', type: 'paragraph',
          showWhen: needsNote,
          requireWhen: { field: id('woundStatus'), operator: 'eq', value: 'Infected' } },
        { id: id('closeTracking'), label: 'Discharged / stop tracking this patient?', type: 'toggle' },
      ],
    });
    context.cases[key] = {
      watchlist_id: r.id as number,
      pod,
      case_ref: r.patient_ref as string,
      surgeon_raw: (r.surgeon_raw as string) || null,
      physician_id: (r.surgeon_physician_id as string) || null,
      physician_name: null,
      match_status: r.surgeon_physician_id ? 'matched' : 'unmatched',
      procedure: (r.procedure_name as string) || null,
      patient: (r.patient_name as string) || null,
    };
  });

  await sql`
    INSERT INTO governance_question_sets (for_date, slug, sections, context, generator_version)
    VALUES (${forDate}, ${'infection-control'}, ${JSON.stringify(sections)}::jsonb, ${JSON.stringify(context)}::jsonb, ${GENERATOR_VERSION})
    ON CONFLICT (for_date, slug) DO UPDATE SET
      sections = EXCLUDED.sections, context = EXCLUDED.context,
      generator_version = EXCLUDED.generator_version, generated_at = now();
  `;
  return { forDate, patients: sections.length, added, closed };
}

/** Capture side-effects for IPC answers: record the daily check, escalate
 *  infected rows, close discharged ones. Called from capture.ts. */
export async function recordIpcCheck(
  forDate: string,
  ctx: { watchlist_id?: number; pod?: number },
  values: Record<string, string>,
  fillerName: string | null,
): Promise<{ firstInfection: boolean }> {
  const wid = ctx.watchlist_id;
  if (!wid) return { firstInfection: false };
  const status = values.woundStatus;
  let firstInfection = false;
  if (status === 'Infected') {
    const prior = await sql`
      SELECT 1 FROM governance_watchlist_checks
      WHERE watchlist_id = ${wid} AND wound_status = 'Infected' AND check_date < ${forDate}
      LIMIT 1
    `;
    firstInfection = prior.rows.length === 0;
  }
  if (status) {
    await sql`
      INSERT INTO governance_watchlist_checks (watchlist_id, check_date, pod, wound_status, notes, escalated, filler_name)
      VALUES (${wid}, ${forDate}, ${ctx.pod ?? null}, ${status}, ${values.notes || null}, ${status === 'Infected'}, ${fillerName})
      ON CONFLICT (watchlist_id, check_date) DO UPDATE SET
        wound_status = EXCLUDED.wound_status, notes = EXCLUDED.notes,
        escalated = EXCLUDED.escalated, filler_name = EXCLUDED.filler_name
    `;
    if (status === 'Infected') {
      await sql`UPDATE governance_watchlist SET status = 'escalated' WHERE id = ${wid} AND status <> 'closed'`;
    }
  }
  if (values.closeTracking === 'Yes') {
    await sql`UPDATE governance_watchlist SET status = 'closed', closed_at = now() WHERE id = ${wid}`;
  }
  return { firstInfection };
}
