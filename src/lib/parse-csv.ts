import Papa from 'papaparse';
import { DepartmentData, DepartmentEntry, DEPARTMENTS } from './types';

function normalizeDate(raw: string): string {
  // Handle various date formats from Google Forms:
  //   DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY  (4-digit year)
  //   DD-MM-YY, DD/MM/YY, DD.MM.YY        (2-digit year)
  //   DD-MM_YY                             (underscore typo)
  //   YYYY-MM-DD, YYYY/MM/DD              (ISO-like)
  if (!raw) return '';
  // Normalize separators: replace underscores with dashes
  const s = raw.trim().replace(/_/g, '-');

  // YYYY/MM/DD or YYYY-MM-DD (4-digit year first)
  let m = s.match(/^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  // DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY (4-digit year last)
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  // DD-MM-YY, DD/MM/YY, DD.MM.YY (2-digit year last — assume 20xx)
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2})$/);
  if (m) return `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

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
    // Find ALL date-like columns (some forms have duplicate "Date" columns from form revisions)
    let dateFields = headers.filter(h => h.toLowerCase().includes('date') && !h.toLowerCase().includes('timestamp'));

    // Fallback: if no header contains "date", detect columns whose values look like dates
    if (dateFields.length === 0) {
      for (const h of headers) {
        if (h.toLowerCase().includes('timestamp')) continue;
        const val = row[h]?.trim() || '';
        // Check if value matches common date patterns: DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
        if (val.match(/^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}$/) || val.match(/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/)) {
          dateFields = [h];
          break;
        }
      }
    }
    const timestampField = headers.find(h => h.toLowerCase().includes('timestamp'));

    // Try each date column until we find a non-empty, parseable date
    let dateVal = '';
    for (const df of dateFields) {
      const raw = row[df]?.trim();
      if (raw) {
        const normalized = normalizeDate(raw);
        if (normalized.match(/^\d{4}-\d{2}-\d{2}$/)) {
          dateVal = normalized;
          break;
        }
      }
    }
    if (!dateVal) continue;

    const fields: Record<string, string | number> = {};
    const skipFields = new Set(dateFields);
    if (timestampField) skipFields.add(timestampField);
    for (const h of headers) {
      if (skipFields.has(h) || h.toLowerCase().includes('timestamp')) continue;
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
