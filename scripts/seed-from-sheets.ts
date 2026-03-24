/**
 * Seed the Postgres database by pulling all data from Google Sheets.
 *
 * Usage:
 *   POSTGRES_URL="postgres://..." npx tsx scripts/seed-from-sheets.ts
 *
 * This does the same thing as the /api/sheets-sync endpoint,
 * but runs as a standalone CLI script for initial data population.
 */

import { sql } from '@vercel/postgres';
import Papa from 'papaparse';

const SPREADSHEET_ID = '19Aqqqa2gatb--5h7hFzEzpFpbWcADqzH7d0v5xNviJM';

const SHEET_TAB_MAP: Record<string, { name: string; tab: string }> = {
  'emergency':      { name: 'Emergency',                    tab: 'ED' },
  'customer-care':  { name: 'Customer Care',                tab: 'Customer Care' },
  'patient-safety': { name: 'Patient Safety & Quality',     tab: 'Patient Safety' },
  'finance':        { name: 'Finance',                      tab: 'Finance' },
  'billing':        { name: 'Billing',                      tab: 'Billing' },
  'supply-chain':   { name: 'Supply Chain & Procurement',   tab: 'Supply Chain' },
  'facility':       { name: 'Facility',                     tab: 'FMS' },
  'it':             { name: 'IT',                           tab: 'IT' },
  'nursing':        { name: 'Nursing',                      tab: 'Nursing' },
  'pharmacy':       { name: 'Pharmacy',                     tab: 'Pharmacy' },
  'clinical-lab':   { name: 'Clinical Lab',                 tab: 'Clinical Lab' },
  'radiology':      { name: 'Radiology',                    tab: 'Radiology' },
  'ot':             { name: 'OT',                           tab: 'OT' },
  'hr-manpower':    { name: 'HR & Manpower',                tab: 'Human Resources' },
  'training':       { name: 'Training',                     tab: 'Training' },
  'diet':           { name: 'Diet',                         tab: 'Clinical Nutrition, F&B' },
  'biomedical':     { name: 'Biomedical',                   tab: 'Biomedical' },
};

function getSheetCsvUrl(tabName: string): string {
  const encoded = encodeURIComponent(tabName);
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encoded}`;
}

function normalizeDate(raw: string): string {
  if (!raw) return '';
  const s = raw.trim();
  let m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}

async function seed() {
  console.log('Seeding EHRC database from Google Sheets...\n');

  let totalRows = 0;
  const allDates = new Set<string>();

  for (const [slug, { name, tab }] of Object.entries(SHEET_TAB_MAP)) {
    process.stdout.write(`  ${name} (${tab})... `);

    try {
      const url = getSheetCsvUrl(tab);
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) {
        console.log(`ERROR HTTP ${resp.status}`);
        continue;
      }

      const csvText = await resp.text();
      if (!csvText.trim()) {
        console.log('EMPTY');
        continue;
      }

      const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });
      const headers = result.meta.fields || [];
      const rows = result.data as Record<string, string>[];

      // Group entries by date
      const byDate = new Map<string, object[]>();

      for (const row of rows) {
        const dateField = headers.find(h => h.toLowerCase().includes('date'));
        const timestampField = headers.find(h => h.toLowerCase().includes('timestamp'));
        let dateVal = dateField ? normalizeDate(row[dateField]) : '';
        if (!dateVal) continue;

        // Fix obvious year errors
        if (dateVal.startsWith('2036')) dateVal = '2026' + dateVal.slice(4);
        if (!dateVal.match(/^\d{4}-\d{2}-\d{2}$/)) continue;

        const fields: Record<string, string | number> = {};
        for (const h of headers) {
          if (h.toLowerCase().includes('timestamp') || h.toLowerCase().includes('date')) continue;
          const val = row[h]?.trim() || '';
          const num = parseFloat(val.replace(/[,\s]/g, ''));
          fields[h] = !isNaN(num) && val.match(/^[\d,.\s-]+$/) ? num : val;
        }

        const entry = {
          timestamp: timestampField ? row[timestampField] : '',
          date: dateVal,
          fields,
        };

        if (!byDate.has(dateVal)) byDate.set(dateVal, []);
        byDate.get(dateVal)!.push(entry);
      }

      // Upsert into Postgres
      let deptRows = 0;
      for (const [date, entries] of byDate) {
        const now = new Date().toISOString();

        await sql`
          INSERT INTO day_snapshots (date, updated_at) VALUES (${date}, ${now})
          ON CONFLICT (date) DO UPDATE SET updated_at = ${now};
        `;

        await sql`
          INSERT INTO department_data (date, slug, name, tab, entries)
          VALUES (${date}, ${slug}, ${name}, ${tab}, ${JSON.stringify(entries)}::jsonb)
          ON CONFLICT (date, slug) DO UPDATE SET
            name = EXCLUDED.name,
            tab = EXCLUDED.tab,
            entries = EXCLUDED.entries;
        `;

        allDates.add(date);
        deptRows += entries.length;
      }

      totalRows += deptRows;
      console.log(`${deptRows} entries across ${byDate.size} dates`);
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nDone! ${totalRows} total entries across ${allDates.size} dates.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
