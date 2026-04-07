import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/supply-chain-requirements/[id]
 * Update a requirement's fields (status, notes, quantity, etc.)
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const reqId = parseInt(id, 10);
    if (isNaN(reqId)) {
      return NextResponse.json({ error: 'Invalid requirement ID' }, { status: 400 });
    }

    const body = await req.json();
    const allowedFields = [
      'item_name', 'quantity', 'priority', 'status', 'notes',
      'requesting_department', 'expected_date', 'vendor', 'cost_estimate',
    ];

    // Validate status if provided
    if (body.status && !['Requested', 'Approved', 'Ordered', 'Received', 'Closed'].includes(body.status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: Requested, Approved, Ordered, Received, Closed' },
        { status: 400 }
      );
    }

    // Validate priority if provided
    if (body.priority && !['Urgent', 'Normal'].includes(body.priority)) {
      return NextResponse.json(
        { error: 'Priority must be Urgent or Normal' },
        { status: 400 }
      );
    }

    // Check requirement exists
    const existing = await sql`SELECT * FROM supply_chain_requirements WHERE id = ${reqId}`;
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Requirement not found' }, { status: 404 });
    }

    // Build dynamic update
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    let paramIdx = 1;

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${paramIdx}`);
        values.push(body[field]);
        paramIdx++;
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Always update updated_at
    updates.push(`updated_at = NOW()`);

    // Set closed_at when status changes to Closed
    if (body.status === 'Closed') {
      updates.push(`closed_at = NOW()`);
    } else if (body.status && body.status !== 'Closed' && existing.rows[0].status === 'Closed') {
      // Reopening: clear closed_at
      updates.push(`closed_at = NULL`);
    }

    values.push(reqId);
    const query = `UPDATE supply_chain_requirements SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`;
    const result = await sql.query(query, values);

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
