import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

interface FinalizeBody {
  duration_seconds?: number;
  compute_from_server?: boolean;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const huddleId = parseInt(id, 10);

    if (isNaN(huddleId)) {
      return NextResponse.json(
        { error: 'Invalid huddle ID' },
        { status: 400 }
      );
    }

    const body: FinalizeBody = await req.json();

    let durationSeconds = body.duration_seconds;

    // If compute_from_server is true OR duration is 0/missing, compute from started_at
    if (body.compute_from_server || !durationSeconds) {
      const huddleResult = await sql`
        SELECT started_at FROM huddle_recordings
        WHERE id = ${huddleId} AND deleted_at IS NULL
        LIMIT 1
      `;

      if (huddleResult.rows.length > 0 && huddleResult.rows[0].started_at) {
        const startedAt = new Date(huddleResult.rows[0].started_at).getTime();
        const now = Date.now();
        durationSeconds = Math.floor((now - startedAt) / 1000);
      } else {
        durationSeconds = durationSeconds || 0;
      }
    }

    // Build audio URL in JS to avoid SQL parameter type ambiguity
    const audioUrl = `/api/huddle/${huddleId}/audio`;

    // Update huddle_recordings: mark as uploaded and set duration
    // Accept huddles in 'recording' status (normal end or crash recovery)
    const result = await sql`
      UPDATE huddle_recordings
      SET
        recording_status = 'uploaded',
        ended_at = NOW(),
        duration_seconds = ${durationSeconds},
        audio_url = ${audioUrl}
      WHERE id = ${huddleId} AND recording_status = 'recording' AND deleted_at IS NULL
      RETURNING id, duration_seconds
    `;

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Huddle not found or not in recording status' },
        { status: 404 }
      );
    }

    // Fire-and-forget: trigger transcription asynchronously
    // Use the full URL so this works on Vercel (can't use relative URLs in server-side fetch)
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_BASE_URL || 'https://ehrc-daily-dash.vercel.app';

    fetch(`${baseUrl}/api/huddle/${huddleId}/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-trigger-type': 'auto-finalize',
      },
    }).catch((err) => {
      console.error('Auto-transcription trigger failed (will retry):', err);
    });

    return NextResponse.json({
      success: true,
      huddle_id: huddleId,
      duration_seconds: result.rows[0].duration_seconds,
    });
  } catch (error) {
    console.error('Huddle finalize error:', error);
    return NextResponse.json(
      {
        error: 'Failed to finalize huddle',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
