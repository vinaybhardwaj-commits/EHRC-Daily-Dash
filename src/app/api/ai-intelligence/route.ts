/* ──────────────────────────────────────────────────────────────────
   Adaptive Forms Intelligence — admin API (F.0)
   GET  (open, read-only): engine status + caps + counts + question list.
   POST (bearer-gated):     admin actions — currently { action:'retire', id }.
   No questions are created here; the nightly gap-analysis job (F.1) does that.
   ────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cron-auth';
import {
  listQuestions,
  statusCounts,
  retireQuestion,
  adaptiveFormsEnabled,
  maxPerDept,
  type AdaptiveStatus,
} from '@/lib/adaptive-forms/store';

export const dynamic = 'force-dynamic';

const VALID_STATUS: AdaptiveStatus[] = ['open', 'answered', 'expired', 'retired'];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawStatus = searchParams.get('status');
  const status = rawStatus && (VALID_STATUS as string[]).includes(rawStatus)
    ? (rawStatus as AdaptiveStatus)
    : undefined;
  const deptSlug = searchParams.get('dept') || undefined;

  try {
    const [questions, counts] = await Promise.all([
      listQuestions({ status, deptSlug }),
      statusCounts(),
    ]);
    return NextResponse.json({
      enabled: adaptiveFormsEnabled(),
      maxPerDept: maxPerDept(),
      counts,
      questions,
    });
  } catch (e) {
    // Tables may not be migrated yet (F.0 just deployed) — return a valid empty
    // shape so the console renders instead of erroring.
    return NextResponse.json({
      enabled: adaptiveFormsEnabled(),
      maxPerDept: maxPerDept(),
      counts: {},
      questions: [],
      note: 'not_migrated_or_error',
      error: String(e).slice(0, 160),
    });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: number };

  if (body.action === 'retire' && typeof body.id === 'number') {
    const ok = await retireQuestion(body.id, 'admin');
    return NextResponse.json({ ok, id: body.id });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
