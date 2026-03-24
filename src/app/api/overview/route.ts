import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { DEPARTMENT_KPIS, GLOBAL_ISSUES, type GlobalIssue } from '@/lib/department-kpis';

export const dynamic = 'force-dynamic';

/**
 * Take only the first pipe-segment of a value.
 * Historical data often has "value1 | value2" where value1 is current day.
 */
function firstPipeSegment(value: string | number | undefined | null): string | number | undefined | null {
  if (value === undefined || value === null) return value;
  if (typeof value === 'number') return value;
  const s = String(value);
  const pipeIdx = s.indexOf('|');
  return pipeIdx >= 0 ? s.substring(0, pipeIdx).trim() : s;
}

/**
 * Extract the first number from a messy text string.
 * Handles Indian-style formatting: "Revenue For The Day- 7,28,265.63"
 * Also handles clean numbers: "403320.17"
 */
function extractNumber(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return value;
  // Always take first pipe segment to avoid mixing current/previous day data
  const raw = firstPipeSegment(value);
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === 'nil' || s.toLowerCase() === 'none' || s.toLowerCase() === 'na' || s.toLowerCase() === 'nill') return null;

  // Try to find a number pattern (with optional Indian comma formatting)
  // Match patterns like: 7,28,265.63  or  403320.17  or  16730432.64  or  1.35
  const matches = s.match(/[\d,]+\.?\d*/g);
  if (!matches) return null;

  // Prefer formatted numbers (containing commas or decimal points) over plain small numbers
  // This handles cases like "Revenue For the Day 14 & 15- 4,25,720.86"
  // where "14" and "15" are day numbers, not the actual value
  let bestFormatted: number | null = null;
  let firstPlain: number | null = null;
  for (const m of matches) {
    const cleaned = m.replace(/,/g, '');
    const num = parseFloat(cleaned);
    if (isNaN(num)) continue;
    if (m.includes(',') || (m.includes('.') && cleaned.length > 3)) {
      if (bestFormatted === null) bestFormatted = num;
    } else {
      if (firstPlain === null) firstPlain = num;
    }
  }
  return bestFormatted !== null ? bestFormatted : firstPlain;
}

/**
 * Extract a number but validate it falls within a reasonable range.
 * Used to catch cases where Excel column misalignment puts wrong data in a field.
 */
function extractNumberInRange(value: string | number | undefined | null, min: number, max: number): number | null {
  const num = extractNumber(value);
  if (num === null) return null;
  if (num < min || num > max) return null; // Out of range = likely wrong data
  return num;
}

/**
 * Count occurrences of non-nil/non-zero values in a text field.
 * Used for counting things like "1 case", "2 cases", "Nil"
 */
function extractCount(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;
  // Take first pipe segment for historical data
  const raw = firstPipeSegment(value);
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim().toLowerCase();
  if (!s || s === 'nil' || s === 'none' || s === 'no' || s === 'na' || s === 'nill' || s === '0' || s === 'no cases') return 0;
  const num = extractNumber(s);
  if (num !== null && num > 0) return num;
  // If there's text but no number, count as 1 (e.g., "1 admission")
  if (s.includes('case') || s.includes('admission') || s.includes('discharge') || s.includes('lama') || s.includes('death') || s.includes('incident') || s.includes('mlc')) {
    const n = extractNumber(s);
    return n !== null ? n : 1;
  }
  return 0;
}

/**
 * Find a field value by partial key match (case-insensitive).
 */
function findField(fields: Record<string, string | number>, ...patterns: string[]): string | number | null {
  for (const pattern of patterns) {
    const lower = pattern.toLowerCase();
    for (const [key, val] of Object.entries(fields)) {
      if (key.toLowerCase().includes(lower)) return val;
    }
  }
  return null;
}

