import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { completeTask } from '@/lib/hk-db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });

    const task = await completeTask(body.taskId, body.completedBy || 'Supervisor');

    // If this task was from Sewa, also resolve the Sewa request
    if (task.sewa_request_id) {
      await sql`
        UPDATE sewa_requests
        SET status = 'RESOLVED', resolved_at = NOW(), resolved_by = ${body.completedBy || 'HK Supervisor'}
        WHERE id = ${task.sewa_request_id} AND status != 'RESOLVED'
      `;
    }

    return NextResponse.json({ success: true, task });
  } catch (error) {
    console.error('Complete task error:', error);
    return NextResponse.json({ error: 'Failed to complete task', details: String(error) }, { status: 500 });
  }
}
