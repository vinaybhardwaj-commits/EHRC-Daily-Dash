// src/lib/governance/generator.ts
// GV.2 — deterministic question-template generator.
// Builds per-case OT-coordinator question sections from yesterday's synced
// OT case log, matches surgeons against the EPI roster, and upserts the
// result into governance_question_sets (merged into /form/ot at serve time).

import { sql } from '@vercel/postgres';
import type { SmartFormSection, SmartFormField } from '@/lib/form-engine/types';
import { fetchRoster } from './elo';
import { matchSurgeon, splitSurgeons, type MatchResult } from './name-match';

export const GENERATOR_VERSION = 'gv2.0';
const MAX_CASES = 12; // question-fatigue cap (PRD §10)

export interface CaseContext {
  case_ref: string;
  surgeon_raw: string | null;
  physician_id: string | null;
  physician_name: string | null;
  match_status: MatchResult['status'];
  candidates?: string[];
  procedure: string | null;
  patient: string | null;
}

export interface GenerateResult {
  forDate: string;
  casesDate: string;
  caseCount: number;
  matched: number;
  ambiguous: number;
  unmatched: number;
  sections: number;
}

function caseFields(key: string): SmartFormField[] {
  const id = (metric: string) => `gov__ot__${key}__${metric}`;
  const when = (metric: string) => ({ field: id(metric), operator: 'eq' as const, value: true });
  return [
    { id: id('lateStart'), label: 'Did this case start late?', type: 'toggle' },
    { id: id('delayMinutes'), label: 'Delay (minutes)', type: 'number', validation: { min: 1 }, showWhen: when('lateStart'), requireWhen: when('lateStart') },
    { id: id('delayReason'), label: 'Reason for delay', type: 'text', showWhen: when('lateStart') },
    { id: id('conductConcern'), label: "Any concern about the surgeon's conduct or behaviour?", type: 'toggle' },
    { id: id('conductDetails'), label: 'What happened?', type: 'paragraph', showWhen: when('conductConcern'), requireWhen: when('conductConcern') },
    { id: id('anaesthesiaIssue'), label: 'Any anaesthesia-related problem?', type: 'toggle' },
    { id: id('anaesthesiaDetails'), label: 'Anaesthesia issue details', type: 'paragraph', showWhen: when('anaesthesiaIssue'), requireWhen: when('anaesthesiaIssue') },
    { id: id('equipmentProcessIssue'), label: 'Any equipment or process problem?', type: 'toggle' },
    { id: id('equipmentProcessDetails'), label: 'Equipment / process details', type: 'paragraph', showWhen: when('equipmentProcessIssue'), requireWhen: when('equipmentProcessIssue') },
    { id: id('commendation'), label: 'Anything done especially well? (optional)', type: 'text' },
  ];
}

/** Generate the OT-coordinator governance sections for `forDate` (= the
 *  morning-meeting date; questions cover the previous day's cases). */
