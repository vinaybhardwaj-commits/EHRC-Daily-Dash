import { sql } from '@vercel/postgres';

// ============================================================================
// CONSTANTS
// ============================================================================

export interface KPIDef {
  slug: string;
  label: string;
  type: 'number' | 'text-status' | 'ratio';
  unit?: string;
  invertTrend?: boolean;
  defaultValue?: number | string;
}

export interface SecondaryKPIDef {
  slug: string;
  label: string;
  type: 'number' | 'text-status';
  unit?: string;
  invertTrend?: boolean;
}

// Primary KPI definitions
const DEPARTMENT_KPIS: KPIDef[] = [
  { slug: 'census', label: 'Census', type: 'number' },
  { slug: 'occupancy-rate', label: 'Occupancy %', type: 'number', unit: '%' },
  { slug: 'emergency-wait', label: 'Avg Wait Time', type: 'number', unit: 'min' },
  { slug: 'emergency-visits', label: 'Visits', type: 'number' },
  { slug: 'patient-satisfaction', label: 'Patient Satisfaction %', type: 'number', unit: '%' },
  { slug: 'complaints', label: 'Complaints', type: 'number' },
  { slug: 'revenue', label: 'Revenue', type: 'number', unit: '₹' },
  { slug: 'receivables', label: 'Receivables', type: 'number', unit: '₹' },
  { slug: 'npa-rate', label: 'NPA %', type: 'number', unit: '%', invertTrend: true },
  { slug: 'supply-variance', label: 'Variance %', type: 'number', unit: '%', invertTrend: true },
  { slug: 'inventory-turnover', label: 'Turnover Days', type: 'number', invertTrend: true },
  { slug: 'maintenance-backlog', label: 'Backlog', type: 'number', unit: '₹', invertTrend: true },
  { slug: 'pharm-availability', label: 'Availability %', type: 'number', unit: '%' },
  { slug: 'training-hours', label: 'Hours/Emp', type: 'number' },
  { slug: 'training-participation', label: 'Participation %', type: 'number', unit: '%' },
  { slug: 'lab-turnaround', label: 'TAT Hours', type: 'number', invertTrend: true },
  { slug: 'radiology-turnaround', label: 'TAT Hours', type: 'number', invertTrend: true },
  { slug: 'theatre-utilization', label: 'Utilization %', type: 'number', unit: '%' },
  { slug: 'staff-safety-incidents', label: 'Incidents', type: 'number', invertTrend: true },
  { slug: 'attrition-rate', label: 'Attrition %', type: 'number', unit: '%', invertTrend: true },
  { slug: 'device-uptime', label: 'Uptime %', type: 'number', unit: '%' },
  { slug: 'system-availability', label: 'Availability %', type: 'number', unit: '%' },
];

// Secondary KPI definitions per primary KPI
const DEPARTMENT_SECONDARY_KPIS: Record<string, SecondaryKPIDef[]> = {
  census: [{ slug: 'icu-census', label: 'ICU Census', type: 'number' }],
  'occupancy-rate': [{ slug: 'icu-occupancy', label: 'ICU %', type: 'number', unit: '%' }],
  'emergency-visits': [{ slug: 'emergency-admissions', label: 'Admissions', type: 'number' }],
  revenue: [{ slug: 'ot-revenue', label: 'OT Revenue', type: 'number', unit: '₹' }],
  'npa-rate': [{ slug: 'npa-outstanding', label: 'Outstanding ₹', type: 'number', unit: '₹' }],
};

// ============================================================================
// FORM SUBMISSION TYPE
// ============================================================================

interface FormSubmission {
  department_slug: string;
  form_date: string;
  form_data: Record<string, unknown>;
}

// ============================================================================
// KPI EXTRACTION HELPERS
// ============================================================================

function extractDeptKPI(
  slug: string,
  fields: Record<string, unknown>,
): { value: number | null; textValue: string | null; status: 'good' | 'warning' | 'bad' | null } {
  const fieldKey = slug.replace(/-/g, '_');
  const rawVal = fields[fieldKey];

  if (rawVal === null || rawVal === undefined) {
    return { value: null, textValue: null, status: null };
  }

  if (typeof rawVal === 'object') {
    const obj = rawVal as Record<string, unknown>;
    const val = obj.value ?? null;
    const status = obj.status ?? null;
    const text = obj.textValue ?? null;

    const numVal = val !== null && typeof val === 'number' ? val : null;
    const strText = text !== null && typeof text === 'string' ? text : null;
    const strStatus = status !== null && typeof status === 'string' ? (status as 'good' | 'warning' | 'bad') : null;

    return { value: numVal, textValue: strText, status: strStatus };
  }

  if (typeof rawVal === 'number') {
    return { value: rawVal, textValue: null, status: null };
  }

  if (typeof rawVal === 'string') {
    return { value: null, textValue: rawVal, status: null };
  }

  return { value: null, textValue: null, status: null };
}

