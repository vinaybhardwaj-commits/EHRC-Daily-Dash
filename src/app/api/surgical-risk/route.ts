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

function parseRange(rangeStr: string | null): { start: string; end: string } {
  // Default: today + 3 days forward (the PRD §6 v1 list view)
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const threeDaysOut = new Date(today.getTime() + 3 * 86400000).toISOString().slice(0, 10);

  if (!rangeStr || rangeStr === 'upcoming') {
    return { start: todayStr, end: threeDaysOut };
  }
  if (rangeStr === 'today') {
    return { start: todayStr, end: todayStr };
  }
  const daysMatch = rangeStr.match(/^(\d+)d$/);
  if (daysMatch) {
    const n = parseInt(daysMatch[1], 10);
    const past = new Date(today.getTime() - n * 86400000).toISOString().slice(0, 10);
    return { start: past, end: threeDaysOut };
  }
  // explicit YYYY-MM-DD,YYYY-MM-DD
  const explicitMatch = rangeStr.match(/^(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})$/);
  if (explicitMatch) {
    return { start: explicitMatch[1], end: explicitMatch[2] };
  }
  // fallback to upcoming+3d
  return { start: todayStr, end: threeDaysOut };
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const { start, end } = parseRange(params.get('range'));
  const tierParam = params.get('tier');
  const tiers: RiskTier[] = tierParam
    ? (tierParam.split(',').map(t => t.trim().toUpperCase()).filter(t => VALID_TIERS.has(t as RiskTier)) as RiskTier[])
    : ['GREEN', 'AMBER', 'RED', 'CRITICAL'];
  const specialty = params.get('specialty')?.trim();
  const summaryOnly = params.get('summary') === 'true';

  try {
    // Summary counts (always computed — cheap, dashboard KPI strip needs them)
    const summaryRes = await sql.query(
      `SELECT
         COUNT(*) FILTER (WHERE risk_tier = 'GREEN')    AS green,
         COUNT(*) FILTER (WHERE risk_tier = 'AMBER')    AS amber,
         COUNT(*) FILTER (WHERE risk_tier = 'RED')      AS red,
         COUNT(*) FILTER (WHERE risk_tier = 'CRITICAL') AS critical,
         COUNT(*) FILTER (WHERE reviewed_at IS NULL)    AS unreviewed,
         COUNT(*) AS total
       FROM surgical_risk_assessments
       WHERE surgery_date >= $1::date AND surgery_date <= $2::date`,
      [start, end]
    );
    const summary = summaryRes.rows[0] || {};

    if (summaryOnly) {
      return NextResponse.json({
        ok: true,
        range: { start, end },
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

    // Build the WHERE for the row query
    const whereClauses = ['surgery_date >= $1::date', 'surgery_date <= $2::date', 'risk_tier = ANY($3::text[])'];
    const queryParams: unknown[] = [start, end, tiers];

    if (specialty) {
      whereClauses.push(`surgical_specialty ILIKE $${queryParams.length + 1}`);
      queryParams.push(`%${specialty}%`);
    }

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
         created_at, reviewed_by, reviewed_at, review_notes
       FROM surgical_risk_assessments
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY surgery_date ASC, composite_risk_score DESC, id DESC
       LIMIT 200`,
      queryParams
    );

    return NextResponse.json({
      ok: true,
      range: { start, end },
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
