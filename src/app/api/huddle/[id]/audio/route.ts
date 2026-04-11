import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const huddleId = parseInt(id, 10);

    if (isNaN(huddleId)) {
      return NextResponse.json({ error: 'Invalid huddle ID' }, { status: 400 });
    }

    // Verify huddle exists and is not deleted
    const huddleResult = await sql`
      SELECT id, recording_status FROM huddle_recordings
      WHERE id = ${huddleId} AND deleted_at IS NULL
      LIMIT 1
    `;

    if (huddleResult.rows.length === 0) {
      return NextResponse.json({ error: 'Huddle not found' }, { status: 404 });
    }

    // Fetch all chunks ordered by chunk_index, then by id as tiebreaker
    const chunksResult = await sql`
      SELECT blob_url, mime_type, size_bytes
      FROM huddle_audio_chunks
      WHERE huddle_id = ${huddleId} AND blob_url IS NOT NULL
      ORDER BY chunk_index ASC, id ASC
    `;

    if (chunksResult.rows.length === 0) {
      // Check if blobs were cleaned up (retention policy)
      const allChunks = await sql`
        SELECT COUNT(*) as total, COUNT(blob_deleted_at) as deleted
        FROM huddle_audio_chunks
        WHERE huddle_id = ${huddleId}
      `;
      if (allChunks.rows[0].total > 0 && allChunks.rows[0].deleted > 0) {
        return NextResponse.json(
          { error: 'Audio has been removed per retention policy (7-day limit)' },
          { status: 410 }
        );
      }
      return NextResponse.json({ error: 'No audio chunks found' }, { status: 404 });
    }

    const mimeType = chunksResult.rows[0].mime_type || 'audio/webm';

    // Fetch all chunk blobs and concatenate
    const audioBuffers: ArrayBuffer[] = [];
    for (const chunk of chunksResult.rows) {
      const blobRes = await fetch(chunk.blob_url);
      if (!blobRes.ok) {
        console.error(`Failed to fetch chunk: ${chunk.blob_url}`);
        continue;
      }
      audioBuffers.push(await blobRes.arrayBuffer());
    }

    if (audioBuffers.length === 0) {
      return NextResponse.json({ error: 'Failed to fetch audio data' }, { status: 500 });
    }

    // Concatenate all buffers
    const totalSize = audioBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    const combined = new Uint8Array(totalSize);
    let offset = 0;
    for (const buf of audioBuffers) {
      combined.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }

    // Return as streaming audio
    return new NextResponse(combined, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(totalSize),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Audio stream error:', error);
    return NextResponse.json(
      {
        error: 'Failed to stream audio',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
