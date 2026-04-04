/* ──────────────────────────────────────────────────────────────────
   AI Questions — Cross-Department Correlation API
   POST: Run on-demand correlation analysis for a date
   ────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { runCorrelationAnalysis } from '@/lib/ai-engine/correlation-engine';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date } = body;

    if (!date) {
      return NextResponse.json({ error: 'Missing date parameter' }, { status: 400 });
    }

    const correlations = await runCorrelationAnalysis(date);

    return NextResponse.json({
      date,
      correlations,
      count: correlations.length,
      hasAlerts: correlations.length > 0,
    });
  } catch (err) {
    console.error('Correlation analysis error:', err);
    return NextResponse.json({ error: 'Failed to run correlation analysis' }, { status: 500 });
  }
}
