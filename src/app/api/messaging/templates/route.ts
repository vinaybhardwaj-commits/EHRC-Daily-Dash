import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { isAuthorizedCron } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const r = await sql`SELECT key, channel, subject, body, active FROM notification_templates ORDER BY key`;
    return NextResponse.json({ ok: true, templates: r.rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed', templates: [] });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let b: { key?: string; body?: string; active?: boolean } | null = null;
  try { b = await req.json(); } catch { /* ignore */ }
  if (!b || !b.key) return NextResponse.json({ error: 'key required' }, { status: 400 });
  try {
    await sql`UPDATE notification_templates
      SET body = COALESCE(${b.body ?? null}, body), active = COALESCE(${b.active ?? null}, active), updated_at = NOW()
      WHERE key = ${b.key}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
