import { NextRequest, NextResponse } from 'next/server';
import { generateOtQuestions } from '@/lib/governance/generator';
import { yesterdayIST } from '@/lib/governance/sheet-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GV.2 — nightly question-set generator (runs after sync-ot; cron in
 * vercel.json). Generates for TODAY's morning meeting from YESTERDAY's
 * OT cases. ?date=YYYY-MM-DD overrides. Not flag-gated: generated sets are
 * invisible until GOV_QUESTIONS_ENABLED turns serving on.
 */
async function handle(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const auth = req.headers.get('authorization') || '';
  const secret = process.env.SERVICE_OBSERVATIONS_SECRET;
  if (!isVercelCron && !(secret && auth === `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const todayIST = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const date = req.nextUrl.searchParams.get('date') || todayIST;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'invalid date' }, { status: 400 });
  }
  // touch the import so "yesterday" semantics stay documented here
  void yesterdayIST;
  try {
    const result = await generateOtQuestions(date);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'generate failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
