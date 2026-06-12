// src/lib/surgical-risk/sheet-bridge.ts
// Legacy booking sheet → cc-desk bridge.
//
// Most bookings still arrive via the legacy Apps-Script sheet ("EHRC Surgery
// Booking — Responses": one FC / Info / Adm tab trio per patient). This module
// downloads the whole workbook (public-link xlsx export), parses every tab
// trio into the SAME BookingFormData the native /surgery-booking form POSTs,
// and upserts through the native pipeline so /cc-desk sees one unified queue.
//
// Dedup: sb_sheet_imports maps tab-key -> booking id + content hash.
//   - new tab trio        -> insertBooking (+ SREWS for future-dated, capped)
//   - changed tab content -> update sheet-sourced fields only (cc_status,
//     revocation and other cc-desk state are NEVER touched)
//   - stub tabs (no procedure AND no consultant) are skipped, not imported

import { read as xlsxRead, utils as xlsxUtils } from 'xlsx';
import { sql } from '@vercel/postgres';
import { insertBooking } from './booking-db';
import type { BookingFormData } from './booking-types';

const SHEET_ID = process.env.SB_SHEET_ID || '1m9ASKreH-Ci5UXyAA9P6td4uszcKpCX9woBEEIdRCGY';

/* ── schema ─────────────────────────────────────────────────────────── */

let ready = false;
async function ensureBridgeSchema(): Promise<void> {
  if (ready) return;
  await sql`
    CREATE TABLE IF NOT EXISTS sb_sheet_imports (
      tab_key     text PRIMARY KEY,
      booking_id  uuid NOT NULL,
      row_hash    text NOT NULL,
      imported_at timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz
    )
  `;
  ready = true;
}

/* ── workbook parsing ───────────────────────────────────────────────── */

type Rows = unknown[][];

