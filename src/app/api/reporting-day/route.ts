/* ──────────────────────────────────────────────────────────────────
   GET /api/reporting-day?slug=<dept>
   Open, read-only. Tells the daily form which day a department should
   report. EOD_RHYTHM_SLUGS stays server-side; the client form fetches
   this on mount and falls back to its own "today" default if it fails,
   so non-pilot departments are unaffected.
   ────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { reportingDay } from '@/lib/reporting-day';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const slug = new URL(req.url).searchParams.get('slug') || '';
  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }
  return NextResponse.json(reportingDay(slug));
}
