/**
 * Database migration script for EHRC Dashboard.
 * Creates the required tables in Neon Postgres.
 *
 * Usage:
 *   POSTGRES_URL="postgres://..." npx tsx scripts/migrate.ts
 *
 * On Vercel, the POSTGRES_URL env var is set automatically
 * via the Neon integration.
 */

import { sql } from '@vercel/postgres';

async function migrate() {
  console.log('Running EHRC Dashboard database migration...\n');

  // 1. day_snapshots â one row per date
  await sql`
    CREATE TABLE IF NOT EXISTS day_snapshots (
      date       TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL
    );
  `;
  console.log('â day_snapshots table');

  // 2. department_data â one row per (date, slug)
  await sql`
    CREATE TABLE IF NOT EXISTS department_data (
      id      SERIAL PRIMARY KEY,
      date    TEXT NOT NULL,
      slug    TEXT NOT NULL,
      name    TEXT NOT NULL,
      tab     TEXT NOT NULL,
      entries JSONB NOT NULL DEFAULT '[]'::jsonb,
      UNIQUE(date, slug)
    );
  `;
  console.log('â department_data table');

  // 3. huddle_summaries â one row per uploaded summary file
  await sql`
    CREATE TABLE IF NOT EXISTS huddle_summaries (
      id          SERIAL PRIMARY KEY,
      date        TEXT NOT NULL,
      filename    TEXT NOT NULL,
      content     TEXT NOT NULL DEFAULT '',
      uploaded_at TEXT NOT NULL,
      type        TEXT NOT NULL
    );
  `;
  console.log('â huddle_summaries table');

  // Indexes for common queries
  await sql`CREATE INDEX IF NOT EXISTS idx_dept_date ON department_data(date);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_dept_slug ON department_data(slug);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_huddle_date ON huddle_summaries(date);`;
  console.log('â indexes');

  console.log('\nMigration complete!');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
