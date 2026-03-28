import { NextResponse } from 'next/server';
import { getCurrentShift } from '@/lib/hk-db';
import { pullSewaRequests } from '@/lib/hk-engine';

export async function GET() {
  try {
    const shift = await getCurrentShift();
    if (!shift) return NextResponse.json({ added: 0, message: 'No active shift' });

    const added = await pullSewaRequests(shift.id);
    return NextResponse.json({ success: true, added, shiftId: shift.id });
  } catch (error) {
    console.error('Sewa poll error:', error);
    return NextResponse.json({ error: 'Failed to poll Sewa', details: String(error) }, { status: 500 });
  }
}
