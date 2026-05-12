/**
 * GET /api/surgical-risk
 *
 * Returns surgical risk assessments. Default: upcoming + 3 days forward.
 * Per PRD v2 §6 SREWS.2 + decision #13 (specialty filter ships in v1).
 *
 * Query params:
 *   ?range=upcoming|today|7d|30d|YYYY-MM-DD,YYYY-MM-DD  (default: upcoming+3d)
 *   ?tier=GREEN,AMBER,RED,CRITICAL                       (comma-separated; default: all)
 *   ?specialty=Orthopaedics                              (case-insensitive substring; default: all)
 *   ?summary=true                                        (return only counts, no rows)
 *
 * No auth required (read-only endpoint, dashboard consumes it).
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import type { RiskTier } from '@/lib/surgical-risk/types';

export const dynamic = 'force-dynamic';

const VALID_TIERS = new Set<RiskTier>(['GREEN', 'AMBER', 'RED', 'CRITICAL']);

function parseRange(rangeStr: string | null): { start: string | null; end: string | null; mode: string } {
  // V's request 12 May 2026: show ALL legit submissions on the dashboard regardless of date.
  // Default range is now 'all' — no surgery_date filter applied. Older modes still work.
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const threeDaysOut = new Date(today.getTime() + 3 * 86400000).toISOString().slice(0, 10);

  // 'all' (default) — no date filter
  if (!rangeStr || rangeStr === 'all') {
    return { start: null, end: null, mode: 'all' };
  }
  if (rangeStr === 'upcoming') {
    return { start: todayStr, end: threeDaysOut, mode: 'upcoming' };
  }
  if (rangeStr === 'today') {
    return { start: todayStr, end: todayStr, mode: 'today' };
  }
  const daysMatch = rangeStr.match(/^(\d+)d$/);
  if (daysMatch) {
    const n = parseInt(daysMatch[1], 10);
    const past = new Date(today.getTime() - n * 86400000).toISOString().slice(0, 10);
    return { start: past, end: threeDaysOut, mode: `${n}d` };
  }
  // explicit YYYY-MM-DD,YYYY-MM-DD
  const explicitMatch = rangeStr.match(/^(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})$/);
  if (explicitMatch) {
    return { start: explicitMatch[1], end: explicitMatch[2], mode: 'custom' };
  }
  // unknown — fall back to all
  return { start: null, end: null, mode: 'all' };
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const { start, end, mode } = parseRange(params.get('range'));
  const dateFilterSql = (start && end)
    ? 'surgery_date >= $1::date AND surgery_date <= $2::date'
    : 'TRUE';
  const tierParam = params.get('tier');
  const tiers: RiskTier[] = tierParam
    ? (tierParam.split(',').map(t => t.trim().toUpperCase()).filter(t => VALID_TIERS.has(t as RiskTier)) as RiskTier[])
    : ['GREEN', 'AMBER', 'RED', 'CRITICAL'];
  const specialty = params.get('specialty')?.trim();
  const summaryOnly = params.get('summary') === 'true';
  const includeRemoved = params.get('include_removed') === 'true';

  try {
    // Summary counts (always computed — cheap, dashboard KPI strip needs them)
    const summaryQueryParams: unknown[] = (start && end) ? [start, end] : [];
    const summaryRes = await sql.query(
      `SELECT
         COUNT(*) FILTER (WHERE risk_tier = 'GREEN')    AS green,
         COUNT(*) FILTER (WHERE risk_tier = 'AMBER')    AS amber,
         COUNT(*) FILTER (WHERE risk_tier = 'RED')      AS red,
         COUNT(*) FILTER (WHERE risk_tier = 'CRITICAL') AS critical,
         COUNT(*) FILTER (WHERE reviewed_at IS NULL)    AS unreviewed,
         COUNT(*) AS total
       FROM surgical_risk_assessments
       WHERE ${dateFilterSql} AND removed_at IS NULL`,
      summaryQueryParams
    );
    const summary = summaryRes.rows[0] || {};

    if (summaryOnly) {
      return NextResponse.json({
        ok: true,
        range: { start, end, mode },
        summary: {
          GREEN: Number(summary.green || 0),
          AMBER: Number(summary.amber || 0),
          RED: Number(summary.red || 0),
          CRITICAL: Number(summary.critical || 0),
          unreviewed: Number(summary.unreviewed || 0),
          total: Number(summary.total || 0),
        },
      });
    }

    // Build the WHERE for the row query. Date filter is conditional.
    const whereClauses: string[] = [];
    const queryParams: unknown[] = [];
    if (start && end) {
      whereClauses.push(`surgery_date >= $${queryParams.length + 1}::date`);
      queryParams.push(start);
      whereClauses.push(`surgery_date <= $${queryParams.length + 1}::date`);
      queryParams.push(end);
    }
    whereClauses.push(`risk_tier = ANY($${queryParams.length + 1}::text[])`);
    queryParams.push(tiers);
    if (specialty) {
      whereClauses.push(`surgical_specialty ILIKE $${queryParams.length + 1}`);
      queryParams.push(`%${specialty}%`);
    }
    // DASH.1 — default to active cases only (removed_at IS NULL). When
    // include_removed=true, return BOTH groups so the dashboard can split
    // them client-side into the main list + the "Removed (N)" section.
    if (!includeRemoved) {
      whereClauses.push(`removed_at IS NULL`);
    }

    // V's request 12 May 2026: sort by 'distance from today' — upcoming first (today asc),
    // then past in reverse chronological. Cases with no surgery_date go last.
    // Composite score is secondary sort key.
    const rowsRes = await sql.query(
      `SELECT
         id, form_submission_uid, submission_timestamp,
         patient_name, uhid, age, sex,
         surgeon_name, surgical_specialty, proposed_procedure,
         surgery_date, surgery_datetime, admission_date, admission_datetime,
         patient_risk_score, procedure_risk_score, system_risk_score,
         composite_risk_score, risk_tier,
         assessment_json,
         llm_model, llm_latency_ms, llm_divergence_logged, rubric_version,
         created_at, reviewed_by, reviewed_at, review_notes,
         removed_at, removed_by, remove_reason,
         raw_form_data
       FROM surgical_risk_assessments
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY
         CASE WHEN removed_at IS NOT NULL THEN 1 ELSE 0 END,
         CASE
           WHEN surgery_date IS NULL THEN 2
           WHEN surgery_date >= CURRENT_DATE THEN 0
           ELSE 1
         END,
         CASE WHEN surgery_date >= CURRENT_DATE THEN surgery_date END ASC,
         CASE WHEN surgery_date <  CURRENT_DATE THEN surgery_date END DESC,
         composite_risk_score DESC, id DESC
       LIMIT 500`,
      queryParams
    );

    return NextResponse.json({
      ok: true,
      range: { start, end, mode },
      filters: { tiers, specialty: specialty || null },
      summary: {
        GREEN: Number(summary.green || 0),
        AMBER: Number(summary.amber || 0),
        RED: Number(summary.red || 0),
        CRITICAL: Number(summary.critical || 0),
        unreviewed: Number(summary.unreviewed || 0),
        total: Number(summary.total || 0),
      },
      assessments: rowsRes.rows,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
