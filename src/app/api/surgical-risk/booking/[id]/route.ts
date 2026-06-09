import { NextResponse } from 'next/server';
import {
  updateBookingCcStatus,
  setBookingRevoked,
  isUuid,
  CC_STATUSES,
  type CcStatus,
} from '@/lib/surgical-risk/booking-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// PATCH /api/surgical-risk/booking/<id>
// CC desk mutations (open per the module's access decision):
//   { action: 'status', status: 'New'|'Counselled'|'Admitted'|'Cancelled', actor? }
//   { action: 'revoke', revoked: boolean, actor? }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ ok: false, error: 'Invalid booking id' }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as
    | { action?: string; status?: string; revoked?: boolean; actor?: string }
    | null;
  if (!body || !body.action) {
    return NextResponse.json({ ok: false, error: 'Missing action' }, { status: 400 });
  }

  const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim().slice(0, 120) : null;

  if (body.action === 'status') {
    if (!body.status || !CC_STATUSES.includes(body.status as CcStatus)) {
      return NextResponse.json(
        { ok: false, error: `status must be one of: ${CC_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }
    const ok = await updateBookingCcStatus(id, body.status, actor);
    return ok
      ? NextResponse.json({ ok: true, id, cc_status: body.status })
      : NextResponse.json({ ok: false, error: 'Booking not found' }, { status: 404 });
  }

  if (body.action === 'revoke') {
    const revoked = body.revoked === true;
    const ok = await setBookingRevoked(id, revoked, actor);
    return ok
      ? NextResponse.json({ ok: true, id, revoked })
      : NextResponse.json({ ok: false, error: 'Booking not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
}
