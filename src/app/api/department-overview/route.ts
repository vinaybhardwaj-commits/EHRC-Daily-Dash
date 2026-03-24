import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

/**
 * Department Overview API — returns all historical data for a single department.
 * GET /api/department-overview?slug=finance&from=2025-01&to=2026-03
 * If no from/to, returns all data from the beginning of time.
 */

function firstPipeSegment(value: string | number | undefined | null): string | number | undefined | null {
  if (value === undefined || value === null) return value;
  if (typeof value === 'number') return value;
  const s = String(value);
  const pipeIdx = s.indexOf('|');
  return pipeIdx >= 0 ? s.substring(0, pipeIdx).trim() : s;
}

function extractNumber(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return value;
  const raw = firstPipeSegment(value);
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === 'nil' || s.toLowerCase() === 'none' || s.toLowerCase() === 'na' || s.toLowerCase() === 'nill') return null;
  const matches = s.match(/[\d,]+\.?\d*/g);
  if (!matches) return null;
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

function extractNumberInRange(value: string | number | undefined | null, min: number, max: number): number | null {
  const num = extractNumber(value);
  if (num === null) return null;
  if (num < min || num > max) return null;
  return num;
}

function findField(fields: Record<string, string | number>, ...patterns: string[]): string | number | null {
  for (const pattern of patterns) {
    const lower = pattern.toLowerCase();
    for (const [key, val] of Object.entries(fields)) {
      if (key.toLowerCase().includes(lower)) return val;
    }
  }
  return null;
}

// ── Finance field extractors ────────────────────────────────────────

interface FinanceDayData {
  date: string;
  revenue: number | null;
  revenueMTD: number | null;
  arpob: number | null;
  ipCensus: number | null;
  surgeriesMTD: number | null;
  opdRevenueMTD: number | null;
  revenueLeakage: string | null;
}

function extractFinanceDay(date: string, fields: Record<string, string | number>): FinanceDayData {
  const revenueRaw = findField(fields, 'revenue for the day', 'revnue for the day', 'Revenue for the day');
  const revenueMTDRaw = findField(fields, 'total revenue', 'Total revenue MTD');
  const arpobRaw = findField(fields, 'arpob', 'ARPOB');
  const censusRaw = findField(fields, 'midnight census', 'mid night census', 'census — total IP');
  const surgeriesRaw = findField(fields, 'surgeries', 'Surgeries MTD');
  const opdRaw = findField(fields, 'opd revenue', 'OPD revenue');
  const leakageRaw = findField(fields, 'revenue leakage', 'leakage alert');

  return {
    date,
    revenue: extractNumber(revenueRaw),
    revenueMTD: extractNumber(revenueMTDRaw),
    arpob: extractNumberInRange(arpobRaw, 10000, 1000000),
    ipCensus: extractNumberInRange(censusRaw, 0, 200),
    surgeriesMTD: extractNumberInRange(surgeriesRaw, 0, 500),
    opdRevenueMTD: extractNumber(opdRaw),
    revenueLeakage: leakageRaw ? String(leakageRaw).trim() : null,
  };
}

// ── Monthly aggregation ─────────────────────────────────────────────

interface MonthSummary {
  month: string;
  label: string;
  daysReported: number;
  // Latest MTD values (last reported day of the month)
  revenueMTD: number | null;
  surgeriesMTD: number | null;
  opdRevenueMTD: number | null;
  // Averages
  avgDailyRevenue: number | null;
  avgArpob: number | null;
  avgCensus: number | null;
  // Daily series
  dailyRevenue: { date: string; value: number }[];
  dailyArpob: { date: string; value: number }[];
  dailyCensus: { date: string; value: number }[];
  dailySurgeries: { date: string; value: number }[];
  // Leakage
  leakageAlerts: { date: string; text: string }[];
}

