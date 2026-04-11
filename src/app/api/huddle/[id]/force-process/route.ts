import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const huddleId = parseInt(id, 10);

    if (isNaN(huddleId)) {
      return NextResponse.json({ error: 'Invalid huddle ID' }, { status: 400 });
    }

    // Fetch huddle to verify status
    const huddleResult = await sql`
      SELECT id, recording_status, transcript_status
      FROM huddle_recordings
      WHERE id = ${huddleId} AND deleted_at IS NULL
      LIMIT 1
    `;

    if (huddleResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Huddle not found' },
        { status: 404 }
      );
    }

    const huddle = huddleResult.rows[0];

    // Verify huddle is in abandoned status
    if (huddle.recording_status !== 'abandoned') {
      return NextResponse.json(
        {
          error: `Huddle is in "${huddle.recording_status}" status. Can only force-process abandoned huddles.`,
          current_status: huddle.recording_status,
        },
        { status: 409 }
      );
    }

    // Count existing attempts to get next attempt number
    const attemptCountResult = await sql`
      SELECT COALESCE(MAX(attempt_number), 0) as max_attempt
      FROM huddle_transcription_attempts
      WHERE huddle_id = ${huddleId}
    `;

    const nextAttemptNumber = (attemptCountResult.rows[0].max_attempt || 0) + 1;

    // Create new transcription attempt
    await sql`
      INSERT INTO huddle_transcription_attempts
        (huddle_id, attempt_number, trigger_type, status, started_at)
      VALUES (${huddleId}, ${nextAttemptNumber}, 'manual', 'pending', NOW())
    `;

    // Flip huddle status back to uploaded
    await sql`
      UPDATE huddle_recordings
      SET
        recording_status = 'uploaded',
        transcript_status = 'pending',
        abandoned_at = NULL,
        abandoned_reason = NULL,
        updated_at = NOW()
      WHERE id = ${huddleId}
    `;

    return NextResponse.json({
      success: true,
      huddle_id: huddleId,
      message: `Huddle recovered from abandoned status. Transcription attempt #${nextAttemptNumber} created.`,
      new_status: 'uploaded',
      new_transcript_status: 'pending',
      attempt_number: nextAttemptNumber,
    });
  } catch (error) {
    console.error('Force process error:', error);
    return NextResponse.json(
      {
        error: 'Force process failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
