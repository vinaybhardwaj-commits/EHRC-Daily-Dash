/* ──────────────────────────────────────────────────────────────────
   Historical Trend Analyzer
   Computes rolling stats and classifies trends per department
   ────────────────────────────────────────────────────────────────── */

import { sql } from '@vercel/postgres';

export type TrendDirection = 'rising' | 'falling' | 'stable' | 'volatile' | 'insufficient';
export type TrendSeverity = 'good' | 'warning' | 'concern' | 'neutral';

export interface FieldTrend {
  field: string;
  label: string;
  direction: TrendDirection;
  values: number[];        // oldest → newest
  dates: string[];
  avg: number;
  current: number;
  change_pct: number;      // % change from first half avg to second half avg
  streak: number;          // consecutive days in same direction (positive = up, negative = down)
}

export interface DepartmentTrendData {
  slug: string;
  department_name: string;
  date: string;
  lookback_days: number;
  data_days_available: number;
  trends: FieldTrend[];
}

/** Fields we care about for trends, per department. label → field patterns in historical data */
const TREND_FIELDS: Record<string, Array<{ id: string; label: string; patterns: string[]; good_direction?: 'up' | 'down' }>> = {
  'finance': [
    { id: 'revenue', label: 'Daily Revenue', patterns: ['revenue for the day', 'daily revenue'], good_direction: 'up' },
    { id: 'revenueMtd', label: 'Revenue MTD', patterns: ['total revenue mtd', 'revenue mtd'], good_direction: 'up' },
    { id: 'census', label: 'Midnight Census', patterns: ['midnight census', 'ip patients'], good_direction: 'up' },
    { id: 'arpob', label: 'ARPOB', patterns: ['arpob', 'avg revenue per occupied bed'], good_direction: 'up' },
    { id: 'surgeries', label: 'Surgeries MTD', patterns: ['surgeries mtd'], good_direction: 'up' },
  ],
  'emergency': [
    { id: 'genuineEmergencies', label: 'Genuine Emergencies', patterns: ['genuine', 'ambulance emergencies'] },
    { id: 'tat', label: 'Door-to-Doctor TAT', patterns: ['door-to-doctor', 'tat'], good_direction: 'down' },
    { id: 'lwbs', label: 'LWBS Count', patterns: ['lwbs', 'left without being seen'], good_direction: 'down' },
    { id: 'edRevenue', label: 'ED Revenue', patterns: ['ed revenue', 'revenue today'], good_direction: 'up' },
    { id: 'lamaDama', label: 'LAMA/DAMA', patterns: ['lama', 'dama'], good_direction: 'down' },
  ],
  'customer-care': [
    { id: 'opdTotal', label: 'OPD Appointments', patterns: ['opd appointments today', 'in-person'], good_direction: 'up' },
    { id: 'noShows', label: 'No-Shows', patterns: ['no-show', 'no show'], good_direction: 'down' },
    { id: 'complaints', label: 'New Complaints', patterns: ['new complaints received'], good_direction: 'down' },
    { id: 'pendingComplaints', label: 'Pending Complaints', patterns: ['total complaints pending', 'pending complaints'], good_direction: 'down' },
    { id: 'starRating', label: 'Google Star Rating', patterns: ['average star rating', 'star rating'], good_direction: 'up' },
  ],
  'nursing': [
    { id: 'census', label: 'Midnight Census', patterns: ['midnight census', 'census'] },
  ],
  'billing': [
    { id: 'pipeline', label: 'Pipeline Cases', patterns: ['pipeline cases', 'active pipeline'] },
    { id: 'otBacklog', label: 'OT Billing Backlog', patterns: ['ot cases awaiting', 'ot billing clearance'], good_direction: 'down' },
  ],
  'pharmacy': [
    { id: 'ipRevenue', label: 'Pharmacy IP Revenue', patterns: ['ip revenue', 'inpatient revenue', 'ip pharmacy revenue'], good_direction: 'up' },
    { id: 'opRevenue', label: 'Pharmacy OP Revenue', patterns: ['op revenue', 'outpatient revenue'], good_direction: 'up' },
  ],
  'radiology': [
    { id: 'xray', label: 'X-Ray Cases', patterns: ['x-ray', 'xray'] },
    { id: 'ct', label: 'CT Cases', patterns: ['ct cases', 'ct scan'] },
    { id: 'usg', label: 'USG Cases', patterns: ['usg', 'ultrasound'] },
    { id: 'pending', label: 'Pending Reports', patterns: ['pending reports'], good_direction: 'down' },
  ],
  'ot': [
    { id: 'cases', label: 'OT Cases Done', patterns: ['ot cases done', 'cases done yesterday', 'surgeries done'], good_direction: 'up' },
    { id: 'delay', label: 'First Case Delay (min)', patterns: ['first case delay', 'delay minutes'], good_direction: 'down' },
  ],
  'it': [
    { id: 'tickets', label: 'Pending IT Tickets', patterns: ['pending it ticket', 'it tickets', 'pending tickets'], good_direction: 'down' },
  ],
  'clinical-lab': [
    { id: 'criticalReports', label: 'Critical Reports Issued', patterns: ['critical report'] },
  ],
  'diet': [
    { id: 'bca', label: 'BCA Done Today', patterns: ['bca done', 'bca today'], good_direction: 'up' },
    { id: 'census', label: 'Diet Patient Census', patterns: ['diet patient', 'patient census'], good_direction: 'up' },
  ],
};