function aggregateMonth(month: string, days: FinanceDayData[]): MonthSummary {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m] = month.split('-');
  const label = `${monthNames[parseInt(m) - 1]} ${y}`;

  const dailyRevenue: { date: string; value: number }[] = [];
  const dailyArpob: { date: string; value: number }[] = [];
  const dailyCensus: { date: string; value: number }[] = [];
  const dailySurgeries: { date: string; value: number }[] = [];
  const leakageAlerts: { date: string; text: string }[] = [];

  let latestRevenueMTD: number | null = null;
  let latestSurgeriesMTD: number | null = null;
  let latestOpdRevenueMTD: number | null = null;

  for (const d of days) {
    if (d.revenue !== null) dailyRevenue.push({ date: d.date, value: d.revenue });
    if (d.arpob !== null) dailyArpob.push({ date: d.date, value: d.arpob });
    if (d.ipCensus !== null) dailyCensus.push({ date: d.date, value: d.ipCensus });
    if (d.surgeriesMTD !== null) dailySurgeries.push({ date: d.date, value: d.surgeriesMTD });
    if (d.revenueMTD !== null) latestRevenueMTD = d.revenueMTD;
    if (d.surgeriesMTD !== null) latestSurgeriesMTD = d.surgeriesMTD;
    if (d.opdRevenueMTD !== null) latestOpdRevenueMTD = d.opdRevenueMTD;
    if (d.revenueLeakage) {
      const text = d.revenueLeakage.toLowerCase();
      if (text !== 'nil' && text !== 'none' && text !== 'na' && text !== 'nill' && text !== 'no' && text !== '0' && text !== '') {
        leakageAlerts.push({ date: d.date, text: d.revenueLeakage });
      }
    }
  }

  const avgRevenue = dailyRevenue.length > 0 ? dailyRevenue.reduce((s, d) => s + d.value, 0) / dailyRevenue.length : null;
  const avgArpob = dailyArpob.length > 0 ? dailyArpob.reduce((s, d) => s + d.value, 0) / dailyArpob.length : null;
  const avgCensus = dailyCensus.length > 0 ? dailyCensus.reduce((s, d) => s + d.value, 0) / dailyCensus.length : null;

  return {
    month,
    label,
    daysReported: days.length,
    revenueMTD: latestRevenueMTD,
    surgeriesMTD: latestSurgeriesMTD,
    opdRevenueMTD: latestOpdRevenueMTD,
    avgDailyRevenue: avgRevenue,
    avgArpob,
    avgCensus,
    dailyRevenue,
    dailyArpob,
    dailyCensus,
    dailySurgeries,
    leakageAlerts,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!slug) {
    return NextResponse.json({ error: 'slug parameter is required' }, { status: 400 });
  }

  // Currently only finance is supported with specific field extraction
  if (slug !== 'finance') {
    return NextResponse.json({ error: 'Only finance department overview is currently available' }, { status: 400 });
  }

  try {
    // Fetch all data for this department
    let result;
    if (from && to) {
      result = await sql`
        SELECT d.date, d.entries
        FROM department_data d
        WHERE d.slug = ${slug}
          AND d.date >= ${from + '-01'}
          AND d.date <= ${to + '-31'}
        ORDER BY d.date ASC;
      `;
    } else {
      result = await sql`
        SELECT d.date, d.entries
        FROM department_data d
        WHERE d.slug = ${slug}
        ORDER BY d.date ASC;
      `;
    }

    // Extract day-level data
    const allDays: FinanceDayData[] = [];
    const availableMonths = new Set<string>();

    for (const row of result.rows) {
      const date = row.date;
      const entries = row.entries as Array<{ fields: Record<string, string | number> }>;
      // Merge all entries' fields (form + whatsapp)
      const mergedFields: Record<string, string | number> = {};
      for (const entry of entries) {
        if (entry.fields) {
          for (const [k, v] of Object.entries(entry.fields)) {
            if (!k.startsWith('_') && !mergedFields[k]) {
              mergedFields[k] = v;
            }
          }
        }
      }

      const dayData = extractFinanceDay(date, mergedFields);
      allDays.push(dayData);
      availableMonths.add(date.substring(0, 7));
    }

    // Group by month
    const byMonth = new Map<string, FinanceDayData[]>();
    for (const d of allDays) {
      const m = d.date.substring(0, 7);
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m)!.push(d);
    }

    // Aggregate each month
    const months: MonthSummary[] = [];
    const sortedMonths = [...availableMonths].sort();
    for (const m of sortedMonths) {
      months.push(aggregateMonth(m, byMonth.get(m) || []));
    }

    // All-time summary
    const allRevenues = allDays.filter(d => d.revenue !== null).map(d => d.revenue!);
    const allArpobs = allDays.filter(d => d.arpob !== null).map(d => d.arpob!);
    const allCensus = allDays.filter(d => d.ipCensus !== null).map(d => d.ipCensus!);
    const allLeakages = allDays.filter(d => {
      if (!d.revenueLeakage) return false;
      const t = d.revenueLeakage.toLowerCase();
      return t !== 'nil' && t !== 'none' && t !== 'na' && t !== 'nill' && t !== 'no' && t !== '0' && t !== '';
    });

    // Month-over-month revenue MTD for bar chart
    const monthlyRevenueMTD = months.map(m => ({
      month: m.month,
      label: m.label,
      value: m.revenueMTD,
    }));

    const monthlySurgeries = months.map(m => ({
      month: m.month,
      label: m.label,
      value: m.surgeriesMTD,
    }));

    const monthlyAvgCensus = months.map(m => ({
      month: m.month,
      label: m.label,
      value: m.avgCensus !== null ? Math.round(m.avgCensus) : null,
    }));

    const monthlyAvgArpob = months.map(m => ({
      month: m.month,
      label: m.label,
      value: m.avgArpob !== null ? Math.round(m.avgArpob) : null,
    }));

    const summary = {
      totalDaysReported: allDays.length,
      dateRange: allDays.length > 0 ? { from: allDays[0].date, to: allDays[allDays.length - 1].date } : null,
      latestRevenueMTD: months.length > 0 ? months[months.length - 1].revenueMTD : null,
      latestSurgeriesMTD: months.length > 0 ? months[months.length - 1].surgeriesMTD : null,
      latestArpob: months.length > 0 ? months[months.length - 1].avgArpob : null,
      latestCensus: months.length > 0 ? months[months.length - 1].avgCensus : null,
      latestOpdRevenueMTD: months.length > 0 ? months[months.length - 1].opdRevenueMTD : null,
      avgDailyRevenue: allRevenues.length > 0 ? allRevenues.reduce((a, b) => a + b, 0) / allRevenues.length : null,
      avgArpob: allArpobs.length > 0 ? allArpobs.reduce((a, b) => a + b, 0) / allArpobs.length : null,
      avgCensus: allCensus.length > 0 ? allCensus.reduce((a, b) => a + b, 0) / allCensus.length : null,
      totalLeakageAlerts: allLeakages.length,
      // Sparkline data (all daily values for mini charts)
      revenueSparkline: allDays.filter(d => d.revenue !== null).map(d => ({ date: d.date, value: d.revenue! })),
      arpobSparkline: allDays.filter(d => d.arpob !== null).map(d => ({ date: d.date, value: d.arpob! })),
      censusSparkline: allDays.filter(d => d.ipCensus !== null).map(d => ({ date: d.date, value: d.ipCensus! })),
      surgeriesSparkline: allDays.filter(d => d.surgeriesMTD !== null).map(d => ({ date: d.date, value: d.surgeriesMTD! })),
    };

    return NextResponse.json({
      slug,
      department: 'Finance',
      summary,
      months,
      monthlyRevenueMTD,
      monthlySurgeries,
      monthlyAvgCensus,
      monthlyAvgArpob,
      availableMonths: sortedMonths,
      allDays,
    });
  } catch (err) {
    console.error('Department overview error:', err);
    return NextResponse.json({ error: 'Failed to fetch department overview' }, { status: 500 });
  }
}
