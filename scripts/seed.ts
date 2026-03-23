// Run with: npx tsx scripts/seed.ts
// Seeds the data directory from the CSV files in the project folder

import fs from 'fs';
import path from 'path';

// We need to set up the same logic as our lib but standalone
const DATA_DIR = path.join(process.cwd(), 'data');
const DAYS_DIR = path.join(DATA_DIR, 'days');
const SUMMARIES_DIR = path.join(DATA_DIR, 'summaries');

[DATA_DIR, DAYS_DIR, SUMMARIES_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

import Papa from 'papaparse';

interface DepartmentEntry {
  timestamp: string;
  date: string;
  fields: Record<string, string | number>;
}

interface DepartmentData {
  name: string;
  slug: string;
  tab: string;
  entries: DepartmentEntry[];
}

interface DaySnapshot {
  date: string;
  departments: DepartmentData[];
  huddleSummaries: unknown[];
  updatedAt: string;
}

const DEPARTMENTS = [
  { name: 'Emergency', slug: 'emergency', tab: 'ED' },
  { name: 'Finance', slug: 'finance', tab: 'Finance' },
  { name: 'Billing', slug: 'billing', tab: 'Billing' },
  { name: 'Pharmacy', slug: 'pharmacy', tab: 'Pharmacy' },
  { name: 'Clinical Lab', slug: 'clinical-lab', tab: 'Clinical Lab' },
  { name: 'Radiology', slug: 'radiology', tab: 'Radiology' },
  { name: 'OT', slug: 'ot', tab: 'OT' },
  { name: 'HR & Manpower', slug: 'hr-manpower', tab: 'Human Resources' },
  { name: 'Supply Chain & Procurement', slug: 'supply-chain', tab: 'Supply Chain' },
  { name: 'Training', slug: 'training', tab: 'Training' },
  { name: 'Diet', slug: 'diet', tab: 'Clinical Nutrition, F&B' },
  { name: 'Biomedical', slug: 'biomedical', tab: 'Biomedical' },
  { name: 'Customer Care', slug: 'customer-care', tab: 'Customer Care' },
  { name: 'Patient Safety', slug: 'patient-safety', tab: 'Patient Safety & Quality' },
  { name: 'Facilities', slug: 'facilities', tab: 'Facilities & Maintenance' },
  { name: 'Nursing', slug: 'nursing', tab: 'Nursing' },
  { name: 'IT', slug: 'it', tab: 'IT' },
];

function normalizeDate(raw: string): string {
  if (!raw) return '';
  const s = raw.trim();
  let m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}

function detectDept(filename: string) {
  const fn = filename.toLowerCase();
  for (const d of DEPARTMENTS) {
    if (fn.includes(d.name.toLowerCase())) return d;
  }
  if (fn.includes('supply chain')) return DEPARTMENTS.find(d => d.slug === 'supply-chain')!;
  if (fn.includes('hr')) return DEPARTMENTS.find(d => d.slug === 'hr-manpower')!;
  return null;
}

// Accept CSV_DIR from env or command line, fallback to ./csv-data
const CSV_DIR = process.env.CSV_DIR || process.argv[2] || path.join(process.cwd(), 'csv-data');
const csvFiles = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv'));

const snapshots = new Map<string, DaySnapshot>();

for (const file of csvFiles) {
  const csvText = fs.readFileSync(path.join(CSV_DIR, file), 'utf-8');
  const dept = detectDept(file);
  if (!dept) { console.log(`Skipping ${file} - no department match`); continue; }

  const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const headers = result.meta.fields || [];

  for (const row of result.data as Record<string, string>[]) {
    const dateField = headers.find(h => h.toLowerCase().includes('date'));
    const timestampField = headers.find(h => h.toLowerCase().includes('timestamp'));
    const dateVal = dateField ? normalizeDate(row[dateField]) : '';
    if (!dateVal || dateVal.length < 8) continue;

    // Fix obvious date errors (e.g., 2036 -> 2026)
    let fixedDate = dateVal;
    if (fixedDate.startsWith('2036')) fixedDate = '2026' + fixedDate.slice(4);

    const fields: Record<string, string | number> = {};
    for (const h of headers) {
      if (h.toLowerCase().includes('timestamp') || h.toLowerCase().includes('date')) continue;
      const val = row[h]?.trim() || '';
      const num = parseFloat(val.replace(/[,\s]/g, ''));
      fields[h] = !isNaN(num) && val.match(/^[\d,.\s-]+$/) ? num : val;
    }

    const entry: DepartmentEntry = {
      timestamp: timestampField ? row[timestampField] : '',
      date: fixedDate,
      fields,
    };

    if (!snapshots.has(fixedDate)) {
      snapshots.set(fixedDate, { date: fixedDate, departments: [], huddleSummaries: [], updatedAt: new Date().toISOString() });
    }

    const snap = snapshots.get(fixedDate)!;
    let deptData = snap.departments.find(d => d.slug === dept.slug);
    if (!deptData) {
      deptData = { name: dept.name, slug: dept.slug, tab: dept.tab, entries: [] };
      snap.departments.push(deptData);
    }
    deptData.entries.push(entry);
  }

  console.log(`Parsed ${file} -> ${dept.name}`);
}

for (const [date, snap] of snapshots) {
  fs.writeFileSync(path.join(DAYS_DIR, `${date}.json`), JSON.stringify(snap, null, 2));
  console.log(`Saved ${date} (${snap.departments.length} depts)`);
}

console.log(`\nDone! Seeded ${snapshots.size} days.`);
