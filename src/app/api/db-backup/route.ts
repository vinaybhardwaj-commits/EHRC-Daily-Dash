import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60s for large exports

/**
 * GET /api/db-backup?secret=...
 *
 * Generates a full JSON backup of all database tables.
 * Protected by BACKUP_SECRET env var (falls back to MIGRATION_SECRET).
 *
 * Returns a downloadable JSON file with:
 * - Full row data for every table
 * - DDL metadata (columns, types, constraints)
 * - Index definitions
 * - Migration history
 * - Timestamp and row counts
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  const expectedSecret = process.env.BACKUP_SECRET || process.env.MIGRATION_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date().toISOString();

    // Get all table names
    const tablesResult = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    const tableNames = tablesResult.rows.map(r => r.table_name);

    const backup: Record<string, unknown> = {
      meta: {
        created_at: now,
        database: 'neondb',
        format_version: 2,
        description: 'EHRC Daily Dashboard full database backup',
        table_count: tableNames.length,
      },
      tables: {} as Record<string, unknown>,
      ddl: {} as Record<string, unknown>,
      indexes: {} as Record<string, unknown>,
    };

    const tables = backup.tables as Record<string, unknown>;
    const ddl = backup.ddl as Record<string, unknown>;
    const indexes = backup.indexes as Record<string, unknown>;

    let totalRows = 0;

    for (const table of tableNames) {
      // Get column info
      const colsResult = await sql.query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_name = $1 AND table_schema = 'public'
         ORDER BY ordinal_position`,
        [table]
      );
      ddl[table] = colsResult.rows;

      // Get indexes
      const idxResult = await sql.query(
        `SELECT indexname, indexdef FROM pg_indexes
         WHERE tablename = $1 AND schemaname = 'public'`,
        [table]
      );
      indexes[table] = idxResult.rows;

      // Get all data
      const dataResult = await sql.query(`SELECT * FROM "${table}"`);
      tables[table] = {
        columns: dataResult.fields?.map((f: { name: string }) => f.name) || [],
        row_count: dataResult.rows.length,
        rows: dataResult.rows,
      };
      totalRows += dataResult.rows.length;
    }

    (backup.meta as Record<string, unknown>).total_rows = totalRows;

    // Return as downloadable JSON
    const dateStr = now.split('T')[0];
    const filename = `ehrc_db_backup_${dateStr}.json`;

    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Backup failed:', error);
    return NextResponse.json(
      { error: 'Backup failed', details: String(error) },
      { status: 500 }
    );
  }
}
