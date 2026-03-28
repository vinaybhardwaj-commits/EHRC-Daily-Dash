import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { SEED_AREAS, SEED_TEMPLATES, SEED_SEWA_MAPPINGS } from '@/lib/hk-config';

export async function POST() {
  try {
    // Check if already seeded
    const existing = await sql`SELECT COUNT(*) as count FROM hk_areas`;
    if (Number(existing.rows[0].count) > 0) {
      return NextResponse.json({
        success: false,
        message: 'Already seeded. Delete existing data first if re-seeding is needed.',
      }, { status: 409 });
    }

    // ── Seed Areas ──
    let areaCount = 0;
    for (const area of SEED_AREAS) {
      await sql`
        INSERT INTO hk_areas (floor, name, area_type, room_number)
        VALUES (${area.floor}, ${area.name}, ${area.area_type}, ${area.room_number || null})
      `;
      areaCount++;
    }

    // ── Seed Task Templates ──
    let templateCount = 0;
    for (const t of SEED_TEMPLATES) {
      const shiftsArr = '{' + t.shifts.join(',') + '}';
      await sql`
        INSERT INTO hk_task_templates (name, category, area_type, frequency, shifts, disinfectant, priority_weight, checklist_ref)
        VALUES (${t.name}, ${t.category}, ${t.area_type || null}, ${t.frequency}, ${shiftsArr}::text[], ${t.disinfectant || null}, ${t.priority_weight}, ${t.checklist_ref || null})
      `;
      templateCount++;
    }

    // ── Seed Sewa Mappings ──
    let mappingCount = 0;
    for (const m of SEED_SEWA_MAPPINGS) {
      await sql`
        INSERT INTO hk_sewa_mappings (sewa_complaint_type_id, sewa_complaint_name, hk_category, auto_create_task, default_priority)
        VALUES (${m.sewa_complaint_type_id}, ${m.sewa_complaint_name}, ${m.hk_category}, ${m.auto_create_task}, ${m.default_priority})
        ON CONFLICT (sewa_complaint_type_id) DO NOTHING
      `;
      mappingCount++;
    }

    return NextResponse.json({
      success: true,
      message: 'SanitizeTrack seed complete',
      counts: { areas: areaCount, templates: templateCount, sewaMappings: mappingCount },
    });
  } catch (error) {
    console.error('HK seed error:', error);
    return NextResponse.json(
      { error: 'Seed failed', details: String(error) },
      { status: 500 }
    );
  }
}
