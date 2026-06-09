import { NextResponse } from 'next/server';
import { listBookingsForCC, toCcDto } from '@/lib/surgical-risk/booking-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// GET /api/surgical-risk/booking/list
// The CC desk work queue: all real (non-test) bookings, newest first, each with
// its scheduling flag, latest SREWS risk tier + score, CC workflow status, and
// the patient portal token. Open (no auth) per the module's access decision.
export async function GET() {
  try {
    const rows = await listBookingsForCC();
    return NextResponse.json({ ok: true, bookings: rows.map(toCcDto) });
  } catch (error) {
    console.error('CC queue list error:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to load queue', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}
