import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { put } from '@vercel/blob';
import { identifySpeakers } from '@/lib/huddle/speaker-identifier';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes — large MP3s + Deepgram

/**
 * POST /api/huddle/upload-audio
 *
 * Upload a raw MP3 file for a given date. Creates a huddle record,
 * stores the file in Vercel Blob, transcribes via Deepgram, and
 * auto-identifies speakers.
 *
 * FormData fields:
 *   - audio: File (MP3/M4A/WAV)
 *   - date: string (YYYY-MM-DD)
 *   - key: string (admin key for auth)
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;
    const dateStr = formData.get('date') as string | null;
    const adminKey = formData.get('key') as string | null;

    // --- Validate auth ---
    const expectedKey = process.env.ADMIN_KEY || process.env.BACKUP_SECRET || '';
    if (!adminKey || adminKey !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // --- Validate inputs ---
    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: 'Date required in YYYY-MM-DD format' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/wav', 'audio/webm', 'audio/x-m4a'];
    const mimeType = audioFile.type || 'audio/mpeg';
    const fileName = audioFile.name || 'upload.mp3';
    // Be lenient — some browsers report weird MIME types for audio
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const allowedExts = ['mp3', 'mp4', 'm4a', 'wav', 'webm', 'ogg', 'aac'];
    if (!allowedTypes.includes(mimeType) && !allowedExts.includes(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${mimeType} (.${ext}). Accepted: MP3, M4A, WAV, WebM` },
        { status: 400 }
      );
    }

    // File size limit: 200MB
    const maxBytes = 200 * 1024 * 1024;
    if (audioFile.size > maxBytes) {
      return NextResponse.json(
        { error: `File too large (${(audioFile.size / 1024 / 1024).toFixed(1)}MB). Max: 200MB` },
        { status: 400 }
      );
    }

    // --- Check for existing huddle on this date ---
    const existingResult = await sql`
      SELECT id, recording_status, transcript_status
      FROM huddle_recordings
      WHERE date = ${dateStr} AND deleted_at IS NULL
      LIMIT 1
    `;

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      return NextResponse.json(
        {
          error: `A huddle already exists for ${dateStr} (ID: ${existing.id}, status: ${existing.recording_status}/${existing.transcript_status}). Delete it first or use a different date.`,
        },
        { status: 409 }
      );
    }

    // --- Create huddle record ---
    const sessionId = `upload-${dateStr}-${Date.now()}`;
    const huddleResult = await sql`
      INSERT INTO huddle_recordings (
        date, started_at, recording_status, transcript_status,
        recorded_by_user_id, created_at, updated_at
      ) VALUES (
        ${dateStr}, NOW(), 'uploaded', 'pending',
        1, NOW(), NOW()
      )
      RETURNING id
    `;
    const huddleId = huddleResult.rows[0].id;

    // --- Upload to Vercel Blob ---
    const audioBuffer = await audioFile.arrayBuffer();
    const blobPath = `huddle/${huddleId}/upload_${fileName}`;
    const blob = await put(blobPath, audioBuffer, {
      access: 'public',
      contentType: mimeType,
    });

    // --- Insert as single chunk (chunk_index=0) ---
    await sql`
      INSERT INTO huddle_audio_chunks (
        huddle_id, chunk_index, recording_session_id,
        blob_url, mime_type, size_bytes
      ) VALUES (
        ${huddleId}, 0, ${sessionId},
        ${blob.url}, ${mimeType}, ${audioBuffer.byteLength}
      )
    `;

    // --- Transcribe via Deepgram ---
    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramKey) {
      // Still save the huddle, just skip transcription
      return NextResponse.json({
        success: true,
        huddle_id: huddleId,
        date: dateStr,
        blob_url: blob.url,
        size_bytes: audioBuffer.byteLength,
        transcript: null,
        warning: 'Deepgram API key not configured — audio uploaded but not transcribed',
      });
    }

    // Update status
    await sql`
      UPDATE huddle_recordings
      SET recording_status = 'transcribing', transcript_status = 'processing', updated_at = NOW()
      WHERE id = ${huddleId}
    `;

    // Log attempt
    await sql`
      INSERT INTO huddle_transcription_attempts
        (huddle_id, attempt_number, trigger_type, status, started_at)
      VALUES (${huddleId}, 1, 'auto', 'processing', NOW())
    `;

    // Call Deepgram
    const dgUrl = 'https://api.deepgram.com/v1/listen?model=nova-2&diarize=true&punctuate=true&utterances=false&smart_format=true';
    const dgResponse = await fetch(dgUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramKey}`,
        'Content-Type': mimeType,
      },
      body: audioBuffer,
    });

    if (!dgResponse.ok) {
      const dgError = await dgResponse.text();
      console.error('Deepgram API error:', dgError);

      await sql`
        UPDATE huddle_recordings
        SET recording_status = 'uploaded', transcript_status = 'failed', updated_at = NOW()
        WHERE id = ${huddleId}
      `;
      await sql`
        UPDATE huddle_transcription_attempts
        SET status = 'failed', completed_at = NOW(),
            latency_ms = ${Date.now() - startTime},
            error_message = ${dgError.slice(0, 500)}
        WHERE huddle_id = ${huddleId} AND attempt_number = 1
      `;

      return NextResponse.json({
        success: true,
        huddle_id: huddleId,
        date: dateStr,
        blob_url: blob.url,
        size_bytes: audioBuffer.byteLength,
        transcript: null,
        error: `Deepgram failed: ${dgResponse.status}`,
      });
    }

    const dgResult = await dgResponse.json();
    const deepgramRequestId = dgResult.metadata?.request_id || null;

    // Parse words into segments
    interface DgWord {
      word: string;
      start: number;
      end: number;
      confidence: number;
      speaker?: number;
      punctuated_word?: string;
    }

    const words: DgWord[] = dgResult.results?.channels?.[0]?.alternatives?.[0]?.words || [];
    const segments = groupWordsIntoSegments(words);

    // Build plain text
    const plainText = segments
      .map((seg) => `[${fmtTime(seg.start)}] Speaker ${seg.speaker}: ${seg.text}`)
      .join('\n');

    const speakerSet = new Set(segments.map((s) => s.speaker));
    const speakerCount = speakerSet.size;

    // Estimate duration from last word
    const durationSeconds = words.length > 0 ? Math.ceil(words[words.length - 1].end) : 0;

    // Save transcript
    const segJson = JSON.stringify(segments);
    await sql`
      UPDATE huddle_recordings
      SET
        recording_status = 'uploaded',
        transcript_status = 'completed',
        transcript_text = ${plainText},
        transcript_json = ${segJson}::jsonb,
        detected_speaker_count = ${speakerCount},
        duration_seconds = ${durationSeconds},
        updated_at = NOW()
      WHERE id = ${huddleId}
    `;

    const latencyMs = Date.now() - startTime;
    await sql`
      UPDATE huddle_transcription_attempts
      SET
        status = 'success', completed_at = NOW(),
        latency_ms = ${latencyMs},
        input_bytes = ${audioBuffer.byteLength},
        deepgram_request_id = ${deepgramRequestId}
      WHERE huddle_id = ${huddleId} AND attempt_number = 1
    `;

    // --- Auto-identify speakers ---
    let autoIdCount = 0;
    try {
      const contactsResult = await sql`
        SELECT department_slug, department_name, head_name
        FROM department_contacts ORDER BY department_name
      `;
      const contacts = contactsResult.rows.map((r) => ({
        head_name: r.head_name as string,
        department_name: r.department_name as string,
        department_slug: r.department_slug as string,
      }));

      const identifications = identifySpeakers(segments, contacts);
      for (const ident of identifications) {
        try {
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
              display_name = ${ident.display_name},
              department_slug = ${ident.department_slug},
              confidence = ${ident.confidence},
              source = 'auto',
              updated_at = NOW()
          `;
          autoIdCount++;
        } catch {
          // skip individual speaker save failures
        }
      }
    } catch (idErr) {
      console.error('Auto-ID error:', idErr);
    }

    return NextResponse.json({
      success: true,
      huddle_id: huddleId,
      date: dateStr,
      blob_url: blob.url,
      size_bytes: audioBuffer.byteLength,
      duration_seconds: durationSeconds,
      transcript: {
        segments: segments.length,
        speakers: speakerCount,
        plain_text_length: plainText.length,
        auto_identified_speakers: autoIdCount,
      },
      latency_ms: latencyMs,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      {
        error: 'Upload failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ─── Helpers (same as transcribe route) ─────────────────────────────

interface Segment {
  start: number;
  end: number;
  text: string;
  speaker: number;
  speaker_confidence: number;
}

interface Word {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
  punctuated_word?: string;
}

function groupWordsIntoSegments(words: Word[]): Segment[] {
  if (words.length === 0) return [];
  const segments: Segment[] = [];
  let curSpeaker = words[0].speaker ?? 0;
  let segWords: Word[] = [words[0]];

  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    const sp = w.speaker ?? 0;
    if (sp !== curSpeaker) {
      segments.push(buildSeg(segWords, curSpeaker));
      curSpeaker = sp;
      segWords = [w];
    } else {
      segWords.push(w);
    }
  }
  if (segWords.length > 0) segments.push(buildSeg(segWords, curSpeaker));
  return segments;
}

function buildSeg(words: Word[], speaker: number): Segment {
  const text = words.map((w) => w.punctuated_word || w.word).join(' ');
  const avg = words.reduce((s, w) => s + w.confidence, 0) / words.length;
  return {
    start: words[0].start,
    end: words[words.length - 1].end,
    text,
    speaker,
    speaker_confidence: Math.round(avg * 100) / 100,
  };
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
