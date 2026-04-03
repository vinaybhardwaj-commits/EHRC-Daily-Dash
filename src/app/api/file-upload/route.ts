import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// File upload route using Vercel Blob
// Requires BLOB_READ_WRITE_TOKEN in env
// Falls back to a stub if @vercel/blob is not installed yet

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const fieldId = formData.get('fieldId') as string || 'unknown';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 400 });
    }

    // Build storage path: form-uploads/{fieldId}/{date}/{filename}
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const pathname = `form-uploads/${fieldId}/${dateStr}/${file.name}`;

    // Try Vercel Blob upload
    try {
      const { put } = await import('@vercel/blob');
      const blob = await put(pathname, file, { access: 'public' });

      return NextResponse.json({
        url: blob.url,
        pathname: blob.pathname,
        size: file.size,
        name: file.name,
      });
    } catch (blobError) {
      // If @vercel/blob is not available or BLOB_READ_WRITE_TOKEN is missing,
      // return a placeholder response so the UI still works during development
      console.warn('Vercel Blob upload failed (expected in dev):', blobError);
      return NextResponse.json({
        url: `/_placeholder/${pathname}`,
        pathname,
        size: file.size,
        name: file.name,
        _dev: true,
      });
    }
  } catch (error) {
    console.error('File upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
