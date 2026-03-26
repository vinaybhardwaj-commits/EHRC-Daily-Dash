/**
 * Sewa v2 — Database Migration
 * Run once to create sewa_ tables in the existing Neon Postgres DB.
 * Can be triggered via: /api/sewa/migrate (one-time setup endpoint)
 */

import { sql } from '@vercel/postgres';

export async function runSewaMigration() {
  // ── sewa_users: lightweight staff registration ──────────────
  await sql`
    CREATE TABLE IF NOT EXISTS sewa_users (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      department    TEXT NOT NULL,
      employee_id   TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // Index for quick lookups by name+dept
  await sql`
    CREATE INDEX IF NOT EXISTS idx_sewa_users_name_dept
    ON sewa_users (name, department);
  `;

  // ── sewa_requests: the core complaints table ────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS sewa_requests (
      id                  TEXT PRIMARY KEY,
      requestor_name      TEXT NOT NULL,
      requestor_dept      TEXT NOT NULL,
      requestor_emp_id    TEXT,
      target_dept         TEXT NOT NULL,
      complaint_type_id   TEXT NOT NULL,
      complaint_type_name TEXT NOT NULL,
      sub_menu            TEXT,
      priority            TEXT NOT NULL DEFAULT 'normal',
      status              TEXT NOT NULL DEFAULT 'NEW',
      location            TEXT,
      description         TEXT NOT NULL,
      patient_name        TEXT,
      patient_uhid        TEXT,
      extra_fields        JSONB DEFAULT '{}',
      response_sla_min    INTEGER NOT NULL,
      resolution_sla_min  INTEGER NOT NULL,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      acknowledged_at     TIMESTAMPTZ,
      resolved_at         TIMESTAMPTZ,
      acknowledged_by     TEXT,
      resolved_by         TEXT,
      escalation_level    INTEGER NOT NULL DEFAULT 0,
      comments            JSONB DEFAULT '[]'
    );
  `;

  // Indexes for common queries
  await sql`CREATE INDEX IF NOT EXISTS idx_sewa_req_target_dept ON sewa_requests (target_dept);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sewa_req_status ON sewa_requests (status);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sewa_req_created ON sewa_requests (created_at DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sewa_req_requestor ON sewa_requests (requestor_name, requestor_dept);`;

  // ── sewa_id_counter: auto-incrementing SEW-XXXX IDs ─────────
  await sql`
    CREATE TABLE IF NOT EXISTS sewa_id_counter (
      id      TEXT PRIMARY KEY DEFAULT 'global',
      counter INTEGER NOT NULL DEFAULT 0
    );
  `;

  // Seed counter if not exists
  await sql`
    INSERT INTO sewa_id_counter (id, counter)
    VALUES ('global', 0)
    ON CONFLICT (id) DO NOTHING;
  `;

  return { success: true, message: 'Sewa tables created/verified successfully' };
}
