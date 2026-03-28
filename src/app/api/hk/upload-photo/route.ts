import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { sql } from '@vercel/postgres';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('photo') as File | null;
    const taskId = formData.get('taskId') as string;

    if (!file || !taskId) {
      return NextResponse.json({ error: 'photo and taskId required' }, { status: 400 });
    }

    // Upload to Vercel Blob
    const blob = await put(`hk-photos/task-${taskId}-${Date.now()}.jpg`, file, {
      access: 'public',
      contentType: file.type || 'image/jpeg',
    });

    // Update task with photo URL
    await sql`
      UPDATE hk_shift_tasks SET photo_url = ${blob.url} WHERE id = ${Number(taskId)}
    `;

    return NextResponse.json({ success: true, url: blob.url, taskId: Number(taskId) });
  } catch (error) {
    console.error('Photo upload error:', error);
    // If Blob is not configured, return a helpful message
    const msg = String(error);
    if (msg.includes('BLOB_READ_WRITE_TOKEN')) {
      return NextResponse.json({
        error: 'Photo upload not configured. Set BLOB_READ_WRITE_TOKEN in Vercel env vars.',
        details: msg,
      }, { status: 503 });
    }
    return NextResponse.json({ error: 'Upload failed', details: msg }, { status: 500 });
  }
}
