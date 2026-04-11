import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

interface ActionTaken {
  type: 'stuck_recording' | 'stuck_upload' | 'stuck_transcription';
  huddle_id: number;
  description: string;
}

export async function POST(req: NextRequest) {
  try {
    // Verify CRON_SECRET
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET not configured' },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header' },
        { status: 401 }
      );
    }

    const providedSecret = authHeader.slice(7); // Remove "Bearer "
    if (providedSecret !== cronSecret) {
      return NextResponse.json(
        { error: 'Invalid CRON_SECRET' },
        { status: 403 }
      );
    }

    let staleRecordings = 0;
    let stuckUploads = 0;
    let stuckTranscriptions = 0;
    const actions: ActionTaken[] = [];

    // A. Find stuck recording → abandoned (no chunks for 6+ hours)
    const stuckRecordingsResult = await sql`
      SELECT id, recording_status, started_at
      FROM huddle_recordings
      WHERE
        recording_status = 'recording'
        AND started_at > NOW() - INTERVAL '7 days'
        AND started_at < NOW() - INTERVAL '6 hours'
        AND deleted_at IS NULL
      ORDER BY id
    `;

    for (const huddle of stuckRecordingsResult.rows) {
      // Verify no chunks exist
      const chunkCount = await sql`
        SELECT COUNT(*) as count
        FROM huddle_audio_chunks
        WHERE huddle_id = ${huddle.id}
      `;

      if (chunkCount.rows[0].count === 0) {
        await sql`
          UPDATE huddle_recordings
          SET
            recording_status = 'abandoned',
            abandoned_at = NOW(),
            abandoned_reason = 'no_chunks_6h',
            updated_at = NOW()
          WHERE id = ${huddle.id}
        `;

        staleRecordings++;
        actions.push({
          type: 'stuck_recording',
          huddle_id: huddle.id,
          description: `Marked as abandoned: no audio chunks in 6+ hours`,
        });
      }
    }

    // B. Find stuck uploaded → re-enqueue transcription (>30 min pending transcript)
    const stuckUploadsResult = await sql`
      SELECT id, recording_status, transcript_status, started_at
      FROM huddle_recordings
      WHERE
        recording_status = 'uploaded'
        AND transcript_status = 'pending'
        AND started_at > NOW() - INTERVAL '7 days'
        AND started_at < NOW() - INTERVAL '30 minutes'
        AND deleted_at IS NULL
      ORDER BY id
    `;

    for (const huddle of stuckUploadsResult.rows) {
      // Count existing attempts
      const attemptCount = await sql`
        SELECT COALESCE(MAX(attempt_number), 0) as max_attempt
        FROM huddle_transcription_attempts
        WHERE huddle_id = ${huddle.id}
      `;

      const nextAttemptNumber = (attemptCount.rows[0].max_attempt || 0) + 1;

      // Insert new transcription attempt
      await sql`
        INSERT INTO huddle_transcription_attempts
          (huddle_id, attempt_number, trigger_type, status, started_at)
        VALUES (${huddle.id}, ${nextAttemptNumber}, 'cron', 'pending', NOW())
      `;

      stuckUploads++;
      actions.push({
        type: 'stuck_upload',
        huddle_id: huddle.id,
        description: `Re-enqueued transcription attempt #${nextAttemptNumber}`,
      });
    }

    // C. Find stuck transcribing → fail and potentially mark abandoned (>30 min in progress)
    const stuckTranscribingResult = await sql`
      SELECT id, recording_status, transcript_status, started_at
      FROM huddle_recordings
      WHERE
        recording_status = 'transcribing'
        AND transcript_status IN ('processing', 'pending')
        AND started_at > NOW() - INTERVAL '7 days'
        AND started_at < NOW() - INTERVAL '30 minutes'
        AND deleted_at IS NULL
      ORDER BY id
    `;

    for (const huddle of stuckTranscribingResult.rows) {
      // Find latest transcription attempt
      const latestAttempt = await sql`
        SELECT id, attempt_number, status
        FROM huddle_transcription_attempts
        WHERE huddle_id = ${huddle.id}
        ORDER BY attempt_number DESC
        LIMIT 1
      `;

      if (latestAttempt.rows.length > 0) {
        const attempt = latestAttempt.rows[0];

        // Only process if the latest attempt is in progress
        if (attempt.status === 'in_progress') {
          // Mark this attempt as failed
          await sql`
            UPDATE huddle_transcription_attempts
            SET
              status = 'failed',
              error_code = 'worker_timeout',
              completed_at = NOW(),
              updated_at = NOW()
            WHERE id = ${attempt.id}
          `;

          // Check attempt count
          const attemptCountResult = await sql`
            SELECT attempt_number
            FROM huddle_transcription_attempts
            WHERE huddle_id = ${huddle.id}
            ORDER BY attempt_number DESC
            LIMIT 1
          `;

          const currentAttemptNumber = attemptCountResult.rows[0].attempt_number;

          let actionDesc = `Marked attempt #${currentAttemptNumber} as failed (worker_timeout)`;

          // If attempt_count >= 3, mark huddle as abandoned
          if (currentAttemptNumber >= 3) {
            await sql`
              UPDATE huddle_recordings
              SET
                recording_status = 'failed',
                abandoned_at = NOW(),
                abandoned_reason = 'transcribe_worker_timeout',
                updated_at = NOW()
              WHERE id = ${huddle.id}
            `;

            actionDesc += `; marked huddle as failed after ${currentAttemptNumber} attempts`;
          }

          stuckTranscriptions++;
          actions.push({
            type: 'stuck_transcription',
            huddle_id: huddle.id,
            description: actionDesc,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      stale_recordings: staleRecordings,
      stuck_uploads: stuckUploads,
      stuck_transcriptions: stuckTranscriptions,
      actions_taken: actions,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Huddle stale check error:', error);
    return NextResponse.json(
      {
        error: 'Stale check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
