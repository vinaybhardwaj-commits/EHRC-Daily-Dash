import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/supply-chain-requirements/summary
 * Returns aggregate stats for the dashboard card.
 */
export async function GET() {
  try {
    // Count by status
    const statusCounts = await sql`
      SELECT status, COUNT(*) as count
      FROM supply_chain_requirements
      WHERE status != 'Closed' OR (status = 'Closed' AND closed_at >= NOW() - INTERVAL '7 days')
      GROUP BY status
    `;

    // Urgent open items
    const urgentOpen = await sql`
      SELECT COUNT(*) as count
      FROM supply_chain_requirements
      WHERE priority = 'Urgent' AND status NOT IN ('Received', 'Closed')
    `;

    // Overdue items (expected_date in the past per IST, not yet Received/Closed)
    const overdue = await sql`
      SELECT COUNT(*) as count
      FROM supply_chain_requirements
      WHERE expected_date < (NOW() AT TIME ZONE 'Asia/Kolkata')::date
        AND status NOT IN ('Received', 'Closed')
    `;

    // Closed this week (IST boundary: UTC+5:30)
    const closedThisWeek = await sql`
      SELECT COUNT(*) as count
      FROM supply_chain_requirements
      WHERE status = 'Closed'
        AND closed_at >= DATE_TRUNC('week', (NOW() AT TIME ZONE 'Asia/Kolkata')::date::timestamp)
    `;

    // Total active (not Closed)
    const totalActive = await sql`
      SELECT COUNT(*) as count
      FROM supply_chain_requirements
      WHERE status NOT IN ('Closed')
    `;

    // Build summary — initialize all statuses to 0
    const byStatus: Record<string, number> = {
      Requested: 0,
      Approved: 0,
      Ordered: 0,
      Received: 0,
      Closed: 0,
    };
    for (const row of statusCounts.rows) {
      byStatus[row.status] = parseInt(row.count, 10);
    }

    return NextResponse.json({
      summary: {
        totalActive: parseInt(totalActive.rows[0]?.count || '0', 10),
        urgentOpen: parseInt(urgentOpen.rows[0]?.count || '0', 10),
        overdue: parseInt(overdue.rows[0]?.count || '0', 10),
        closedThisWeek: parseInt(closedThisWeek.rows[0]?.count || '0', 10),
        byStatus,
      },
    });
  } catch (error) {
    console.error('Supply chain summary error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch summary', details: String(error) },
      { status: 500 }
    );
  }
}