export async function generateOtQuestions(forDate: string): Promise<GenerateResult> {
  const casesDate = new Date(new Date(forDate + 'T00:00:00Z').getTime() - 86400_000)
    .toISOString().slice(0, 10);

  const rows = await sql`
    SELECT case_ref, ot_room, scheduled_time, patient_name, procedure_name, surgeon_raw
    FROM ot_case_log
    WHERE case_date = ${casesDate} AND cancelled = false AND surgeon_raw IS NOT NULL
    ORDER BY ot_room NULLS LAST, id
    LIMIT ${MAX_CASES}
  `;

  const roster = await fetchRoster();
  const aliasRows = await sql`SELECT alias_norm, physician_id FROM gv_name_aliases`;
  const aliases = new Map<string, string>(
    aliasRows.rows.map(r => [r.alias_norm as string, r.physician_id as string]),
  );

  const sections: SmartFormSection[] = [];
  const context: { casesDate: string; cases: Record<string, CaseContext> } = { casesDate, cases: {} };
  let matched = 0, ambiguous = 0, unmatched = 0;

  for (let i = 0; i < rows.rows.length; i++) {
    const row = rows.rows[i];
    const key = `c${i}`;
    const raw = (row.surgeon_raw as string) || '';
    const primary = splitSurgeons(raw)[0] || raw;
    const m = roster.length ? matchSurgeon(primary, roster, aliases) : { status: 'unmatched' as const };
    if (m.status === 'matched') matched++;
    else if (m.status === 'ambiguous') ambiguous++;
    else unmatched++;

    // write the match back onto the case log (admin "Matched" column + GV.3)
    if (m.status === 'matched' && m.physicianId) {
      await sql`UPDATE ot_case_log SET surgeon_physician_id = ${m.physicianId} WHERE case_date = ${casesDate} AND case_ref = ${row.case_ref}`;
    }

    const display = m.physicianName || raw;
    const meta = [row.procedure_name, row.patient_name, row.scheduled_time, row.ot_room]
      .filter(Boolean).join(' · ');
    sections.push({
      id: `gov-ot-${key}`,
      title: `Yesterday's case — ${display}`,
      description: meta || undefined,
      fields: caseFields(key),
    });
    context.cases[key] = {
      case_ref: row.case_ref as string,
      surgeon_raw: raw,
      physician_id: m.physicianId || null,
      physician_name: m.physicianName || null,
      match_status: m.status,
      candidates: m.candidates,
      procedure: (row.procedure_name as string) || null,
      patient: (row.patient_name as string) || null,
    };
  }

  await sql`
    INSERT INTO governance_question_sets (for_date, slug, sections, context, generator_version)
    VALUES (${forDate}, ${'ot'}, ${JSON.stringify(sections)}::jsonb, ${JSON.stringify(context)}::jsonb, ${GENERATOR_VERSION})
    ON CONFLICT (for_date, slug) DO UPDATE SET
      sections = EXCLUDED.sections, context = EXCLUDED.context,
      generator_version = EXCLUDED.generator_version, generated_at = now();
  `;

  return { forDate, casesDate, caseCount: rows.rows.length, matched, ambiguous, unmatched, sections: sections.length };
}

/* ── Customer Care standing block ─────────────────────────────────── */
// Doctor-report slots (roster dropdown -> exact resolution on submit) plus
// V's standing process-problems question. Regenerated nightly so the roster
// options stay fresh.

function ccSlot(key: string, roster: string[], showWhenPrev?: string): SmartFormSection {
  const id = (metric: string) => `gov__cc__${key}__${metric}`;
  const hasDoctor = { field: id('doctor'), operator: 'is_not_empty' as const };
  return {
    id: `gov-cc-${key}`,
    title: key === 's0' ? 'Doctor report (optional)' : 'Another doctor report (optional)',
    description: key === 's0'
      ? 'Report any doctor in the EPI index — complaint, concern, or commendation. Leave blank if nothing to report.'
      : undefined,
    showWhen: showWhenPrev ? { field: showWhenPrev, operator: 'is_not_empty' as const } : undefined,
    fields: [
      { id: id('doctor'), label: 'Doctor', type: 'dropdown', options: roster },
      { id: id('reportType'), label: 'Type of report', type: 'radio', options: ['Complaint', 'Concern', 'Commendation'], showWhen: hasDoctor, requireWhen: hasDoctor },
      { id: id('details'), label: 'What happened?', type: 'paragraph', showWhen: hasDoctor, requireWhen: hasDoctor },
    ],
  };
}

/** Generate the customer-care standing governance sections for `forDate`. */
export async function generateCcQuestions(forDate: string): Promise<{ forDate: string; sections: number; rosterSize: number }> {
  const roster = await fetchRoster();
  const names = roster.map(r => r.full_name);
  const rosterMap: Record<string, string> = {};
  for (const r of roster) rosterMap[r.full_name] = r.id;

  const sections: SmartFormSection[] = [
    {
      id: 'gov-cc-process',
      title: 'Process problems (standing question)',
      fields: [
        { id: 'gov__cc__p0__processProblems', label: 'Any process problems from yesterday that need reporting?', type: 'paragraph', placeholder: 'Leave blank if none' },
      ],
    },
    ccSlot('s0', names),
    ccSlot('s1', names, 'gov__cc__s0__doctor'),
  ];

  await sql`
    INSERT INTO governance_question_sets (for_date, slug, sections, context, generator_version)
    VALUES (${forDate}, ${'customer-care'}, ${JSON.stringify(sections)}::jsonb, ${JSON.stringify({ roster: rosterMap })}::jsonb, ${GENERATOR_VERSION})
    ON CONFLICT (for_date, slug) DO UPDATE SET
      sections = EXCLUDED.sections, context = EXCLUDED.context,
      generator_version = EXCLUDED.generator_version, generated_at = now();
  `;
  return { forDate, sections: sections.length, rosterSize: roster.length };
}
