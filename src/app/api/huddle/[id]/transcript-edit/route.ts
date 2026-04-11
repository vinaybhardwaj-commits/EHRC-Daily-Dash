import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/huddle/[id]/transcript-edit
 *
 * Edit a single transcript segment's text. Saves the edit to
 * huddle_transcript_edits for audit trail, then updates the
 * segment in transcript_json and rebuilds transcript_text.
 *
 * Body: { segment_index: number, text: string }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const huddleId = parseInt(id, 10);
    if (isNaN(huddleId)) {
      return NextResponse.json({ error: 'Invalid huddle ID' }, { status: 400 });
    }

    const body = await req.json();
    const { segment_index, text } = body;

    if (segment_index === undefined || typeof segment_index !== 'number') {
      return NextResponse.json({ error: 'segment_index (number) required' }, { status: 400 });
    }
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'text (non-empty string) required' }, { status: 400 });
    }

    // Fetch current transcript
    const huddleResult = await sql`
      SELECT id, transcript_json, transcript_text
      FROM huddle_recordings
      WHERE id = ${huddleId} AND deleted_at IS NULL
      LIMIT 1
    `;

    if (huddleResult.rows.length === 0) {
      return NextResponse.json({ error: 'Huddle not found' }, { status: 404 });
    }

    const huddle = huddleResult.rows[0];
    const segments = huddle.transcript_json as Array<{
      start: number;
      end: number;
      text: string;
      speaker: number;
      speaker_confidence: number;
    }>;

    if (!segments || segment_index < 0 || segment_index >= segments.length) {
      return NextResponse.json(
        { error: `segment_index ${segment_index} out of range (0–${segments ? segments.length - 1 : 0})` },
        { status: 400 }
      );
    }

    const originalText = segments[segment_index].text;
    const trimmedText = text.trim();

    // No change
    if (originalText === trimmedText) {
      return NextResponse.json({ success: true, changed: false });
    }

    // Log the edit (user_id=1 for V — only user right now)
    await sql`
      INSERT INTO huddle_transcript_edits
        (huddle_id, segment_index, original_text, edited_text, edited_by_user_id, edited_at)
      VALUES (${huddleId}, ${segment_index}, ${originalText}, ${trimmedText}, 1, NOW())
    `;

    // Update the segment in JSON
    segments[segment_index].text = trimmedText;
    const updatedJson = JSON.stringify(segments);

    // Rebuild plain text
    const plainText = segments
      .map((seg) => {
        const m = Math.floor(seg.start / 60);
        const s = Math.floor(seg.start % 60);
        const ts = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `[${ts}] Speaker ${seg.speaker}: ${seg.text}`;
      })
      .join('\n');

    // Save updated transcript
    await sql`
      UPDATE huddle_recordings
      SET transcript_json = ${updatedJson}::jsonb,
          transcript_text = ${plainText},
          updated_at = NOW()
      WHERE id = ${huddleId}
    `;

    return NextResponse.json({
      success: true,
      changed: true,
      segment_index,
      original_text: originalText,
      edited_text: trimmedText,
    });
  } catch (error) {
    console.error('Transcript edit error:', error);
    return NextResponse.json(
      { error: 'Edit failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/huddle/[id]/transcript-edit?segment=N
 *
 * Fetch edit history for a specific segment (or all segments if no param).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const segmentParam = req.nextUrl.searchParams.get('segment');

    let result;
    if (segmentParam !== null) {
      const segIndex = parseInt(segmentParam, 10);
      result = await sql`
        SELECT id, segment_index, original_text, edited_text, edited_at
        FROM huddle_transcript_edits
        WHERE huddle_id = ${id} AND segment_index = ${segIndex}
        ORDER BY edited_at DESC
      `;
    } else {
      result = await sql`
        SELECT id, segment_index, original_text, edited_text, edited_at
        FROM huddle_transcript_edits
        WHERE huddle_id = ${id}
        ORDER BY edited_at DESC
        LIMIT 200
      `;
    }

    return NextResponse.json({ edits: result.rows });
  } catch (error) {
    console.error('Edit history error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch edit history', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
