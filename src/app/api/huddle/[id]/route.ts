import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch huddle by ID
    const huddleResult = await sql`
      SELECT * FROM huddle_recordings
      WHERE id = ${id} AND deleted_at IS NULL
      LIMIT 1
    `;

    if (huddleResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Huddle not found' },
        { status: 404 }
      );
    }

    const huddle = huddleResult.rows[0];

    // Fetch chunk count
    const chunkResult = await sql`
      SELECT COUNT(*) as count FROM huddle_audio_chunks
      WHERE huddle_id = ${id}
    `;

    const chunkCount = parseInt(chunkResult.rows[0].count, 10);

    return NextResponse.json({
      huddle: {
        ...huddle,
        chunk_count: chunkCount,
      },
    });
  } catch (error) {
    console.error('Huddle fetch error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch huddle',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
