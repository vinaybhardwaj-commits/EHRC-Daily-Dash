import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { del } from '@vercel/blob';

export const dynamic = 'force-dynamic';

interface CleanupError {
  huddle_id: number;
  blob_url: string;
  error: string;
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

    let huddlesProcessed = 0;
    let chunksClean = 0;
    const errors: CleanupError[] = [];

    // Find huddles ≥7 days old with completed transcript OR failed/abandoned recording
    const huddlesToClean = await sql`
      SELECT id, recording_status, transcript_status, created_at
      FROM huddle_recordings
      WHERE
        created_at < NOW() - INTERVAL '7 days'
        AND (
          transcript_status = 'completed'
          OR recording_status IN ('failed', 'abandoned')
        )
        AND deleted_at IS NULL
      ORDER BY id
    `;

    for (const huddle of huddlesToClean.rows) {
      const huddleId = huddle.id;
      let huddleProcessed = false;

      // Fetch all audio chunks for this huddle with non-null blob_url
      const chunks = await sql`
        SELECT id, blob_url
        FROM huddle_audio_chunks
        WHERE huddle_id = ${huddleId} AND blob_url IS NOT NULL
        ORDER BY id
      `;

      for (const chunk of chunks.rows) {
        try {
          // Delete from Vercel Blob
          await del(chunk.blob_url);

          // Clear the blob_url and set blob_deleted_at
          await sql`
            UPDATE huddle_audio_chunks
            SET
              blob_url = NULL,
              blob_deleted_at = NOW(),
              updated_at = NOW()
            WHERE id = ${chunk.id}
          `;

          chunksClean++;
          huddleProcessed = true;
        } catch (delError) {
          const errorMsg = delError instanceof Error ? delError.message : 'Unknown error';
          errors.push({
            huddle_id: huddleId,
            blob_url: chunk.blob_url,
            error: errorMsg,
          });
          console.error(`Failed to delete blob for huddle ${huddleId}:`, delError);
        }
      }

      // If any chunks were deleted, also clear the huddle_recordings audio_url
      if (huddleProcessed && chunks.rows.length > 0) {
        await sql`
          UPDATE huddle_recordings
          SET audio_url = NULL, updated_at = NOW()
          WHERE id = ${huddleId}
        `;

        huddlesProcessed++;
      }
    }

    return NextResponse.json({
      success: true,
      huddles_processed: huddlesProcessed,
      chunks_cleaned: chunksClean,
      errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Audio cleanup error:', error);
    return NextResponse.json(
      {
        error: 'Audio cleanup failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
