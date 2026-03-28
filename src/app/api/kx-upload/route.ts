import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

// Auto-create table on first run
async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS ip_unbilled_snapshots (
      id SERIAL PRIMARY KEY,
      snapshot_date DATE NOT NULL,
      uploaded_at TIMESTAMPTZ DEFAULT NOW(),
      total_patients INTEGER NOT NULL,
      total_bill_amt NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_deposit_amt NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_due_amt NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_payer_payable NUMERIC(12,2) NOT NULL DEFAULT 0,
      ward_breakdown JSONB NOT NULL DEFAULT '{}',
      payer_breakdown JSONB NOT NULL DEFAULT '{}',
      patient_details JSONB NOT NULL DEFAULT '[]',
      UNIQUE(snapshot_date)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_ip_unbilled_date ON ip_unbilled_snapshots(snapshot_date)
  `;
}

interface PatientRow {
  uhid: string;
  admissionNo: string;
  name: string;
  ageGender: string;
  payerType: string;
  payerName: string;
  billingCategory: string;
  ward: string;
  bed: string;
  treatingDoctor: string;
  doa: string;
  los: number;
  status: string;
  billAmt: number;
  payerAmount: number;
  patientAmount: number;
  depositAmount: number;
  dueRefundable: number;
  payerPayable: number;
}

function parseCSV(text: string): PatientRow[] {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  // Find column indices
  const colMap: Record<string, number> = {};
  headers.forEach((h, i) => { colMap[h.trim().toLowerCase()] = i; });

  const findCol = (names: string[]): number => {
    for (const n of names) {
      const idx = colMap[n.toLowerCase()];
      if (idx !== undefined) return idx;
    }
    return -1;
  };

  const iUHID = findCol(['uhid']);
  const iAdmNo = findCol(['admission no.', 'admission no']);
  const iName = findCol(['patient name']);
  const iAge = findCol(['age/gender']);
  const iPayerType = findCol(['payer type']);
  const iPayerName = findCol(['payer name']);
  const iBillCat = findCol(['billing category']);
  const iWard = findCol(['ward']);
  const iBed = findCol(['bed']);
  const iDoctor = findCol(['treating doctor/team']);
  const iDOA = findCol(['doa']);
  const iLOS = findCol(['los']);
  const iStatus = findCol(['status']);
  const iBillAmt = findCol(['bill amt', 'bill amount']);
  const iPayerAmt = findCol(['payer amount']);
  const iPatientAmt = findCol(['patient amount']);
  const iDeposit = findCol(['deposit amount']);
  const iDue = findCol(['due/refundable']);
  const iPayerPayable = findCol(['payer payable amount']);

  // Validate required columns exist
  if (iBillAmt === -1) {
    throw new Error('CSV missing required column: Bill Amt');
  }

  const rows: PatientRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 5) continue; // skip malformed rows

    const parseNum = (idx: number): number => {
      if (idx === -1) return 0;
      const val = (cols[idx] || '').trim().replace(/,/g, '');
      const n = parseFloat(val);
      return isNaN(n) ? 0 : n;
    };

    rows.push({
      uhid: cols[iUHID] || '',
      admissionNo: cols[iAdmNo] || '',
      name: cols[iName] || '',
      ageGender: cols[iAge] || '',
      payerType: cols[iPayerType] || '',
      payerName: cols[iPayerName] || '',
      billingCategory: cols[iBillCat] || '',
      ward: cols[iWard] || '',
      bed: cols[iBed] || '',
      treatingDoctor: cols[iDoctor] || '',
      doa: cols[iDOA] || '',
      los: parseNum(iLOS),
      status: cols[iStatus] || '',
      billAmt: parseNum(iBillAmt),
      payerAmount: parseNum(iPayerAmt),
      patientAmount: parseNum(iPatientAmt),
      depositAmount: parseNum(iDeposit),
      dueRefundable: parseNum(iDue),
      payerPayable: parseNum(iPayerPayable),
    });
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export async function POST(request: Request) {
  try {
    await ensureTable();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const dateStr = formData.get('date') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    if (!dateStr) {
      return NextResponse.json({ error: 'No date provided' }, { status: 400 });
    }

    // Validate date format
    const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) {
      return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
    }

    const csvText = await file.text();
    const patients = parseCSV(csvText);

    if (patients.length === 0) {
      return NextResponse.json({ error: 'No patient data found in CSV' }, { status: 400 });
    }

    // Aggregate totals
    const totalBillAmt = patients.reduce((s, p) => s + p.billAmt, 0);
    const totalDepositAmt = patients.reduce((s, p) => s + p.depositAmount, 0);
    const totalDueAmt = patients.reduce((s, p) => s + p.dueRefundable, 0);
    const totalPayerPayable = patients.reduce((s, p) => s + p.payerPayable, 0);

    // Ward breakdown
    const wardMap: Record<string, { patients: number; billAmt: number; depositAmt: number; dueAmt: number }> = {};
    for (const p of patients) {
      const ward = p.billingCategory || p.ward || 'Unknown';
      if (!wardMap[ward]) wardMap[ward] = { patients: 0, billAmt: 0, depositAmt: 0, dueAmt: 0 };
      wardMap[ward].patients++;
      wardMap[ward].billAmt += p.billAmt;
      wardMap[ward].depositAmt += p.depositAmount;
      wardMap[ward].dueAmt += p.dueRefundable;
    }

    // Payer breakdown
    const payerMap: Record<string, { patients: number; billAmt: number }> = {};
    for (const p of patients) {
      const payer = p.payerName || p.payerType || 'Unknown';
      if (!payerMap[payer]) payerMap[payer] = { patients: 0, billAmt: 0 };
      payerMap[payer].patients++;
      payerMap[payer].billAmt += p.billAmt;
    }

    // Patient details for storage (exclude mobile numbers for privacy)
    const patientDetails = patients.map(p => ({
      uhid: p.uhid,
      admissionNo: p.admissionNo,
      name: p.name,
      ward: p.ward,
      bed: p.bed,
      billingCategory: p.billingCategory,
      treatingDoctor: p.treatingDoctor,
      doa: p.doa,
      los: p.los,
      status: p.status,
      billAmt: p.billAmt,
      depositAmount: p.depositAmount,
      dueRefundable: p.dueRefundable,
      payerPayable: p.payerPayable,
      payerType: p.payerType,
      payerName: p.payerName,
    }));

    // Upsert into database
    await sql`
      INSERT INTO ip_unbilled_snapshots (
        snapshot_date, total_patients, total_bill_amt, total_deposit_amt,
        total_due_amt, total_payer_payable, ward_breakdown, payer_breakdown,
        patient_details, uploaded_at
      ) VALUES (
        ${dateStr}, ${patients.length}, ${totalBillAmt}, ${totalDepositAmt},
        ${totalDueAmt}, ${totalPayerPayable}, ${JSON.stringify(wardMap)},
        ${JSON.stringify(payerMap)}, ${JSON.stringify(patientDetails)}, NOW()
      )
      ON CONFLICT (snapshot_date)
      DO UPDATE SET
        total_patients = EXCLUDED.total_patients,
        total_bill_amt = EXCLUDED.total_bill_amt,
        total_deposit_amt = EXCLUDED.total_deposit_amt,
        total_due_amt = EXCLUDED.total_due_amt,
        total_payer_payable = EXCLUDED.total_payer_payable,
        ward_breakdown = EXCLUDED.ward_breakdown,
        payer_breakdown = EXCLUDED.payer_breakdown,
        patient_details = EXCLUDED.patient_details,
        uploaded_at = NOW()
    `;

    // Log IP admissions to admissions_log (for accurate Admissions MTD tracking)
    let admissionsLogged = 0;
    try {
      for (const p of patients) {
        if (!p.admissionNo || !p.admissionNo.startsWith('IP-')) continue;
        if (!p.doa) continue;

        // Parse DOA: "DD/MM/YYYY, HH:MM am/pm"
        const doaMatch = p.doa.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (!doaMatch) continue;
        const admDate = `${doaMatch[3]}-${doaMatch[2].padStart(2, '0')}-${doaMatch[1].padStart(2, '0')}`;

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
        admissionsLogged++;
      }
    } catch {
      // admissions_log table may not exist yet — silently skip
    }

    return NextResponse.json({
      success: true,
      date: dateStr,
      summary: {
        totalPatients: patients.length,
        totalBillAmt: Math.round(totalBillAmt * 100) / 100,
        totalDepositAmt: Math.round(totalDepositAmt * 100) / 100,
        totalDueAmt: Math.round(totalDueAmt * 100) / 100,
        depositCoverage: totalBillAmt > 0 ? Math.round((totalDepositAmt / totalBillAmt) * 10000) / 100 : 0,
        wardBreakdown: wardMap,
        admissionsLogged,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('KX upload error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET endpoint to retrieve unbilled snapshots for the Finance dashboard
export async function GET(request: Request) {
  try {
    await ensureTable();

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // e.g., '2026-03'
    const date = searchParams.get('date'); // e.g., '2026-03-25'

    if (date) {
      // Single day snapshot
      const result = await sql`
        SELECT * FROM ip_unbilled_snapshots WHERE snapshot_date = ${date}
      `;
      if (result.rows.length === 0) {
        return NextResponse.json({ data: null });
      }
      return NextResponse.json({ data: result.rows[0] });
    }

    if (month) {
      // Monthly snapshots for trend
      const result = await sql`
        SELECT snapshot_date, total_patients, total_bill_amt, total_deposit_amt,
               total_due_amt, total_payer_payable, ward_breakdown
        FROM ip_unbilled_snapshots
        WHERE snapshot_date >= ${month + '-01'}
          AND snapshot_date < (${month + '-01'}::date + interval '1 month')
        ORDER BY snapshot_date
      `;
      return NextResponse.json({ data: result.rows });
    }

    // Default: latest 30 days
    const result = await sql`
      SELECT snapshot_date, total_patients, total_bill_amt, total_deposit_amt,
             total_due_amt, total_payer_payable
      FROM ip_unbilled_snapshots
      ORDER BY snapshot_date DESC
      LIMIT 30
    `;
    return NextResponse.json({ data: result.rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
