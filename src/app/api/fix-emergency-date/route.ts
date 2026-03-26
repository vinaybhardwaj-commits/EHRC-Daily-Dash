import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { secret } = await request.json();
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check what exists for emergency on 2026-01-26
    const oldData = await sql`
      SELECT id, date_val, slug, tab, name, entries
      FROM department_data
      WHERE slug = 'emergency' AND date_val = '2026-01-26'
    `;

    if ((oldData.rowCount ?? 0) === 0) {
      return NextResponse.json({ error: 'No emergency data found for 2026-01-26' }, { status: 404 });
    }

    // Check if emergency already has data for 2026-03-26
    const existingToday = await sql`
      SELECT id FROM department_data
      WHERE slug = 'emergency' AND date_val = '2026-03-26'
    `;

    if ((existingToday.rowCount ?? 0) > 0) {
      return NextResponse.json({ error: 'Emergency already has data for 2026-03-26 - aborting to avoid overwrite' }, { status: 409 });
    }

    // Move the entry: update date from Jan 26 to Mar 26
    const updated = await sql`
      UPDATE department_data
      SET date_val = '2026-03-26'
      WHERE slug = 'emergency' AND date_val = '2026-01-26'
    `;

    // Also update day_snapshots if it has emergency-specific data for that date
    const snapUpdate = await sql`
      UPDATE day_snapshots
      SET date_val = '2026-03-26'
      WHERE date_val = '2026-01-26'
      AND NOT EXISTS (SELECT 1 FROM day_snapshots WHERE date_val = '2026-03-26')
    `;

    return NextResponse.json({
      success: true,
      department_data_moved: updated.rowCount ?? 0,
      day_snapshots_moved: snapUpdate.rowCount ?? 0,
      old_entry: oldData.rows[0]
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
