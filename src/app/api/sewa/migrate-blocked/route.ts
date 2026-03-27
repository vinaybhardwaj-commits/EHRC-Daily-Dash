import { sql } from '@vercel/postgres';

/**
 * GET /api/sewa/migrate-blocked?secret=...
 * Adds blocked_at and blocking_dept columns to sewa_requests table
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const secret = url.searchParams.get('secret');

    if (!secret || secret !== process.env.MIGRATION_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Add blocked_at column if not exists
    await sql`
      ALTER TABLE sewa_requests
      ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ DEFAULT NULL;
    `;

    // Add blocking_dept column if not exists
    await sql`
      ALTER TABLE sewa_requests
      ADD COLUMN IF NOT EXISTS blocking_dept TEXT DEFAULT NULL;
    `;

    // Add blocked_reason column for quick display without parsing comments
    await sql`
      ALTER TABLE sewa_requests
      ADD COLUMN IF NOT EXISTS blocked_reason TEXT DEFAULT NULL;
    `;

    return Response.json({
      success: true,
      message: 'Added blocked_at, blocking_dept, blocked_reason columns to sewa_requests',
    });
  } catch (error) {
    console.error('Migration error:', error);
    return Response.json(
      { error: 'Migration failed', details: String(error) },
      { status: 500 }
    );
  }
}
