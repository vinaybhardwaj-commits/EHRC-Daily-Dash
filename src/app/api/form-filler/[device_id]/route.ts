import { sql } from '@vercel/postgres';
import type { NextRequest } from 'next/server';

// GET /api/form-filler/:device_id
// Returns: { device_id, name, first_seen_at, last_seen_at, submission_count } | 404
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ device_id: string }> },
) {
  try {
    const { device_id: deviceIdRaw } = await params;
    const deviceId = (deviceIdRaw || '').trim();
    if (!deviceId || deviceId.length < 8 || deviceId.length > 64) {
      return Response.json({ error: 'Invalid device_id' }, { status: 400 });
    }
    const result = await sql`
      SELECT device_id, name, first_seen_at, last_seen_at, submission_count
      FROM form_fillers WHERE device_id = ${deviceId} LIMIT 1
    `;
    if (result.rows.length === 0) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    return Response.json(result.rows[0]);
  } catch (error) {
    console.error('form-filler GET error:', error);
    return Response.json(
      { error: 'Failed to load form filler', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}
