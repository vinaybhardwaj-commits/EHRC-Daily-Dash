import { NextRequest, NextResponse } from 'next/server';
import { sendDailyDigests } from '@/lib/governance/digest';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GV.6 — evening digest cron: one dated note line per observed physician. */
async function handle(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const auth = req.headers.get('authorization') || '';
  const secret = process.env.SERVICE_OBSERVATIONS_SECRET;
  if (!isVercelCron && !(secret && auth === `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const todayIST = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const date = req.nextUrl.searchParams.get('date') || todayIST;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'invalid date' }, { status: 400 });
  try {
    const r = await sendDailyDigests(date);
    return NextResponse.json({ ok: true, date, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'digest failed' }, { status: 500 });
  }
}
export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
