/* G.3 — LLM cost/latency metrics (bearer-gated). Aggregates llm_metrics by
   provider for the last 24h and 7d: calls, avg/p95 latency, tokens, rough cost.
   Cost is an ESTIMATE from blended per-1M-token rates (env-overridable) — verify
   against actual Vertex billing. */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

// Rough blended USD per 1M tokens (input+output averaged). Override via env.
const RATE: Record<string, number> = {
  'gemini:pro': Number(process.env.GEMINI_PRO_PER_1M) || 5,
  'gemini:flash': Number(process.env.GEMINI_FLASH_PER_1M) || 0.2,
  ollama: 0,
};

interface ProviderAgg {
  provider: string; calls: number; avg_ms: number; p95_ms: number; tokens: number; est_cost_usd: number;
}

async function windowAgg(hours: number): Promise<ProviderAgg[]> {
  const r = await sql`
    SELECT provider,
      COUNT(*)::int AS calls,
      ROUND(AVG(latency_ms))::int AS avg_ms,
      ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms))::int AS p95_ms,
      COALESCE(SUM(total_tokens), 0)::bigint AS tokens
    FROM llm_metrics
    WHERE ts > NOW() - make_interval(hours => ${hours})
    GROUP BY provider
    ORDER BY provider`;
  return r.rows.map(row => {
    const tokens = Number(row.tokens);
    const rate = RATE[row.provider as string] ?? 0;
    return {
      provider: String(row.provider),
      calls: Number(row.calls),
      avg_ms: Number(row.avg_ms),
      p95_ms: Number(row.p95_ms),
      tokens,
      est_cost_usd: Math.round((tokens / 1e6) * rate * 100) / 100,
    };
  });
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const [last_24h, last_7d] = await Promise.all([windowAgg(24), windowAgg(24 * 7)]);
    return NextResponse.json({ rates: RATE, last_24h, last_7d });
  } catch (e) {
    return NextResponse.json({ note: 'not_migrated_or_error', detail: String(e).slice(0, 160), rates: RATE, last_24h: [], last_7d: [] });
  }
}
