import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { listRecipients, updateRecipient, setRecipientVerified } from '@/lib/messaging/recipients';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ ok: true, recipients: await listRecipients() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed', recipients: [] });
  }
}

// Admin write (enter/verify numbers). Bearer-gated (service/cron secret) until
// the MSG.5 console ships its own server-side path.
export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { id?: number; whatsapp_e164?: string; email?: string; name?: string; active?: boolean; channel_pref?: string; verified?: boolean } | null = null;
  try { body = await req.json(); } catch { /* ignore */ }
  if (!body || typeof body.id !== 'number') {
    return NextResponse.json({ error: 'numeric id required' }, { status: 400 });
  }
  try {
    if (body.verified !== undefined) await setRecipientVerified(body.id, !!body.verified);
    const recipient = await updateRecipient(body.id, {
      whatsapp_e164: body.whatsapp_e164, email: body.email, name: body.name,
      active: body.active, channel_pref: body.channel_pref,
    });
    return NextResponse.json({ ok: true, recipient });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
