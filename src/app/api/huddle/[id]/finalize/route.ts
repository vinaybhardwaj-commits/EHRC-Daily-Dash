import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

interface FinalizeBody {
  duration_seconds: number;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: FinalizeBody = await req.json();
    const { duration_seconds } = body;

    if (duration_seconds === undefined || duration_seconds === null) {
      return NextResponse.json(
        { error: 'Missing required field: duration_seconds' },
        { status: 400 }
      );
    }

    // Update huddle_recordings: mark as uploaded and set duration
    const result = await sql`
      UPDATE huddle_recordings
      SET
        recording_status = 'uploaded',
        ended_at = NOW(),
        duration_seconds = ${duration_seconds},
        audio_url = '/api/huddle/' || ${id} || '/audio'
      WHERE id = ${id} AND recording_status = 'recording'
      RETURNING id
    `;

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Huddle not found or not in recording status' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      huddle_id: id,
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
