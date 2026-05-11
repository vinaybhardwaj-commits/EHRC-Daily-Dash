/**
 * POST /api/surgical-risk/check-uids
 *
 * Apps Script time-trigger handler calls this with the list of
 * form_submission_uids it sees in the surgery booking sheet. We return the
 * subset already in the DB so the time-trigger only POSTs missing rows
 * to /assess. Per PRD v2 §2.1 + decision #6.
 *
 * Body: { uids: string[] }
 * Response: { ok: true, existing: string[] }
 *
 * Validates X-Webhook-Secret. Internally bound endpoint — Apps Script only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { checkWebhookSecret } from '@/lib/surgical-risk/webhook-auth';

export const dynamic = 'force-dynamic';

const MAX_UIDS = 500;       // Sanity cap so a runaway client doesn't blast the DB

export async function POST(req: NextRequest) {
  const auth = checkWebhookSecret(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: { uids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  const uids = body.uids;
  if (!Array.isArray(uids) || !uids.every(u => typeof u === 'string')) {
    return NextResponse.json({ ok: false, error: 'uids must be a string[]' }, { status: 400 });
  }
  if (uids.length === 0) {
    return NextResponse.json({ ok: true, existing: [] });
  }
  if (uids.length > MAX_UIDS) {
    return NextResponse.json({ ok: false, error: `Too many uids (max ${MAX_UIDS})` }, { status: 400 });
  }

  try {
    const r = await sql.query(
      `SELECT form_submission_uid
         FROM surgical_risk_assessments
         WHERE form_submission_uid = ANY($1::text[])`,
      [uids]
    );
    const existing = r.rows.map((row: { form_submission_uid: string }) => row.form_submission_uid);
    return NextResponse.json({ ok: true, existing });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
