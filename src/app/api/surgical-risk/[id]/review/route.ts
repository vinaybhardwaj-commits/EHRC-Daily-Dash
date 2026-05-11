/**
 * POST /api/surgical-risk/[id]/review
 *
 * Marks an assessment as reviewed. Single review per case (decision #14).
 * Body: { reviewer_name: string, notes?: string }
 *
 * No webhook secret required — this is dashboard-driven, but we should
 * eventually gate behind user auth. For v1: anyone with the URL can mark
 * reviewed. Audit posture relies on the dashboard being internal.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const idNum = parseInt(id, 10);
  if (!Number.isFinite(idNum)) {
    return NextResponse.json({ ok: false, error: 'Invalid id' }, { status: 400 });
  }

  let body: { reviewer_name?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const reviewerName = (body.reviewer_name || '').trim();
  if (!reviewerName) {
    return NextResponse.json({ ok: false, error: 'reviewer_name is required' }, { status: 400 });
  }
  const notes = (body.notes || '').trim() || null;

  try {
    const r = await sql`
      UPDATE surgical_risk_assessments
      SET reviewed_by = ${reviewerName},
          reviewed_at = NOW(),
          review_notes = ${notes}
      WHERE id = ${idNum}
      RETURNING id, reviewed_by, reviewed_at, review_notes
    `;
    if (r.rows.length === 0) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, review: r.rows[0] });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
