import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const dynamic = 'force-dynamic';

// POST /api/surgical-risk/booking/upload  (multipart/form-data, field "file")
// Stores the prescription in Vercel Blob and returns { url }.
// Uses BLOB_READ_WRITE_TOKEN (already configured for this app).
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 15 MB)' }, { status: 400 });
    }

    const safeName = (file.name || 'prescription').replace(/[^a-zA-Z0-9._-]/g, '_');
    const blob = await put(`surgery-booking/prescriptions/${safeName}`, file, {
      access: 'public',
      addRandomSuffix: true,
    });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error('prescription upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}
