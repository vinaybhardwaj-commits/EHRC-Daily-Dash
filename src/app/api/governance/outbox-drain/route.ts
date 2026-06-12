import { NextRequest, NextResponse } from 'next/server';
import { drainOutbox } from '@/lib/governance/outbox';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GV.3 — hourly retry of undelivered EPI observations. */
async function handle(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const auth = req.headers.get('authorization') || '';
  const secret = process.env.SERVICE_OBSERVATIONS_SECRET;
  if (!isVercelCron && !(secret && auth === `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const r = await drainOutbox(25);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'drain failed' }, { status: 500 });
  }
}
export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