function serialDate(v: unknown): string | undefined {
  if (typeof v === 'number' && v > 40000) {
    return new Date(Date.UTC(1899, 11, 30) + v * 86400_000).toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(v.trim());
    if (m) {
      const mon = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[2].toLowerCase()) + 1;
      if (mon) return `${m[3]}-${String(mon).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
  }
  return undefined;
}

function serialTime(v: unknown): string | undefined {
  if (typeof v === 'number' && v > 0 && v < 1) {
    const mins = Math.round(v * 1440);
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }
  if (typeof v === 'string' && /^\d{1,2}:\d{2}/.test(v.trim())) return v.trim();
  return undefined;
}

function grab(rows: Rows, label: string): string {
  for (const r of rows) {
    const i = r.findIndex(c => typeof c === 'string' && c.trim().toLowerCase().startsWith(label.toLowerCase()));
    if (i >= 0) {
      for (let j = i + 1; j < r.length; j++) {
        if (r[j] !== undefined && r[j] !== '') return String(r[j]).trim();
      }
      return '';
    }
  }
  return '';
}
function grabRaw(rows: Rows, label: string): unknown {
  for (const r of rows) {
    const i = r.findIndex(c => typeof c === 'string' && c.trim().toLowerCase().startsWith(label.toLowerCase()));
    if (i >= 0) { for (let j = i + 1; j < r.length; j++) { if (r[j] !== undefined && r[j] !== '') return r[j]; } }
  }
  return undefined;
}

/** "₹ 1.65" (lakhs, as the CC team writes it) | "₹ 45,000" | 45000 → rupees. */
function parseAmountRupees(v: string): number | null {
  const cleaned = v.replace(/[₹,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!isFinite(n) || n < 0) return null;
  if (n === 0) return 0;
  return n < 1000 ? Math.round(n * 100000) : Math.round(n); // <1000 ⇒ lakhs shorthand
}

export interface ParsedSheetBooking {
  tabKey: string;
  hash: string;
  stub: boolean;
  data: BookingFormData;
  rawPackage: string;
  rawAdvance: string;
}

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export async function parseBookingSheet(): Promise<ParsedSheetBooking[]> {
  const res = await fetch(
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`,
    { cache: 'no-store', redirect: 'follow' },
  );
  if (!res.ok) throw new Error(`sheet export failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000 || buf.subarray(0, 64).toString().includes('<!DOCTYPE')) {
    throw new Error('sheet export returned HTML — is the sheet still link-readable?');
  }
  const wb = xlsxRead(buf, { type: 'buffer' });

  // Group FC/Info tab pairs by CONTENT identity (patient name + UHID parsed
  // from inside the tab), NOT by tab name: Google truncates tab names at
  // ~31 chars, so the "FC - " / "Info - " prefixes truncate long patient
  // names differently and name-based keys silently split the trio.
  const identity = (name: string, uhid: string) =>
    `${name.trim().toLowerCase().replace(/\s+/g, ' ')}|${uhid.replace(/[^0-9a-z]/gi, '').toLowerCase()}`;

  const groups = new Map<string, { fc?: Rows; info?: Rows; tabKey: string }>();
  for (const name of wb.SheetNames) {
    const m = /^(FC|Info|Adm) - (.+)$/.exec(name);
    if (!m) continue;
    const rows = xlsxUtils.sheet_to_json(wb.Sheets[name], { header: 1 }) as Rows;
    let key = '';
    if (m[1] === 'FC') {
      key = identity(grab(rows, 'Patient Name'), grab(rows, 'UHID'));
    } else if (m[1] === 'Info') {
      // header line: "Patient: X   |   UHID: Y   |   Generated: ..."
      const header = rows.flat().find(c => typeof c === 'string' && c.startsWith('Patient:')) as string | undefined;
      const hm = header ? /Patient:\s*(.+?)\s*\|\s*UHID:\s*([^|]+)/.exec(header) : null;
      if (hm) key = identity(hm[1], hm[2]);
    } else {
      continue; // Adm carries no extra fields
    }
    if (!key || key === '|') continue;
    const g = groups.get(key) || { tabKey: key };
    if (m[1] === 'FC') g.fc = rows;
    if (m[1] === 'Info') g.info = rows;
    groups.set(key, g);
  }

  const out: ParsedSheetBooking[] = [];
  for (const [tabKey, g] of groups) {
    void g.tabKey;
    const fc = g.fc || [];
    const info = g.info || [];
    const patientName = grab(fc, 'Patient Name');
    if (!patientName) continue; // unparseable tab

    const ageSex = grab(fc, 'Age / Sex');
    const ageMatch = /(\d{1,3})/.exec(ageSex);
    const sex = /male/i.test(ageSex) ? (/female/i.test(ageSex) ? 'Female' : 'Male') : (/other/i.test(ageSex) ? 'Other' : undefined);
    const rawPackage = grab(fc, 'Package Amount');
    const rawAdvance = grab(fc, 'Advance to be Collected');
    const consultant = grab(fc, 'Admitting Consultant');
    const procedure = grab(fc, 'Proposed Procedure');

    const data: BookingFormData = {
      patient_name: patientName,
      uhid: grab(fc, 'UHID') || '—',
      age: ageMatch ? Number(ageMatch[1]) : null,
      sex,
      contact: grab(fc, 'Contact Number') || undefined,
      surgeon_name: consultant || undefined,
      surgical_specialty: grab(info, 'Surgical Specialty') || undefined,
      proposed_procedure: procedure || undefined,
      laterality: grab(info, 'Laterality') || undefined,
      anaesthesia: grab(info, 'Anaesthesia') || undefined,
      urgency: grab(info, 'Urgency') || undefined,
      clinical_justification: grab(info, 'Clinical Justification') || undefined,
      comorbidities: (grab(info, 'Known Co-morbidities') || '').split(',').map(s => s.trim()).filter(Boolean),
      pac_status: grab(info, 'PAC (anaesthesia') || grab(info, 'PAC') || undefined,
      pac_advice: grab(info, "Anaesthetist's advice") || undefined,
      habits: (grab(info, 'Habits') || '').split(',').map(s => s.trim()).filter(Boolean),
      transfer: /^yes/i.test(grab(info, 'Transfer Patient')) ? true : (/^no/i.test(grab(info, 'Transfer Patient')) ? false : null),
      referring_hospital: grab(info, 'Referring Hospital') || undefined,
      surgery_date: serialDate(grabRaw(fc, 'Date of Surgery')),
      surgery_time: serialTime(grabRaw(fc, 'Planned time of surgery')),
      admission_date: serialDate(grabRaw(fc, 'Date of Admission')),
      admission_time: serialTime(grabRaw(fc, 'Expected time')),
      special_requirements: grab(info, 'Special requirements') || undefined,
      payer: grab(fc, 'Payer') || undefined,
      insurance_details: grab(fc, 'Insurance Details') || undefined,
      los: grab(fc, 'Expected Length of Stay') || undefined,
      admission_to: grab(fc, 'Admission To') || undefined,
      staying_bed: grab(info, 'Staying Bed Category') || grab(fc, 'Bed Category') || undefined,
      admission_type: grab(fc, 'Admission Type') || undefined,
      package_amount: rawPackage ? parseAmountRupees(rawPackage) : null,
      open_bill_items: grab(info, 'Open Bill line items') || undefined,
      advance: rawAdvance ? parseAmountRupees(rawAdvance) : null,
      counselled_by: grab(fc, 'Counselled By') || undefined,
      admission_done_by: grab(fc, 'Admission Done By') || undefined,
      prescription_url: grab(info, 'Prescription file') || undefined,
      remarks: [grab(fc, 'Remarks'), `[sheet:${tabKey}]`, rawPackage && `pkg as written: "${rawPackage}"`]
        .filter(Boolean).join(' · '),
      submitted_by_device: 'sheet-bridge',
    };

    out.push({
      tabKey,
      hash: djb2(JSON.stringify(data)),
      stub: !procedure && !consultant,
      data,
      rawPackage,
      rawAdvance,
    });
  }
  return out;
}

/* ── sync ───────────────────────────────────────────────────────────── */

export interface SyncStats {
  parsed: number; stubsSkipped: number; inserted: number; updated: number; unchanged: number;
  srewsQueued: string[]; errors: Array<{ tab: string; error: string }>;
}

const UPDATABLE = [
  'patient_name','uhid','age','sex','contact','surgeon_name','surgical_specialty','proposed_procedure',
  'laterality','anaesthesia','urgency','clinical_justification','pac_status','pac_advice','referring_hospital',
  'surgery_date','surgery_time','admission_date','admission_time','special_requirements','payer',
  'insurance_details','los','admission_to','staying_bed','admission_type','open_bill_items',
  'counselled_by','admission_done_by','prescription_url','remarks',
] as const;

export async function syncBookingSheet(opts: { backfill?: boolean; dry?: boolean } = {}): Promise<SyncStats> {
  await ensureBridgeSchema();
  const parsed = await parseBookingSheet();
  const stats: SyncStats = { parsed: parsed.length, stubsSkipped: 0, inserted: 0, updated: 0, unchanged: 0, srewsQueued: [], errors: [] };
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

  // bulk lookups (the per-row version was ~200 sequential HTTP queries/run)
  const importRows = await sql`SELECT tab_key, booking_id, row_hash FROM sb_sheet_imports`;
  const imports = new Map<string, { booking_id: string; row_hash: string }>(
    importRows.rows.map(r => [r.tab_key as string, { booking_id: r.booking_id as string, row_hash: r.row_hash as string }]),
  );
  const nativeRows = await sql`SELECT id, uhid, surgery_date::text AS sd FROM surgery_booking WHERE revoked = false`;
  const nativeByKey = new Map<string, string>(
    nativeRows.rows.map(r => [`${r.uhid}|${r.sd}`, r.id as string]),
  );

  for (const p of parsed) {
    try {
      if (p.stub) { stats.stubsSkipped++; continue; }
      const existing = imports.get(p.tabKey);

      if (!existing) {
        // safety net: the same patient may already exist via the NATIVE form —
        // link instead of duplicating (match on uhid + surgery_date)
        if (p.data.uhid !== '—' && p.data.surgery_date) {
          const dupeId = nativeByKey.get(`${p.data.uhid}|${p.data.surgery_date}`);
          if (dupeId) {
            if (!opts.dry) {
              await sql`
                INSERT INTO sb_sheet_imports (tab_key, booking_id, row_hash)
                VALUES (${p.tabKey}, ${dupeId}::uuid, ${p.hash})
                ON CONFLICT (tab_key) DO NOTHING
              `;
            }
            stats.unchanged++;
            continue;
          }
        }
        if (opts.dry) { stats.inserted++; continue; }
        const result = await insertBooking(p.data);
        await sql`
          INSERT INTO sb_sheet_imports (tab_key, booking_id, row_hash)
          VALUES (${p.tabKey}, ${result.id}::uuid, ${p.hash})
          ON CONFLICT (tab_key) DO NOTHING
        `;
        stats.inserted++;
        // future-dated real bookings get a SREWS assessment (cron mode only, capped by caller)
        if (!opts.backfill && p.data.surgery_date && p.data.surgery_date >= today) {
          stats.srewsQueued.push(result.id);
        }
      } else if (existing.row_hash !== p.hash) {
        if (opts.dry) { stats.updated++; continue; }
        const bid = existing.booking_id;
        // refresh sheet-sourced fields; cc-desk state (cc_status / revoked / flag) untouched
        const d = p.data as unknown as Record<string, unknown>;
        for (const col of UPDATABLE) {
          let v = d[col] ?? null;
          if (col === 'uhid' && v === '—') continue;
          await sql.query(`UPDATE surgery_booking SET ${col} = $1 WHERE id = $2 AND revoked = false`, [v, bid]);
        }
        if (p.data.package_amount != null) {
          await sql`UPDATE surgery_booking SET package_amount_paise = ${Math.round(p.data.package_amount * 100)} WHERE id = ${bid}::uuid AND revoked = false`;
        }
        if (p.data.advance != null) {
          await sql`UPDATE surgery_booking SET advance_paise = ${Math.round(p.data.advance * 100)} WHERE id = ${bid}::uuid AND revoked = false`;
        }
        const com = (p.data.comorbidities || []).join(', ');
        const hab = (p.data.habits || []).join(', ');
        await sql`UPDATE surgery_booking SET comorbidities = ${com || null}, habits = ${hab || null}, transfer = ${p.data.transfer ?? null} WHERE id = ${bid}::uuid AND revoked = false`;
        await sql`UPDATE sb_sheet_imports SET row_hash = ${p.hash}, updated_at = now() WHERE tab_key = ${p.tabKey}`;
        stats.updated++;
      } else {
        stats.unchanged++;
      }
    } catch (e) {
      stats.errors.push({ tab: p.tabKey, error: e instanceof Error ? e.message.slice(0, 120) : 'failed' });
    }
  }
  return stats;
}