function extractSecondaryKPI(
  def: SecondaryKPIDef,
  fields: Record<string, unknown>,
): { value: number | null; textValue: string | null; status: 'good' | 'warning' | 'bad' | null } {
  const fieldKey = def.slug.replace(/-/g, '_');
  const rawVal = fields[fieldKey];

  if (rawVal === null || rawVal === undefined) {
    return { value: null, textValue: null, status: null };
  }

  if (typeof rawVal === 'object') {
    const obj = rawVal as Record<string, unknown>;
    const val = obj.value ?? null;
    const status = obj.status ?? null;
    const text = obj.textValue ?? null;

    const numVal = val !== null && typeof val === 'number' ? val : null;
    const strText = text !== null && typeof text === 'string' ? text : null;
    const strStatus = status !== null && typeof status === 'string' ? (status as 'good' | 'warning' | 'bad') : null;

    return { value: numVal, textValue: strText, status: strStatus };
  }

  if (def.type === 'number' && typeof rawVal === 'number') {
    return { value: rawVal, textValue: null, status: null };
  }

  if (def.type === 'text-status' && typeof rawVal === 'string') {
    return { value: null, textValue: rawVal, status: null };
  }

  return { value: null, textValue: null, status: null };
}

// ============================================================================
// MAIN BUILDER FUNCTION
// ============================================================================

export function buildDeptKPIs(
  deptSlug: string,
  rawData: Map<string, Map<string, Record<string, unknown>>>,
  sortedDates: string[],
  prevRawData: Map<string, Map<string, Record<string, unknown>>>,
  prevSortedDates: string[],
) {
  if (sortedDates.length === 0) {
    return DEPARTMENT_KPIS.map(kpiDef => ({
      slug: kpiDef.slug,
      label: kpiDef.label,
      unit: kpiDef.unit || null,
      type: kpiDef.type,
      invertTrend: kpiDef.invertTrend || false,
      value: null,
      textValue: null,
      status: null,
      submitted: false,
      submissionCount: 0,
      totalDays: 0,
      trend: 'flat' as const,
      avg7d: null,
      prevValue: null,
      prevTextValue: null,
      prevStatus: null,
      prevAvg: null,
      prevSubmissionCount: 0,
      prevTotalDays: 0,
      monthTrend: 'flat' as const,
      secondaryKpis: [],
      health: 'red' as const,
      lastSubmissionDate: null,
      isStale: false,
      staleDate: null,
      staleTooOld: false,
    }));
  }

  const latestDate = sortedDates[sortedDates.length - 1];
  const recentDates = sortedDates.slice(Math.max(0, sortedDates.length - 7));
  const prevLatestDate = prevSortedDates.length > 0 ? prevSortedDates[prevSortedDates.length - 1] : null;

  return DEPARTMENT_KPIS.map(kpiDef => {
    // Check if department submitted on the latest date
    const submittedOnLatest = rawData.get(latestDate)?.has(kpiDef.slug) || false;

    // Find the department's own most recent submission date
    let deptLatestDate: string | null = null;
    for (let i = sortedDates.length - 1; i >= 0; i--) {
      if (rawData.get(sortedDates[i])?.has(kpiDef.slug)) {
        deptLatestDate = sortedDates[i];
        break;
      }
    }

    // Determine staleness: stale if dept didn't submit on the overall latest date
    // and we're falling back to an older submission
    const isStale = !submittedOnLatest && deptLatestDate !== null && deptLatestDate !== latestDate;

    // Apply 7-day staleness cutoff
    let staleTooOld = false;
    if (isStale && deptLatestDate) {
      const staleMs = new Date(latestDate).getTime() - new Date(deptLatestDate).getTime();
      const staleDays = staleMs / (1000 * 60 * 60 * 24);
      if (staleDays > 7) staleTooOld = true;
    }

    // Use the department's own latest date for KPI extraction (fallback to stale data)
    const effectiveDate = staleTooOld ? null : (deptLatestDate || null);
    const effectiveFields = effectiveDate ? (rawData.get(effectiveDate)?.get(kpiDef.slug) || {}) : {};
    const latest = extractDeptKPI(kpiDef.slug, effectiveFields);

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

    // Extract secondary KPIs for this department (also from effective date)
    const secDefs = DEPARTMENT_SECONDARY_KPIS[kpiDef.slug] || [];
    const secondaryKpis = secDefs.map(secDef => {
      const extracted = extractSecondaryKPI(secDef, effectiveFields);
      // Compute trend for numeric secondary KPIs
      let secTrend: 'up' | 'down' | 'flat' = 'flat';
      if (secDef.type === 'number' && extracted.value !== null) {
        const recentVals: number[] = [];
        for (const date of recentDates) {
          const f = rawData.get(date)?.get(kpiDef.slug);
          if (f) {
            const r = extractSecondaryKPI(secDef, f);
            if (r.value !== null) recentVals.push(r.value);
          }
        }
        if (recentVals.length >= 2) {
          const avg = recentVals.reduce((s, v) => s + v, 0) / recentVals.length;
          const diff = extracted.value - avg;
          const pct = avg !== 0 ? Math.abs(diff / avg) * 100 : 0;
          if (pct > 5) secTrend = diff > 0 ? 'up' : 'down';
        }
      }
      return {
        label: secDef.label,
        value: extracted.value,
        textValue: extracted.textValue,
        status: extracted.status,
        unit: secDef.unit || null,
        type: secDef.type,
        trend: secTrend,
        invertTrend: secDef.invertTrend || false,
      };
    });

    // Compute health score: green/amber/red based on submission consistency
    const submissionRate = sortedDates.length > 0 ? submissionCount / sortedDates.length : 0;
    let health: 'green' | 'amber' | 'red' = 'green';
    if (submissionRate < 0.4) health = 'red';
    else if (submissionRate < 0.7) health = 'amber';
    // Downgrade if primary KPI trend is bad AND submission is borderline
    if (health === 'green' && trend !== 'flat' && submissionRate < 0.85) {
      const isBadTrend = (trend === 'down' && !kpiDef.invertTrend) || (trend === 'up' && kpiDef.invertTrend);
      if (isBadTrend) health = 'amber';
    }

    // Find last submission date for this department
    let lastSubmissionDate: string | null = deptLatestDate;

    return {
      slug: kpiDef.slug,
      label: kpiDef.label,
      unit: kpiDef.unit || null,
      type: kpiDef.type,
      invertTrend: kpiDef.invertTrend || false,
      value: latest.value,
      textValue: latest.textValue,
      status: latest.status,
      submitted: submittedOnLatest,
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
      // Secondary KPIs, health, last submission
      secondaryKpis,
      health,
      lastSubmissionDate,
      // NEW: Staleness info
      isStale: isStale && !staleTooOld,
      staleDate: (isStale && !staleTooOld) ? deptLatestDate : null,
      staleTooOld,
    };
  });
}

