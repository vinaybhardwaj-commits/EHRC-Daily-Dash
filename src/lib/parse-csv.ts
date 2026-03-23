import Papa from 'papaparse';
import { DepartmentData, DepartmentEntry, DEPARTMENTS } from './types';

function normalizeDate(raw: string): string {
  // Handle various date formats: DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, YYYY/MM/DD
  if (!raw) return '';
  const s = raw.trim();

  // YYYY/MM/DD or YYYY-MM-DD
  let m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  // DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  return s;
}

function detectDepartment(headers: string[], filename: string): typeof DEPARTMENTS[number] | null {
  const fn = filename.toLowerCase();
  for (const dept of DEPARTMENTS) {
    if (fn.includes(dept.slug.replace('-', ' ')) || fn.includes(dept.name.toLowerCase())) {
      return dept;
    }
  }
  // Fallback: check if any column names match known departments
  return null;
}

export function parseCSV(csvText: string, filename: string): { byDate: Map<string, DepartmentEntry[]>; dept: typeof DEPARTMENTS[number] | null } {
  const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const headers = result.meta.fields || [];
  const dept = detectDepartment(headers, filename);

  const byDate = new Map<string, DepartmentEntry[]>();

  for (const row of result.data as Record<string, string>[]) {
    const dateField = headers.find(h => h.toLowerCase().includes('date'));
    const timestampField = headers.find(h => h.toLowerCase().includes('timestamp'));
    const dateVal = dateField ? normalizeDate(row[dateField]) : '';
    if (!dateVal) continue;

    const fields: Record<string, string | number> = {};
    for (const h of headers) {
      if (h.toLowerCase().includes('timestamp') || h.toLowerCase().includes('date')) continue;
      const val = row[h]?.trim() || '';
      const num = parseFloat(val.replace(/[,\s]/g, ''));
      fields[h] = !isNaN(num) && val.match(/^[\d,.\s-]+$/) ? num : val;
    }

    const entry: DepartmentEntry = {
      timestamp: timestampField ? row[timestampField] : '',
      date: dateVal,
      fields,
    };

    if (!byDate.has(dateVal)) byDate.set(dateVal, []);
    byDate.get(dateVal)!.push(entry);
  }

  return { byDate, dept };
}

export function csvToDepartmentDataByDate(csvText: string, filename: string): { deptName: string; slug: string; tab: string; byDate: Map<string, DepartmentData> } {
  const { byDate, dept } = parseCSV(csvText, filename);
  const deptName = dept?.name || filename.replace(/\.csv$/i, '');
  const slug = dept?.slug || deptName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const tab = dept?.tab || deptName;

  const result = new Map<string, DepartmentData>();
  for (const [date, entries] of byDate) {
    result.set(date, { name: deptName, slug, tab, entries });
  }

  return { deptName, slug, tab, byDate: result };
}
