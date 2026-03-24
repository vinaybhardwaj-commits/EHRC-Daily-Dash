import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

/**
 * Extract the first number from a messy text string.
 * Handles Indian-style formatting: "Revenue For The Day- 7,28,265.63"
 * Also handles clean numbers: "403320.17"
 */
function extractNumber(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return value;
  const s = String(value).trim();
  if (!s || s.toLowerCase() === 'nil' || s.toLowerCase() === 'none' || s.toLowerCase() === 'na' || s.toLowerCase() === 'nill') return null;

  // Try to find a number pattern (with optional Indian comma formatting)
  // Match patterns like: 7,28,265.63  or  403320.17  or  16730432.64  or  1.35
  const matches = s.match(/[\d,]+\.?\d*/g);
  if (!matches) return null;

  // Take the first match that looks like a substantial number
  for (const m of matches) {
    const cleaned = m.replace(/,/g, '');
    const num = parseFloat(cleaned);
    if (!isNaN(num)) return num;
  }
  return null;
}

/**
 * Count occurrences of non-nil/non-zero values in a text field.
 * Used for counting things like "1 case", "2 cases", "Nil"
 */
function extractCount(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;
  const s = String(value).trim().toLowerCase();
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

    metrics.push({
      date,
      revenue: extractNumber(revenueRaw),
      revenueMTD: extractNumber(revenueMTDRaw),
      arpob: extractNumber(arpobRaw),
      ipCensus: extractNumber(censusRaw),
      surgeriesMTD: extractNumber(surgeriesRaw),
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

export async function GET(req: NextRequest) {
  const monthParam = req.nextUrl.searchParams.get('month'); // e.g., '2026-03'

  // Default to current month
  const now = new Date();
  const currentMonth = monthParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Calculate previous month
  const [year, month] = currentMonth.split('-').map(Number);
  const prevDate = new Date(year, month - 2, 1); // month-2 because month is 1-based and we want previous
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  const [currentData, prevData] = await Promise.all([
    getMonthData(currentMonth),
    getMonthData(prevMonth),
  ]);

  const current = aggregateMonth(currentData);
  const previous = aggregateMonth(prevData);

  // Get total available months for the month selector
  const monthsResult = await sql`
    SELECT DISTINCT LEFT(date, 7) as month FROM day_snapshots ORDER BY month DESC;
  `;
  const availableMonths = monthsResult.rows.map(r => r.month);

  return NextResponse.json({
    currentMonth,
    previousMonth: prevMonth,
    current,
    previous,
    availableMonths,
    dailyMetrics: currentData,
  });
}
