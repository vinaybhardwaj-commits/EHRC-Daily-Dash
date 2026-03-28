import { NextResponse } from 'next/server';
import { endShift, getCurrentShift, getShiftSummary } from '@/lib/hk-db';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const shift = body.shiftId ? { id: body.shiftId } : await getCurrentShift();
    if (!shift) return NextResponse.json({ error: 'No active shift' }, { status: 400 });

    await endShift(shift.id);
    const summary = await getShiftSummary(shift.id);
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error('End shift error:', error);
    return NextResponse.json({ error: 'Failed to end shift', details: String(error) }, { status: 500 });
  }
}
