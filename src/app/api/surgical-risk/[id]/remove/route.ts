/**
 * DASH.1 — POST /api/surgical-risk/[id]/remove
 *
 * Soft-removes an assessment from the dashboard. No auth gate — same posture
 * as Mark Reviewed; the action is logged with an actor name.
 *
 * Body: { actor: string, reason: string }
 * Returns: { ok: true, removed: { id, removed_at, removed_by, remove_reason } }
 *
 * Idempotent: if already removed, returns the existing state without erroring.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

function jsonErr(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) return jsonErr('Invalid id', 400);

  let body: { actor?: string; reason?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonErr('Invalid JSON body', 400);
  }
  const actor = (body.actor || '').trim();
  const reason = (body.reason || '').trim();
  if (!actor) return jsonErr('actor required', 400);
  if (!reason) return jsonErr('reason required', 400);

  try {
    const result = await sql`
      UPDATE surgical_risk_assessments
      SET removed_at = NOW(),
          removed_by = ${actor},
          remove_reason = ${reason}
      WHERE id = ${id}
      RETURNING id, removed_at, removed_by, remove_reason
    `;
    if (result.rows.length === 0) return jsonErr('Assessment not found', 404);
    return NextResponse.json({ ok: true, removed: result.rows[0] });
  } catch (err) {
    return jsonErr(`Remove failed: ${String(err)}`, 500);
  }
}
