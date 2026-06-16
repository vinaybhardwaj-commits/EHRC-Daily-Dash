import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');

  // Bulk: all snapshots in ONE query (replaces 260 serial /api/days?date= round-trips).
  if (req.nextUrl.searchParams.get('all')) {
    const rows = await sql`
      SELECT date, slug, name, tab, entries
      FROM department_data
      ORDER BY date ASC, slug ASC;
    `;
    const byDate = new Map<string, { date: string; departments: { name: string; slug: string; tab: string; entries: unknown }[]; huddleSummaries: never[]; updatedAt: string }>();
    for (const row of rows.rows) {
      const d = row.date as string;
      if (!byDate.has(d)) byDate.set(d, { date: d, departments: [], huddleSummaries: [], updatedAt: '' });
      byDate.get(d)!.departments.push({
        name: row.name, slug: row.slug, tab: row.tab,
        entries: typeof row.entries === 'string' ? JSON.parse(row.entries) : row.entries,
      });
    }
    return NextResponse.json({ snapshots: Array.from(byDate.values()) });
  }

  if (date) {
    // Fetch all department data for this date from Postgres
    const deptResult = await sql`
      SELECT slug, name, tab, entries
      FROM department_data
      WHERE date = ${date}
      ORDER BY slug;
    `;

    if ((deptResult.rowCount ?? 0) === 0) {
      return NextResponse.json({ error: 'No data for this date' }, { status: 404 });
    }

    // Fetch the snapshot metadata
    const snapResult = await sql`
      SELECT updated_at FROM day_snapshots WHERE date = ${date};
    `;

    const departments = deptResult.rows.map(row => ({
      name: row.name,
      slug: row.slug,
      tab: row.tab,
      entries: typeof row.entries === 'string' ? JSON.parse(row.entries) : row.entries,
    }));

    // Fetch huddle summaries for this date (graceful fallback if table doesn't exist)
    let huddleSummaries: { filename: string; content: string; uploadedAt: string; type: string }[] = [];
    try {
      const hsResult = await sql`
        SELECT filename, content, uploaded_at, type
        FROM huddle_summaries
        WHERE date = ${date}
        ORDER BY uploaded_at;
      `;
      huddleSummaries = hsResult.rows.map(r => ({
        filename: r.filename,
        content: r.content,
        uploadedAt: r.uploaded_at,
        type: r.type,
      }));
    } catch {
      // huddle_summaries table may not exist yet — return empty array
    }

    const snapshot = {
      date,
      departments,
      huddleSummaries,
      updatedAt: snapResult.rows[0]?.updated_at || new Date().toISOString(),
    };

    return NextResponse.json(snapshot);
  }

  // List all available dates
  const result = await sql`
    SELECT DISTINCT date FROM department_data
    ORDER BY date DESC;
  `;

  const days = result.rows.map(r => r.date);
  return NextResponse.json({ days });
}
