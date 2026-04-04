/* ──────────────────────────────────────────────────────────────────
   AI Questions — Historical Trend Intelligence API
   POST: Run trend analysis across all departments for a date
   ────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeAllTrends } from '@/lib/ai-engine/trend-analyzer';
import { generateAllNarratives, type TrendNarrative } from '@/lib/ai-engine/trend-narrator';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, lookbackDays } = body;

    if (!date) {
      return NextResponse.json({ error: 'Missing date parameter' }, { status: 400 });
    }

    const days = lookbackDays ? Math.min(Number(lookbackDays), 30) : 14;

    // 1. Analyze trends for all departments
    const trendData = await analyzeAllTrends(date, days);

    // 2. Generate narratives (Qwen + template fallback)
    const narratives: TrendNarrative[] = await generateAllNarratives(trendData);

    // 3. Build top-level summary
    const allHighlights = narratives.flatMap(n => n.highlights);
    const concerns = allHighlights.filter(h => h.severity === 'concern');
    const warnings = allHighlights.filter(h => h.severity === 'warning');
    const goods = allHighlights.filter(h => h.severity === 'good');

    return NextResponse.json({
      date,
      lookback_days: days,
      departments: narratives,
      department_count: narratives.length,
      summary: {
        concerns: concerns.length,
        warnings: warnings.length,
        positive: goods.length,
        total_highlights: allHighlights.length,
      },
      hasInsights: narratives.length > 0,
    });
  } catch (err) {
    console.error('Trend analysis error:', err);
    return NextResponse.json({ error: 'Failed to run trend analysis' }, { status: 500 });
  }
}
