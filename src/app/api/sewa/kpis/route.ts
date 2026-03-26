import { sql } from '@vercel/postgres';

/**
 * GET /api/sewa/kpis
 * Returns Sewa KPIs for each department (for EHRC Dash integration)
 * Query params:
 *   - dept: optional, filter to specific department slug
 *
 * Returns per department:
 *   - openCount: unresolved complaints
 *   - newToday: complaints raised today
 *   - slaBreachCount: complaints where SLA has been breached
 *   - avgResolutionMin: avg resolution time over last 7 days (minutes)
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const dept = url.searchParams.get('dept');

    // Get today's start in IST (UTC+5:30)
    const nowUtc = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(nowUtc.getTime() + istOffset);
    const todayIST = istNow.toISOString().slice(0, 10);
    const todayStart = `${todayIST}T00:00:00+05:30`;

    // 7 days ago for avg resolution
    const sevenDaysAgo = new Date(istNow.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const deptFilter = dept ? `AND target_dept = '${dept.replace(/'/g, "''")}'` : '';

    // Open complaints (not resolved) per department
    const openResult = await sql.query(`
      SELECT target_dept, COUNT(*) as count
      FROM sewa_requests
      WHERE status != 'RESOLVED' ${deptFilter}
      GROUP BY target_dept
    `);

    // New today per department
    const newTodayResult = await sql.query(`
      SELECT target_dept, COUNT(*) as count
      FROM sewa_requests
      WHERE created_at >= $1::timestamptz ${deptFilter}
      GROUP BY target_dept
    `, [todayStart]);

    // SLA breaches: response SLA breached (not acknowledged within response_sla_min)
    // or resolution SLA breached (not resolved within resolution_sla_min)
    const slaBreachResult = await sql.query(`
      SELECT target_dept, COUNT(*) as count
      FROM sewa_requests
      WHERE status != 'RESOLVED'
        AND (
          (status = 'NEW' AND created_at + (response_sla_min || ' minutes')::interval < NOW())
          OR
          (created_at + (resolution_sla_min || ' minutes')::interval < NOW())
        )
        ${deptFilter}
      GROUP BY target_dept
    `);

    // Avg resolution time (last 7 days, resolved only)
    const avgResResult = await sql.query(`
      SELECT target_dept,
             ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60)) as avg_min
      FROM sewa_requests
      WHERE status = 'RESOLVED'
        AND resolved_at >= $1::timestamptz
        ${deptFilter}
      GROUP BY target_dept
    `, [sevenDaysAgo]);

    // Merge into per-department map
    const kpis: Record<string, {
      openCount: number;
      newToday: number;
      slaBreachCount: number;
      avgResolutionMin: number | null;
    }> = {};

    const ensureDept = (d: string) => {
      if (!kpis[d]) kpis[d] = { openCount: 0, newToday: 0, slaBreachCount: 0, avgResolutionMin: null };
    };

    openResult.rows.forEach(r => { ensureDept(r.target_dept); kpis[r.target_dept].openCount = Number(r.count); });
    newTodayResult.rows.forEach(r => { ensureDept(r.target_dept); kpis[r.target_dept].newToday = Number(r.count); });
    slaBreachResult.rows.forEach(r => { ensureDept(r.target_dept); kpis[r.target_dept].slaBreachCount = Number(r.count); });
    avgResResult.rows.forEach(r => { ensureDept(r.target_dept); kpis[r.target_dept].avgResolutionMin = Number(r.avg_min); });

    return Response.json({ kpis, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Sewa KPIs error:', error);
    return Response.json(
      { error: 'Failed to fetch KPIs', details: String(error) },
      { status: 500 }
    );
  }
}
