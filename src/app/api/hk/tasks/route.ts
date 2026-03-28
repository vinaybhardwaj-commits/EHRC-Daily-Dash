import { NextResponse } from 'next/server';
import { getShiftTasks, getCurrentShift } from '@/lib/hk-db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shiftId = searchParams.get('shiftId');
    const floor = searchParams.get('floor') || undefined;
    const status = searchParams.get('status') || undefined;

    let id: number;
    if (shiftId) {
      id = Number(shiftId);
    } else {
      const shift = await getCurrentShift();
      if (!shift) return NextResponse.json({ tasks: [], message: 'No active shift' });
      id = shift.id;
    }

    const tasks = await getShiftTasks(id, floor, status);
    return NextResponse.json({ tasks, shiftId: id, count: tasks.length });
  } catch (error) {
    console.error('Get tasks error:', error);
    return NextResponse.json({ error: 'Failed to get tasks', details: String(error) }, { status: 500 });
  }
}
