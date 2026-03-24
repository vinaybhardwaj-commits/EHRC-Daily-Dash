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
  if (!s || /^(nil|none|na|nill|no|0)$/i.test(s)) return null;

  // Handle "X Lakhs" / "X Lakh" / "X L" patterns (multiply by 100,000)
  const lakhMatch = s.match(/([\d,]+\.?\d*)\s*(?:lakhs?|lacs?)\b/i);
  if (lakhMatch) {
    const num = parseFloat(lakhMatch[1].replace(/,/g, ''));
    if (!isNaN(num)) return num * 100000;
  }

  // Handle "X Cr" / "X Crore" patterns (multiply by 10,000,000)
  const crMatch = s.match(/([\d,]+\.?\d*)\s*(?:cr(?:ore)?s?)\b/i);
  if (crMatch) {
    const num = parseFloat(crMatch[1].replace(/,/g, ''));
    if (!isNaN(num)) return num * 10000000;
  }

  // Handle "X K" patterns (multiply by 1,000)
  const kMatch = s.match(/([\d,]+\.?\d*)\s*K\b/i);
  if (kMatch) {
    const num = parseFloat(kMatch[1].replace(/,/g, ''));
    if (!isNaN(num)) return num * 1000;
  }

  // Standard number extraction (handles Indian comma formatting)
  // Find ALL number-like tokens, then pick the best one (largest formatted number)
  const matches = s.match(/[\d,]+\.?\d*/g);
  if (!matches) return null;
  let bestFormatted: number | null = null;
  let bestFormattedVal = 0;
  let firstPlain: number | null = null;
  for (const m of matches) {
    const cleaned = m.replace(/,/g, '');
    const num = parseFloat(cleaned);
    if (isNaN(num)) continue;
    if (m.includes(',')) {
      // For Indian formatting, pick the LARGEST comma-formatted number
      if (bestFormatted === null || num > bestFormattedVal) {
        bestFormatted = num;
        bestFormattedVal = num;
      }
    } else if (m.includes('.') && cleaned.length > 5) {
      // Long decimal numbers like 751294.22
      if (bestFormatted === null || num > bestFormattedVal) {
        bestFormatted = num;
        bestFormattedVal = num;
      }
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
  // All 3 eras of field names:
  // Era 1 (Sep-Oct 2025): Daily revenue, Total Revenue till date, ARPOB, Surgeries done MTD, OPD Revenue
  // Era 2 (Nov 2025-Feb 2026): Revnue For The Day, Total Revenue till date, ARPOB, Mid Night Census, Surgeries done MTD
  // Era 3 (Mar 2026+): Revenue for the day (Rs.), Total revenue MTD (Rs.), ARPOB — Avg Revenue..., Midnight census..., Surgeries MTD
  const revenueRaw = findField(fields, 'revenue for the day', 'revnue for the day', 'daily revenue');
  const revenueMTDRaw = findField(fields, 'total revenue', 'revenue till date');
  const arpobRaw = findField(fields, 'arpob');
  const censusRaw = findField(fields, 'midnight census', 'mid night census', 'census');
  const surgeriesRaw = findField(fields, 'surgeries');
  const opdRaw = findField(fields, 'opd revenue');
  const leakageRaw = findField(fields, 'revenue leakage', 'leakage alert');

  // For surgeries, extract count from text like "24 Sugeries Has Been Completed" or "87 Surgeries In November"
  let surgeriesMTD = extractNumber(surgeriesRaw);
  // Validate surgeries range
  if (surgeriesMTD !== null && (surgeriesMTD < 0 || surgeriesMTD > 500)) surgeriesMTD = null;

  return {
    date,
    revenue: extractNumber(revenueRaw),
    revenueMTD: extractNumber(revenueMTDRaw),
    arpob: extractNumberInRange(arpobRaw, 10000, 1000000),
    ipCensus: extractNumberInRange(censusRaw, 0, 200),
    surgeriesMTD,
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
    // Fetch all data for this department + BRM baselines
    let result;
    let brmResult;
    if (from && to) {
      result = await sql`
        SELECT d.date, d.entries
        FROM department_data d
        WHERE d.slug = ${slug}
          AND d.date >= ${from + '-01'}
          AND d.date <= ${to + '-31'}
        ORDER BY d.date ASC;
      `;
      brmResult = await sql`
        SELECT month, data FROM brm_monthly
        WHERE month >= ${from} AND month <= ${to}
        ORDER BY month ASC;
      `;
    } else {
      result = await sql`
        SELECT d.date, d.entries
        FROM department_data d
        WHERE d.slug = ${slug}
        ORDER BY d.date ASC;
      `;
      brmResult = await sql`
        SELECT month, data FROM brm_monthly
        ORDER BY month ASC;
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

    // ── BRM baseline data ──────────────────────────────────────────
    interface BrmMonth {
      month: string;
      label: string;
      revenue_lakhs: number | null;
      ebitdar_lakhs: number | null;
      ebitdar_pct: number | null;
      ebitda_before_lakhs: number | null;
      ebitda_before_pct: number | null;
      contribution_margin_pct: number | null;
      operating_days: number | null;
      opd_footfall_total: number | null;
      ip_admissions: number | null;
      ip_discharges: number | null;
      avg_occupied_beds: number | null;
      occupancy_pct: number | null;
      arpob_daily: number | null;
      arpob_annualized_lakhs: number | null;
      alos_days: number | null;
      ipd_revenue_lakhs: number | null;
      opd_revenue_lakhs: number | null;
      operating_revenue_lakhs: number | null;
      census_beds: number | null;
    }

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const brmMonths: BrmMonth[] = brmResult.rows.map((row: any) => {
      const d = row.data as Record<string, unknown>;
      const [y, m] = row.month.split('-');
      return {
        month: row.month,
        label: `${monthNames[parseInt(m) - 1]} ${y}`,
        revenue_lakhs: d.revenue_lakhs as number | null,
        ebitdar_lakhs: d.ebitdar_lakhs as number | null,
        ebitdar_pct: d.ebitdar_pct as number | null,
        ebitda_before_lakhs: d.ebitda_before_lakhs as number | null,
        ebitda_before_pct: d.ebitda_before_pct as number | null,
        contribution_margin_pct: d.contribution_margin_pct as number | null,
        operating_days: d.operating_days as number | null,
        opd_footfall_total: d.opd_footfall_total as number | null,
        ip_admissions: d.ip_admissions as number | null,
        ip_discharges: d.ip_discharges as number | null,
        avg_occupied_beds: d.avg_occupied_beds as number | null,
        occupancy_pct: d.occupancy_pct as number | null,
        arpob_daily: d.arpob_daily as number | null,
        arpob_annualized_lakhs: d.arpob_annualized_lakhs as number | null,
        alos_days: d.alos_days as number | null,
        ipd_revenue_lakhs: d.ipd_revenue_lakhs as number | null,
        opd_revenue_lakhs: d.opd_revenue_lakhs as number | null,
        operating_revenue_lakhs: d.operating_revenue_lakhs as number | null,
        census_beds: d.census_beds as number | null,
      };
    });

    // Merge BRM months into available months set
    const allMonthsSet = new Set(sortedMonths);
    for (const b of brmMonths) allMonthsSet.add(b.month);
    const allAvailableMonths = [...allMonthsSet].sort();

    return NextResponse.json({
      slug,
      department: 'Finance',
      summary,
      months,
      monthlyRevenueMTD,
      monthlySurgeries,
      monthlyAvgCensus,
      monthlyAvgArpob,
      availableMonths: allAvailableMonths,
      allDays,
      brmMonths,
    });
  } catch (err) {
    console.error('Department overview error:', err);
    return NextResponse.json({ error: 'Failed to fetch department overview' }, { status: 500 });
  }
}
