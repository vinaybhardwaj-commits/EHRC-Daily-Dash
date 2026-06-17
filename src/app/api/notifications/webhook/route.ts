import { NextRequest, NextResponse } from 'next/server';
import { applyDeliveryUpdate } from '@/lib/messaging/outbox';

export const dynamic = 'force-dynamic';

function authed(req: NextRequest): boolean {
  const secret = process.env.NOTIFICATIONS_WEBHOOK_SECRET;
  if (!secret) return true; // accept until configured
  const token = new URL(req.url).searchParams.get('token')
    || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return token === secret;
}

function pick(o: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) { const v = o[k]; if (v != null) return String(v); }
  return '';
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: Record<string, unknown> | null = null;
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* ignore */ }
  try {
    const b = body ?? {};
    const data = (b.data && typeof b.data === 'object' ? b.data : b) as Record<string, unknown>;
    const msgId = pick(data, 'msgId', 'id', 'messageId') || pick(b, 'msgId', 'id', 'messageId');
    const raw = (pick(data, 'status') || pick(b, 'status', 'event', 'type')).toLowerCase();
    const status = /read/.test(raw) ? 'read'
      : /deliver/.test(raw) ? 'delivered'
      : /fail|error|undeliver/.test(raw) ? 'failed'
      : (raw || 'update');
    let updated = 0;
    if (msgId && ['read', 'delivered', 'failed'].includes(status)) {
      updated = await applyDeliveryUpdate(msgId, status);
    }
    return NextResponse.json({ ok: true, msgId, status, updated });
  } catch (e) {
    // Never 5xx a webhook — providers retry-storm on errors.
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, webhook: 'notifications', configured: !!process.env.NOTIFICATIONS_WEBHOOK_SECRET });
}
