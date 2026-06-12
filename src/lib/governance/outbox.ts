// src/lib/governance/outbox.ts
// GV.3 — reliable delivery of auto-filed observations to even-elo (EPI).
// Rows are enqueued with a unique dedup_key, attempted inline right after
// the submit, and retried by an hourly cron until sent (max 8 attempts).

import { sql } from '@vercel/postgres';

const ELO_BASE = process.env.EVEN_ELO_BASE_URL || 'https://governance.evenos.app';
const MAX_ATTEMPTS = 8;

export interface ObservationPayload {
  physician_id: string;
  polarity: 'negative' | 'positive';
  category?: string;
  severity?: string;
  commendation_category?: string;
  narrative: string;
  hospital_code?: string;
  context?: Record<string, unknown>;
  dedup_key: string;
}

/** Enqueue one observation. Sent rows are never re-queued; a pending row
 *  with the same dedup_key gets its payload refreshed (resubmission). */
export async function enqueue(p: ObservationPayload): Promise<void> {
  await sql`
    INSERT INTO governance_outbox (payload, dedup_key, status)
    VALUES (${JSON.stringify(p)}::jsonb, ${p.dedup_key}, 'pending')
    ON CONFLICT (dedup_key) DO UPDATE SET
      payload = CASE WHEN governance_outbox.status <> 'sent' THEN EXCLUDED.payload ELSE governance_outbox.payload END,
      status  = CASE WHEN governance_outbox.status <> 'sent' THEN 'pending' ELSE governance_outbox.status END
  `;
}

async function sendOne(id: number, payload: ObservationPayload): Promise<boolean> {
  const secret = process.env.SERVICE_OBSERVATIONS_SECRET;
  if (!secret) return false;
  try {
    const res = await fetch(`${ELO_BASE}/api/service/observations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      await sql`UPDATE governance_outbox SET status='sent', sent_at=now(), last_error=${JSON.stringify({ incident_id: data.incident_id })} WHERE id=${id}`;
      return true;
    }
    await sql`UPDATE governance_outbox SET status='failed', attempts=attempts+1, last_error=${String(data.error || res.status).slice(0, 300)} WHERE id=${id}`;
    return false;
  } catch (e) {
    await sql`UPDATE governance_outbox SET status='failed', attempts=attempts+1, last_error=${(e instanceof Error ? e.message : 'fetch failed').slice(0, 300)} WHERE id=${id}`;
    return false;
  }
}

/** Attempt delivery of up to `limit` pending/failed rows. */
export async function drainOutbox(limit = 10): Promise<{ sent: number; failed: number }> {
  const rows = await sql`
    SELECT id, payload FROM governance_outbox
    WHERE status IN ('pending', 'failed') AND attempts < ${MAX_ATTEMPTS}
    ORDER BY id LIMIT ${limit}
  `;
  let sent = 0, failed = 0;
  for (const r of rows.rows) {
    (await sendOne(r.id as number, r.payload as ObservationPayload)) ? sent++ : failed++;
  }
  return { sent, failed };
}
