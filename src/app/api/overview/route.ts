import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { DEPARTMENT_KPIS, GLOBAL_ISSUES, DEPT_ALERT_DEFS, type GlobalIssue } from '@/lib/department-kpis';

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
  if (num === null) return 'â';
  if (Math.abs(num) >= 10000000) return (num / 10000000).toFixed(2) + ' Cr';
  if (Math.abs(num) >= 100000) return (num / 100000).toFixed(2) + ' L';
  if (Math.abs(num) >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toFixed(0);
}

/**
 * Extract admission count from the messy "# of Admissions/Transfers" field.
 * Examples: "2 admissions", "1 icu admission, 1 ward admission, 5 discharges",
 *           "1 admission, 2 discharges, 1 LAMA", "Nil", "0"
 * We count ONLY admissions (icu/ward/generic), ignoring discharges/LAMA/transfers.
 */
function extractAdmissions(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;
  const s = String(value).trim().toLowerCase();
  if (!s || s === 'nil' || s === 'none' || s === 'na' || s === 'nill' || s === '0') return 0;

  // Split by commas to handle each segment separately
  const segments = s.split(',').map(seg => seg.trim());
  let total = 0;
  for (const seg of segments) {
    // Skip segments about discharges, LAMA, DAMA, transfers (not admissions)
    if (/discharge|lama|dama|transfer out/i.test(seg) && !/admission/i.test(seg)) continue;
    // Match patterns like "2 admissions", "1 icu admission", "1 ward admission", "1admission"
    const match = seg.match(/(\d+)\s*(?:icu\s*|ward\s*|icu\/ward\s*)?admission/i);
    if (match) {
      total += parseInt(match[1], 10);
    }
  }
  return total;
}

interface DayMetrics {
  date: string;
  revenue: number | null;
  revenueMTD: number | null;
  arpob: number | null;
  ipCensus: number | null;
  admissions: number;
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
    const censusRaw = findField(finance, 'midnight census', 'mid night census', 'census â total IP');
    const surgeriesRaw = findField(finance, 'surgeries', 'Surgeries MTD');

    // Emergency metrics
    const erCasesRaw = findField(emergency, 'er cases', '# of ER cases', 'walk-in');
    const deathsRaw = findField(emergency, 'death', '# of Deaths');
    const lamaRaw = findField(emergency, 'lama', '# of LAMA', 'DAMA');
    const alertsRaw = findField(emergency, 'critical alert', 'Code Blue');
    const mlcRaw = findField(emergency, 'mlc', 'MLC cases');
    const admissionsRaw = findField(emergency, 'admission', '# of Admissions');

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
      admissions: extractAdmissions(admissionsRaw),
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
  const dailyAdmissions = metrics.map(m => ({ date: m.date, value: m.admissions }));
  const dailyErCases = metrics.map(m => ({ date: m.date, value: m.erCases }));
  const dailySubmissions = metrics.map(m => ({ date: m.date, submitted: m.submittedDepts, total: m.totalDepts }));

