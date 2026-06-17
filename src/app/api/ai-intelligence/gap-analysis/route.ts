/* ──────────────────────────────────────────────────────────────────
   Adaptive Forms Intelligence — nightly gap-analysis cron (F.1)
   Cron-gated (isAuthorizedCron). Runs the reasoning-tier gap-analysis and
   publishes valid candidate questions to adaptive_form_questions.

   Safety: when ADAPTIVE_FORMS_ENABLED is unset, a normal run is a no-op.
   A dry run (?dry=1) ALWAYS works and never writes — use it to preview what
   the engine would generate before flipping the kill switch.

   Schedule: 23:30 IST (0 18 * * * UTC). Manual: bearer + ?dry=1 / ?date=.
   ────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { adaptiveFormsEnabled } from '@/lib/adaptive-forms/store';
import { runGapAnalysis } from '@/lib/adaptive-forms/gap-analysis';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry') === '1';
  const date = url.searchParams.get('date') || todayIST();

  // Live (writing) runs require the kill switch ON. Dry runs always allowed.
  if (!adaptiveFormsEnabled() && !dryRun) {
    return NextResponse.json({
      ok: true,
      skipped: 'engine_disabled',
      hint: 'set ADAPTIVE_FORMS_ENABLED=1 to activate, or call with ?dry=1 to preview',
    });
  }

  try {
    const result = await runGapAnalysis(date, { dryRun });
    return NextResponse.json({ date, dryRun, enabled: adaptiveFormsEnabled(), ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message).slice(0, 200) }, { status: 500 });
  }
}
