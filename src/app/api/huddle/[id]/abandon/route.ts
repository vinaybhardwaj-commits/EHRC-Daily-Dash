import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

interface AbandonBody {
  reason?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auth removed — internal tool. Will be restored in Phase 2.

    const body: AbandonBody = await req.json().catch(() => ({}));
    const reason = body.reason || 'Abandoned by recorder';

    // Soft-delete the huddle: set deleted_at, abandoned_at, abandoned_reason, and update status
    const result = await sql`
      UPDATE huddle_recordings
      SET
        recording_status = 'abandoned',
        abandoned_at = NOW(),
        abandoned_reason = ${reason},
        deleted_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING id
    `;

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Huddle not found or already deleted' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      huddle_id: id,
    });
  } catch (error) {
    console.error('Huddle abandon error:', error);
    return NextResponse.json(
      {
        error: 'Failed to abandon huddle',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
