import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { fetchRoster } from '@/lib/governance/elo';

export const dynamic = 'force-dynamic';

const KEY = 'ms_observe_physician_ids';

/** GV.6 — the Medical Superintendent's manual observation watch list. */
export async function GET() {
  try {
    const cfg = await sql`SELECT value FROM gv_config WHERE key = ${KEY}`;
    const ids: string[] = Array.isArray(cfg.rows[0]?.value) ? cfg.rows[0].value : [];
    const roster = await fetchRoster();
    const byId = new Map(roster.map(r => [r.id, r.full_name]));
    return NextResponse.json({
      watched: ids.map(id => ({ id, name: byId.get(id) || '(not on active roster)' })),
      roster: roster.map(r => ({ id: r.id, name: r.full_name })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}

/** Add/remove a physician. Bearer-gated. Body: { physician_id, action: 'add'|'remove' } */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const secret = process.env.SERVICE_OBSERVATIONS_SECRET;
  if (!(secret && auth === `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: { physician_id?: string; action?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const pid = (body.physician_id || '').trim();
  const action = body.action === 'remove' ? 'remove' : 'add';
  if (!pid) return NextResponse.json({ error: 'physician_id required' }, { status: 400 });
  try {
    const cfg = await sql`SELECT value FROM gv_config WHERE key = ${KEY}`;
    const ids = new Set<string>(Array.isArray(cfg.rows[0]?.value) ? cfg.rows[0].value : []);
    if (action === 'add') ids.add(pid); else ids.delete(pid);
    await sql`
      INSERT INTO gv_config (key, value) VALUES (${KEY}, ${JSON.stringify([...ids])}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `;
    return NextResponse.json({ ok: true, watched: ids.size });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
