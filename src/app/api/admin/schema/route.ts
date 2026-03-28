import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/schema?key=...
 * Returns database schema info: table sizes, row counts, and migration history.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') || '';
  const validKeys = [
    process.env.ADMIN_KEY,
    process.env.BACKUP_SECRET,
    process.env.MIGRATION_SECRET,
  ].filter(Boolean);

  if (!key || validKeys.length === 0 || !validKeys.includes(key)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get table info with row counts and sizes
    const tablesResult = await sql`
      SELECT
        c.relname as table_name,
        c.reltuples::bigint as row_count,
        pg_size_pretty(pg_total_relation_size(c.oid)) as size_pretty
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
    `;

    // Get migrations
    let migrations: { version: number; name: string; applied_at: string }[] = [];
    try {
      const migResult = await sql`SELECT version, name, applied_at FROM schema_migrations ORDER BY version`;
      migrations = migResult.rows.map(r => ({
        version: r.version,
        name: r.name,
        applied_at: r.applied_at,
      }));
    } catch {
      // schema_migrations may not exist
    }

    // Get total DB size
    const sizeResult = await sql`SELECT pg_size_pretty(pg_database_size(current_database())) as db_size`;

    return NextResponse.json({
      tables: tablesResult.rows,
      migrations,
      db_size: sizeResult.rows[0]?.db_size || '',
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
