import { NextRequest, NextResponse } from 'next/server';
import { syncOtCases, yesterdayIST } from '@/lib/governance/sheet-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GV.1 — OT sheet → ot_case_log sync.
 * Scheduled in vercel.json (daily, pre-morning-meeting); also manually
 * triggerable with `Authorization: Bearer <SERVICE_OBSERVATIONS_SECRET>`.
 * ?date=YYYY-MM-DD overrides the default (yesterday IST).
 */
async function handle(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const auth = req.headers.get('authorization') || '';
  const secret = process.env.SERVICE_OBSERVATIONS_SECRET;
  const bearerOk = !!secret && auth === `Bearer ${secret}`;
  if (!isVercelCron && !bearerOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const date = req.nextUrl.searchParams.get('date') || yesterdayIST();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'invalid date' }, { status: 400 });
  }
  try {
    const result = await syncOtCases(date);
    return NextResponse.json({
      ok: !result.error,
      date: result.date,
      tab: result.tab,
      format: result.format,
      cases: result.cases.length,
      inserted: result.inserted,
      error: result.error,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'sync failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
