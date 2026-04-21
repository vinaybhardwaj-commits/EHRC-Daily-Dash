import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { SHEET_TAB_MAP, getSheetCsvUrl } from '@/lib/sheets-config';
import { csvToDepartmentDataByDate } from '@/lib/parse-csv';
import { FORM_DEFINITIONS } from '@/lib/form-definitions';

export const dynamic = 'force-dynamic';

export async function GET() {
  return syncAllSheets();
}

export async function POST() {
  return syncAllSheets();
}

async function syncAllSheets() {
  const results: { department: string; status: string; datesUpdated?: string[]; error?: string }[] = [];

  // Process all departments in parallel (batched to avoid rate limiting)
  const slugs = Object.keys(SHEET_TAB_MAP);
  const batchSize = 5;

  for (let i = 0; i < slugs.length; i += batchSize) {
    const batch = slugs.slice(i, i + batchSize);
    const promises = batch.map(async (slug) => {
      const tabName = SHEET_TAB_MAP[slug];
      const formDef = FORM_DEFINITIONS.find(f => f.slug === slug);
      const deptName = formDef?.name || tabName;

      try {
        const url = getSheetCsvUrl(tabName);
        const resp = await fetch(url, {
          next: { revalidate: 0 },
          cache: 'no-store'
        });

        if (!resp.ok) {
          return { department: deptName, status: 'error', error: `HTTP ${resp.status}` };
        }

        const csvText = await resp.text();
        if (!csvText.trim()) {
          return { department: deptName, status: 'empty', error: 'No data in sheet' };
        }

        // Parse CSV and group by date
        const { byDate } = csvToDepartmentDataByDate(csvText, `${slug}.csv`);
        const datesUpdated: string[] = [];

        for (const [date, deptData] of byDate) {
          // Fix the department name/slug/tab to match our form definitions
          deptData.name = deptName;
          deptData.slug = slug;
          deptData.tab = formDef?.tab || tabName;

          // Fix obvious date errors (e.g., 2036 -> 2026)
          let fixedDate = date;
          if (fixedDate.startsWith('2036')) fixedDate = '2026' + fixedDate.slice(4);

          // Reject future dates (DD/MM misparse guard)
          const today = new Date().toISOString().split('T')[0];
          if (fixedDate > today) continue;

          if (fixedDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            // Upsert into Postgres instead of ephemeral JSON files
            const entriesJson = JSON.stringify(deptData.entries);
            await sql`
              INSERT INTO department_data (date, date_d, slug, name, tab, entries)
              VALUES (${fixedDate}, ${fixedDate}::date, ${slug}, ${deptName}, ${deptData.tab}, ${entriesJson}::jsonb)
              ON CONFLICT (date, slug) DO UPDATE SET
                name = EXCLUDED.name,
                tab = EXCLUDED.tab,
                entries = EXCLUDED.entries;
            `;
            datesUpdated.push(fixedDate);
          }
        }

        // Upsert day_snapshots for all synced dates
        const isoNow = new Date().toISOString();
        const uniqueDates = [...new Set(datesUpdated)];
        for (const d of uniqueDates) {
          await sql`
            INSERT INTO day_snapshots (date, updated_at)
            VALUES (${d}, ${isoNow})
            ON CONFLICT (date) DO UPDATE SET updated_at = ${isoNow};
          `;
        }

        return { department: deptName, status: 'ok', datesUpdated };
      } catch (e: unknown) {
        return { department: deptName, status: 'error', error: e instanceof Error ? e.message : 'fetch failed' };
      }
    });

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
  }

  const totalDates = new Set(results.flatMap(r => r.datesUpdated || []));

  return NextResponse.json({
    success: true,
    syncedAt: new Date().toISOString(),
    departments: results.length,
    datesUpdated: totalDates.size,
    results,
  });
}
