// src/lib/governance/sheet-sync.ts
// GV.1 — OT posted-cases Google Sheet → ot_case_log.
//
// The sheet has ONE TAB PER DAY with wildly inconsistent tab names
// ("12-06-26", "11/06/26", "30May", "May 29", "Sheet92"…) and at least two
// format eras. The reliable date anchor is the in-sheet title row:
// "EVEN RACE COURSE ROAD OT SCHEDULE FOR DD-MM-YYYY". Strategy:
//   1. generate candidate tab names for the target date (and date+1 — tabs
//      are sometimes named for the day they were made, not the day they hold),
//   2. fetch each candidate via the public gviz CSV endpoint,
//   3. accept a tab ONLY if its title row matches the target date
//      (old-era tabs lack a title row: accept those only on exact-name match),
//   4. parse rows for both eras, replace ot_case_log for that date.

import { sql } from '@vercel/postgres';

const SHEET_ID = process.env.OT_SHEET_ID || '1QEWDYVEbSJxyOtzK-trde72JdSqm8EQ0i-KYjjgldhM';

export interface OtCase {
  caseRef: string;
  otRoom: string | null;
  slNo: string | null;
  scheduledTime: string | null;
  patientName: string | null;
  uhid: string | null;
  procedureName: string | null;
  surgeonRaw: string | null;
  anaesthetistRaw: string | null;
  anaesthesia: string | null;
  remarks: string | null;
  cancelled: boolean;
}

export interface SyncResult {
  date: string;
  tab: string | null;
  format: 'new' | 'old' | null;
  cases: OtCase[];
  error?: string;
}

/* ── CSV parsing (minimal, quote-aware) ─────────────────────────────── */

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cell); cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/* ── Tab-name candidates ────────────────────────────────────────────── */

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function candidatesFor(d: Date): string[] {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const d1 = String(d.getUTCDate());
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const m1 = String(d.getUTCMonth() + 1);
  const yyyy = String(d.getUTCFullYear());
  const yy = yyyy.slice(2);
  const mon = MONTHS[d.getUTCMonth()];
  const out = [
    `${dd}-${mm}-${yy}`, `${dd}/${mm}/${yy}`, `${dd}/${mm}/${yyyy}`, `${dd}-${mm}-${yyyy}`,
    `${d1}/${m1}/${yy}`, `${d1}-${m1}-${yy}`, `${d1}/${m1}/${yyyy}`, `${dd}.${mm}.${yy}`,
    `${dd}${mon.slice(0, 3)}`, `${d1}${mon.slice(0, 3)}`, `${mon.slice(0, 3)} ${dd}`, `${mon.slice(0, 3)} ${d1}`,
    `${dd}${mon}`, `${mon} ${d1}`, `${dd} ${mon.slice(0, 3)}`,
  ];
  return [...new Set(out)];
}

/* ── Title-row date extraction ──────────────────────────────────────── */

function titleRowDate(rows: string[][]): string | null {
  for (const row of rows.slice(0, 8)) {
    for (const cell of row) {
      const m = /SCHEDULE\s+FOR\s+(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/i.exec(cell);
      if (m) {
        const y = m[3].length === 2 ? `20${m[3]}` : m[3];
        return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      }
    }
  }
  return null;
}

/* ── Row parsing ────────────────────────────────────────────────────── */

const CANCEL_RE = /cancel|postpon/i;

function findHeaderRow(rows: string[][]): { idx: number; cols: Record<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const lower = rows[i].map(c => c.trim().toLowerCase());
    const surgeonIdx = lower.findIndex(c => c === 'surgeon' || c === 'surgeon ');
    if (surgeonIdx === -1) continue;
    const find = (...names: string[]) => lower.findIndex(c => names.some(n => c.startsWith(n)));
    return {
      idx: i,
      cols: {
        surgeon: surgeonIdx,
        time: find('scheduled time', 'start hhmm', 'time'),
        patient: find('patient name'),
        uhid: find('uhid'),
        procedure: find('surgery', 'procedure'),
        anaesthetist: find('anaesthetist'),
        anaesthesia: find('anaethesia', 'anaesthesia', 'anae'),
        remarks: find('remarks'),
        slno: find('sl no'),
        ot: find('ot #', 'ot#'),
      },
    };
  }
  return null;
}

