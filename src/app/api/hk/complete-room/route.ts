import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { completeRoomTasks } from '@/lib/hk-db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.areaId || !body.shiftId) {
      return NextResponse.json({ error: 'areaId and shiftId required' }, { status: 400 });
    }

    const completedBy = body.completedBy || 'Supervisor';
    const count = await completeRoomTasks(body.areaId, body.shiftId, completedBy);

    // Also resolve any linked Sewa requests for this room
    const sewaTasks = await sql`
      SELECT sewa_request_id FROM hk_shift_tasks
      WHERE area_id = ${body.areaId} AND shift_id = ${body.shiftId}
      AND sewa_request_id IS NOT NULL AND status = 'done'
    `;
    for (const t of sewaTasks.rows) {
      await sql`
        UPDATE sewa_requests
        SET status = 'RESOLVED', resolved_at = NOW(), resolved_by = ${completedBy}
        WHERE id = ${t.sewa_request_id} AND status != 'RESOLVED'
      `;
    }

    return NextResponse.json({ success: true, tasksCompleted: count });
  } catch (error) {
    console.error('Complete room error:', error);
    return NextResponse.json({ error: 'Failed to complete room', details: String(error) }, { status: 500 });
  }
}
