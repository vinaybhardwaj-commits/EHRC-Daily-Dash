/* ──────────────────────────────────────────────────────────────────
   Part B (B.1a) — Overview Intelligence API
   GET                : read the cached snapshot (open, instant) + stale flag.
   GET ?compute=1     : cron/bearer-gated force recompute (the nightly cron).
   POST ?auto=1       : open, claim-debounced recompute (client stale-refresh).
   POST (bearer)      : force recompute.
   ────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { getCachedOverview, ensureOverview } from '@/lib/ai-engine/overview-intelligence';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const date = url.searchParams.get('date') || todayIST();

  // Nightly pre-warm cron hits GET ?compute=1.
  if (url.searchParams.get('compute') === '1') {
    if (!isAuthorizedCron(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const r = await ensureOverview(date, { force: true });
    return NextResponse.json({ date, ...r });
  }

  // Default: instant cache read.
  const c = await getCachedOverview(date);
  return NextResponse.json({
    date,
    payload: c.payload,
    computing: c.computing,
    stale: !c.payload && !c.computing,
    model: c.model,
    generated_at: c.generated_at,
  });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const date = url.searchParams.get('date') || todayIST();
  const force = isAuthorizedCron(req);           // cron header or bearer
  const auto = url.searchParams.get('auto') === '1';

  if (!force && !auto) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const r = await ensureOverview(date, { force });
  return NextResponse.json({ date, ...r });
}
