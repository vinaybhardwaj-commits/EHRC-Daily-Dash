import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { govEnabled } from '@/lib/governance/flags';

export const dynamic = 'force-dynamic';

/** GV.6 — counts for the Daily Dash governance card. */
export async function GET(req: NextRequest) {
  if (!govEnabled()) return NextResponse.json({ enabled: false });
  const todayIST = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const date = req.nextUrl.searchParams.get('date') || todayIST;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'invalid date' }, { status: 400 });
  try {
    const r = await sql`
      SELECT
        (SELECT count(*)::int FROM governance_responses WHERE for_date = ${date}) AS responses,
        (SELECT count(DISTINCT physician_id)::int FROM governance_responses WHERE for_date = ${date} AND physician_id IS NOT NULL) AS physicians,
        (SELECT count(*)::int FROM governance_outbox WHERE status = 'sent' AND (sent_at AT TIME ZONE 'Asia/Kolkata')::date = ${date}::date) AS filed,
        (SELECT count(*)::int FROM governance_outbox WHERE status IN ('pending','failed')) AS queued,
        (SELECT count(*)::int FROM governance_watchlist WHERE status = 'open') AS watch_open,
        (SELECT count(*)::int FROM governance_watchlist WHERE status = 'escalated') AS watch_escalated,
        (SELECT count(*)::int FROM ot_case_log WHERE case_date = ${date}::date - 1) AS ot_cases_yesterday
    `;
    return NextResponse.json({ enabled: true, date, ...r.rows[0] });
  } catch (e) {
    return NextResponse.json({ enabled: false, error: e instanceof Error ? e.message : 'failed' });
  }
}
