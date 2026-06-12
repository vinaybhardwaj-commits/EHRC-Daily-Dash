import { NextRequest, NextResponse } from 'next/server';
import { syncBookingSheet } from '@/lib/surgical-risk/sheet-bridge';
import { buildAssessPayload, runSrewsAssessment } from '@/lib/surgical-risk/srews-bridge';
import { sql } from '@vercel/postgres';
import { isAuthorizedCron } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SREWS_CAP = 3; // LLM assessments per run; the rest catch up next hour

/**
 * Legacy booking sheet → cc-desk sync. Hourly Vercel cron + manual bearer.
 * ?backfill=1 — import without SREWS (historical load)
 * ?dry=1      — parse + classify only, no writes
 */
async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const backfill = req.nextUrl.searchParams.get('backfill') === '1';
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  try {
    const stats = await syncBookingSheet({ backfill, dry });

    // SREWS for newly imported future-dated bookings (capped per run)
    let assessed = 0;
    if (!dry && stats.srewsQueued.length > 0) {
      const origin = new URL(req.url).origin;
      for (const id of stats.srewsQueued.slice(0, SREWS_CAP)) {
        try {
          const row = await sql`SELECT * FROM surgery_booking WHERE id = ${id}::uuid`;
          const b = row.rows[0];
          if (!b) continue;
          const payload = buildAssessPayload(
            {
              patient_name: b.patient_name, uhid: b.uhid, age: b.age, sex: b.sex,
              surgeon_name: b.surgeon_name, surgical_specialty: b.surgical_specialty,
              proposed_procedure: b.proposed_procedure, laterality: b.laterality,
              anaesthesia: b.anaesthesia, urgency: b.urgency,
              clinical_justification: b.clinical_justification,
              comorbidities: (b.comorbidities || '').split(',').map((s: string) => s.trim()).filter(Boolean),
              pac_status: b.pac_status, pac_advice: b.pac_advice,
              habits: (b.habits || '').split(',').map((s: string) => s.trim()).filter(Boolean),
              transfer: b.transfer, surgery_date: typeof b.surgery_date === 'string' ? b.surgery_date : b.surgery_date?.toISOString?.()?.slice(0, 10),
              surgery_time: b.surgery_time, admission_date: typeof b.admission_date === 'string' ? b.admission_date : b.admission_date?.toISOString?.()?.slice(0, 10),
              payer: b.payer,
            },
            id,
            String(b.created_at instanceof Date ? b.created_at.toISOString() : b.created_at),
            b.flag,
          );
          await runSrewsAssessment(origin, payload);
          assessed++;
        } catch { /* reassess available from /surgical-risk; next runs catch up */ }
      }
    }

    return NextResponse.json({ ok: true, mode: dry ? 'dry' : backfill ? 'backfill' : 'sync', ...stats, srewsQueued: stats.srewsQueued.length, srewsAssessed: assessed });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'sync failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
