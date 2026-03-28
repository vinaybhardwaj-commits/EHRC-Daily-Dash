import { NextResponse } from 'next/server';
import { getCurrentShift } from '@/lib/hk-db';
import { getShiftSummary } from '@/lib/hk-db';

export async function GET() {
  try {
    const shift = await getCurrentShift();
    if (!shift) {
      return NextResponse.json({ shift: null, summary: null });
    }
    const summary = await getShiftSummary(shift.id);
    return NextResponse.json({ shift, summary });
  } catch (error) {
    console.error('Current shift error:', error);
    return NextResponse.json({ error: 'Failed to get current shift', details: String(error) }, { status: 500 });
  }
}
