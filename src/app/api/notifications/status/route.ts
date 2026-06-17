import { NextResponse } from 'next/server';
import { outboxStatus } from '@/lib/messaging/outbox';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await outboxStatus()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' });
  }
}
