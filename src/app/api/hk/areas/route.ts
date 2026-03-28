import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getAreas } from '@/lib/hk-db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const floor = searchParams.get('floor') || undefined;
    const areaType = searchParams.get('areaType') || undefined;
    const activeOnly = searchParams.get('active') !== 'all';
    const areas = await getAreas(floor, areaType, activeOnly);
    return NextResponse.json({ areas, count: areas.length });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get areas', details: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.floor || !body.name || !body.area_type) {
      return NextResponse.json({ error: 'floor, name, and area_type required' }, { status: 400 });
    }
    const result = await sql`
      INSERT INTO hk_areas (floor, name, area_type, room_number)
      VALUES (${body.floor}, ${body.name}, ${body.area_type}, ${body.room_number || null})
      RETURNING *
    `;
    return NextResponse.json({ success: true, area: result.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create area', details: String(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    // Handle deactivation
    if (body.active === false) {
      await sql`UPDATE hk_areas SET active = FALSE, updated_at = NOW() WHERE id = ${body.id}`;
      return NextResponse.json({ success: true, message: 'Area deactivated' });
    }

    const result = await sql`
      UPDATE hk_areas
      SET floor = COALESCE(${body.floor || null}, floor),
          name = COALESCE(${body.name || null}, name),
          area_type = COALESCE(${body.area_type || null}, area_type),
          room_number = COALESCE(${body.room_number || null}, room_number),
          active = COALESCE(${body.active ?? null}, active),
          updated_at = NOW()
      WHERE id = ${body.id}
      RETURNING *
    `;
    return NextResponse.json({ success: true, area: result.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update area', details: String(error) }, { status: 500 });
  }
}
