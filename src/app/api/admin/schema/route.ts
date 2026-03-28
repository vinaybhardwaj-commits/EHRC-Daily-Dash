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
    // Get table names and sizes
    const tablesRaw = await sql`
      SELECT
        c.relname as table_name,
        pg_size_pretty(pg_total_relation_size(c.oid)) as size_pretty,
        pg_total_relation_size(c.oid) as size_bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
    `;

    // Get exact row counts for each table
    const tablesWithCounts = [];
    for (const row of tablesRaw.rows) {
      try {
        const countResult = await sql.query(`SELECT COUNT(*) as cnt FROM "${row.table_name}"`);
        tablesWithCounts.push({
          table_name: row.table_name,
          row_count: parseInt(countResult.rows[0]?.cnt || '0', 10),
          size_pretty: row.size_pretty,
        });
      } catch {
        tablesWithCounts.push({
          table_name: row.table_name,
          row_count: 0,
          size_pretty: row.size_pretty,
        });
      }
    }
    const tablesResult = { rows: tablesWithCounts };

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
