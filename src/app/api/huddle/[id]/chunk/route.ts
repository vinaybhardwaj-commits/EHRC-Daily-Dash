import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { put } from '@vercel/blob';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Parse multipart/form-data
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;
    const chunkIndex = formData.get('chunk_index') as string;
    const recordingSessionId = formData.get('recording_session_id') as string;
    const mimeType = formData.get('mime_type') as string;

    // Validate inputs
    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    if (!chunkIndex || !recordingSessionId || !mimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: chunk_index, recording_session_id, mime_type' },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const audioBuffer = await audioFile.arrayBuffer();

    // Upload to Vercel Blob
    const blobPath = `huddle/${id}/chunk_${chunkIndex}`;
    const blob = await put(blobPath, audioBuffer, {
      access: 'public',
      contentType: mimeType,
    });

    // Insert into huddle_audio_chunks
    const result = await sql`
      INSERT INTO huddle_audio_chunks (
        huddle_id,
        chunk_index,
        recording_session_id,
        blob_url,
        mime_type,
        size_bytes
      )
      VALUES (
        ${id},
        ${parseInt(chunkIndex, 10)},
        ${recordingSessionId},
        ${blob.url},
        ${mimeType},
        ${audioBuffer.byteLength}
      )
      RETURNING id, blob_url
    `;

    const chunk = result.rows[0];

    return NextResponse.json({
      success: true,
      chunk_id: chunk.id,
      blob_url: chunk.blob_url,
    });
  } catch (error) {
    console.error('Huddle chunk upload error:', error);
    return NextResponse.json(
      {
        error: 'Failed to upload audio chunk',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
