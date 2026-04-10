import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

interface SpeakerMapping {
  speaker_index: number;
  display_name: string;
  department_slug?: string;
}

interface SpeakerResponse {
  speaker_index: number;
  display_name: string;
  department_slug?: string;
  user_id?: number;
  confidence?: number;
  source?: string;
}

// GET /api/huddle/[id]/speakers
// Fetch existing speaker mappings for a huddle
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify huddle exists
    const huddleResult = await sql`
      SELECT id FROM huddle_recordings
      WHERE id = ${id} AND deleted_at IS NULL
      LIMIT 1
    `;

    if (huddleResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Huddle not found' },
        { status: 404 }
      );
    }

    // Fetch speaker mappings
    const speakersResult = await sql`
      SELECT speaker_index, display_name, department_slug, user_id, confidence, source
      FROM huddle_speakers
      WHERE huddle_id = ${id}
      ORDER BY speaker_index ASC
    `;

    return NextResponse.json({
      speakers: speakersResult.rows as SpeakerResponse[],
    });
  } catch (error) {
    console.error('Speaker fetch error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch speakers',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// POST /api/huddle/[id]/speakers
// Upsert speaker mappings for a huddle
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { mappings } = body;

    if (!Array.isArray(mappings)) {
      return NextResponse.json(
        { error: 'mappings must be an array' },
        { status: 400 }
      );
    }

    // Verify huddle exists
    const huddleResult = await sql`
      SELECT id FROM huddle_recordings
      WHERE id = ${id} AND deleted_at IS NULL
      LIMIT 1
    `;

    if (huddleResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Huddle not found' },
        { status: 404 }
      );
    }

    // Validate mappings
    for (const mapping of mappings) {
      if (
        mapping.speaker_index === undefined ||
        typeof mapping.speaker_index !== 'number' ||
        !mapping.display_name ||
        typeof mapping.display_name !== 'string'
      ) {
        return NextResponse.json(
          { error: 'Each mapping must have speaker_index (number) and display_name (string)' },
          { status: 400 }
        );
      }
    }

    // Upsert mappings
    const results = [];
    for (const mapping of mappings) {
      const result = await sql`
        INSERT INTO huddle_speakers (
          huddle_id,
          speaker_index,
          display_name,
          department_slug,
          confidence,
          source,
          created_at,
          updated_at
        ) VALUES (
          ${id},
          ${mapping.speaker_index},
          ${mapping.display_name},
          ${mapping.department_slug || null},
          1.0,
          'manual',
          NOW(),
          NOW()
        )
        ON CONFLICT (huddle_id, speaker_index)
        DO UPDATE SET
          display_name = ${mapping.display_name},
          department_slug = ${mapping.department_slug || null},
          confidence = 1.0,
          source = 'manual',
          updated_at = NOW()
        RETURNING speaker_index, display_name, department_slug, user_id, confidence, source
      `;
      results.push(result.rows[0]);
    }

    return NextResponse.json({
      speakers: results as SpeakerResponse[],
      message: 'Speaker mappings saved successfully',
    });
  } catch (error) {
    console.error('Speaker save error:', error);
    return NextResponse.json(
      {
        error: 'Failed to save speakers',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
