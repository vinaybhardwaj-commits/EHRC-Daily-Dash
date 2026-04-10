import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Check ADMIN_KEY auth
    const key = req.nextUrl.searchParams.get('key') || req.headers.get('x-admin-key') || '';
    const validKeys = [process.env.ADMIN_KEY].filter(Boolean);

    if (!key || validKeys.length === 0 || !validKeys.includes(key)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if a huddle already exists for today (not deleted)
    const existingHuddle = await sql`
      SELECT id FROM huddle_recordings
      WHERE date = CURRENT_DATE AND deleted_at IS NULL
      LIMIT 1
    `;

    if (existingHuddle.rows.length > 0) {
      return NextResponse.json(
        { error: 'Huddle already exists for today' },
        { status: 409 }
      );
    }

    // Generate recording_session_id
    const recordingSessionId = randomUUID();

    // Insert new huddle_recordings row
    // recording_session_id lives on huddle_audio_chunks, not here
    const result = await sql`
      INSERT INTO huddle_recordings (date, recording_status, recorded_by_user_id)
      VALUES (CURRENT_DATE, 'recording', 1)
      RETURNING id, date
    `;

    const huddle = result.rows[0];

    return NextResponse.json({
      huddle_id: huddle.id,
      date: huddle.date,
      recording_session_id: recordingSessionId,
    });
  } catch (error) {
    console.error('Huddle start error:', error);
    return NextResponse.json(
      {
        error: 'Failed to start huddle',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
