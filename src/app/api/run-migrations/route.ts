import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

/**
 * POST /api/run-migrations
 *
 * Ensures all schema migrations are applied.
 * Protected by MIGRATION_SECRET.
 *
 * This endpoint is idempotent — it checks schema_migrations
 * and only runs migrations that haven't been applied yet.
 *
 * GET returns the current migration status.
 */

interface Migration {
  version: number;
  name: string;
  statements: string[];
}

// Add new migrations here. Each must have a unique incrementing version.
const MIGRATIONS: Migration[] = [
  {
    version: 0,
    name: 'create_schema_migrations',
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    ],
  },
  // Migrations 1-6 were applied directly on 2026-03-28.
  // They are recorded in schema_migrations but not re-runnable here
  // since they included data backfills that should only run once.
  {
    version: 7,
    name: 'create_supply_chain_requirements',
    statements: [
      `CREATE TABLE IF NOT EXISTS supply_chain_requirements (
        id SERIAL PRIMARY KEY,
        item_name TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        priority TEXT DEFAULT 'Normal' CHECK (priority IN ('Urgent', 'Normal')),
        status TEXT DEFAULT 'Requested' CHECK (status IN ('Requested', 'Approved', 'Ordered', 'Received', 'Closed')),
        notes TEXT,
        requesting_department TEXT,
        expected_date DATE,
        vendor TEXT,
        cost_estimate NUMERIC(12,2),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at TIMESTAMPTZ,
        created_by TEXT,
        facility_id INTEGER DEFAULT 1
      )`,
      `CREATE INDEX IF NOT EXISTS idx_scr_status ON supply_chain_requirements(status)`,
      `CREATE INDEX IF NOT EXISTS idx_scr_priority ON supply_chain_requirements(priority)`,
      `CREATE INDEX IF NOT EXISTS idx_scr_closed_at ON supply_chain_requirements(closed_at)`,
    ],
  },
  {
    version: 8,
    name: 'create_huddle_tables',
    statements: [
      // --- users table (auth foundation) ---
      `CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('super_admin', 'admin', 'hod', 'viewer')),
        department_slug TEXT,
        is_huddle_recorder BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
      `CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`,

      // --- Seed V as super_admin + recorder ---
      `INSERT INTO users (email, display_name, role, is_huddle_recorder)
       VALUES ('vinay.bhardwaj@even.in', 'V (Vinay Bhardwaj)', 'super_admin', true)
       ON CONFLICT (email) DO NOTHING`,

      // --- huddle_recordings: one row per huddle per day ---
      `CREATE TABLE IF NOT EXISTS huddle_recordings (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMPTZ,
        duration_seconds INTEGER,
        recording_status TEXT NOT NULL DEFAULT 'recording' CHECK (recording_status IN ('recording', 'uploaded', 'transcribing', 'completed', 'failed', 'abandoned')),
        transcript_status TEXT DEFAULT 'pending' CHECK (transcript_status IN ('pending', 'processing', 'completed', 'failed')),
        transcript_text TEXT,
        transcript_json JSONB,
        summary_json JSONB,
        detected_speaker_count INTEGER,
        audio_url TEXT,
        recorded_by_user_id INTEGER REFERENCES users(id),
        deleted_at TIMESTAMPTZ,
        deleted_by_user_id INTEGER REFERENCES users(id),
        abandoned_at TIMESTAMPTZ,
        abandoned_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_huddle_per_day ON huddle_recordings(date) WHERE (deleted_at IS NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_huddle_recordings_date ON huddle_recordings(date DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_huddle_recordings_status ON huddle_recordings(recording_status)`,

      // --- huddle_audio_chunks: per-chunk Blob URLs ---
      `CREATE TABLE IF NOT EXISTS huddle_audio_chunks (
        id SERIAL PRIMARY KEY,
        huddle_id INTEGER NOT NULL REFERENCES huddle_recordings(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        recording_session_id TEXT NOT NULL,
        blob_url TEXT,
        blob_deleted_at TIMESTAMPTZ,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER,
        duration_seconds REAL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_huddle_chunks_huddle ON huddle_audio_chunks(huddle_id, chunk_index)`,
      `CREATE INDEX IF NOT EXISTS idx_huddle_chunks_session ON huddle_audio_chunks(recording_session_id)`,

      // --- huddle_speakers: Deepgram speaker index → user mapping ---
      `CREATE TABLE IF NOT EXISTS huddle_speakers (
        id SERIAL PRIMARY KEY,
        huddle_id INTEGER NOT NULL REFERENCES huddle_recordings(id) ON DELETE CASCADE,
        speaker_index INTEGER NOT NULL,
        user_id INTEGER REFERENCES users(id),
        display_name TEXT NOT NULL,
        department_slug TEXT,
        voice_signature_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT unique_speaker_per_huddle UNIQUE (huddle_id, speaker_index)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_huddle_speakers_huddle ON huddle_speakers(huddle_id)`,

      // --- huddle_transcription_attempts: retry log ---
      `CREATE TABLE IF NOT EXISTS huddle_transcription_attempts (
        id SERIAL PRIMARY KEY,
        huddle_id INTEGER NOT NULL REFERENCES huddle_recordings(id) ON DELETE CASCADE,
        attempt_number INTEGER NOT NULL DEFAULT 1,
        trigger_type TEXT NOT NULL DEFAULT 'auto' CHECK (trigger_type IN ('auto', 'manual', 'cron')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'success', 'failed')),
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        latency_ms INTEGER,
        input_bytes INTEGER,
        output_tokens INTEGER,
        error_message TEXT,
        deepgram_request_id TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_transcription_attempts_huddle ON huddle_transcription_attempts(huddle_id, attempt_number)`,

      // --- huddle_transcript_edits: inline edit history ---
      `CREATE TABLE IF NOT EXISTS huddle_transcript_edits (
        id SERIAL PRIMARY KEY,
        huddle_id INTEGER NOT NULL REFERENCES huddle_recordings(id) ON DELETE CASCADE,
        segment_index INTEGER NOT NULL,
        original_text TEXT NOT NULL,
        edited_text TEXT NOT NULL,
        edited_by_user_id INTEGER NOT NULL REFERENCES users(id),
        edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_transcript_edits_huddle ON huddle_transcript_edits(huddle_id, segment_index)`,

      // --- huddle_recorder_audit: grant/revoke log ---
      `CREATE TABLE IF NOT EXISTS huddle_recorder_audit (
        id SERIAL PRIMARY KEY,
        target_user_id INTEGER NOT NULL REFERENCES users(id),
        changed_by_user_id INTEGER NOT NULL REFERENCES users(id),
        action TEXT NOT NULL CHECK (action IN ('grant', 'revoke')),
        changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_huddle_recorder_audit_target ON huddle_recorder_audit(target_user_id, changed_at DESC)`,
    ],
  },
  {
    version: 9,
    name: 'add_speaker_auto_id_columns',
    statements: [
      // Add confidence score (0.0–1.0) for auto-identification
      `ALTER TABLE huddle_speakers ADD COLUMN IF NOT EXISTS confidence REAL DEFAULT NULL`,
      // Source of mapping: 'auto' (rule engine), 'manual' (user override), 'llm' (future)
      `ALTER TABLE huddle_speakers ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual' CHECK (source IN ('auto', 'manual', 'llm'))`,
      // Timestamp for manual overrides
      `ALTER TABLE huddle_speakers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
    ],
  },
{
    version: 10,
    name: 'no_op_lane_check_s0',
    statements: [
      // S0 backup-drill no-op: proves the migration lane works end-to-end.
      // Touches no existing data; no schema change beyond schema_migrations row insert.
      `SELECT 1`,
    ],
  },
  {
    version: 11,
    name: 'form_fillers',
    statements: [
      // S2 R3: identity capture — who filled which form, per-device.
      // Additive only. department_data columns are nullable (backfill handled in runtime).
      `CREATE TABLE IF NOT EXISTS form_fillers (
         device_id TEXT PRIMARY KEY,
         name TEXT NOT NULL,
         first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         submission_count INTEGER NOT NULL DEFAULT 0
       )`,
      `CREATE INDEX IF NOT EXISTS idx_form_fillers_name ON form_fillers (LOWER(name))`,
      `CREATE TABLE IF NOT EXISTS form_filler_audit (
         id BIGSERIAL PRIMARY KEY,
         device_id TEXT NOT NULL,
         old_name TEXT,
         new_name TEXT NOT NULL,
         changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         user_agent TEXT,
         ip_hash TEXT
       )`,
      `CREATE INDEX IF NOT EXISTS idx_form_filler_audit_device ON form_filler_audit (device_id, changed_at DESC)`,
      `ALTER TABLE department_data ADD COLUMN IF NOT EXISTS filler_name TEXT`,
      `ALTER TABLE department_data ADD COLUMN IF NOT EXISTS filler_device_id TEXT`,
      `ALTER TABLE department_data ADD COLUMN IF NOT EXISTS filler_claimed_at TIMESTAMPTZ`,
      `CREATE INDEX IF NOT EXISTS idx_department_data_filler_device ON department_data (filler_device_id)`,
    ],
  },
  {
    version: 12,
    name: 'backfill_department_data_date_d',
    statements: [
      // S4 R4 B1: populate date_d (typed) from date (text) for all historical rows.
      // Well-formed dates -> real cast. Malformed legacy rows (e.g. '2026-00-11')
      // get a sentinel of 1900-01-01 so they don't break the NOT NULL guard and
      // are trivially filterable later.
      `UPDATE department_data
         SET date_d = CASE
           WHEN date ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
             THEN date::date
           ELSE DATE '1900-01-01'
         END
         WHERE date_d IS NULL`,
      // Future guard: stop accepting NULL date_d on new writes. All 5 INSERT
      // sites (form-submit x2, storage.ts x2, sheets-sync x1) now populate
      // date_d alongside date, so this constraint should never fire in normal
      // flow.
      `ALTER TABLE department_data
         ALTER COLUMN date_d SET NOT NULL`,
    ],
  },
];

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  const expectedSecret = process.env.MIGRATION_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Ensure schema_migrations exists
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

    const result = await sql`SELECT version, name, applied_at FROM schema_migrations ORDER BY version`;
    return NextResponse.json({
      applied: result.rows,
      total_available: MIGRATIONS.length,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const secret = body.secret || '';
  const expectedSecret = process.env.MIGRATION_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Ensure schema_migrations exists
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

    const applied = await sql`SELECT version FROM schema_migrations`;
    const appliedVersions = new Set(applied.rows.map(r => r.version));

    const results: { version: number; name: string; status: string }[] = [];

    for (const migration of MIGRATIONS) {
      if (appliedVersions.has(migration.version)) {
        results.push({ version: migration.version, name: migration.name, status: 'already_applied' });
        continue;
      }

      try {
        for (const stmt of migration.statements) {
          await sql.query(stmt);
        }
        await sql`INSERT INTO schema_migrations (version, name) VALUES (${migration.version}, ${migration.name})`;
        results.push({ version: migration.version, name: migration.name, status: 'applied' });
      } catch (error) {
        results.push({ version: migration.version, name: migration.name, status: `failed: ${error}` });
        break; // Stop on first failure
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