/**
 * Load raw historical data for a department (up to lookback_days).
 * Returns array of {date, fields} sorted oldest → newest.
 */
async function loadRawHistory(
  slug: string,
  upToDate: string,
  lookbackDays: number
): Promise<Array<{ date: string; fields: Record<string, unknown> }>> {
  try {
    const result = await sql`
      SELECT date, entries
      FROM department_data
      WHERE slug = ${slug}
        AND date <= ${upToDate}
      ORDER BY date DESC
      LIMIT ${lookbackDays}
    `;

    return result.rows
      .map(row => ({
        date: row.date,
        fields: normalizeEntries(row.entries),
      }))
      .reverse(); // oldest first
  } catch {
    return [];
  }
}

function normalizeEntries(entries: unknown): Record<string, unknown> {
  if (!Array.isArray(entries)) return {};
  const fields: Record<string, unknown> = {};
  for (const entry of entries) {
    if (entry && typeof entry === 'object') {
      if ('key' in entry && 'value' in entry) {
        fields[entry.key as string] = entry.value;
      }
      if ('fields' in entry && typeof entry.fields === 'object' && entry.fields !== null) {
        Object.assign(fields, entry.fields);
      }
    }
  }
  return fields;
}

/**
 * Extract a numeric value from historical fields by matching label patterns.
 */
function extractNumericValue(fields: Record<string, unknown>, patterns: string[]): number | null {
  for (const pattern of patterns) {
    const lower = pattern.toLowerCase();
    for (const [key, value] of Object.entries(fields)) {
      if (key.toLowerCase().includes(lower)) {
        const num = parseFloat(String(value).replace(/[₹,\s%]/g, ''));
        if (!isNaN(num)) return num;
      }
    }
  }
  return null;
}

/**
 * Classify trend direction from a series of values.
 */
function classifyTrend(values: number[]): { direction: TrendDirection; change_pct: number; streak: number } {
  if (values.length < 3) {
    return { direction: 'insufficient', change_pct: 0, streak: 0 };
  }

  // Split into halves for comparison
  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);

  const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;

  const change_pct = firstAvg === 0 ? 0 : ((secondAvg - firstAvg) / Math.abs(firstAvg)) * 100;

  // Calculate streak (consecutive direction from end)
  let streak = 0;
  for (let i = values.length - 1; i > 0; i--) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) {
      if (streak >= 0) streak++;
      else break;
    } else if (diff < 0) {
      if (streak <= 0) streak--;
      else break;
    } else {
      break; // equal means streak broken
    }
  }

  // Calculate coefficient of variation for volatility
  const allAvg = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - allAvg, 2), 0) / values.length;
  const cv = allAvg === 0 ? 0 : Math.sqrt(variance) / Math.abs(allAvg);

  let direction: TrendDirection;
  if (cv > 0.5 && Math.abs(change_pct) < 15) {
    direction = 'volatile';
  } else if (change_pct > 10) {
    direction = 'rising';
  } else if (change_pct < -10) {
    direction = 'falling';
  } else {
    direction = 'stable';
  }

  return { direction, change_pct: Math.round(change_pct * 10) / 10, streak };
}

/**
 * Compute trend data for a department.
 */
export async function analyzeDepartmentTrends(
  slug: string,
  date: string,
  lookbackDays: number = 14
): Promise<DepartmentTrendData> {
  const trendFields = TREND_FIELDS[slug];
  const deptNames: Record<string, string> = {
    'customer-care': 'Customer Care', 'emergency': 'Emergency', 'patient-safety': 'Patient Safety',
    'finance': 'Finance', 'billing': 'Billing', 'clinical-lab': 'Clinical Lab', 'pharmacy': 'Pharmacy',
    'supply-chain': 'Supply Chain', 'facility': 'Facility', 'nursing': 'Nursing', 'radiology': 'Radiology',
    'ot': 'OT', 'hr-manpower': 'HR & Manpower', 'diet': 'Diet', 'training': 'Training',
    'biomedical': 'Biomedical', 'it': 'IT',
  };

  if (!trendFields) {
    return {
      slug,
      department_name: deptNames[slug] || slug,
      date,
      lookback_days: lookbackDays,
      data_days_available: 0,
      trends: [],
    };
  }

  const history = await loadRawHistory(slug, date, lookbackDays);

  const trends: FieldTrend[] = [];

  for (const field of trendFields) {
    const values: number[] = [];
    const dates: string[] = [];

    for (const day of history) {
      const val = extractNumericValue(day.fields, field.patterns);
      if (val !== null) {
        values.push(val);
        dates.push(day.date);
      }
    }

    if (values.length < 3) continue;

    const { direction, change_pct, streak } = classifyTrend(values);
    const avg = Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
    const current = values[values.length - 1];

    trends.push({
      field: field.id,
      label: field.label,
      direction,
      values,
      dates,
      avg,
      current,
      change_pct,
      streak,
    });
  }

  return {
    slug,
    department_name: deptNames[slug] || slug,
    date,
    lookback_days: lookbackDays,
    data_days_available: history.length,
    trends,
  };
}

/**
 * Analyze trends across all departments that have trend fields defined.
 */
export async function analyzeAllTrends(
  date: string,
  lookbackDays: number = 14
): Promise<DepartmentTrendData[]> {
  const slugs = Object.keys(TREND_FIELDS);
  const results = await Promise.all(
    slugs.map(slug => analyzeDepartmentTrends(slug, date, lookbackDays))
  );
  // Only return departments that have actual trend data
  return results.filter(r => r.trends.length > 0);
}
