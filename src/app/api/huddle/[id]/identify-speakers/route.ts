import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { identifySpeakers, SpeakerIdentification } from '@/lib/huddle/speaker-identifier';

export const dynamic = 'force-dynamic';

/**
 * POST /api/huddle/[id]/identify-speakers
 *
 * Runs the rule-based speaker identification engine on a transcribed huddle.
 * Saves auto-identified speakers to huddle_speakers (won't overwrite manual mappings).
 * Returns all identifications with confidence scores.
 */
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

    // Fetch huddle with transcript
    const huddleResult = await sql`
      SELECT id, transcript_status, transcript_json, detected_speaker_count
      FROM huddle_recordings
      WHERE id = ${huddleId} AND deleted_at IS NULL
      LIMIT 1
    `;

    if (huddleResult.rows.length === 0) {
      return NextResponse.json({ error: 'Huddle not found' }, { status: 404 });
    }

    const huddle = huddleResult.rows[0];

    if (huddle.transcript_status !== 'completed' || !huddle.transcript_json) {
      return NextResponse.json(
        { error: 'Huddle must be transcribed before speaker identification' },
        { status: 400 }
      );
    }

    // Fetch department contacts
    const contactsResult = await sql`
      SELECT department_slug, department_name, head_name
      FROM department_contacts
      ORDER BY department_name
    `;

    const contacts = contactsResult.rows.map((r) => ({
      head_name: r.head_name as string,
      department_name: r.department_name as string,
      department_slug: r.department_slug as string,
    }));

    // Run identification engine
    const segments = huddle.transcript_json as any[];
    const identifications = identifySpeakers(segments, contacts);

    // Check for existing manual mappings (don't overwrite)
    const existingResult = await sql`
      SELECT speaker_index, source
      FROM huddle_speakers
      WHERE huddle_id = ${huddleId}
    `;

    const manualIndices = new Set(
      existingResult.rows
        .filter((r) => r.source === 'manual')
        .map((r) => r.speaker_index)
    );

    // Save auto-identifications (skip manually mapped speakers)
    const saved: SpeakerIdentification[] = [];
    const skipped: number[] = [];

    for (const ident of identifications) {
      if (manualIndices.has(ident.speaker_index)) {
        skipped.push(ident.speaker_index);
        continue;
      }

      await sql`
        INSERT INTO huddle_speakers (
          huddle_id, speaker_index, display_name, department_slug,
          confidence, source, created_at, updated_at
        ) VALUES (
          ${huddleId}, ${ident.speaker_index}, ${ident.display_name},
          ${ident.department_slug}, ${ident.confidence}, 'auto',
          NOW(), NOW()
        )
        ON CONFLICT (huddle_id, speaker_index)
        DO UPDATE SET
          display_name = CASE
            WHEN huddle_speakers.source = 'manual' THEN huddle_speakers.display_name
            ELSE ${ident.display_name}
          END,
          department_slug = CASE
            WHEN huddle_speakers.source = 'manual' THEN huddle_speakers.department_slug
            ELSE ${ident.department_slug}
          END,
          confidence = CASE
            WHEN huddle_speakers.source = 'manual' THEN huddle_speakers.confidence
            ELSE ${ident.confidence}
          END,
          source = CASE
            WHEN huddle_speakers.source = 'manual' THEN 'manual'
            ELSE 'auto'
          END,
          updated_at = NOW()
      `;

      saved.push(ident);
    }

    return NextResponse.json({
      success: true,
      huddle_id: huddleId,
      identifications: identifications.map((i) => ({
        speaker_index: i.speaker_index,
        display_name: i.display_name,
        department_slug: i.department_slug,
        confidence: i.confidence,
        match_reasons: i.match_reasons,
      })),
      saved_count: saved.length,
      skipped_manual: skipped,
      total_speakers: huddle.detected_speaker_count || 0,
    });
  } catch (error) {
    console.error('Speaker identification error:', error);
    return NextResponse.json(
      {
        error: 'Speaker identification failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
