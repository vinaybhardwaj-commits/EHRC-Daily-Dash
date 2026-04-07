import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/supply-chain-requirements/[id]
 * Update a requirement's fields (status, notes, quantity, etc.)
 * Strategy: read existing → merge with body → write back with full parameterized UPDATE.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const reqId = parseInt(id, 10);
    if (isNaN(reqId)) {
      return NextResponse.json({ error: 'Invalid requirement ID' }, { status: 400 });
    }

    // Handle empty or malformed body
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });
    }

    // Filter to only allowed fields
    const allowedFields = new Set([
      'item_name', 'quantity', 'priority', 'status', 'notes',
      'requesting_department', 'expected_date', 'vendor', 'cost_estimate',
    ]);
    const updates: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      if (allowedFields.has(key)) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // ── Validation ──────────────────────────────────────────────
    const validStatuses = ['Requested', 'Approved', 'Ordered', 'Received', 'Closed'];
    if (updates.status !== undefined && !validStatuses.includes(updates.status as string)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') },
        { status: 400 }
      );
    }

    if (updates.priority !== undefined && !['Urgent', 'Normal'].includes(updates.priority as string)) {
      return NextResponse.json({ error: 'Priority must be Urgent or Normal' }, { status: 400 });
    }

    if (updates.quantity !== undefined) {
      const qty = Number(updates.quantity);
      if (isNaN(qty) || qty < 1 || !Number.isInteger(qty)) {
        return NextResponse.json({ error: 'Quantity must be a positive whole number' }, { status: 400 });
      }
    }

    if (updates.cost_estimate !== undefined && updates.cost_estimate !== null) {
      const cost = Number(updates.cost_estimate);
      if (isNaN(cost) || cost < 0) {
        return NextResponse.json({ error: 'Cost estimate must be a non-negative number' }, { status: 400 });
      }
    }

    if (updates.expected_date !== undefined && updates.expected_date !== null && updates.expected_date !== '') {
      const dateCheck = new Date(String(updates.expected_date) + 'T00:00:00Z');
      if (isNaN(dateCheck.getTime())) {
        return NextResponse.json({ error: 'Invalid expected_date format. Use YYYY-MM-DD.' }, { status: 400 });
      }
    }

    if (updates.item_name !== undefined) {
      if (typeof updates.item_name !== 'string' || updates.item_name.trim() === '') {
        return NextResponse.json({ error: 'Item name cannot be empty' }, { status: 400 });
      }
    }

    // ── Read existing row ───────────────────────────────────────
    const existing = await sql`SELECT * FROM supply_chain_requirements WHERE id = ${reqId}`;
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Requirement not found' }, { status: 404 });
    }
    const row = existing.rows[0];

    // ── Merge: body values override existing row ────────────────
    const merged = {
      item_name: updates.item_name !== undefined ? String(updates.item_name).trim() : row.item_name,
      quantity: updates.quantity !== undefined ? Number(updates.quantity) : row.quantity,
      priority: updates.priority !== undefined ? String(updates.priority) : row.priority,
      status: updates.status !== undefined ? String(updates.status) : row.status,
      notes: updates.notes !== undefined ? String(updates.notes) : row.notes,
      requesting_department: updates.requesting_department !== undefined ? String(updates.requesting_department) : row.requesting_department,
      expected_date: updates.expected_date !== undefined
        ? (updates.expected_date === '' || updates.expected_date === null ? null : String(updates.expected_date))
        : row.expected_date,
      vendor: updates.vendor !== undefined ? String(updates.vendor) : row.vendor,
      cost_estimate: updates.cost_estimate !== undefined
        ? (updates.cost_estimate === null ? null : Number(updates.cost_estimate))
        : row.cost_estimate,
    };

    // ── Determine closed_at ─────────────────────────────────────
    const isClosingNow = merged.status === 'Closed' && row.status !== 'Closed';
    const isReopening = merged.status !== 'Closed' && row.status === 'Closed';

    // ── Write back: single fully-parameterized UPDATE ───────────
    const result = await sql`
      UPDATE supply_chain_requirements SET
        item_name = ${merged.item_name},
        quantity = ${merged.quantity},
        priority = ${merged.priority},
        status = ${merged.status},
        notes = ${merged.notes},
        requesting_department = ${merged.requesting_department},
        expected_date = ${merged.expected_date},
        vendor = ${merged.vendor},
        cost_estimate = ${merged.cost_estimate},
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
