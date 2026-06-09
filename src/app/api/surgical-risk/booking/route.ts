import { NextResponse } from 'next/server';
import { insertBooking } from '@/lib/surgical-risk/booking-db';
import type { BookingFormData } from '@/lib/surgical-risk/booking-types';

export const dynamic = 'force-dynamic';

// POST /api/surgical-risk/booking
// Body: BookingFormData (JSON). Persists the booking, computes the scheduling
// flag, and returns { id, portal_token, flag }. The table self-creates on first
// call (see booking-db.ensureBookingSchema) — no migration step required.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Partial<BookingFormData> | null;

    if (!body || !body.patient_name?.toString().trim() || !body.uhid?.toString().trim()) {
      return NextResponse.json(
        { error: 'patient_name and uhid are required' },
        { status: 400 },
      );
    }

    const result = await insertBooking(body as BookingFormData);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('surgery booking POST error:', error);
    return NextResponse.json(
      { error: 'Failed to save booking', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}
