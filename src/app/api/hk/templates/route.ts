import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getTemplates } from '@/lib/hk-db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const activeOnly = searchParams.get('active') !== 'all';
    const templates = await getTemplates(category, activeOnly);
    return NextResponse.json({ templates, count: templates.length });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get templates', details: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.name || !body.category || !body.frequency) {
      return NextResponse.json({ error: 'name, category, and frequency required' }, { status: 400 });
    }
    const shifts = body.shifts || ['AM', 'PM'];
    const shiftsArr = '{' + shifts.join(',') + '}';
    const result = await sql`
      INSERT INTO hk_task_templates (name, category, area_id, area_type, frequency, shifts, disinfectant, priority_weight, checklist_ref)
      VALUES (${body.name}, ${body.category}, ${body.area_id || null}, ${body.area_type || null},
              ${body.frequency}, ${shiftsArr}::text[], ${body.disinfectant || null},
              ${body.priority_weight || 50}, ${body.checklist_ref || null})
      RETURNING *
    `;
    return NextResponse.json({ success: true, template: result.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create template', details: String(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    if (body.active === false) {
      await sql`UPDATE hk_task_templates SET active = FALSE, updated_at = NOW() WHERE id = ${body.id}`;
      return NextResponse.json({ success: true, message: 'Template deactivated' });
    }

    const result = await sql`
      UPDATE hk_task_templates
      SET name = COALESCE(${body.name || null}, name),
          category = COALESCE(${body.category || null}, category),
          area_id = COALESCE(${body.area_id ?? null}, area_id),
          area_type = COALESCE(${body.area_type || null}, area_type),
          frequency = COALESCE(${body.frequency || null}, frequency),
          disinfectant = COALESCE(${body.disinfectant || null}, disinfectant),
          priority_weight = COALESCE(${body.priority_weight ?? null}, priority_weight),
          checklist_ref = COALESCE(${body.checklist_ref || null}, checklist_ref),
          active = COALESCE(${body.active ?? null}, active),
          updated_at = NOW()
      WHERE id = ${body.id}
      RETURNING *
    `;
    return NextResponse.json({ success: true, template: result.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update template', details: String(error) }, { status: 500 });
  }
}
