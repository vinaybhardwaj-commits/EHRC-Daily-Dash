import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/validate?key=...
 * Validates the admin key. Returns 200 if valid, 401 if not.
 * The admin key is checked against ADMIN_KEY env var,
 * falling back to BACKUP_SECRET and MIGRATION_SECRET.
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

  return NextResponse.json({ ok: true });
}
