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
  // Fetch departments for this date
  const deptRows = await sql`
    SELECT slug, name, tab, entries FROM department_data WHERE date = ${date} ORDER BY name;
  `;
  if ((deptRows.rowCount ?? 0) === 0) return null;

  const departments: DepartmentData[] = deptRows.rows.map(r => ({
    name: r.name,
    slug: r.slug,
    tab: r.tab,
    entries: typeof r.entries === 'string' ? JSON.parse(r.entries) : r.entries,
  }));

  // Fetch the snapshot metadata
  const dayRow = await sql`SELECT updated_at FROM day_snapshots WHERE date = ${date};`;

  // Fetch huddle summaries (table may not exist yet — graceful fallback)
  let huddleSummaries: HuddleSummary[] = [];
  try {
    const hsRows = await sql`
      SELECT filename, content, uploaded_at, type FROM huddle_summaries WHERE date = ${date} ORDER BY uploaded_at;
    `;
    huddleSummaries = hsRows.rows.map(r => ({
      filename: r.filename,
      content: r.content,
      uploadedAt: r.uploaded_at,
      type: r.type as HuddleSummary['type'],
    }));
  } catch {
    // huddle_summaries table may not exist yet — return empty array
  }

  return {
    date,
    departments,
    huddleSummaries,
    updatedAt: dayRow.rows[0]?.updated_at || new Date().toISOString(),
  };
}

/**
 * List all dates that have data, most recent first.
 */
export async function listAvailableDays(): Promise<string[]> {
  const result = await sql`SELECT DISTINCT date FROM department_data ORDER BY date DESC;`;
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
 * Save a huddle summary to the database.
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

/**
 * @deprecated - File-based functions removed. Use saveHuddleSummary() for huddle files.
 * For actual binary file storage on Vercel, use Vercel Blob.
 */
export function saveSummaryFile(_date: string, _filename: string, _content: Buffer): string {
  console.warn('saveSummaryFile is deprecated - file storage not available on Vercel serverless');
  return '';
}

export function getSummaryFilePath(_date: string, _filename: string): string {
  console.warn('getSummaryFilePath is deprecated');
  return '';
}
