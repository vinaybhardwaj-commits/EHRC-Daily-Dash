import { NextResponse } from 'next/server';
import { skipTask } from '@/lib/hk-db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.taskId || !body.reason) {
      return NextResponse.json({ error: 'taskId and reason required' }, { status: 400 });
    }
    const task = await skipTask(body.taskId, body.reason);
    return NextResponse.json({ success: true, task });
  } catch (error) {
    console.error('Skip task error:', error);
    return NextResponse.json({ error: 'Failed to skip task', details: String(error) }, { status: 500 });
  }
}
