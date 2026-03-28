import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getTodayIST } from '@/lib/hk-types';

export async function GET() {
  try {
    const today = getTodayIST();

    // Terminal clean tasks for today (across all shifts)
    const result = await sql`
      SELECT
        COUNT(*) FILTER (WHERE task_category = 'terminal') as total_terminal,
        COUNT(*) FILTER (WHERE task_category = 'terminal' AND status = 'done') as completed,
        COUNT(*) FILTER (WHERE task_category = 'terminal' AND status = 'pending') as pending,
        AVG(
          CASE WHEN task_category = 'terminal' AND status = 'done' AND completed_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (completed_at - created_at)) / 60.0
          END
        ) as avg_minutes
      FROM hk_shift_tasks t
      JOIN hk_shifts s ON s.id = t.shift_id
      WHERE s.date = ${today}
    `;

    const r = result.rows[0];
    return NextResponse.json({
      date: today,
      totalTerminalTasks: Number(r.total_terminal),
      completed: Number(r.completed),
      pending: Number(r.pending),
      avgMinutesToClean: r.avg_minutes ? Math.round(Number(r.avg_minutes)) : null,
    });
  } catch (error) {
    console.error('Terminal cleans error:', error);
    return NextResponse.json({ error: 'Failed to load terminal clean stats', details: String(error) }, { status: 500 });
  }
}
