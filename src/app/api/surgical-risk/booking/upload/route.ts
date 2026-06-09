import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// POST /api/surgical-risk/booking/upload
//
// Token issuer for Vercel Blob CLIENT uploads. The browser uploads the file
// DIRECTLY to Blob storage, which bypasses the ~4.5 MB serverless request-body
// limit that previously caused a 413 "Request Entity Too Large" (and the
// "Unexpected token 'R'" JSON error on the client) for larger prescriptions.
//
// This route now only (a) signs a short-lived, size/type-restricted upload
// token, and (b) receives the completion webhook. It never receives the file
// bytes itself, so there is no body-size ceiling here.
//
// Uses BLOB_READ_WRITE_TOKEN (already configured for this app).
export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/heic',
          'image/heif',
          'application/pdf',
        ],
        maximumSizeInBytes: 15 * 1024 * 1024, // 15 MB cap, enforced at upload time
        addRandomSuffix: true,
      }),
      // The client gets the blob URL directly from upload(); nothing to do here.
      // (In production this webhook fires after the direct upload completes.)
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(json);
  } catch (error) {
    console.error('prescription upload (client) error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 400 },
    );
  }
}
