/**
 * SPAS.2 — Activate a draft config.
 *
 * POST /api/surgical-risk/admin/configs/[id]/activate?key=...
 *   Body (optional): { actor?: string, notes?: string,
 *                      acknowledged_impact?: { pct_changed: number, severity: 'green'|'yellow'|'red' } }
 *
 * Atomic transition: archive the currently-active config, set this one to
 * active. Per PRD decision #4 the partial unique index `WHERE status='active'`
 * enforces exactly-one-active in Postgres so the order is:
 *   1. UPDATE active → archived (sets archived_at)
 *   2. UPDATE target → active (sets activated_at + activated_by)
 *   3. Insert audit row with from_version + to_version + ack'd impact
 *   4. Call invalidateConfigCache() so the next /assess picks up immediately
 *
 * If target is already 'active' returns 409. If 'archived' returns 409 (can't
 * re-activate without making a new draft from it).
 *
 * The 'tiered activation warning' (decision #4: green<25% / yellow 25-50% /
 * red >50%) is enforced CLIENT-SIDE in SPAS.3 UI before the user can fire
 * this endpoint with the appropriate `acknowledged_impact`. The endpoint
 * trusts what it receives and records it for audit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { checkAdminKey } from '@/lib/surgical-risk/admin-auth';
import { invalidateConfigCache } from '@/lib/surgical-risk/config-store';

export const dynamic = 'force-dynamic';

function jsonErr(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

interface ActivateBody {
  actor?: string;
  notes?: string;
  acknowledged_impact?: {
    pct_changed: number;
    severity: 'green' | 'yellow' | 'red';
  };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = checkAdminKey(req);
  if (!auth.ok) return jsonErr(auth.error || 'Unauthorized', 401);

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return jsonErr('Invalid id', 400);

  let body: ActivateBody = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  try {
    // 1. Inspect target
    const target = await sql`SELECT id, version, status FROM srews_configs WHERE id = ${id}`;
    if (target.rows.length === 0) return jsonErr('Config not found', 404);
    const t = target.rows[0];
    if (t.status === 'active') {
      return jsonErr(`Config id=${id} is already active`, 409, { current_status: t.status });
    }
    if (t.status === 'archived') {
      return jsonErr(
        `Config id=${id} is archived. Clone it as a new draft, then activate that draft.`,
        409,
        { current_status: t.status }
      );
    }

    // 2. Find current active (may not exist if first-time activation)
    const current = await sql`SELECT id, version FROM srews_configs WHERE status = 'active'`;
    const previousActive = current.rows[0]
      ? { id: Number(current.rows[0].id), version: String(current.rows[0].version) }
      : null;

    // 3. Atomic-ish: archive current then activate target. Postgres partial
    //    unique index on status='active' prevents two-active anomalies. If
    //    the archive step succeeds but the activate step fails, we have a
    //    no-active-config state. The next /assess will fall back to
    //    hardcoded prompt/version (per config-store null contract).
    if (previousActive) {
      await sql`
        UPDATE srews_configs
        SET status = 'archived', archived_at = NOW()
        WHERE id = ${previousActive.id}
      `;
    }

    const activated = await sql`
      UPDATE srews_configs
      SET status = 'active',
          activated_at = NOW(),
          activated_by = ${body.actor ?? 'admin'}
      WHERE id = ${id}
      RETURNING id, version, status, activated_at, activated_by
    `;

    // 4. Invalidate cache so next /assess on THIS serverless instance picks
    //    up immediately. Other instances see worst-case 60s staleness.
    invalidateConfigCache();

    // 5. Audit
    await sql`
      INSERT INTO srews_config_audit (
        config_id, action, actor, from_version, to_version, impact, notes
      ) VALUES (
        ${id}, 'activated', ${body.actor ?? 'admin'},
        ${previousActive?.version ?? null}, ${activated.rows[0].version},
        ${body.acknowledged_impact ? JSON.stringify(body.acknowledged_impact) : null}::jsonb,
        ${body.notes ?? null}
      )
    `;

    // 6. If we archived a previous active, log that too for full traceability
    if (previousActive) {
      await sql`
        INSERT INTO srews_config_audit (
          config_id, action, actor, from_version, to_version, notes
        ) VALUES (
          ${previousActive.id}, 'archived', ${body.actor ?? 'admin'},
          ${previousActive.version}, ${activated.rows[0].version},
          ${`Auto-archived during activation of config id=${id} (v${activated.rows[0].version})`}
        )
      `;
    }

    return NextResponse.json({
      ok: true,
      activated: activated.rows[0],
      previous_active: previousActive,
    });
  } catch (err) {
    return jsonErr(`Activate failed: ${String(err)}`, 500);
  }
}
