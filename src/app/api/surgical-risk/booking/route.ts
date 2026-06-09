import { NextResponse, after } from 'next/server';
import { insertBooking } from '@/lib/surgical-risk/booking-db';
import type { BookingFormData } from '@/lib/surgical-risk/booking-types';
import { buildAssessPayload, runSrewsAssessment } from '@/lib/surgical-risk/srews-bridge';
import { notifyBooking } from '@/lib/surgical-risk/notify-booking';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // covers the post-response SREWS LLM call in after()

// POST /api/surgical-risk/booking
// Persists the booking + computes the scheduling flag (returned immediately),
// then AFTER the response: runs the SREWS risk assessment in-process and emails
// the marketing/IPD team. Both post-response steps are best-effort — a failure
// there never affects the saved booking or the form's success response.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Partial<BookingFormData> | null;

    if (!body || !body.patient_name?.toString().trim() || !body.uhid?.toString().trim()) {
      return NextResponse.json({ error: 'patient_name and uhid are required' }, { status: 400 });
    }

    const d = body as BookingFormData;
    const result = await insertBooking(d);

    const origin = new URL(request.url).origin;
    const createdAtIso = new Date().toISOString();

    after(async () => {
      let tier: string | undefined;
      if (!d.is_test) {
        const payload = buildAssessPayload(d, result.id, createdAtIso, result.flag);
        const assess = await runSrewsAssessment(origin, payload);
        tier = assess.tier;
      }
      await notifyBooking(d, result.flag, tier);
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('surgery booking POST error:', error);
    return NextResponse.json(
      { error: 'Failed to save booking', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}
