import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Allow up to 2 minutes for transcription

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
  punctuated_word?: string;
}

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker: number;
  speaker_confidence: number;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();

  try {
    const { id } = await params;
    const huddleId = parseInt(id, 10);

    if (isNaN(huddleId)) {
      return NextResponse.json({ error: 'Invalid huddle ID' }, { status: 400 });
    }

    // Check admin key for manual triggers
    const key = req.headers.get('x-admin-key') || req.nextUrl.searchParams.get('key') || '';
    const triggerType = req.headers.get('x-trigger-type') || 'manual';

    // Verify Deepgram API key exists
    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramKey) {
      return NextResponse.json({ error: 'Deepgram API key not configured' }, { status: 500 });
    }

    // Fetch huddle and verify it's ready for transcription
    const huddleResult = await sql`
      SELECT id, recording_status, transcript_status
      FROM huddle_recordings
      WHERE id = ${huddleId} AND deleted_at IS NULL
      LIMIT 1
    `;

    if (huddleResult.rows.length === 0) {
      return NextResponse.json({ error: 'Huddle not found' }, { status: 404 });
    }

    const huddle = huddleResult.rows[0];

    if (huddle.recording_status !== 'uploaded' && huddle.recording_status !== 'transcribing') {
      return NextResponse.json(
        { error: `Huddle is in "${huddle.recording_status}" status. Must be "uploaded" to transcribe.` },
        { status: 400 }
      );
    }

    // Count previous attempts
    const attemptCountResult = await sql`
      SELECT COALESCE(MAX(attempt_number), 0) as max_attempt
      FROM huddle_transcription_attempts
      WHERE huddle_id = ${huddleId}
    `;
    const attemptNumber = attemptCountResult.rows[0].max_attempt + 1;

    // Log this attempt
    await sql`
      INSERT INTO huddle_transcription_attempts
        (huddle_id, attempt_number, trigger_type, status, started_at)
      VALUES (${huddleId}, ${attemptNumber}, ${triggerType}, 'processing', NOW())
    `;

    // Update huddle status
    await sql`
      UPDATE huddle_recordings
      SET recording_status = 'transcribing', transcript_status = 'processing', updated_at = NOW()
      WHERE id = ${huddleId}
    `;

    // Fetch all audio chunks
    const chunksResult = await sql`
      SELECT blob_url, mime_type, size_bytes
      FROM huddle_audio_chunks
      WHERE huddle_id = ${huddleId} AND blob_url IS NOT NULL
      ORDER BY chunk_index ASC, id ASC
    `;

    if (chunksResult.rows.length === 0) {
      await logAttemptFailure(huddleId, attemptNumber, 'No audio chunks found', startTime);
      await sql`
        UPDATE huddle_recordings
        SET recording_status = 'uploaded', transcript_status = 'failed', updated_at = NOW()
        WHERE id = ${huddleId}
      `;
      return NextResponse.json({ error: 'No audio chunks found' }, { status: 400 });
    }

    // Concatenate audio chunks
    const audioBuffers: ArrayBuffer[] = [];
    let totalInputBytes = 0;
    for (const chunk of chunksResult.rows) {
      const blobRes = await fetch(chunk.blob_url);
      if (!blobRes.ok) {
        console.error(`Failed to fetch chunk: ${chunk.blob_url}`);
        continue;
      }
      const buf = await blobRes.arrayBuffer();
      audioBuffers.push(buf);
      totalInputBytes += buf.byteLength;
    }

    if (audioBuffers.length === 0) {
      await logAttemptFailure(huddleId, attemptNumber, 'Failed to fetch any audio chunks', startTime);
      return NextResponse.json({ error: 'Failed to fetch audio data' }, { status: 500 });
    }

    // Combine buffers
    const combined = new Uint8Array(totalInputBytes);
    let offset = 0;
    for (const buf of audioBuffers) {
      combined.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }

    const mimeType = chunksResult.rows[0].mime_type || 'audio/webm';

    // Call Deepgram API
    const deepgramUrl = 'https://api.deepgram.com/v1/listen?model=nova-2&diarize=true&punctuate=true&utterances=false&smart_format=true';

    const dgResponse = await fetch(deepgramUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramKey}`,
        'Content-Type': mimeType,
      },
      body: combined,
    });

    if (!dgResponse.ok) {
      const dgError = await dgResponse.text();
      console.error('Deepgram API error:', dgError);
      await logAttemptFailure(huddleId, attemptNumber, `Deepgram API error: ${dgResponse.status} - ${dgError.slice(0, 200)}`, startTime);
      await sql`
        UPDATE huddle_recordings
        SET recording_status = 'uploaded', transcript_status = 'failed', updated_at = NOW()
        WHERE id = ${huddleId}
      `;
      return NextResponse.json(
        { error: 'Deepgram transcription failed', details: dgError.slice(0, 200) },
        { status: 502 }
      );
    }

    const dgResult = await dgResponse.json();

    // Extract the Deepgram request ID
    const deepgramRequestId = dgResult.metadata?.request_id || null;

    // Parse words into speaker-grouped segments
    const words: DeepgramWord[] = dgResult.results?.channels?.[0]?.alternatives?.[0]?.words || [];
    const segments = groupWordsIntoSegments(words);

    // Build plain text transcript
    const plainText = segments
      .map((seg) => `[${formatTimestamp(seg.start)}] Speaker ${seg.speaker}: ${seg.text}`)
      .join('\n');

    // Count unique speakers
    const speakerSet = new Set(segments.map((s) => s.speaker));
    const detectedSpeakerCount = speakerSet.size;

    // Update huddle with transcript
    const segmentsJson = JSON.stringify(segments);
    await sql`
      UPDATE huddle_recordings
      SET
        recording_status = 'uploaded',
        transcript_status = 'completed',
        transcript_text = ${plainText},
        transcript_json = ${segmentsJson}::jsonb,
        detected_speaker_count = ${detectedSpeakerCount},
        updated_at = NOW()
      WHERE id = ${huddleId}
    `;

    // Log successful attempt
    const latencyMs = Date.now() - startTime;
    await sql`
      UPDATE huddle_transcription_attempts
      SET
        status = 'success',
        completed_at = NOW(),
        latency_ms = ${latencyMs},
        input_bytes = ${totalInputBytes},
        deepgram_request_id = ${deepgramRequestId}
      WHERE huddle_id = ${huddleId} AND attempt_number = ${attemptNumber}
    `;

    return NextResponse.json({
      success: true,
      huddle_id: huddleId,
      segments: segments.length,
      speakers: detectedSpeakerCount,
      latency_ms: latencyMs,
      plain_text_length: plainText.length,
    });
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      {
        error: 'Transcription failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Group Deepgram words into speaker segments (consecutive words from same speaker)
function groupWordsIntoSegments(words: DeepgramWord[]): TranscriptSegment[] {
  if (words.length === 0) return [];

  const segments: TranscriptSegment[] = [];
  let currentSpeaker = words[0].speaker ?? 0;
  let segmentWords: DeepgramWord[] = [words[0]];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const speaker = word.speaker ?? 0;

    if (speaker !== currentSpeaker) {
      // Flush current segment
      segments.push(buildSegment(segmentWords, currentSpeaker));
      currentSpeaker = speaker;
      segmentWords = [word];
    } else {
      segmentWords.push(word);
    }
  }

  // Flush final segment
  if (segmentWords.length > 0) {
    segments.push(buildSegment(segmentWords, currentSpeaker));
  }

  return segments;
}

function buildSegment(words: DeepgramWord[], speaker: number): TranscriptSegment {
  const text = words.map((w) => w.punctuated_word || w.word).join(' ');
  const avgConfidence = words.reduce((sum, w) => sum + w.confidence, 0) / words.length;

  return {
    start: words[0].start,
    end: words[words.length - 1].end,
    text,
    speaker,
    speaker_confidence: Math.round(avgConfidence * 100) / 100,
  };
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

async function logAttemptFailure(
  huddleId: number,
  attemptNumber: number,
  errorMessage: string,
  startTime: number
) {
  const latencyMs = Date.now() - startTime;
  try {
    await sql`
      UPDATE huddle_transcription_attempts
      SET
        status = 'failed',
        completed_at = NOW(),
        latency_ms = ${latencyMs},
        error_message = ${errorMessage.slice(0, 500)}
      WHERE huddle_id = ${huddleId} AND attempt_number = ${attemptNumber}
    `;

    // Revert huddle status on failure
    await sql`
      UPDATE huddle_recordings
      SET recording_status = 'uploaded', transcript_status = 'failed', updated_at = NOW()
      WHERE id = ${huddleId}
    `;
  } catch (err) {
    console.error('Failed to log attempt failure:', err);
  }
}
