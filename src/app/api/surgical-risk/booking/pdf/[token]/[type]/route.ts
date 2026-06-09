import { NextResponse } from 'next/server';
import { getBookingByToken } from '@/lib/surgical-risk/booking-db';
import { renderBookingPdf, DOC_TYPES, DOC_LABEL, type DocType } from '@/lib/surgical-risk/pdf/render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// GET /api/surgical-risk/booking/pdf/<portal_token>/<fc|info|adm>
// Public (open token, per Decision 3). Renders the requested document on demand
// from the booking row and streams it as a PDF. 404 if the token is unknown,
// 403 if the booking link has been revoked by staff.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string; type: string }> },
) {
  const { token, type } = await params;

  if (!DOC_TYPES.includes(type as DocType)) {
    return NextResponse.json({ error: 'Invalid document type' }, { status: 400 });
  }

  const booking = await getBookingByToken(token);
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (booking.revoked) return NextResponse.json({ error: 'This link has been revoked' }, { status: 403 });

  const buffer = await renderBookingPdf(type as DocType, booking);
  const uhid = (booking.uhid || 'patient').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `EHRC-${DOC_LABEL[type as DocType]}-${uhid}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
