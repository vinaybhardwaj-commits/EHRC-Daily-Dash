/**
 * SPAS.2 — Archive a draft config (without deleting it).
 *
 * POST /api/surgical-risk/admin/configs/[id]/archive?key=...
 *   Body (optional): { actor?: string, notes?: string }
 *
 * Use case: V created a draft, decided not to activate it, wants to keep it
 * around for history but stop showing it as a draft. Different from DELETE
 * which removes the row entirely.
 *
 * Refuses to archive the currently-active config — must transition through
 * a different active first (use /activate on a different config).
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { checkAdminKey } from '@/lib/surgical-risk/admin-auth';

export const dynamic = 'force-dynamic';

function jsonErr(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

interface ArchiveBody {
  actor?: string;
  notes?: string;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = checkAdminKey(req);
  if (!auth.ok) return jsonErr(auth.error || 'Unauthorized', 401);

  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) return jsonErr('Invalid id', 400);

  let body: ArchiveBody = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  try {
    const target = await sql`SELECT id, version, status FROM srews_configs WHERE id = ${id}`;
    if (target.rows.length === 0) return jsonErr('Config not found', 404);

    const t = target.rows[0];
    if (t.status === 'active') {
      return jsonErr(
        `Cannot archive the currently-active config. Activate a different config first.`,
        409,
        { current_status: t.status }
      );
    }
    if (t.status === 'archived') {
      return jsonErr(`Config id=${id} is already archived`, 409, { current_status: t.status });
    }

    const updated = await sql`
      UPDATE srews_configs
      SET status = 'archived', archived_at = NOW()
      WHERE id = ${id}
      RETURNING id, version, status, archived_at
    `;

    await sql`
      INSERT INTO srews_config_audit (config_id, action, actor, from_version, to_version, notes)
      VALUES (${id}, 'archived', ${body.actor ?? 'admin'}, ${t.version}, ${t.version},
              ${body.notes ?? 'Archived (draft cleanup)'})
    `;

    return NextResponse.json({ ok: true, archived: updated.rows[0] });
  } catch (err) {
    return jsonErr(`Archive failed: ${String(err)}`, 500);
  }
}
