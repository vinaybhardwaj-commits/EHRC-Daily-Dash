// src/lib/governance/capture.ts
// GV.2/GV.3 — structured capture of governance answers on form submission,
// followed by auto-file classification (V's decision: negatives file to EPI
// immediately; ambiguous/unmatched physicians are held in the queue).
// Best-effort by design: a capture failure must never block the HOD's submit.

import { sql } from '@vercel/postgres';
import type { CaseContext } from './generator';
import { autoFileGroup, type GroupCtx } from './autofile';

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
  const ctxJson = setRow.rows[0]?.context ?? {};
  const cases: Record<string, CaseContext> = ctxJson.cases ?? {};
  const roster: Record<string, string> = ctxJson.roster ?? {}; // CC: full_name -> physician_id

  // group answers: (templateGroup, groupKey) -> { metric: serialized }
  const groups = new Map<string, { templateGroup: string; groupKey: string; values: Record<string, string> }>();
  for (const [fieldId, value] of govEntries) {
    const m = GOV_FIELD_RE.exec(fieldId)!;
    const [, templateGroup, groupKey, metric] = m;
    const gk = `${templateGroup}__${groupKey}`;
    if (!groups.has(gk)) groups.set(gk, { templateGroup, groupKey, values: {} });
    groups.get(gk)!.values[metric] = serialize(value);
  }

  let written = 0;
  for (const { templateGroup, groupKey, values } of groups.values()) {
    // resolve provenance: case-keyed (OT) or answer-keyed (CC doctor picker)
    let ctx: GroupCtx;
    const caseCtx = cases[groupKey];
    if (caseCtx) {
      ctx = { ...caseCtx, case_ref: caseCtx.case_ref };
    } else if (values.doctor && roster[values.doctor]) {
      ctx = { physician_id: roster[values.doctor], physician_name: values.doctor, surgeon_raw: values.doctor, match_status: 'matched', case_ref: null };
    } else if (values.doctor) {
      ctx = { physician_id: null, physician_name: null, surgeon_raw: values.doctor, match_status: 'unmatched', case_ref: null };
    } else {
      ctx = { physician_id: null, physician_name: null, surgeon_raw: null, match_status: 'orphan', case_ref: null };
    }

    for (const [metric, value] of Object.entries(values)) {
      const templateId = `${templateGroup}_${metric}`;
      // replace-on-resubmit semantics, mirroring the entries merge
      await sql`
        DELETE FROM governance_responses
        WHERE for_date = ${forDate} AND slug = ${slug}
          AND template_id = ${templateId}
          AND case_ref IS NOT DISTINCT FROM ${ctx.case_ref ?? null}
          AND physician_name_raw IS NOT DISTINCT FROM ${ctx.surgeon_raw ?? null}
      `;
      await sql`
        INSERT INTO governance_responses
          (for_date, slug, question_set_id, template_id, physician_id, physician_name_raw,
           case_ref, metric, value, filler_name, filler_device_id, match_status)
        VALUES
          (${forDate}, ${slug}, ${setId}, ${templateId},
           ${ctx.physician_id ?? null}, ${ctx.surgeon_raw ?? null},
           ${ctx.case_ref ?? null}, ${metric}, ${value},
           ${fillerName}, ${fillerDeviceId}, ${ctx.match_status})
      `;
      written++;
    }

    try {
      await autoFileGroup(forDate, slug, templateGroup, groupKey, ctx, values, { name: fillerName, deviceId: fillerDeviceId });
    } catch (e) {
      console.error('governance auto-file failed (capture unaffected):', e);
    }
  }
  return written;
}
