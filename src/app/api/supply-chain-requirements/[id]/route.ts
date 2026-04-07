import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/supply-chain-requirements/[id]
 * Update a requirement's fields (status, notes, quantity, etc.)
 * Uses individual parameterized sql calls — no dynamic query building.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const reqId = parseInt(id, 10);
    if (isNaN(reqId)) {
      return NextResponse.json({ error: 'Invalid requirement ID' }, { status: 400 });
    }

    const body = await req.json();

    // Validate status if provided
    const validStatuses = ['Requested', 'Approved', 'Ordered', 'Received', 'Closed'];
    if (body.status !== undefined && !validStatuses.includes(body.status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') },
        { status: 400 }
      );
    }

    // Validate priority if provided
    if (body.priority !== undefined && !['Urgent', 'Normal'].includes(body.priority)) {
      return NextResponse.json(
        { error: 'Priority must be Urgent or Normal' },
        { status: 400 }
      );
    }

    // Validate quantity if provided
    if (body.quantity !== undefined) {
      const qty = Number(body.quantity);
      if (isNaN(qty) || qty < 1) {
        return NextResponse.json({ error: 'Quantity must be a positive integer' }, { status: 400 });
      }
    }

    // Validate cost_estimate if provided
    if (body.cost_estimate !== undefined && body.cost_estimate !== null) {
      const cost = Number(body.cost_estimate);
      if (isNaN(cost) || cost < 0) {
        return NextResponse.json({ error: 'Cost estimate must be a non-negative number' }, { status: 400 });
      }
    }

    // Check requirement exists
    const existing = await sql`SELECT * FROM supply_chain_requirements WHERE id = ${reqId}`;
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Requirement not found' }, { status: 404 });
    }

    // Determine closed_at value
    const wasClosedBefore = existing.rows[0].status === 'Closed';
    const isClosingNow = body.status === 'Closed';
    const isReopening = body.status && body.status !== 'Closed' && wasClosedBefore;

    // Use a single parameterized UPDATE with COALESCE to only change provided fields
    // This avoids dynamic SQL entirely — every field path is a parameterized template literal
    const result = await sql`
      UPDATE supply_chain_requirements SET
        item_name = COALESCE(${body.item_name ?? null}, item_name),
        quantity = COALESCE(${body.quantity !== undefined ? Number(body.quantity) : null}, quantity),
        priority = COALESCE(${body.priority ?? null}, priority),
        status = COALESCE(${body.status ?? null}, status),
        notes = COALESCE(${body.notes ?? null}, notes),
        requesting_department = COALESCE(${body.requesting_department ?? null}, requesting_department),
        expected_date = COALESCE(${body.expected_date ?? null}, expected_date),
        vendor = COALESCE(${body.vendor ?? null}, vendor),
        cost_estimate = COALESCE(${body.cost_estimate !== undefined ? Number(body.cost_estimate) : null}, cost_estimate),
        updated_at = NOW(),
        closed_at = CASE
          WHEN ${isClosingNow} THEN NOW()
          WHEN ${isReopening} THEN NULL
          ELSE closed_at
        END
      WHERE id = ${reqId}
      RETURNING *
    `;

    return NextResponse.json({ requirement: result.rows[0] });
  } catch (error) {
    console.error('Supply chain requirements PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update requirement', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/supply-chain-requirements/[id]
 * Get a single requirement by ID.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const reqId = parseInt(id, 10);
    if (isNaN(reqId)) {
      return NextResponse.json({ error: 'Invalid requirement ID' }, { status: 400 });
    }

    const result = await sql`SELECT * FROM supply_chain_requirements WHERE id = ${reqId}`;
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Requirement not found' }, { status: 404 });
    }

    return NextResponse.json({ requirement: result.rows[0] });
  } catch (error) {
    console.error('Supply chain requirements GET [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch requirement', details: String(error) },
      { status: 500 }
    );
  }
}
