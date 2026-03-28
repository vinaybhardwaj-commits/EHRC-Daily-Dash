import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

/**
 * POST /api/seed-admissions
 * One-time endpoint to create the admissions_log table and seed it
 * with historical data from the discharge CSV.
 * Protected by MIGRATION_SECRET.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Protect with migration secret
    if (body.secret !== process.env.MIGRATION_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Create the admissions_log table
    await sql`
      CREATE TABLE IF NOT EXISTS admissions_log (
        id SERIAL PRIMARY KEY,
        admission_no TEXT NOT NULL,
        uhid TEXT,
        patient_name TEXT,
        admission_date DATE NOT NULL,
        ward TEXT,
        bed_category TEXT,
        treating_doctor TEXT,
        specialty TEXT,
        payer_type TEXT,
        payer_name TEXT,
        admission_type TEXT,
        source TEXT NOT NULL DEFAULT 'kx_upload',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(admission_no)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_admissions_date ON admissions_log(admission_date)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_admissions_month ON admissions_log((TO_CHAR(admission_date, 'YYYY-MM')))`;

    // 2. Seed from provided records
    const records = body.records as Array<{
      admission_no: string;
      uhid?: string;
      patient_name?: string;
      admission_date: string;
      ward?: string;
      bed_category?: string;
      treating_doctor?: string;
      specialty?: string;
      payer_type?: string;
      payer_name?: string;
      admission_type?: string;
      source?: string;
    }>;

    let inserted = 0;
    let skipped = 0;

    for (const r of records) {
      try {
        await sql`
          INSERT INTO admissions_log (
            admission_no, uhid, patient_name, admission_date,
            ward, bed_category, treating_doctor, specialty,
            payer_type, payer_name, admission_type, source
          ) VALUES (
            ${r.admission_no}, ${r.uhid || null}, ${r.patient_name || null}, ${r.admission_date},
            ${r.ward || null}, ${r.bed_category || null}, ${r.treating_doctor || null}, ${r.specialty || null},
            ${r.payer_type || null}, ${r.payer_name || null}, ${r.admission_type || null}, ${r.source || 'discharge_csv'}
          )
          ON CONFLICT (admission_no) DO NOTHING
        `;
        inserted++;
      } catch {
        skipped++;
      }
    }

    // 3. Also backfill from existing KX snapshots (patient_details with DOA)
    let kxBackfilled = 0;
    try {
      const kxResult = await sql`
        SELECT patient_details FROM ip_unbilled_snapshots ORDER BY snapshot_date
      `;
      for (const row of kxResult.rows) {
        const patients = (typeof row.patient_details === 'string'
          ? JSON.parse(row.patient_details)
          : row.patient_details) as Array<{
            admissionNo?: string;
            uhid?: string;
            name?: string;
            doa?: string;
            ward?: string;
            billingCategory?: string;
            treatingDoctor?: string;
            payerType?: string;
            payerName?: string;
          }>;

        for (const p of patients) {
          if (!p.admissionNo || !p.admissionNo.startsWith('IP-')) continue;
          if (!p.doa) continue;

          // Parse DOA: "DD/MM/YYYY, HH:MM am/pm"
          const doaMatch = p.doa.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (!doaMatch) continue;
          const admDate = `${doaMatch[3]}-${doaMatch[2].padStart(2, '0')}-${doaMatch[1].padStart(2, '0')}`;

          try {
            await sql`
              INSERT INTO admissions_log (
                admission_no, uhid, patient_name, admission_date,
                ward, bed_category, treating_doctor, payer_type, payer_name, source
              ) VALUES (
                ${p.admissionNo}, ${p.uhid || null}, ${p.name || null}, ${admDate},
                ${p.ward || null}, ${p.billingCategory || null}, ${p.treatingDoctor || null},
                ${p.payerType || null}, ${p.payerName || null}, 'kx_upload'
              )
              ON CONFLICT (admission_no) DO NOTHING
            `;
            kxBackfilled++;
          } catch {
            // skip duplicates
          }
        }
      }
    } catch {
      // KX table might not exist
    }

    // 4. Report results
    const countResult = await sql`
      SELECT TO_CHAR(admission_date, 'YYYY-MM') as month, COUNT(*) as total
      FROM admissions_log
      GROUP BY TO_CHAR(admission_date, 'YYYY-MM')
      ORDER BY month
    `;

    return NextResponse.json({
      success: true,
      inserted,
      skipped,
      kxBackfilled,
      monthlyCounts: countResult.rows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Seed admissions error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
