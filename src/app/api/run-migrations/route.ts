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
  // Future migrations go here:
  // { version: 7, name: 'next_migration', statements: ['...'] },
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
