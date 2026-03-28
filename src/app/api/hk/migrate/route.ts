import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    // ═══════════════════════════════════════════════════════════════
    // hk_areas: Physical locations in the hospital
    // ═══════════════════════════════════════════════════════════════
    await sql`
      CREATE TABLE IF NOT EXISTS hk_areas (
        id            SERIAL PRIMARY KEY,
        floor         TEXT NOT NULL,
        name          TEXT NOT NULL,
        area_type     TEXT NOT NULL,
        room_number   TEXT,
        active        BOOLEAN DEFAULT TRUE,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_hk_areas_floor ON hk_areas (floor)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_hk_areas_type ON hk_areas (area_type)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_hk_areas_active ON hk_areas (active)`;

    // ═══════════════════════════════════════════════════════════════
    // hk_task_templates: Master task list
    // ═══════════════════════════════════════════════════════════════
    await sql`
      CREATE TABLE IF NOT EXISTS hk_task_templates (
        id              SERIAL PRIMARY KEY,
        name            TEXT NOT NULL,
        name_kn         TEXT,
        category        TEXT NOT NULL,
        area_id         INTEGER REFERENCES hk_areas(id),
        area_type       TEXT,
        frequency       TEXT NOT NULL,
        shifts          TEXT[] NOT NULL DEFAULT '{AM,PM,NIGHT}',
        disinfectant    TEXT,
        priority_weight INTEGER DEFAULT 50,
        checklist_ref   TEXT,
        active          BOOLEAN DEFAULT TRUE,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_hk_templates_category ON hk_task_templates (category)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_hk_templates_active ON hk_task_templates (active)`;

    // ═══════════════════════════════════════════════════════════════
    // hk_shifts: One row per shift — metadata and summary
    // ═══════════════════════════════════════════════════════════════
    await sql`
      CREATE TABLE IF NOT EXISTS hk_shifts (
        id              SERIAL PRIMARY KEY,
        date            TEXT NOT NULL,
        shift_type      TEXT NOT NULL,
        supervisor_name TEXT,
        staff_count     INTEGER,
        male_count      INTEGER,
        female_count    INTEGER,
        ip_census       INTEGER,
        started_at      TIMESTAMPTZ DEFAULT NOW(),
        completed_at    TIMESTAMPTZ,
        UNIQUE(date, shift_type)
      )
    `;

    // ═══════════════════════════════════════════════════════════════
    // hk_shift_tasks: Generated task instances — the core table
    // ═══════════════════════════════════════════════════════════════
    await sql`
      CREATE TABLE IF NOT EXISTS hk_shift_tasks (
        id                  SERIAL PRIMARY KEY,
        shift_id            INTEGER NOT NULL REFERENCES hk_shifts(id),
        template_id         INTEGER REFERENCES hk_task_templates(id),
        area_id             INTEGER NOT NULL REFERENCES hk_areas(id),
        task_name           TEXT NOT NULL,
        task_category       TEXT NOT NULL,
        disinfectant        TEXT,
        floor               TEXT NOT NULL,
        area_name           TEXT NOT NULL,
        source              TEXT NOT NULL,
        sewa_request_id     TEXT,
        carryover_from_id   INTEGER,
        status              TEXT NOT NULL DEFAULT 'pending',
        priority            INTEGER DEFAULT 50,
        completed_at        TIMESTAMPTZ,
        completed_by        TEXT,
        photo_url           TEXT,
        skip_reason         TEXT,
        notes               TEXT,
        created_at          TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_hk_tasks_shift ON hk_shift_tasks (shift_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_hk_tasks_status ON hk_shift_tasks (status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_hk_tasks_floor ON hk_shift_tasks (floor)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_hk_tasks_sewa ON hk_shift_tasks (sewa_request_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_hk_tasks_source ON hk_shift_tasks (source)`;

    // ═══════════════════════════════════════════════════════════════
    // hk_sewa_mappings: Sewa complaint type -> HK task mapping
    // ═══════════════════════════════════════════════════════════════
    await sql`
      CREATE TABLE IF NOT EXISTS hk_sewa_mappings (
        id                      SERIAL PRIMARY KEY,
        sewa_complaint_type_id  TEXT NOT NULL UNIQUE,
        sewa_complaint_name     TEXT NOT NULL,
        hk_category             TEXT NOT NULL,
        auto_create_task        BOOLEAN DEFAULT TRUE,
        default_priority        INTEGER DEFAULT 10
      )
    `;

    return NextResponse.json({
      success: true,
      message: 'SanitizeTrack migration complete — 5 tables created',
      tables: ['hk_areas', 'hk_task_templates', 'hk_shifts', 'hk_shift_tasks', 'hk_sewa_mappings'],
    });
  } catch (error) {
    console.error('HK migration error:', error);
    return NextResponse.json(
      { error: 'Migration failed', details: String(error) },
      { status: 500 }
    );
  }
}
