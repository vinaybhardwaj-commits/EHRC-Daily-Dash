import { sql } from '@vercel/postgres';
import {
  notifyAdmins,
  buildSlaBreachMessage,
  buildDailySummaryMessage,
} from '@/lib/whatsapp';
import { SEWA_DEPARTMENTS } from '@/lib/sewa-config';

/**
 * GET /api/sewa/check-sla
 *
 * Checks for SLA breaches and sends WhatsApp alerts.
 * Also sends a daily Sewa summary.
 * Designed to be called by Vercel cron (e.g., every 30 min during work hours).
 *
 * Query params:
 *   - mode: 'breach' (check for new breaches) | 'summary' (daily summary) | 'both' (default)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') || 'both';

  const results: { breachAlerts: number; summarySet: boolean } = {
    breachAlerts: 0,
    summarySet: false,
  };

  try {
    // ── Check for SLA breaches ──
    if (mode === 'breach' || mode === 'both') {
      // Find open requests that have breached their SLA
      const breached = await sql`
        SELECT id, complaint_type_name, target_dept, status,
               response_sla_min, resolution_sla_min, created_at,
               EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 AS elapsed_min
        FROM sewa_requests
        WHERE status NOT IN ('RESOLVED')
          AND (
            (status = 'NEW' AND EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 > response_sla_min)
            OR
            (EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 > resolution_sla_min)
          )
        ORDER BY created_at ASC
        LIMIT 20;
      `;

      // Send alerts for each breached complaint (max 5 to avoid spam)
      const alertPromises = breached.rows.slice(0, 5).map(row => {
        const slaMin = row.status === 'NEW'
          ? row.response_sla_min
          : row.resolution_sla_min;

        const msg = buildSlaBreachMessage(
          row.complaint_type_name,
          row.target_dept,
          row.status,
          Math.round(row.elapsed_min),
          slaMin,
          row.id
        );
        return notifyAdmins(msg);
      });

      await Promise.all(alertPromises);
      results.breachAlerts = Math.min(breached.rows.length, 5);
    }

    // ── Daily summary ──
    if (mode === 'summary' || mode === 'both') {
      // Get today's date in IST
      const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      // Aggregate KPIs
      const openResult = await sql`
        SELECT target_dept, COUNT(*) as cnt
        FROM sewa_requests WHERE status != 'RESOLVED'
        GROUP BY target_dept;
      `;
      const blockedResult = await sql`
        SELECT target_dept, COUNT(*) as cnt
        FROM sewa_requests WHERE status = 'BLOCKED'
        GROUP BY target_dept;
      `;
      const newTodayResult = await sql`
        SELECT COUNT(*) as cnt FROM sewa_requests
        WHERE created_at >= ${today}::date;
      `;
      const resolvedTodayResult = await sql`
        SELECT COUNT(*) as cnt FROM sewa_requests
        WHERE resolved_at >= ${today}::date AND status = 'RESOLVED';
      `;
      const breachedResult = await sql`
        SELECT target_dept, COUNT(*) as cnt
        FROM sewa_requests
        WHERE status NOT IN ('RESOLVED')
          AND (
            (status = 'NEW' AND EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 > response_sla_min)
            OR (EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 > resolution_sla_min)
          )
        GROUP BY target_dept;
      `;

      const openMap: Record<string, number> = {};
      openResult.rows.forEach(r => { openMap[r.target_dept] = parseInt(r.cnt); });

      const blockedMap: Record<string, number> = {};
      blockedResult.rows.forEach(r => { blockedMap[r.target_dept] = parseInt(r.cnt); });

      const breachedMap: Record<string, number> = {};
      breachedResult.rows.forEach(r => { breachedMap[r.target_dept] = parseInt(r.cnt); });

      const totalOpen = Object.values(openMap).reduce((a, b) => a + b, 0);
      const totalBlocked = Object.values(blockedMap).reduce((a, b) => a + b, 0);
      const totalBreached = Object.values(breachedMap).reduce((a, b) => a + b, 0);
      const totalNewToday = parseInt(newTodayResult.rows[0]?.cnt || '0');
      const totalResolved = parseInt(resolvedTodayResult.rows[0]?.cnt || '0');

      // Build hotspots from departments with issues
      const hotspots = SEWA_DEPARTMENTS
        .map(d => ({
          dept: d.name,
          open: openMap[d.slug] || 0,
          blocked: blockedMap[d.slug] || 0,
          breached: breachedMap[d.slug] || 0,
        }))
        .filter(h => h.open > 0)
        .sort((a, b) => b.blocked - a.blocked || b.breached - a.breached || b.open - a.open);

      const msg = buildDailySummaryMessage(
        today,
        totalOpen,
        totalBlocked,
        totalBreached,
        totalNewToday,
        totalResolved,
        hotspots
      );

      await notifyAdmins(msg);
      results.summarySet = true;
    }

    return Response.json({
      success: true,
      mode,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[sewa/check-sla] Error:', error);
    return Response.json(
      { error: 'Failed to check SLA', details: String(error) },
      { status: 500 }
    );
  }
}
