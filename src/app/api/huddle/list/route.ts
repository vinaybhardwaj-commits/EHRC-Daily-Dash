import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

/**
 * GET /api/huddle/list
 *
 * Returns all huddles ordered by date DESC.
 * Includes speaker count, transcript status, and duration.
 */
export async function GET(req: NextRequest) {
  try {
    const result = await sql`
      SELECT
        id, date, duration_seconds, recording_status, transcript_status,
        detected_speaker_count, created_at,
        COALESCE(LENGTH(transcript_text), 0) as transcript_length
      FROM huddle_recordings
      WHERE deleted_at IS NULL
      ORDER BY date DESC
      LIMIT 100
    `;

    return NextResponse.json({ huddles: result.rows });
  } catch (error) {
    console.error('Huddle list error:', error);
    return NextResponse.json(
      { error: 'Failed to list huddles', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