function formatNumberShort(num: number | null): string {
  if (num === null) return '—';
  if (Math.abs(num) >= 10000000) return (num / 10000000).toFixed(2) + ' Cr';
  if (Math.abs(num) >= 100000) return (num / 100000).toFixed(2) + ' L';
  if (Math.abs(num) >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toFixed(0);
}

interface DayMetrics {
  date: string;
  revenue: number | null;
  revenueMTD: number | null;
  arpob: number | null;
  ipCensus: number | null;
  surgeriesMTD: number | null;
  erCases: number;
  deaths: number;
  lama: number;
  criticalAlerts: number;
  mlcCases: number;
  incidentReports: number;
  submittedDepts: number;
  totalDepts: number;
  stockShortages: boolean;
  equipmentIssues: boolean;
}

async function getMonthData(yearMonth: string): Promise<DayMetrics[]> {
  const result = await sql`
    SELECT d.date, d.slug, d.entries
    FROM department_data d
    WHERE d.date LIKE ${yearMonth + '%'}
    ORDER BY d.date, d.slug;
  `;

  // Group by date
  const byDate = new Map<string, Map<string, Record<string, string | number>>>();
  for (const row of result.rows) {
    const date = row.date;
    const slug = row.slug;
    const entries = row.entries as Array<{ fields: Record<string, string | number> }>;
    const fields = entries?.[0]?.fields || {};

    if (!byDate.has(date)) byDate.set(date, new Map());
    byDate.get(date)!.set(slug, fields);
  }

  const metrics: DayMetrics[] = [];

  for (const [date, deptMap] of byDate) {
    const finance = deptMap.get('finance') || {};
    const emergency = deptMap.get('emergency') || {};
    const patientSafety = deptMap.get('patient-safety') || {};
    const supplyChain = deptMap.get('supply-chain') || {};
    const biomedical = deptMap.get('biomedical') || {};
    const nursing = deptMap.get('nursing') || {};

    // Financial metrics
    const revenueRaw = findField(finance, 'revenue for the day', 'revnue for the day', 'Revenue for the day');
    const revenueMTDRaw = findField(finance, 'total revenue', 'Total revenue MTD');
    const arpobRaw = findField(finance, 'arpob', 'ARPOB');
    const censusRaw = findField(finance, 'midnight census', 'mid night census', 'census — total IP');
    const surgeriesRaw = findField(finance, 'surgeries', 'Surgeries MTD');

    // Emergency metrics
    const erCasesRaw = findField(emergency, 'er cases', '# of ER cases', 'walk-in');
    const deathsRaw = findField(emergency, 'death', '# of Deaths');
    const lamaRaw = findField(emergency, 'lama', '# of LAMA', 'DAMA');
    const alertsRaw = findField(emergency, 'critical alert', 'Code Blue');
    const mlcRaw = findField(emergency, 'mlc', 'MLC cases');

    // Patient Safety
    const incidentRaw = findField(patientSafety, 'incident', '# of Incident');

    // Supply Chain
    const stockRaw = findField(supplyChain, 'shortage', 'stockout', 'critical stock');
    const stockText = stockRaw ? String(stockRaw).toLowerCase() : '';
    const hasShortage = stockText.length > 0 && !['nil', 'none', 'no', 'na', 'nill', 'no stock outs', 'no stockouts', 'adequate'].some(w => stockText.includes(w));

    // Biomedical
    const breakdownRaw = findField(biomedical, 'breakdown', 'pending repair');
    const breakdownText = breakdownRaw ? String(breakdownRaw).toLowerCase() : '';
    const hasEquipmentIssue = breakdownText.length > 0 && !['nil', 'none', 'no', 'na', 'nill', 'no breakdowns', 'no pending'].some(w => breakdownText.includes(w));

    // IP Census should be a small number (1-200 patients), not a revenue figure
    // ARPOB should be in the range of ~50,000 to ~500,000 (Rs per bed per month)
    // Surgeries MTD should be reasonable (1-500)
    const censusVal = extractNumberInRange(censusRaw, 0, 200);
    const arpobVal = extractNumberInRange(arpobRaw, 10000, 1000000);

    metrics.push({
      date,
      revenue: extractNumber(revenueRaw),
      revenueMTD: extractNumber(revenueMTDRaw),
      arpob: arpobVal,
      ipCensus: censusVal,
      surgeriesMTD: extractNumberInRange(surgeriesRaw, 0, 500),
      erCases: extractCount(erCasesRaw),
      deaths: extractCount(deathsRaw),
      lama: extractCount(lamaRaw),
      criticalAlerts: extractCount(alertsRaw),
      mlcCases: extractCount(mlcRaw),
      incidentReports: extractCount(incidentRaw),
      submittedDepts: deptMap.size,
      totalDepts: 17,
      stockShortages: hasShortage,
      equipmentIssues: hasEquipmentIssue,
    });
  }

  metrics.sort((a, b) => a.date.localeCompare(b.date));
  return metrics;
}

function aggregateMonth(metrics: DayMetrics[]) {
  if (metrics.length === 0) return null;

  const latestWithRevenueMTD = [...metrics].reverse().find(m => m.revenueMTD !== null);
  const latestWithArpob = [...metrics].reverse().find(m => m.arpob !== null);
  const latestWithCensus = [...metrics].reverse().find(m => m.ipCensus !== null);
  const latestWithSurgeries = [...metrics].reverse().find(m => m.surgeriesMTD !== null);

  const dailyRevenues = metrics.filter(m => m.revenue !== null).map(m => ({ date: m.date, value: m.revenue! }));
  const dailyCensus = metrics.filter(m => m.ipCensus !== null).map(m => ({ date: m.date, value: m.ipCensus! }));
  const dailyErCases = metrics.map(m => ({ date: m.date, value: m.erCases }));
  const dailySubmissions = metrics.map(m => ({ date: m.date, submitted: m.submittedDepts, total: m.totalDepts }));

  const totalErCases = metrics.reduce((s, m) => s + m.erCases, 0);
  const totalDeaths = metrics.reduce((s, m) => s + m.deaths, 0);
  const totalLama = metrics.reduce((s, m) => s + m.lama, 0);
  const totalCriticalAlerts = metrics.reduce((s, m) => s + m.criticalAlerts, 0);
  const totalMlcCases = metrics.reduce((s, m) => s + m.mlcCases, 0);
  const totalIncidents = metrics.reduce((s, m) => s + m.incidentReports, 0);
  const daysWithShortages = metrics.filter(m => m.stockShortages).length;
  const daysWithEquipmentIssues = metrics.filter(m => m.equipmentIssues).length;

  const avgSubmissionRate = metrics.reduce((s, m) => s + m.submittedDepts, 0) / metrics.length;
  const avgDailyRevenue = dailyRevenues.length > 0
    ? dailyRevenues.reduce((s, d) => s + d.value, 0) / dailyRevenues.length
    : null;
  const avgCensus = dailyCensus.length > 0
    ? dailyCensus.reduce((s, d) => s + d.value, 0) / dailyCensus.length
    : null;

  return {
    daysReported: metrics.length,
    // Financial
    revenueMTD: latestWithRevenueMTD?.revenueMTD ?? null,
    latestArpob: latestWithArpob?.arpob ?? null,
    latestCensus: latestWithCensus?.ipCensus ?? null,
    surgeriesMTD: latestWithSurgeries?.surgeriesMTD ?? null,
    avgDailyRevenue,
    avgCensus,
    dailyRevenues,
    dailyCensus,
    // Clinical
    totalErCases,
    totalDeaths,
    totalLama,
    totalCriticalAlerts,
    totalMlcCases,
    totalIncidents,
    dailyErCases,
    // Operational
    avgSubmissionRate: Math.round(avgSubmissionRate * 10) / 10,
    daysWithShortages,
    daysWithEquipmentIssues,
    dailySubmissions,
  };
}

/**
 * Get raw per-department fields for every day in a month.
 * Returns Map<date, Map<slug, fields>>
 */
async function getRawDeptData(yearMonth: string): Promise<Map<string, Map<string, Record<string, string | number>>>> {
  const result = await sql`
    SELECT d.date, d.slug, d.entries
    FROM department_data d
    WHERE d.date LIKE ${yearMonth + '%'}
    ORDER BY d.date, d.slug;
  `;

  const byDate = new Map<string, Map<string, Record<string, string | number>>>();
  for (const row of result.rows) {
    const date = row.date;
    const slug = row.slug;
    const entries = row.entries as Array<{ fields: Record<string, string | number> }>;
    const fields = entries?.[0]?.fields || {};
    if (!byDate.has(date)) byDate.set(date, new Map());
    byDate.get(date)!.set(slug, fields);
  }
  return byDate;
}

/**
 * Extract the signature KPI value for a department from its fields.
 */
function extractDeptKPI(slug: string, fields: Record<string, string | number>): { value: number | null; textValue: string | null; status: 'good' | 'warning' | 'bad' | null } {
  const kpiDef = DEPARTMENT_KPIS.find(k => k.slug === slug);
  if (!kpiDef) return { value: null, textValue: null, status: null };

  if (kpiDef.type === 'number') {
    // Special case: radiology sums X-Ray + USG + CT
    if (slug === 'radiology') {
      const xray = extractNumber(findField(fields, 'x-ray'));
      const usg = extractNumber(findField(fields, 'usg'));
      const ct = extractNumber(findField(fields, 'ct'));
      const total = (xray || 0) + (usg || 0) + (ct || 0);
      return { value: total > 0 ? total : null, textValue: null, status: null };
    }
    const raw = findField(fields, ...kpiDef.fieldPatterns);
    const val = extractNumber(raw);
    return { value: val, textValue: null, status: null };
  }

  if (kpiDef.type === 'text-status') {
    const raw = findField(fields, ...kpiDef.fieldPatterns);
    const text = raw ? String(raw).trim() : '';
    if (!text) return { value: null, textValue: null, status: null };

    const lower = text.toLowerCase();
    const kw = kpiDef.statusKeywords!;
    let status: 'good' | 'warning' | 'bad' = 'warning'; // default

    // Check bad first (more specific), then good, then default to warning
    if (kw.bad.some(w => lower.includes(w))) status = 'bad';
    else if (kw.good.some(w => lower.includes(w))) status = 'good';
    else if (kw.warning.some(w => lower.includes(w))) status = 'warning';

    return { value: null, textValue: text.substring(0, 60), status };
  }

  return { value: null, textValue: null, status: null };
}

/**
 * Extract global issue value for a single day.
 */
function extractIssueValue(issue: GlobalIssue, deptFields: Record<string, string | number>): { active: boolean; count: number } {
  const raw = findField(deptFields, ...issue.fieldPatterns);

  if (issue.type === 'count') {
    const count = extractCount(raw);
    const threshold = issue.threshold ?? 0;
    return { active: count > threshold, count };
  }

  if (issue.type === 'boolean-text') {
    const text = raw ? String(raw).trim().toLowerCase() : '';
    if (!text) return { active: false, count: 0 };
    const isClear = (issue.clearKeywords || []).some(w => text.includes(w));
    if (isClear) return { active: false, count: 0 };
    const isIssue = (issue.issueKeywords || []).some(w => text.includes(w));
    return { active: isIssue || (!isClear && text.length > 0), count: isIssue ? 1 : 0 };
  }

  return { active: false, count: 0 };
}

/**
 * Build global issues summary with weekly trend.
 */
function buildGlobalIssues(rawData: Map<string, Map<string, Record<string, string | number>>>) {
  const sortedDates = Array.from(rawData.keys()).sort();
  if (sortedDates.length === 0) return [];

  const latestDate = sortedDates[sortedDates.length - 1];
  // Last 7 reporting days for trend
  const recentDates = sortedDates.slice(-7);
  const olderDates = sortedDates.slice(0, -7).slice(-7); // previous 7 for comparison

  return GLOBAL_ISSUES.map(issue => {
    // Today's value
    const todayDeptFields = rawData.get(latestDate)?.get(issue.deptSlug) || {};
    const todayVal = extractIssueValue(issue, todayDeptFields);

    // Recent week totals
    let recentTotal = 0;
    let recentActiveDays = 0;
    for (const date of recentDates) {
      const fields = rawData.get(date)?.get(issue.deptSlug) || {};
      const val = extractIssueValue(issue, fields);
      recentTotal += val.count;
      if (val.active) recentActiveDays++;
    }

    // Older week totals for comparison
    let olderTotal = 0;
    let olderActiveDays = 0;
    for (const date of olderDates) {
      const fields = rawData.get(date)?.get(issue.deptSlug) || {};
      const val = extractIssueValue(issue, fields);
      olderTotal += val.count;
      if (val.active) olderActiveDays++;
    }

    // Trend: comparing recent week to older week
    let trend: 'up' | 'down' | 'flat' = 'flat';
    if (recentTotal > olderTotal) trend = 'up';
    else if (recentTotal < olderTotal) trend = 'down';

    return {
      id: issue.id,
      label: issue.label,
      severity: issue.severity,
      todayCount: todayVal.count,
      todayActive: todayVal.active,
      weekTotal: recentTotal,
      weekActiveDays: recentActiveDays,
      prevWeekTotal: olderTotal,
      trend,
    };
  });
}

/**
 * Build per-department signature KPI data with trend.
 */
function buildDeptKPIs(rawData: Map<string, Map<string, Record<string, string | number>>>) {
  const sortedDates = Array.from(rawData.keys()).sort();
  if (sortedDates.length === 0) return [];

  const latestDate = sortedDates[sortedDates.length - 1];
  // For trend: compare latest value to 7-day average
  const recentDates = sortedDates.slice(-7);

  return DEPARTMENT_KPIS.map(kpiDef => {
    const latestFields = rawData.get(latestDate)?.get(kpiDef.slug) || {};
    const latest = extractDeptKPI(kpiDef.slug, latestFields);

    // Check if department submitted on the latest date
    const submitted = rawData.get(latestDate)?.has(kpiDef.slug) || false;

    // Compute 7-day average for numeric KPIs
    let avg7d: number | null = null;
    let trend: 'up' | 'down' | 'flat' = 'flat';

    if (kpiDef.type === 'number') {
      const recentValues: number[] = [];
      for (const date of recentDates) {
        const fields = rawData.get(date)?.get(kpiDef.slug);
        if (fields) {
          const kpiResult = extractDeptKPI(kpiDef.slug, fields);
          if (kpiResult.value !== null) recentValues.push(kpiResult.value);
        }
      }
      if (recentValues.length >= 2) {
        avg7d = recentValues.reduce((s, v) => s + v, 0) / recentValues.length;
        if (latest.value !== null) {
          const diff = latest.value - avg7d;
          const pct = avg7d !== 0 ? Math.abs(diff / avg7d) * 100 : 0;
          if (pct > 5) trend = diff > 0 ? 'up' : 'down';
        }
      }
    }

    // Monthly submission count
    let submissionCount = 0;
    for (const [, deptMap] of rawData) {
      if (deptMap.has(kpiDef.slug)) submissionCount++;
    }

    return {
      slug: kpiDef.slug,
      label: kpiDef.label,
      unit: kpiDef.unit || null,
      type: kpiDef.type,
      invertTrend: kpiDef.invertTrend || false,
      value: latest.value,
      textValue: latest.textValue,
      status: latest.status,
      submitted,
      submissionCount,
      totalDays: sortedDates.length,
      trend,
      avg7d,
    };
  });
}

/**
 * Build heatmap data: for each date, which department slugs submitted.
 */
function buildHeatmapData(rawData: Map<string, Map<string, Record<string, string | number>>>) {
  const result: { date: string; slugs: string[] }[] = [];
  const sortedDates = Array.from(rawData.keys()).sort();
  for (const date of sortedDates) {
    const deptMap = rawData.get(date)!;
    result.push({ date, slugs: Array.from(deptMap.keys()) });
  }
  return result;
}

export async function GET(req: NextRequest) {
  const monthParam = req.nextUrl.searchParams.get('month'); // e.g., '2026-03'

  // Default to current month
  const now = new Date();
  const currentMonth = monthParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Calculate previous month
  const [year, month] = currentMonth.split('-').map(Number);
  const prevDate = new Date(year, month - 2, 1); // month-2 because month is 1-based and we want previous
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  const [currentData, prevData, currentRawData] = await Promise.all([
    getMonthData(currentMonth),
    getMonthData(prevMonth),
    getRawDeptData(currentMonth),
  ]);

  const current = aggregateMonth(currentData);
  const previous = aggregateMonth(prevData);

  // New: global issues, department KPIs, and heatmap data
  const globalIssues = buildGlobalIssues(currentRawData);
  const departmentKPIs = buildDeptKPIs(currentRawData);
  const heatmapData = buildHeatmapData(currentRawData);

  // Get total available months for the month selector
  const monthsResult = await sql`
    SELECT DISTINCT LEFT(date, 7) as month FROM day_snapshots ORDER BY month DESC;
  `;
  const availableMonths = monthsResult.rows.map(r => r.month);

  // Get today's date and calculate the start of this week (Monday)
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - mondayOffset);
  const weekStartStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

  // All 17 department slugs with display names
  const ALL_DEPARTMENTS = [
    { slug: 'emergency', name: 'Emergency' },
    { slug: 'customer-care', name: 'Customer Care' },
    { slug: 'patient-safety', name: 'Patient Safety' },
    { slug: 'finance', name: 'Finance' },
    { slug: 'billing', name: 'Billing' },
    { slug: 'supply-chain', name: 'Supply Chain' },
    { slug: 'facility', name: 'Facility & Engineering' },
    { slug: 'it', name: 'IT' },
    { slug: 'nursing', name: 'Nursing' },
    { slug: 'pharmacy', name: 'Pharmacy' },
    { slug: 'clinical-lab', name: 'Clinical Lab' },
    { slug: 'radiology', name: 'Radiology' },
    { slug: 'ot', name: 'OT' },
    { slug: 'hr-manpower', name: 'HR & Manpower' },
    { slug: 'training', name: 'Training' },
    { slug: 'diet', name: 'Diet & Nutrition' },
    { slug: 'biomedical', name: 'Biomedical' },
  ];

  // Fetch today's submissions (which departments submitted)
  const todayResult = await sql`
    SELECT slug, entries FROM department_data WHERE date = ${todayStr};
  `;
  const todaySubmissions = todayResult.rows.map(r => {
    const entries = r.entries as Array<{ fields: Record<string, string | number> }>;
    const fields = entries?.[0]?.fields || {};
    // Extract a one-line highlight from the data
    let highlight = '';
    if (r.slug === 'finance') {
      const rev = findField(fields, 'revenue for the day', 'revnue for the day');
      if (rev) highlight = `Rev: ₹${formatNumberShort(extractNumber(rev))}`;
    } else if (r.slug === 'emergency') {
      const er = findField(fields, 'er cases', '# of ER cases', 'walk-in');
      if (er) highlight = `ER Cases: ${extractCount(er)}`;
    } else if (r.slug === 'pharmacy') {
      const stock = findField(fields, 'stockout', 'shortage', 'critical stock');
      highlight = stock ? String(firstPipeSegment(stock)).substring(0, 50) : '';
    } else if (r.slug === 'nursing') {
      const census = findField(fields, 'census', 'ip count', 'bed');
      if (census) highlight = `Census: ${extractNumber(census) || ''}`;
    }
    return { slug: r.slug, highlight };
  });

  // Fetch this week's submissions (Mon–today), grouped by date and slug
  const weekResult = await sql`
    SELECT date, slug FROM department_data
    WHERE date >= ${weekStartStr} AND date <= ${todayStr}
    ORDER BY date, slug;
  `;
  const weekByDate = new Map<string, string[]>();
  for (const row of weekResult.rows) {
    if (!weekByDate.has(row.date)) weekByDate.set(row.date, []);
    weekByDate.get(row.date)!.push(row.slug);
  }
  const weekDays = Array.from(weekByDate.entries()).map(([date, slugs]) => ({ date, slugs }));

  return NextResponse.json({
    currentMonth,
    previousMonth: prevMonth,
    current,
    previous,
    availableMonths,
    dailyMetrics: currentData,
    todayDate: todayStr,
    todaySubmissions,
    weekStartDate: weekStartStr,
    weekDays,
    allDepartments: ALL_DEPARTMENTS,
    // New sections for upgraded overview
    globalIssues,
    departmentKPIs,
    heatmapData,
  });
}
