import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { buildAssessPayload, runSrewsAssessment } from '@/lib/surgical-risk/srews-bridge';
import type { BookingFormData } from '@/lib/surgical-risk/booking-types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TIME_BUDGET_MS = 235_000; // leave headroom for the in-flight 55s LLM call
const LOCK_KEY = 'srews_backlog_lock';
const LOCK_TTL_MS = 4 * 60_000;

/**
 * SREWS backlog drainer. Every run picks unassessed, non-revoked bookings
 * (most recent surgery first) and assesses them SEQUENTIALLY — the Mac Mini
 * runs one generation at a time — until the time budget is spent. A gv_config
 * lock prevents overlapping cron runs from queueing parallel LLM calls.
 * Once the backlog is empty each run is a single cheap SELECT (permanent
 * safety net for bookings that miss their inline assessment).
 */
async function handle(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const auth = req.headers.get('authorization') || '';
  const secret = process.env.SERVICE_OBSERVATIONS_SECRET;
  if (!isVercelCron && !(secret && auth === `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // overlap guard
  const lock = await sql`SELECT value, updated_at FROM gv_config WHERE key = ${LOCK_KEY}`;
  const lockedAt = lock.rows[0] ? new Date(lock.rows[0].updated_at as string).getTime() : 0;
  if (lockedAt && Date.now() - lockedAt < LOCK_TTL_MS) {
    return NextResponse.json({ ok: true, skipped: 'another run holds the lock' });
  }
  await sql`
    INSERT INTO gv_config (key, value) VALUES (${LOCK_KEY}, '"running"'::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;

  const started = Date.now();
  const origin = new URL(req.url).origin;
  let assessed = 0, failed = 0, remaining = 0;
  const results: string[] = [];

  try {
    while (Date.now() - started < TIME_BUDGET_MS) {
      const next = await sql`
        SELECT b.* FROM surgery_booking b
        WHERE b.revoked = false AND b.is_test = false
          AND NOT EXISTS (SELECT 1 FROM surgical_risk_assessments a WHERE a.form_submission_uid = b.id::text)
        ORDER BY b.surgery_date DESC NULLS LAST, b.created_at DESC
        LIMIT 1
      `;
      if (next.rows.length === 0) break;
      const b = next.rows[0];
      const d: Partial<BookingFormData> = {
        patient_name: b.patient_name, uhid: b.uhid, age: b.age, sex: b.sex,
        surgeon_name: b.surgeon_name, surgical_specialty: b.surgical_specialty,
        proposed_procedure: b.proposed_procedure, laterality: b.laterality,
        anaesthesia: b.anaesthesia, urgency: b.urgency, clinical_justification: b.clinical_justification,
        comorbidities: (b.comorbidities || '').split(',').map((s: string) => s.trim()).filter(Boolean),
        pac_status: b.pac_status, pac_advice: b.pac_advice,
        habits: (b.habits || '').split(',').map((s: string) => s.trim()).filter(Boolean),
        transfer: b.transfer,
        surgery_date: b.surgery_date instanceof Date ? b.surgery_date.toISOString().slice(0, 10) : b.surgery_date,
        surgery_time: b.surgery_time,
        admission_date: b.admission_date instanceof Date ? b.admission_date.toISOString().slice(0, 10) : b.admission_date,
        payer: b.payer,
      };
      const payload = buildAssessPayload(
        d as BookingFormData, b.id,
        b.created_at instanceof Date ? b.created_at.toISOString() : String(b.created_at),
        b.flag,
      );
      const r = await runSrewsAssessment(origin, payload);
      if (r.ok) { assessed++; results.push(`${b.patient_name}:${r.tier}`); }
      else {
        failed++;
        // avoid spinning on a permanently failing row within this run
        if (failed >= 3) break;
      }
    }
    const rem = await sql`
      SELECT count(*)::int AS n FROM surgery_booking b
      WHERE b.revoked = false AND b.is_test = false
        AND NOT EXISTS (SELECT 1 FROM surgical_risk_assessments a WHERE a.form_submission_uid = b.id::text)
    `;
    remaining = rem.rows[0].n;
  } finally {
    await sql`UPDATE gv_config SET value = '"idle"'::jsonb, updated_at = to_timestamp(0) WHERE key = ${LOCK_KEY}`;
  }

  return NextResponse.json({ ok: true, assessed, failed, remaining, results });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
