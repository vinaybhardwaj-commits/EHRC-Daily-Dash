import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import type { AnalyticsEvent } from '@/lib/form-engine/types';

export const dynamic = 'force-dynamic';

/* ── POST: Receive analytics events from SmartForm ────────────────── */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const events: AnalyticsEvent[] = body.events;

    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0 });
    }

    // Batch insert in chunks of 50 (10 params per row)
    const BATCH_SIZE = 50;
    let inserted = 0;

    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const batch = events.slice(i, i + BATCH_SIZE);
      const params: (string | number | null)[] = [];
      const valueClauses: string[] = [];

      for (const event of batch) {
        const offset = params.length;
        params.push(
          event.sessionId,
          event.formSlug,
          event.type,
          event.fieldId || null,
          event.sectionId || null,
          event.durationMs ?? null,
          event.metadata ? JSON.stringify(event.metadata) : null,
          new Date(event.timestamp).toISOString(),
        );
        valueClauses.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}::jsonb, $${offset + 8})`
        );
      }

      try {
        await sql.query(
          `INSERT INTO form_analytics_events (session_id, form_slug, event_type, field_id, section_id, duration_ms, metadata, created_at) VALUES ${valueClauses.join(', ')}`,
          params,
        );
        inserted += batch.length;
      } catch (dbError) {
        // Table might not exist yet — log but don't fail the request
        console.warn('form_analytics_events insert failed (table may not exist):', dbError);
      }
    }

    return NextResponse.json({ ok: true, inserted });
  } catch (error) {
    console.error('Form analytics error:', error);
    // Never fail the analytics endpoint — it shouldn't block form UX
    return NextResponse.json({ ok: false, error: 'Failed to process events' });
  }
}

/* ── GET: Retrieve analytics summary for a form ───────────────────── */

export async function GET(req: NextRequest) {
  const formSlug = req.nextUrl.searchParams.get('slug');
  const period = req.nextUrl.searchParams.get('period'); // YYYY-MM or YYYY-MM-DD
  const allForms = req.nextUrl.searchParams.get('all') === 'true';

  try {
    // If requesting all forms summary (for overview heatmap)
    if (allForms) {
      const month = period || new Date().toISOString().slice(0, 7);
      const startDate = `${month}-01`;
      const endDate = `${month}-31`;

      const result = await sql`
        SELECT form_slug, date, total_starts, total_submits, total_abandons,
               avg_completion_ms, field_stats, section_stats, drop_off_points
        FROM form_analytics_daily
        WHERE date >= ${startDate} AND date <= ${endDate}
        ORDER BY form_slug, date;
      `;

      return NextResponse.json({ summaries: result.rows });
    }

    // Single form analytics
    if (!formSlug) {
      return NextResponse.json({ error: 'Missing slug parameter' }, { status: 400 });
    }

    // Check for pre-computed daily summary first
    if (period && period.length === 10) {
      // Specific date
      const cached = await sql`
        SELECT * FROM form_analytics_daily WHERE form_slug = ${formSlug} AND date = ${period};
      `;
      if (cached.rows.length > 0) {
        return NextResponse.json({ summary: cached.rows[0], cached: true });
      }
    }

    // Compute from raw events
    const month = period || new Date().toISOString().slice(0, 7);
    const startDate = `${month}-01`;
    const endDate = period?.length === 10 ? period : `${month}-31`;

    // Get session-level aggregates
    const sessionStats = await sql`
      SELECT
        COUNT(DISTINCT CASE WHEN event_type = 'form_start' THEN session_id END) AS total_starts,
        COUNT(DISTINCT CASE WHEN event_type = 'form_submit' THEN session_id END) AS total_submits,
        COUNT(DISTINCT CASE WHEN event_type = 'form_abandon' THEN session_id END) AS total_abandons
      FROM form_analytics_events
      WHERE form_slug = ${formSlug}
        AND created_at >= ${startDate}::date
        AND created_at < (${endDate}::date + INTERVAL '1 day');
    `;

    // Get average completion time
    const completionTime = await sql`
      SELECT
        AVG(duration_ms) AS avg_ms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) AS median_ms
      FROM form_analytics_events
      WHERE form_slug = ${formSlug}
        AND event_type = 'form_submit'
        AND duration_ms IS NOT NULL
        AND created_at >= ${startDate}::date
        AND created_at < (${endDate}::date + INTERVAL '1 day');
    `;

    // Get field-level stats
    const fieldStats = await sql`
      SELECT
        field_id,
        AVG(CASE WHEN event_type = 'field_blur' THEN duration_ms END) AS avg_time_ms,
        COUNT(CASE WHEN event_type = 'field_focus' THEN 1 END) AS focus_count,
        COUNT(CASE WHEN event_type = 'field_blur' THEN 1 END) AS blur_count,
        COUNT(CASE WHEN event_type = 'validation_error' THEN 1 END) AS error_count
      FROM form_analytics_events
      WHERE form_slug = ${formSlug}
        AND field_id IS NOT NULL
        AND created_at >= ${startDate}::date
        AND created_at < (${endDate}::date + INTERVAL '1 day')
      GROUP BY field_id
      ORDER BY avg_time_ms DESC NULLS LAST;
    `;

    // Get section reach rates
    const sectionStats = await sql`
      SELECT
        section_id,
        COUNT(DISTINCT session_id) AS reach_count
      FROM form_analytics_events
      WHERE form_slug = ${formSlug}
        AND event_type = 'section_enter'
        AND created_at >= ${startDate}::date
        AND created_at < (${endDate}::date + INTERVAL '1 day')
      GROUP BY section_id;
    `;

    const stats = sessionStats.rows[0] || {};
    const totalStarts = Number(stats.total_starts) || 0;

    return NextResponse.json({
      summary: {
        formSlug,
        period: month,
        totalStarts,
        totalSubmissions: Number(stats.total_submits) || 0,
        totalAbandons: Number(stats.total_abandons) || 0,
        completionRate: totalStarts > 0 ? Math.round((Number(stats.total_submits) / totalStarts) * 100) : 0,
        avgCompletionTimeMs: Math.round(Number(completionTime.rows[0]?.avg_ms) || 0),
        medianCompletionTimeMs: Math.round(Number(completionTime.rows[0]?.median_ms) || 0),
        fieldStats: fieldStats.rows.map(r => ({
          fieldId: r.field_id,
          avgTimeMs: Math.round(Number(r.avg_time_ms) || 0),
          focusCount: Number(r.focus_count),
          blurCount: Number(r.blur_count),
          validationErrorCount: Number(r.error_count),
        })),
        sectionStats: sectionStats.rows.map(r => ({
          sectionId: r.section_id,
          reachRate: totalStarts > 0 ? Math.round((Number(r.reach_count) / totalStarts) * 100) : 0,
        })),
      },
      cached: false,
    });
  } catch (error) {
    console.error('Form analytics GET error:', error);
    // Return empty data rather than error — analytics should degrade gracefully
    return NextResponse.json({
      summary: {
        formSlug: formSlug || '',
        period: period || '',
        totalStarts: 0,
        totalSubmissions: 0,
        totalAbandons: 0,
        completionRate: 0,
        avgCompletionTimeMs: 0,
        medianCompletionTimeMs: 0,
        fieldStats: [],
        sectionStats: [],
      },
      cached: false,
      _fallback: true,
    });
  }
}
