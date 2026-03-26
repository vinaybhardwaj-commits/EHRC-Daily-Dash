import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

/**
 * GET /api/cleanup-stray-date
 * One-shot endpoint to delete the stray 2026-06-18 record.
 * Protected by CRON_SECRET. Remove this file after running.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Delete stray future date
    const del = await sql`DELETE FROM department_data WHERE date = '2026-06-18'`;

    // Also clean up any day_snapshots entry
    const delSnap = await sql`DELETE FROM day_snapshots WHERE date = '2026-06-18'`;

    return NextResponse.json({
      success: true,
      department_data_deleted: del.rowCount,
      day_snapshots_deleted: delSnap.rowCount,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Cleanup failed', details: String(error) },
      { status: 500 }
    );
  }
}
