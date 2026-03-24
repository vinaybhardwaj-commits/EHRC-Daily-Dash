import { sql } from '@vercel/postgres';
import { DaySnapshot, DepartmentData, HuddleSummary } from './types';

/**
 * Save a full day snapshot (overwrites all department data for that date).
 */
export async function saveDaySnapshot(snapshot: DaySnapshot): Promise<void> {
  const now = new Date().toISOString();

  // Upsert the day row
  await sql`
    INSERT INTO day_snapshots (date, updated_at) VALUES (${snapshot.date}, ${now})
    ON CONFLICT (date) DO UPDATE SET updated_at = ${now};
  `;

  // Upsert each department
  for (const dept of snapshot.departments) {
    await sql`
      INSERT INTO department_data (date, slug, name, tab, entries)
      VALUES (${snapshot.date}, ${dept.slug}, ${dept.name}, ${dept.tab}, ${JSON.stringify(dept.entries)}::jsonb)
      ON CONFLICT (date, slug) DO UPDATE SET
        name = EXCLUDED.name,
        tab = EXCLUDED.tab,
        entries = EXCLUDED.entries;
    `;
  }

  // Insert huddle summaries (append — no conflict key)
  for (const hs of snapshot.huddleSummaries) {
    await sql`
      INSERT INTO huddle_summaries (date, filename, content, uploaded_at, type)
      VALUES (${snapshot.date}, ${hs.filename}, ${hs.content}, ${hs.uploadedAt}, ${hs.type});
    `;
  }
}

/**
 * Load a full day snapshot by date, or null if no data exists.
 */
export async function loadDaySnapshot(date: string): Promise<DaySnapshot | null> {
  // Check if the day exists
  const dayRow = await sql`SELECT date, updated_at FROM day_snapshots WHERE date = ${date};`;
  if (dayRow.rows.length === 0) return null;

  // Fetch departments for this date
  const deptRows = await sql`
    SELECT slug, name, tab, entries FROM department_data WHERE date = ${date} ORDER BY name;
  `;
  const departments: DepartmentData[] = deptRows.rows.map(r => ({
    name: r.name,
    slug: r.slug,
    tab: r.tab,
    entries: r.entries as DepartmentData['entries'],
  }));

  // Fetch huddle summaries
  const hsRows = await sql`
    SELECT filename, content, uploaded_at, type FROM huddle_summaries WHERE date = ${date} ORDER BY uploaded_at;
  `;
  const huddleSummaries: HuddleSummary[] = hsRows.rows.map(r => ({
    filename: r.filename,
    content: r.content,
    uploadedAt: r.uploaded_at,
    type: r.type as HuddleSummary['type'],
  }));

  return {
    date,
    departments,
    huddleSummaries,
    updatedAt: dayRow.rows[0].updated_at,
  };
}

/**
 * List all dates that have data, most recent first.
 */
export async function listAvailableDays(): Promise<string[]> {
  const result = await sql`SELECT date FROM day_snapshots ORDER BY date DESC;`;
  return result.rows.map(r => r.date);
}

/**
 * Upsert a single department's data for a given date.
 * Creates the day snapshot row if it doesn't exist.
 */
export async function upsertDepartmentData(date: string, deptData: DepartmentData): Promise<DaySnapshot> {
  const now = new Date().toISOString();

  // Ensure the day row exists
  await sql`
    INSERT INTO day_snapshots (date, updated_at) VALUES (${date}, ${now})
    ON CONFLICT (date) DO UPDATE SET updated_at = ${now};
  `;

  // Upsert the department data
  await sql`
    INSERT INTO department_data (date, slug, name, tab, entries)
    VALUES (${date}, ${deptData.slug}, ${deptData.name}, ${deptData.tab}, ${JSON.stringify(deptData.entries)}::jsonb)
    ON CONFLICT (date, slug) DO UPDATE SET
      name = EXCLUDED.name,
      tab = EXCLUDED.tab,
      entries = EXCLUDED.entries;
  `;

  // Return the full snapshot
  const snapshot = await loadDaySnapshot(date);
  return snapshot!;
}

/**
 * Save a huddle summary file's metadata to the database.
 */
export async function saveHuddleSummary(date: string, summary: HuddleSummary): Promise<void> {
  const now = new Date().toISOString();

  // Ensure the day row exists
  await sql`
    INSERT INTO day_snapshots (date, updated_at) VALUES (${date}, ${now})
    ON CONFLICT (date) DO UPDATE SET updated_at = ${now};
  `;

  await sql`
    INSERT INTO huddle_summaries (date, filename, content, uploaded_at, type)
    VALUES (${date}, ${summary.filename}, ${summary.content}, ${summary.uploadedAt}, ${summary.type});
  `;
}
