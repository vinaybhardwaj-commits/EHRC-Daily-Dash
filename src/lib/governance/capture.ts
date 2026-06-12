// src/lib/governance/capture.ts
// GV.2 — structured capture of governance answers on form submission.
// gov__ field ids carry template + case-key + metric; physician/case
// provenance comes from the question set's context. Best-effort by design:
// a capture failure must never block the HOD's submit.

import { sql } from '@vercel/postgres';
import type { CaseContext } from './generator';

const GOV_FIELD_RE = /^gov__([a-z0-9]+)__([a-z0-9]+)__([A-Za-z0-9]+)$/;

function serialize(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export async function captureGovernanceResponses(
  forDate: string,
  slug: string,
  fields: Record<string, unknown>,
  fillerName: string | null,
  fillerDeviceId: string | null,
): Promise<number> {
  const govEntries = Object.entries(fields).filter(([k, v]) =>
    GOV_FIELD_RE.test(k) && v !== undefined && v !== null && v !== '');
  if (govEntries.length === 0) return 0;

  const setRow = await sql`
    SELECT id, context FROM governance_question_sets
    WHERE for_date = ${forDate} AND slug = ${slug} LIMIT 1
  `;
  const setId: number | null = setRow.rows[0]?.id ?? null;
  const cases: Record<string, CaseContext> = setRow.rows[0]?.context?.cases ?? {};

  let written = 0;
  for (const [fieldId, value] of govEntries) {
    const m = GOV_FIELD_RE.exec(fieldId)!;
    const [, templateGroup, caseKey, metric] = m;
    const ctx = cases[caseKey];
    // replace-on-resubmit semantics, mirroring the entries merge
    await sql`
      DELETE FROM governance_responses
      WHERE for_date = ${forDate} AND slug = ${slug}
        AND template_id = ${`${templateGroup}_${metric}`}
        AND case_ref IS NOT DISTINCT FROM ${ctx?.case_ref ?? null}
    `;
    await sql`
      INSERT INTO governance_responses
        (for_date, slug, question_set_id, template_id, physician_id, physician_name_raw,
         case_ref, metric, value, filler_name, filler_device_id, match_status)
      VALUES
        (${forDate}, ${slug}, ${setId}, ${`${templateGroup}_${metric}`},
         ${ctx?.physician_id ?? null}, ${ctx?.surgeon_raw ?? null},
         ${ctx?.case_ref ?? null}, ${metric}, ${serialize(value)},
         ${fillerName}, ${fillerDeviceId}, ${ctx?.match_status ?? 'orphan'})
    `;
    written++;
  }
  return written;
}
