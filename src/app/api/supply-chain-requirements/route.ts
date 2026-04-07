import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/supply-chain-requirements
 * Returns active requirements + recently closed (within 3 days).
 * Query params: ?status=Open&priority=Urgent (optional filters)
 */
export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get('status');
    const priority = req.nextUrl.searchParams.get('priority');
    const includeArchived = req.nextUrl.searchParams.get('archived') === 'true';

    let result;

    if (includeArchived) {
      // Return everything (for admin/history view)
      result = await sql`
        SELECT * FROM supply_chain_requirements
        ORDER BY
          CASE WHEN status = 'Closed' THEN 1 ELSE 0 END,
          CASE priority WHEN 'Urgent' THEN 0 ELSE 1 END,
          created_at DESC
      `;
    } else {
      // Active items + items closed within last 3 days
      result = await sql`
        SELECT * FROM supply_chain_requirements
        WHERE status != 'Closed'
           OR (status = 'Closed' AND closed_at >= NOW() - INTERVAL '3 days')
        ORDER BY
          CASE WHEN status = 'Closed' THEN 1 ELSE 0 END,
          CASE priority WHEN 'Urgent' THEN 0 ELSE 1 END,
          created_at DESC
      `;
    }

    let rows = result.rows;

    // Apply optional filters
    if (status) {
      rows = rows.filter(r => r.status === status);
    }
    if (priority) {
      rows = rows.filter(r => r.priority === priority);
    }

    return NextResponse.json({ requirements: rows, count: rows.length });
  } catch (error) {
    console.error('Supply chain requirements GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch requirements', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/supply-chain-requirements
 * Create a new requirement.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      item_name,
      quantity = 1,
      priority = 'Normal',
      notes = '',
      requesting_department = '',
      expected_date = null,
      vendor = '',
      cost_estimate = null,
      created_by = null,
    } = body;

    if (!item_name || !item_name.trim()) {
      return NextResponse.json(
        { error: 'Item name is required' },
        { status: 400 }
      );
    }

    // Validate priority
    if (!['Urgent', 'Normal'].includes(priority)) {
      return NextResponse.json(
        { error: 'Priority must be Urgent or Normal' },
        { status: 400 }
      );
    }

    const result = await sql`
      INSERT INTO supply_chain_requirements
        (item_name, quantity, priority, status, notes, requesting_department, expected_date, vendor, cost_estimate, created_by)
      VALUES
        (${item_name.trim()}, ${quantity}, ${priority}, 'Requested', ${notes}, ${requesting_department}, ${expected_date}, ${vendor}, ${cost_estimate}, ${created_by})
      RETURNING *
    `;

    return NextResponse.json({ requirement: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('Supply chain requirements POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create requirement', details: String(error) },
      { status: 500 }
    );
  }
}
