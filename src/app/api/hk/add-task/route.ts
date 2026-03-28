import { NextResponse } from 'next/server';
import { addManualTask, getCurrentShift } from '@/lib/hk-db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.areaId || !body.taskName) {
      return NextResponse.json({ error: 'areaId and taskName required' }, { status: 400 });
    }
    const shift = await getCurrentShift();
    if (!shift) return NextResponse.json({ error: 'No active shift' }, { status: 400 });

    const task = await addManualTask(
      body.shiftId || shift.id,
      body.areaId,
      body.taskName,
      body.category || 'routine',
      body.priority || 10
    );
    return NextResponse.json({ success: true, task });
  } catch (error) {
    console.error('Add task error:', error);
    return NextResponse.json({ error: 'Failed to add task', details: String(error) }, { status: 500 });
  }
}
