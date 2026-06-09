import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // a cold model reload via the health ping can take ~90s

/**
 * LLM keep-warm cron.
 *
 * Pings /api/llm-health (which runs a tiny real inference) every few minutes
 * during operating hours so qwen2.5:14b stays resident on the Mac-Mini tunnel.
 * This prevents the first booking after an idle gap from timing out while the
 * model cold-loads (see Phase 2 verification: idle-2-weeks → first /assess 504'd).
 *
 * Scheduled in vercel.json. Vercel Cron sends the request with
 * `Authorization: Bearer ${CRON_SECRET}` (and an `x-vercel-cron` header).
 * Handles both GET and POST so it works regardless of how the cron invokes it.
 */
async function warm(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const auth = req.headers.get('Authorization') || '';
  const bearerOk = !!cronSecret && auth === `Bearer ${cronSecret}`;
  if (!isVercelCron && !bearerOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const origin = new URL(req.url).origin;
  const started = Date.now();
  try {
    const r = await fetch(`${origin}/api/llm-health`, { cache: 'no-store' });
    const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({
      ok: true,
      warmed: true,
      health_status: r.status,
      llm_status: body?.status ?? null,
      latency_ms: body?.latency_ms ?? null,
      elapsed_ms: Date.now() - started,
    });
  } catch (e) {
    // Never error the cron — the reload still proceeds on the LLM host even if we time out.
    return NextResponse.json(
      { ok: false, warmed: false, error: e instanceof Error ? e.message : 'warmup failed', elapsed_ms: Date.now() - started },
      { status: 200 },
    );
  }
}

export async function GET(req: NextRequest) {
  return warm(req);
}
export async function POST(req: NextRequest) {
  return warm(req);
}
