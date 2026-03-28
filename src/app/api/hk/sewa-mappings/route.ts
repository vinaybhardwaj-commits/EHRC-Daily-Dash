import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getSewaMappings } from '@/lib/hk-db';

export async function GET() {
  try {
    const mappings = await getSewaMappings();
    return NextResponse.json({ mappings, count: mappings.length });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get Sewa mappings', details: String(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const result = await sql`
      UPDATE hk_sewa_mappings
      SET hk_category = COALESCE(${body.hk_category || null}, hk_category),
          auto_create_task = COALESCE(${body.auto_create_task ?? null}, auto_create_task),
          default_priority = COALESCE(${body.default_priority ?? null}, default_priority)
      WHERE id = ${body.id}
      RETURNING *
    `;
    return NextResponse.json({ success: true, mapping: result.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update mapping', details: String(error) }, { status: 500 });
  }
}
