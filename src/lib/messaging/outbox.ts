import { sql } from '@vercel/postgres';
import { sendWhatsApp } from '@/lib/whatsapp';

const SEND_SPACING_MS = Number(process.env.MSG_SEND_SPACING_MS || 1200);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export interface EnqueueArgs {
  event_type: string;
  recipient_id?: number | null;
  dept_slug?: string | null;
  channel?: string;
  to_address: string;
  rendered_body: string;
  dedup_key: string;
  scheduled_for?: Date | string | null;
}

/** Insert one message. Idempotent on dedup_key. Returns true if newly enqueued. */
export async function enqueue(a: EnqueueArgs): Promise<boolean> {
  const when = a.scheduled_for ? new Date(a.scheduled_for).toISOString() : new Date().toISOString();
  const r = await sql`
    INSERT INTO notification_outbox
      (event_type, recipient_id, dept_slug, channel, to_address, rendered_body, dedup_key, scheduled_for)
    VALUES (${a.event_type}, ${a.recipient_id ?? null}, ${a.dept_slug ?? null},
            ${a.channel ?? 'whatsapp'}, ${a.to_address}, ${a.rendered_body}, ${a.dedup_key}, ${when})
    ON CONFLICT (dedup_key) DO NOTHING
    RETURNING id
  `;
  return (r.rowCount ?? 0) > 0;
}

export interface DrainResult { claimed: number; sent: number; failed: number; retried: number; }

interface ClaimRow {
  id: number; event_type: string; recipient_id: number | null;
  channel: string; to_address: string; rendered_body: string;
  attempts: number; max_attempts: number;
}

/** Claim due pending rows atomically (safe under concurrent drains) and send them. */
export async function drainOutbox(limit = 20): Promise<DrainResult> {
  const claimed = await sql`
    UPDATE notification_outbox o SET status = 'sending', claimed_at = NOW()
    WHERE o.id IN (
      SELECT id FROM notification_outbox
      WHERE status = 'pending' AND scheduled_for <= NOW()
      ORDER BY scheduled_for ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING o.id, o.event_type, o.recipient_id, o.channel, o.to_address, o.rendered_body, o.attempts, o.max_attempts
  `;
  const rows = claimed.rows as unknown as ClaimRow[];
  const res: DrainResult = { claimed: rows.length, sent: 0, failed: 0, retried: 0 };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let ok = false, err = '';
    let providerId: string | undefined;
    try {
      if (row.channel === 'whatsapp') {
        const r = await sendWhatsApp(row.to_address, row.rendered_body);
        ok = r.success; err = r.error || ''; providerId = r.sid;
      } else {
        err = `unsupported channel: ${row.channel}`;
      }
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }

    if (ok) {
      await sql`UPDATE notification_outbox
                SET status='sent', sent_at=NOW(), provider_msg_id=${providerId ?? null},
                    attempts=attempts+1, last_error=NULL
                WHERE id=${row.id}`;
      await sql`INSERT INTO notification_log (outbox_id, recipient_id, event_type, channel, status, provider_msg_id)
                VALUES (${row.id}, ${row.recipient_id}, ${row.event_type}, ${row.channel}, 'sent', ${providerId ?? null})`;
      res.sent++;
    } else {
      const attempts = row.attempts + 1;
      const dead = attempts >= row.max_attempts;
      await sql`UPDATE notification_outbox
                SET status=${dead ? 'failed' : 'pending'}, attempts=${attempts},
                    last_error=${err.slice(0, 500)}, claimed_at=NULL
                WHERE id=${row.id}`;
      await sql`INSERT INTO notification_log (outbox_id, recipient_id, event_type, channel, status, detail)
                VALUES (${row.id}, ${row.recipient_id}, ${row.event_type}, ${row.channel}, ${dead ? 'failed' : 'retry'}, ${err.slice(0, 500)})`;
      if (dead) res.failed++; else res.retried++;
    }
    if (i < rows.length - 1) await sleep(SEND_SPACING_MS);
  }
  return res;
}

/** Mark delivery/read status from a provider webhook. */
export async function applyDeliveryUpdate(providerMsgId: string, status: string): Promise<number> {
  const r = await sql`
    UPDATE notification_outbox SET status=${status}
    WHERE provider_msg_id=${providerMsgId} AND status IN ('sent','delivered')
  `;
  await sql`INSERT INTO notification_log (outbox_id, recipient_id, event_type, channel, status, provider_msg_id, detail)
            SELECT id, recipient_id, event_type, channel, ${status}, ${providerMsgId}, 'webhook'
            FROM notification_outbox WHERE provider_msg_id=${providerMsgId} LIMIT 1`;
  return r.rowCount ?? 0;
}

export async function outboxStatus() {
  const counts = await sql`SELECT status, count(*)::int AS n FROM notification_outbox GROUP BY status ORDER BY status`;
  const recent = await sql`SELECT event_type, channel, status, provider_msg_id, detail, at
                           FROM notification_log ORDER BY at DESC LIMIT 10`;
  return { byStatus: counts.rows, recentLog: recent.rows };
}
