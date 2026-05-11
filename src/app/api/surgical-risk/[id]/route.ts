/**
 * GET /api/surgical-risk/[id]
 *
 * Returns a single surgical risk assessment by id.
 * No auth required (read-only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const idNum = parseInt(id, 10);
  if (!Number.isFinite(idNum)) {
    return NextResponse.json({ ok: false, error: 'Invalid id' }, { status: 400 });
  }
  try {
    const r = await sql`
      SELECT
        id, form_submission_uid, submission_timestamp,
        patient_name, uhid, age, sex,
        surgeon_name, surgical_specialty, proposed_procedure,
        surgery_date, surgery_datetime, admission_date, admission_datetime,
        patient_risk_score, procedure_risk_score, system_risk_score,
        composite_risk_score, risk_tier,
        assessment_json,
        llm_model, llm_latency_ms, llm_divergence_logged, rubric_version,
        raw_form_data,
        created_at, reviewed_by, reviewed_at, review_notes
      FROM surgical_risk_assessments
      WHERE id = ${idNum}
      LIMIT 1
    `;
    if (r.rows.length === 0) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, assessment: r.rows[0] });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