function parseCases(rows: string[][], date: string): { cases: OtCase[]; format: 'new' | 'old' } {
  const header = findHeaderRow(rows);
  if (!header) return { cases: [], format: 'new' };
  const { idx, cols } = header;
  // New era: rows grouped under OT-1/OT-2/OT-3 markers in column 0.
  // Old era: per-row OT number in the "OT #" column. Both handled below.
  const format: 'new' | 'old' = cols.ot >= 0 && rows[idx][cols.ot]?.trim().toLowerCase().startsWith('ot') ? 'old' : (cols.slno >= 0 ? 'new' : 'old');
  const get = (row: string[], c: number): string | null => (c >= 0 && row[c] !== undefined ? row[c].trim() || null : null);

  const cases: OtCase[] = [];
  let currentOt: string | null = null;
  let counter = 0;
  for (let i = idx + 1; i < rows.length; i++) {
    const row = rows[i];
    const col0 = (row[0] || '').trim();
    if (/^OT[-\s]?\d/i.test(col0)) currentOt = col0.toUpperCase().replace(/\s/g, '');
    else if (/^\d$/.test(col0)) currentOt = `OT-${col0}`;

    const patient = get(row, cols.patient);
    const procedure = get(row, cols.procedure);
    const surgeon = get(row, cols.surgeon);
    // skip time-grid filler / empty rows: need at least a surgeon or a procedure
    if (!surgeon && !procedure) continue;
    // skip template junk ("Dr. " placeholder rows with no patient/procedure)
    if (!patient && !procedure) continue;

    counter++;
    const time = get(row, cols.time);
    const remarks = get(row, cols.remarks);
    const slug = (patient || procedure || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 16);
    cases.push({
      caseRef: `${date}-${get(row, cols.slno) || counter}-${slug}`,
      otRoom: currentOt,
      slNo: get(row, cols.slno),
      scheduledTime: time,
      patientName: patient,
      uhid: get(row, cols.uhid),
      procedureName: procedure,
      surgeonRaw: surgeon,
      anaesthetistRaw: get(row, cols.anaesthetist),
      anaesthesia: get(row, cols.anaesthesia),
      remarks,
      cancelled: CANCEL_RE.test(remarks || '') || CANCEL_RE.test(time || ''),
    });
  }
  return { cases, format };
}

/* ── Fetch + sync ───────────────────────────────────────────────────── */

async function fetchTab(tab: string): Promise<string[][] | null> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  try {
    const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.trimStart().startsWith('<')) return null; // permission wall / missing tab HTML
    return parseCsv(text);
  } catch {
    return null;
  }
}

function fingerprint(rows: string[][]): string {
  return JSON.stringify(rows.slice(0, 5));
}

/** Locate + parse the OT schedule for `date` (YYYY-MM-DD). Does not write. */
export async function fetchOtSchedule(date: string): Promise<SyncResult> {
  const d = new Date(date + 'T00:00:00Z');
  const next = new Date(d.getTime() + 86400_000);
  // gviz quirk: a request for a NON-EXISTENT tab silently falls back to the
  // spreadsheet's first sheet. Probe with a bogus name once and reject any
  // candidate that returns identical content.
  const sentinel = await fetchTab('zzz-gv-no-such-tab-zzz');
  const sentinelFp = sentinel ? fingerprint(sentinel) : null;

  // Tabs are usually named for the date itself, sometimes for the day after
  // (tab "2/6/26" held the 01-06 schedule). Title row is the arbiter.
  const tried = new Set<string>();
  for (const tab of [...candidatesFor(d), ...candidatesFor(next)]) {
    if (tried.has(tab)) continue;
    tried.add(tab);
    const rows = await fetchTab(tab);
    if (!rows) continue;
    if (sentinelFp && fingerprint(rows) === sentinelFp) continue; // gviz fallback, not a real tab
    const titleDate = titleRowDate(rows);
    if (titleDate === date || (titleDate === null && candidatesFor(d).includes(tab))) {
      const { cases, format } = parseCases(rows, date);
      return { date, tab, format, cases };
    }
  }
  return { date, tab: null, format: null, cases: [], error: 'no tab found for date (checked ' + tried.size + ' candidate names)' };
}

function rowHash(c: OtCase): string {
  // dependency-free stable hash (djb2) over identifying fields
  const s = [c.caseRef, c.patientName, c.procedureName, c.surgeonRaw, c.scheduledTime, c.remarks].join('|');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Sync `date`'s OT schedule into ot_case_log (replace-per-date, idempotent). */
export async function syncOtCases(date: string): Promise<SyncResult & { inserted: number }> {
  const result = await fetchOtSchedule(date);
  if (result.error || !result.tab) return { ...result, inserted: 0 };

  await sql`DELETE FROM ot_case_log WHERE case_date = ${date} AND source = 'sheet'`;
  let inserted = 0;
  for (const c of result.cases) {
    await sql`
      INSERT INTO ot_case_log (case_date, case_ref, ot_room, sl_no, scheduled_time, patient_name, uhid, procedure_name, surgeon_raw, anaesthetist_raw, anaesthesia, remarks, cancelled, source_tab, row_hash)
      VALUES (${date}, ${c.caseRef}, ${c.otRoom}, ${c.slNo}, ${c.scheduledTime}, ${c.patientName}, ${c.uhid}, ${c.procedureName}, ${c.surgeonRaw}, ${c.anaesthetistRaw}, ${c.anaesthesia}, ${c.remarks}, ${c.cancelled}, ${result.tab}, ${rowHash(c)})
      ON CONFLICT (case_date, case_ref) DO UPDATE SET
        ot_room = EXCLUDED.ot_room, scheduled_time = EXCLUDED.scheduled_time,
        patient_name = EXCLUDED.patient_name, uhid = EXCLUDED.uhid,
        procedure_name = EXCLUDED.procedure_name, surgeon_raw = EXCLUDED.surgeon_raw,
        anaesthetist_raw = EXCLUDED.anaesthetist_raw, anaesthesia = EXCLUDED.anaesthesia,
        remarks = EXCLUDED.remarks, cancelled = EXCLUDED.cancelled,
        source_tab = EXCLUDED.source_tab, row_hash = EXCLUDED.row_hash, synced_at = now();
    `;
    inserted++;
  }
  return { ...result, inserted };
}

/** Yesterday's calendar date in IST as YYYY-MM-DD. */
export function yesterdayIST(): string {
  return new Date(Date.now() + 5.5 * 3600_000 - 86400_000).toISOString().slice(0, 10);
}