// ============================================================================
// API ROUTE HANDLER
// ============================================================================

export async function GET() {
  try {
    const result = await sql`
      SELECT
        department_slug,
        DATE(form_date) as form_date,
        form_data
      FROM form_submissions
      ORDER BY form_date DESC
      LIMIT 500
    `;

    const rows = result.rows as unknown as FormSubmission[];

    // Build monthly maps by department
    const currentMonth = new Date();
    const prevMonth = new Date(currentMonth);
    prevMonth.setMonth(prevMonth.getMonth() - 1);

    const currentMonthStr = currentMonth.toISOString().slice(0, 7);
    const prevMonthStr = prevMonth.toISOString().slice(0, 7);

    // Group submissions by month and date
    const currentData = new Map<string, Map<string, Map<string, Record<string, unknown>>>>();
    const prevData = new Map<string, Map<string, Map<string, Record<string, unknown>>>>();

    for (const row of rows) {
      const dateStr = row.form_date.toString().slice(0, 10);
      const monthStr = dateStr.slice(0, 7);

      const targetData = monthStr === currentMonthStr ? currentData : monthStr === prevMonthStr ? prevData : null;
      if (!targetData) continue;

      if (!targetData.has(row.department_slug)) {
        targetData.set(row.department_slug, new Map());
      }
      const deptMap = targetData.get(row.department_slug)!;

      if (!deptMap.has(dateStr)) {
        deptMap.set(dateStr, new Map());
      }
      const dateMap = deptMap.get(dateStr)!;

      for (const [slug, kpiDef] of DEPARTMENT_KPIS.entries()) {
        if (!dateMap.has(kpiDef.slug)) {
          dateMap.set(kpiDef.slug, row.form_data);
        }
      }
    }

    // Build per-department overviews
    const depts = Array.from(currentData.keys()).sort();
    const overviews = depts.map(deptSlug => {
      const rawData = currentData.get(deptSlug) || new Map();
      const prevRawData = prevData.get(deptSlug) || new Map();

      const sortedDates = Array.from(rawData.keys()).sort();
      const prevSortedDates = Array.from(prevRawData.keys()).sort();

      const kpis = buildDeptKPIs(deptSlug, rawData, sortedDates, prevRawData, prevSortedDates);

      return { slug: deptSlug, kpis };
    });

    return Response.json({ overviews }, { status: 200 });
  } catch (error) {
    console.error('GET /api/overview failed:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
