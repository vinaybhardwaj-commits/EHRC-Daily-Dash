/**
 * DASH.1 — POST /api/surgical-risk/[id]/restore
 *
 * Restores a previously-removed assessment back to the active dashboard.
 * Clears removed_at, removed_by, remove_reason.
 *
 * Body: { actor: string }
 * Returns: { ok: true, restored: { id } }
 *
 * Idempotent: if not currently removed, returns 200 with a noop notice.
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

  let body: { actor?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonErr('Invalid JSON body', 400);
  }
  const actor = (body.actor || '').trim();
  if (!actor) return jsonErr('actor required', 400);

  try {
    const result = await sql`
      UPDATE surgical_risk_assessments
      SET removed_at = NULL,
          removed_by = NULL,
          remove_reason = NULL
      WHERE id = ${id}
      RETURNING id
    `;
    if (result.rows.length === 0) return jsonErr('Assessment not found', 404);
    return NextResponse.json({ ok: true, restored: { id, restored_by: actor } });
  } catch (err) {
    return jsonErr(`Restore failed: ${String(err)}`, 500);
  }
}
