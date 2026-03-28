import { NextResponse } from 'next/server';
import { generateShift } from '@/lib/hk-engine';
import { getCurrentShiftType, getTodayIST } from '@/lib/hk-types';
import { updateShiftMeta } from '@/lib/hk-db';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const date = body.date || getTodayIST();
    const shiftType = body.shiftType || getCurrentShiftType();

    // Generate tasks for the shift
    const result = await generateShift(date, shiftType);

    // Update shift metadata if provided
    if (body.supervisorName) {
      await updateShiftMeta(
        result.shiftId,
        body.supervisorName,
        body.staffCount || 0,
        body.maleCount || 0,
        body.femaleCount || 0,
        body.ipCensus || 0
      );
    }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Generate shift error:', error);
    return NextResponse.json(
      { error: 'Failed to generate shift', details: String(error) },
      { status: 500 }
    );
  }
}
