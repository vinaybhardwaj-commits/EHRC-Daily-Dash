/* F.2 — daily lifecycle cron for adaptive questions (advance days-shown, expire
   per recurrence). Cron-gated; no-op unless the engine is enabled; skips Sundays.
   Schedule: 06:00 IST working days (30 0 * * 1-6 UTC), before the morning forms. */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { adaptiveFormsEnabled } from '@/lib/adaptive-forms/store';
import { advanceDailyLifecycle } from '@/lib/adaptive-forms/lifecycle';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function istNow(): Date { return new Date(Date.now() + 5.5 * 3600_000); }
function todayIST(): string { return istNow().toISOString().slice(0, 10); }

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!adaptiveFormsEnabled()) {
    return NextResponse.json({ ok: true, skipped: 'engine_disabled' });
  }
  if (istNow().getUTCDay() === 0) {
    return NextResponse.json({ ok: true, skipped: 'sunday' });
  }
  const result = await advanceDailyLifecycle(todayIST());
  return NextResponse.json({ ok: true, date: todayIST(), ...result });
}
