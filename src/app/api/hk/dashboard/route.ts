import { NextResponse } from 'next/server';
import { getCurrentShift, getShiftSummary, getFloorHeatmap, getOverdueItems } from '@/lib/hk-db';

export async function GET() {
  try {
    const shift = await getCurrentShift();
    if (!shift) {
      return NextResponse.json({
        currentShift: null,
        floorHeatmap: [],
        overdueItems: [],
        terminalCleanStats: null,
      });
    }

    const [summary, heatmap, overdue] = await Promise.all([
      getShiftSummary(shift.id),
      getFloorHeatmap(shift.id),
      getOverdueItems(shift.id),
    ]);

    return NextResponse.json({
      currentShift: summary,
      floorHeatmap: heatmap,
      overdueItems: overdue,
      terminalCleanStats: null, // Phase 2
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Failed to load dashboard', details: String(error) }, { status: 500 });
  }
}
