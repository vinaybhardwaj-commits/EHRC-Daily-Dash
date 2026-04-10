import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

/**
 * GET /api/huddle/[id]/transcript-download
 *
 * Downloads the transcript as a .txt file.
 * Includes speaker names if mapped, timestamps, and metadata header.
 *
 * Query params:
 *   ?format=plain  — raw speaker-indexed text (default)
 *   ?format=named  — uses mapped speaker names where available
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const format = req.nextUrl.searchParams.get('format') || 'named';

    // Fetch huddle
    const huddleResult = await sql`
      SELECT id, date, duration_seconds, transcript_text, transcript_json,
             detected_speaker_count, started_at
      FROM huddle_recordings
      WHERE id = ${id} AND deleted_at IS NULL
      LIMIT 1
    `;

    if (huddleResult.rows.length === 0) {
      return NextResponse.json({ error: 'Huddle not found' }, { status: 404 });
    }

    const huddle = huddleResult.rows[0];

    if (!huddle.transcript_text && !huddle.transcript_json) {
      return NextResponse.json({ error: 'No transcript available' }, { status: 400 });
    }

    // Fetch speaker mappings
    const speakersResult = await sql`
      SELECT speaker_index, display_name, department_slug, confidence, source
      FROM huddle_speakers
      WHERE huddle_id = ${id}
      ORDER BY speaker_index ASC
    `;

    const speakerMap = new Map<number, { name: string; dept: string | null; confidence: number | null; source: string | null }>();
    for (const row of speakersResult.rows) {
      speakerMap.set(row.speaker_index, {
        name: row.display_name,
        dept: row.department_slug,
        confidence: row.confidence,
        source: row.source,
      });
    }

    // Build transcript text
    const dateStr = new Date(huddle.date).toISOString().split('T')[0];
    const durationMins = huddle.duration_seconds ? Math.round(huddle.duration_seconds / 60) : '?';

    let output = '';

    // Header
    output += `EHRC Morning Huddle — ${dateStr}\n`;
    output += `Duration: ${durationMins} minutes | Speakers: ${huddle.detected_speaker_count || '?'}\n`;
    output += `Transcribed by: Deepgram Nova-2\n`;

    // Speaker legend
    if (speakerMap.size > 0) {
      output += `\nSpeaker Map:\n`;
      for (const [idx, info] of speakerMap) {
        const confStr = info.confidence !== null ? ` (${Math.round(info.confidence * 100)}% ${info.source || 'auto'})` : '';
        const deptStr = info.dept ? ` [${info.dept}]` : '';
        output += `  Speaker ${idx} → ${info.name}${deptStr}${confStr}\n`;
      }
    }

    output += `\n${'─'.repeat(60)}\n\n`;

    // Transcript body
    if (format === 'named' && huddle.transcript_json) {
      const segments = huddle.transcript_json as Array<{
        start: number;
        end: number;
        text: string;
        speaker: number;
      }>;

      for (const seg of segments) {
        const time = fmtTime(seg.start);
        const mapped = speakerMap.get(seg.speaker);
        const label = mapped ? mapped.name : `Speaker ${seg.speaker}`;
        output += `[${time}] ${label}: ${seg.text}\n`;
      }
    } else {
      // Plain format — use stored transcript_text
      output += huddle.transcript_text || '';
    }

    // Footer
    output += `\n${'─'.repeat(60)}\n`;
    output += `Generated: ${new Date().toISOString()}\n`;

    // Return as downloadable text file
    const filename = `huddle-${dateStr}.txt`;

    return new NextResponse(output, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Transcript download error:', error);
    return NextResponse.json(
      { error: 'Download failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
