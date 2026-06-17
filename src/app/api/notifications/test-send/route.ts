import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { enqueue, drainOutbox } from '@/lib/messaging/outbox';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** POST — enqueue one test message to the verified admin recipient and drain it.
 *  Proves the full queue -> drain -> WaSender -> log pipeline. Bearer-gated. */
export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const admin = await sql`
      SELECT id, whatsapp_e164 FROM notification_recipients
      WHERE role='admin' AND verified=true AND whatsapp_e164 <> '' ORDER BY id LIMIT 1`;
    const row = admin.rows[0];
    if (!row) return NextResponse.json({ ok: false, error: 'no verified admin recipient' }, { status: 400 });
    const enqueued = await enqueue({
      event_type: 'test',
      recipient_id: row.id as number,
      channel: 'whatsapp',
      to_address: row.whatsapp_e164 as string,
      rendered_body: `EHRC notifications engine — outbox pipeline test (${new Date().toISOString()})`,
      dedup_key: `test|${Date.now()}`,
    });
    const drain = await drainOutbox(5);
    return NextResponse.json({ ok: true, enqueued, drain });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
