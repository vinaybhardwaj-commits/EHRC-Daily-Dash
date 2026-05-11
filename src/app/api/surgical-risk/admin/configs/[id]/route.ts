/**
 * SPAS.2 — Single config detail + audit history.
 *
 * GET /api/surgical-risk/admin/configs/[id]?key=...
 *   Returns the full config row (all JSONB blobs unpacked) + last 20 audit rows.
 *
 * DELETE /api/surgical-risk/admin/configs/[id]?key=...
 *   Hard-deletes a DRAFT config. Refuses if status='active' or 'archived'
 *   (use the archive endpoint for active→archived transition).
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { checkAdminKey } from '@/lib/surgical-risk/admin-auth';

export const dynamic = 'force-dynamic';

function jsonErr(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = checkAdminKey(req);
  if (!auth.ok) return jsonErr(auth.error || 'Unauthorized', 401);

  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) return jsonErr('Invalid id', 400);

  try {
    const cfg = await sql`SELECT * FROM srews_configs WHERE id = ${id}`;
    if (cfg.rows.length === 0) return jsonErr('Config not found', 404);

    const audit = await sql`
      SELECT id, action, actor, from_version, to_version, diff, impact, notes, created_at
      FROM srews_config_audit
      WHERE config_id = ${id}
      ORDER BY id DESC
      LIMIT 20
    `;

    return NextResponse.json({ ok: true, config: cfg.rows[0], audit: audit.rows });
  } catch (err) {
    return jsonErr(`Query failed: ${String(err)}`, 500);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = checkAdminKey(req);
  if (!auth.ok) return jsonErr(auth.error || 'Unauthorized', 401);

  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) return jsonErr('Invalid id', 400);

  try {
    const row = await sql`SELECT id, version, status FROM srews_configs WHERE id = ${id}`;
    if (row.rows.length === 0) return jsonErr('Config not found', 404);

    if (row.rows[0].status !== 'draft') {
      return jsonErr(
        `Cannot delete a ${row.rows[0].status} config. Use /archive endpoint for active→archived transitions.`,
        409
      );
    }

    // Remove audit FK references first (ON DELETE SET NULL means audit rows
    // survive, just lose their config_id link). Then delete the config row.
    await sql`DELETE FROM srews_configs WHERE id = ${id}`;

    return NextResponse.json({ ok: true, deleted: { id, version: row.rows[0].version } });
  } catch (err) {
    return jsonErr(`Delete failed: ${String(err)}`, 500);
  }
}
