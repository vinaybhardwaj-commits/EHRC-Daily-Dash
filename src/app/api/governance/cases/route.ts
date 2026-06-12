import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { yesterdayIST } from '@/lib/governance/sheet-sync';

export const dynamic = 'force-dynamic';

/** GV.1 — read synced OT cases for the admin page. */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') || yesterdayIST();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'invalid date' }, { status: 400 });
  }
  try {
    const rows = await sql`
      SELECT case_ref, ot_room, sl_no, scheduled_time, patient_name, uhid, procedure_name,
             surgeon_raw, surgeon_physician_id, anaesthetist_raw, anaesthesia, remarks,
             cancelled, source_tab, synced_at
      FROM ot_case_log WHERE case_date = ${date}
      ORDER BY ot_room NULLS LAST, sl_no NULLS LAST, id
    `;
    return NextResponse.json({ date, count: rows.rows.length, cases: rows.rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'query failed' }, { status: 500 });
  }
}