  const totalAdmissions = metrics.reduce((s, m) => s + m.admissions, 0);
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
    dailyAdmissions,
    totalAdmissions,
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
 * Collect all occurrences of a global issue from raw data across all dates.
 */
function collectIssueDetails(
  issue: GlobalIssue,
  rawData: Map<string, Map<string, Record<string, string | number>>>
): { details: { date: string; text: string; count: number }[]; totalCount: number; activeDays: number } {
  const details: { date: string; text: string; count: number }[] = [];
  let totalCount = 0;
  let activeDays = 0;

  const sortedDates = Array.from(rawData.keys()).sort();
  for (const date of sortedDates) {
    const fields = rawData.get(date)?.get(issue.deptSlug) || {};
    const val = extractIssueValue(issue, fields);
    totalCount += val.count;
    if (val.active) {
      activeDays++;
      const rawText = findField(fields, ...issue.fieldPatterns);
      const displayText = rawText ? String(rawText).trim() : '';
      details.push({
        date,
        text: displayText.length > 100 ? displayText.substring(0, 100) + '...' : displayText,
        count: val.count,
      });
    }
  }
  return { details: details.sort((a, b) => b.date.localeCompare(a.date)), totalCount, activeDays };
}

/**
 * Build global issues summary with month-over-month comparison.
 */
function buildGlobalIssues(
  currentRawData: Map<string, Map<string, Record<string, string | number>>>,
  prevRawData: Map<string, Map<string, Record<string, string | number>>>
) {
  const sortedDates = Array.from(currentRawData.keys()).sort();
  if (sortedDates.length === 0) return [];

  const latestDate = sortedDates[sortedDates.length - 1];
  // Last 7 reporting days for the "7d" column
  const recentDates = sortedDates.slice(-7);

  return GLOBAL_ISSUES.map(issue => {
    // Today's value
    const todayDeptFields = currentRawData.get(latestDate)?.get(issue.deptSlug) || {};
    const todayVal = extractIssueValue(issue, todayDeptFields);

    // Recent 7-day total (for the "7d" column display)
    let weekTotal = 0;
    for (const date of recentDates) {
      const fields = currentRawData.get(date)?.get(issue.deptSlug) || {};
      const val = extractIssueValue(issue, fields);
      weekTotal += val.count;
    }

    // Full current month details
    const current = collectIssueDetails(issue, currentRawData);
    // Full previous month details
    const prev = collectIssueDetails(issue, prevRawData);

    // Trend: comparing current month total to previous month total
    let trend: 'up' | 'down' | 'flat' = 'flat';
    if (current.totalCount > prev.totalCount) trend = 'up';
    else if (current.totalCount < prev.totalCount) trend = 'down';

    // Build change summary
    let changeSummary = '';
    const currentDaysReported = sortedDates.length;
    const prevDaysReported = Array.from(prevRawData.keys()).length;
    if (issue.type === 'count') {
      changeSummary = `${current.totalCount} total this month (${current.activeDays} days) vs ${prev.totalCount} last month (${prev.activeDays} days)`;
    } else {
      changeSummary = `${current.activeDays} days flagged this month (of ${currentDaysReported}) vs ${prev.activeDays} days last month (of ${prevDaysReported})`;
    }

    return {
      id: issue.id,
      label: issue.label,
      severity: issue.severity,
      deptSlug: issue.deptSlug,
      todayCount: todayVal.count,
      todayActive: todayVal.active,
      weekTotal,
      weekActiveDays: current.activeDays,
      prevWeekTotal: prev.totalCount,
      trend,
      // Current month details (replaces old recentDetails)
      recentDetails: current.details,
      currentMonthTotal: current.totalCount,
      currentMonthActiveDays: current.activeDays,
      currentMonthDaysReported: currentDaysReported,
      // Previous month details (new)
      prevDetails: prev.details,
      prevMonthTotal: prev.totalCount,
      prevMonthActiveDays: prev.activeDays,
      prevMonthDaysReported: prevDaysReported,
      changeSummary,
    };
  });
}

/**
 * Build per-department signature KPI data with trend + previous month comparison.
 */
function buildDeptKPIs(
  rawData: Map<string, Map<string, Record<string, string | number>>>,
  prevRawData: Map<string, Map<string, Record<string, string | number>>>
) {
  const sortedDates = Array.from(rawData.keys()).sort();
  if (sortedDates.length === 0) return [];

  const latestDate = sortedDates[sortedDates.length - 1];
  // For trend: compare latest value to 7-day average
  const recentDates = sortedDates.slice(-7);

  // Previous month dates
  const prevSortedDates = Array.from(prevRawData.keys()).sort();
  const prevLatestDate = prevSortedDates.length > 0 ? prevSortedDates[prevSortedDates.length - 1] : null;

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

    // Previous month KPI: get the latest value from prev month
    let prevValue: number | null = null;
    let prevTextValue: string | null = null;
    let prevStatus: 'good' | 'warning' | 'bad' | null = null;
    let prevAvg: number | null = null;

    if (prevLatestDate) {
      const prevLatestFields = prevRawData.get(prevLatestDate)?.get(kpiDef.slug) || {};
      const prevLatest = extractDeptKPI(kpiDef.slug, prevLatestFields);
      prevValue = prevLatest.value;
      prevTextValue = prevLatest.textValue;
      prevStatus = prevLatest.status;

      // Compute previous month average for numeric KPIs
      if (kpiDef.type === 'number') {
        const prevValues: number[] = [];
        for (const date of prevSortedDates) {
          const fields = prevRawData.get(date)?.get(kpiDef.slug);
          if (fields) {
            const kpiResult = extractDeptKPI(kpiDef.slug, fields);
            if (kpiResult.value !== null) prevValues.push(kpiResult.value);
          }
        }
        if (prevValues.length > 0) {
          prevAvg = prevValues.reduce((s, v) => s + v, 0) / prevValues.length;
        }
      }
    }

    // Previous month submission count
    let prevSubmissionCount = 0;
    for (const [, deptMap] of prevRawData) {
      if (deptMap.has(kpiDef.slug)) prevSubmissionCount++;
    }

    // Month-over-month trend (comparing averages for numeric, status for text)
    let monthTrend: 'up' | 'down' | 'flat' = 'flat';
    if (kpiDef.type === 'number' && avg7d !== null && prevAvg !== null && prevAvg !== 0) {
      const diff = avg7d - prevAvg;
      const pct = Math.abs(diff / prevAvg) * 100;
      if (pct > 5) monthTrend = diff > 0 ? 'up' : 'down';
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
      // Previous month comparison
      prevValue,
      prevTextValue,
      prevStatus,
      prevAvg,
      prevSubmissionCount,
      prevTotalDays: prevSortedDates.length,
      monthTrend,
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

/**
 * Build per-department alerts: recent red-flag items and missed submissions.
 */
function buildDeptAlerts(rawData: Map<string, Map<string, Record<string, string | number>>>) {
  const sortedDates = Array.from(rawData.keys()).sort();
  if (sortedDates.length === 0) return [];

  const latestDate = sortedDates[sortedDates.length - 1];
  const recentDates = sortedDates.slice(-5); // last 5 reporting days
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return DEPT_ALERT_DEFS.map(def => {
    const alerts: { message: string; severity: 'red' | 'amber' | 'info'; sourceDate?: string | null; sourceSlug?: string }[] = [];

    // Check for missed submissions in last 5 days
    const missedDates = recentDates.filter(d => !rawData.get(d)?.has(def.slug) && d <= todayStr);
    if (missedDates.length > 0) {
      const dateLabels = missedDates.map(d => {
        const dt = new Date(d + 'T00:00:00');
        return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      });
      alerts.push({
        message: `Missed submission: ${dateLabels.join(', ')}`,
        severity: 'amber',
        sourceDate: missedDates[0],
        sourceSlug: def.slug,
      });
    }

    // Check field-level alerts from latest available data for this dept
    let latestDeptDate: string | null = null;
    for (let i = sortedDates.length - 1; i >= 0; i--) {
      if (rawData.get(sortedDates[i])?.has(def.slug)) {
        latestDeptDate = sortedDates[i];
        break;
      }
    }

    if (latestDeptDate) {
      const fields = rawData.get(latestDeptDate)!.get(def.slug)!;

      for (const check of def.checks) {
        const raw = findField(fields, ...check.fieldPatterns);

        if (check.type === 'count-above') {
          const count = extractCount(raw);
          const threshold = check.threshold ?? 0;
          if (count > threshold) {
            alerts.push({
              message: `${check.label}: ${count}`,
              severity: 'red',
              sourceDate: latestDeptDate,
              sourceSlug: def.slug,
            });
          }
        }

        if (check.type === 'text-issue') {
          const text = raw ? String(raw).trim() : '';
          if (!text) continue;
          const lower = text.toLowerCase();
          const isClear = (check.clearKeywords || []).some(w => w && lower === w || lower.startsWith(w));
          if (isClear) continue;
          const isIssue = (check.issueKeywords || []).some(w => lower.includes(w));
          if (isIssue) {
            const truncated = text.length > 50 ? text.substring(0, 50) + '...' : text;
            alerts.push({
              message: `${check.label}: ${truncated}`,
              severity: 'amber',
              sourceDate: latestDeptDate,
              sourceSlug: def.slug,
            });
          }
        }
      }
    }

    return {
      slug: def.slug,
      alerts,
      lastSubmissionDate: latestDeptDate,
    };
  });
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

  // Fetch all historical months for average curves
  const allMonthsResult = await sql`
    SELECT DISTINCT LEFT(date, 7) as month FROM department_data ORDER BY month;
  `;
  const allMonthKeys = allMonthsResult.rows.map(r => r.month).filter((m: string) => m !== currentMonth);
  // Fetch historical months in parallel (excluding current month)
  const historicalMonthsData = await Promise.all(
    allMonthKeys.map((m: string) => getMonthData(m))
  );

  const [currentData, prevData, currentRawData, prevRawData] = await Promise.all([
    getMonthData(currentMonth),
    getMonthData(prevMonth),
    getRawDeptData(currentMonth),
    getRawDeptData(prevMonth),
  ]);

  const current = aggregateMonth(currentData);
  const previous = aggregateMonth(prevData);

  // Compute historical average daily curves (by day-of-month: day1, day2, ...)
  // Revenue: average revenue per day-of-month across all historical months
  // Census: average census per day-of-month across all historical months
  const revenueByDay = new Map<number, number[]>();
  const censusByDay = new Map<number, number[]>();
  for (const monthMetrics of historicalMonthsData) {
    for (const m of monthMetrics) {
      const dayNum = parseInt(m.date.split('-')[2], 10);
      if (m.revenue !== null) {
        if (!revenueByDay.has(dayNum)) revenueByDay.set(dayNum, []);
        revenueByDay.get(dayNum)!.push(m.revenue);
      }
      if (m.ipCensus !== null) {
        if (!censusByDay.has(dayNum)) censusByDay.set(dayNum, []);
        censusByDay.get(dayNum)!.push(m.ipCensus);
      }
    }
  }

  const historicalAvgRevenues: { day: number; value: number }[] = [];
  for (const [day, values] of Array.from(revenueByDay.entries()).sort((a, b) => a[0] - b[0])) {
    historicalAvgRevenues.push({ day, value: values.reduce((s, v) => s + v, 0) / values.length });
  }
  const historicalAvgCensus: { day: number; value: number }[] = [];
  for (const [day, values] of Array.from(censusByDay.entries()).sort((a, b) => a[0] - b[0])) {
    historicalAvgCensus.push({ day, value: values.reduce((s, v) => s + v, 0) / values.length });
  }

  // New: global issues, department KPIs, heatmap data, and per-dept alerts
  const globalIssues = buildGlobalIssues(currentRawData, prevRawData);

  // ── IP Unbilled Revenue alert for global issues ──
  try {
    const unbilledResult = await sql`
      SELECT snapshot_date, total_bill_amt, total_deposit_amt, total_due_amt, total_patients
      FROM ip_unbilled_snapshots
      ORDER BY snapshot_date DESC LIMIT 1
    `;
    if (unbilledResult.rows.length > 0) {
      const ub = unbilledResult.rows[0];
      const dueAmt = Number(ub.total_due_amt);
      const billAmt = Number(ub.total_bill_amt);
      const depositPct = billAmt > 0 ? ((Number(ub.total_deposit_amt) / billAmt) * 100) : 0;
      // Add to globalIssues if net due is significant (> 1 lakh)
      if (dueAmt > 100000) {
        const fmtAmt = dueAmt >= 10000000 ? (dueAmt / 10000000).toFixed(2) + ' Cr' :
                        dueAmt >= 100000 ? (dueAmt / 100000).toFixed(2) + ' L' :
                        (dueAmt / 1000).toFixed(1) + ' K';
        globalIssues.push({
          id: 'ip-unbilled-due',
          label: 'IP Unbilled Due: \u20B9' + fmtAmt + ' (' + ub.total_patients + ' patients, ' + depositPct.toFixed(0) + '% deposit cover)',
          severity: (dueAmt > 500000 ? 'red' : 'amber') as 'red' | 'amber',
          deptSlug: 'finance',
          todayCount: 1,
          todayActive: true,
          weekActiveDays: 1,
          prevWeekTotal: 0,
          recentDetails: [{ date: ub.snapshot_date, text: 'Net due: \u20B9' + fmtAmt, count: 1 }],
          currentMonthTotal: 1,
          currentMonthActiveDays: 1,
          currentMonthDaysReported: 1,
          prevDetails: [],
          prevMonthTotal: 0,
          prevMonthActiveDays: 0,
          prevMonthDaysReported: 0,
          weekTotal: 1,
          trend: 'flat' as 'flat' | 'down' | 'up',
          changeSummary: 'IP unbilled revenue: net due from KX snapshot',
        });
      }
    }
  } catch (e) {
    // ip_unbilled_snapshots table may not exist yet - silently skip
    console.error('Unbilled check skipped:', e);
  }

  const departmentKPIs = buildDeptKPIs(currentRawData, prevRawData);
  const heatmapData = buildHeatmapData(currentRawData);
  const deptAlerts = buildDeptAlerts(currentRawData);

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
      if (rev) highlight = `Rev: â¹${formatNumberShort(extractNumber(rev))}`;
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

  // Fetch this week's submissions (Monâtoday), grouped by date and slug
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
    deptAlerts,
    // Sparkline overlay data
    historicalAvgRevenues,
    historicalAvgCensus,
    historicalMonthCount: allMonthKeys.length,
  });
}
