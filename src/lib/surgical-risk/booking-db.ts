/**
 * Surgery booking — DB layer (Vercel Postgres).
 *
 * Phase 1: lazy, self-migrating. ensureBookingSchema() runs CREATE TABLE
 * IF NOT EXISTS on first use, so there is NO separate migration step to run.
 * Idempotent + additive — safe to call on every request (guarded to run once
 * per warm lambda). Zero new dependencies (uses @vercel/postgres + node crypto).
 *
 * Phase 3 adds getBookingByToken() for the public patient portal + PDF routes.
 * Phase 4 adds the CC desk: an additive cc_status workflow column, a queue
 * query that LEFT JOINs each booking to its SREWS risk tier, and the status /
 * revoke mutations. All additions are idempotent (ALTER ... IF NOT EXISTS) so
 * the existing surgery_booking table upgrades in place with no manual migration.
 */
import { sql } from '@vercel/postgres';
import { randomUUID } from 'crypto';
import { computeFlag, type FlagValue } from './flag';
import type { BookingFormData } from './booking-types';

let schemaReady = false;

/** CC workflow states. 'New' is the default for every fresh booking. */
export const CC_STATUSES = ['New', 'Counselled', 'Admitted', 'Cancelled'] as const;
export type CcStatus = (typeof CC_STATUSES)[number];

export async function ensureBookingSchema(): Promise<void> {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS surgery_booking (
      id                    uuid PRIMARY KEY,
      created_at            timestamptz NOT NULL DEFAULT now(),
      submitted_by          text,
      submitted_by_device   text,
      patient_name          text NOT NULL,
      uhid                  text NOT NULL,
      age                   int,
      sex                   text,
      contact               text,
      surgeon_name          text,
      surgical_specialty    text,
      proposed_procedure    text,
      laterality            text,
      anaesthesia           text,
      urgency               text,
      clinical_justification text,
      comorbidities         text,
      pac_status            text,
      pac_advice            text,
      habits                text,
      transfer              boolean,
      referring_hospital    text,
      surgery_date          date,
      surgery_time          text,
      admission_date        date,
      admission_time        text,
      special_requirements  text,
      payer                 text,
      insurance_details     text,
      los                   text,
      admission_to          text,
      billing_bed           text,
      staying_bed           text,
      admission_type        text,
      package_amount_paise  bigint,
      open_bill_items       text,
      advance_paise         bigint,
      counselled_by         text,
      admission_done_by     text,
      prescription_url      text,
      remarks               text,
      flag                  text,
      portal_token          text UNIQUE NOT NULL,
      is_test               boolean NOT NULL DEFAULT false,
      revoked               boolean NOT NULL DEFAULT false,
      cc_status             text NOT NULL DEFAULT 'New',
      cc_status_at          timestamptz,
      cc_status_by          text
    )
  `;
  // Additive upgrades for tables created before Phase 4 (idempotent).
  await sql`ALTER TABLE surgery_booking ADD COLUMN IF NOT EXISTS cc_status text NOT NULL DEFAULT 'New'`;
  await sql`ALTER TABLE surgery_booking ADD COLUMN IF NOT EXISTS cc_status_at timestamptz`;
  await sql`ALTER TABLE surgery_booking ADD COLUMN IF NOT EXISTS cc_status_by text`;
  schemaReady = true;
}

export interface InsertResult {
  id: string;
  portal_token: string;
  flag: FlagValue;
}

/** Full booking row (loose types — pg returns dates as Date|string and bigint as string). */
export interface BookingRow {
  id: string;
  created_at: string | Date;
  submitted_by: string | null;
  submitted_by_device: string | null;
  patient_name: string;
  uhid: string;
  age: number | null;
  sex: string | null;
  contact: string | null;
  surgeon_name: string | null;
  surgical_specialty: string | null;
  proposed_procedure: string | null;
  laterality: string | null;
  anaesthesia: string | null;
  urgency: string | null;
  clinical_justification: string | null;
  comorbidities: string | null;
  pac_status: string | null;
  pac_advice: string | null;
  habits: string | null;
  transfer: boolean | null;
  referring_hospital: string | null;
  surgery_date: string | Date | null;
  surgery_time: string | null;
  admission_date: string | Date | null;
  admission_time: string | null;
  special_requirements: string | null;
  payer: string | null;
  insurance_details: string | null;
  los: string | null;
  admission_to: string | null;
  billing_bed: string | null;
  staying_bed: string | null;
  admission_type: string | null;
  package_amount_paise: string | number | null;
  open_bill_items: string | null;
  advance_paise: string | number | null;
  counselled_by: string | null;
  admission_done_by: string | null;
  prescription_url: string | null;
  remarks: string | null;
  flag: string | null;
  portal_token: string;
  is_test: boolean;
  revoked: boolean;
  cc_status: string;
  cc_status_at: string | Date | null;
  cc_status_by: string | null;
}

/** A queue row = the booking joined to its latest live SREWS assessment. */
export interface CCQueueRow extends BookingRow {
  risk_tier: string | null;
  composite_risk_score: string | number | null;
}

const toPaise = (rupees?: number | null): number | null =>
  rupees === null || rupees === undefined || isNaN(rupees) ? null : Math.round(rupees * 100);

const csv = (arr?: string[]): string | null =>
  arr && arr.length ? arr.join(', ') : null;

const clean = (v?: string | null): string | null => {
  const t = (v ?? '').toString().trim();
  return t === '' ? null : t;
};

export async function insertBooking(d: BookingFormData): Promise<InsertResult> {
  await ensureBookingSchema();

  const id = randomUUID();
  const portal_token = randomUUID().replace(/-/g, ''); // 32-char unguessable token, not the UHID

  const flag = computeFlag({
    urgency: d.urgency,
    comorbidities: d.comorbidities,
    pac_status: d.pac_status,
    pac_advice: d.pac_advice,
    habits: d.habits,
    surgery_date: d.surgery_date,
    surgery_time: d.surgery_time,
    admission_date: d.admission_date,
    admission_time: d.admission_time,
  });

  await sql`
    INSERT INTO surgery_booking (
      id, submitted_by, submitted_by_device,
      patient_name, uhid, age, sex, contact,
      surgeon_name, surgical_specialty, proposed_procedure, laterality, anaesthesia, urgency,
      clinical_justification, comorbidities, pac_status, pac_advice, habits,
      transfer, referring_hospital,
      surgery_date, surgery_time, admission_date, admission_time, special_requirements,
      payer, insurance_details, los, admission_to, billing_bed, staying_bed, admission_type,
      package_amount_paise, open_bill_items, advance_paise,
      counselled_by, admission_done_by, prescription_url, remarks,
      flag, portal_token, is_test
    ) VALUES (
      ${id}, ${clean(d.counselled_by)}, ${clean(d.submitted_by_device)},
      ${clean(d.patient_name)}, ${clean(d.uhid)}, ${d.age ?? null}, ${clean(d.sex)}, ${clean(d.contact)},
      ${clean(d.surgeon_name)}, ${clean(d.surgical_specialty)}, ${clean(d.proposed_procedure)}, ${clean(d.laterality)}, ${clean(d.anaesthesia)}, ${clean(d.urgency)},
      ${clean(d.clinical_justification)}, ${csv(d.comorbidities)}, ${clean(d.pac_status)}, ${clean(d.pac_advice)}, ${csv(d.habits)},
      ${d.transfer ?? null}, ${clean(d.referring_hospital)},
      ${clean(d.surgery_date)}, ${clean(d.surgery_time)}, ${clean(d.admission_date)}, ${clean(d.admission_time)}, ${clean(d.special_requirements)},
      ${clean(d.payer)}, ${clean(d.insurance_details)}, ${clean(d.los)}, ${clean(d.admission_to)}, ${clean(d.billing_bed)}, ${clean(d.staying_bed)}, ${clean(d.admission_type)},
      ${toPaise(d.package_amount)}, ${clean(d.open_bill_items)}, ${toPaise(d.advance)},
      ${clean(d.counselled_by)}, ${clean(d.admission_done_by)}, ${clean(d.prescription_url)}, ${clean(d.remarks)},
      ${flag}, ${portal_token}, ${d.is_test ?? false}
    )
  `;

  return { id, portal_token, flag };
}

/** Look up a booking by its public portal token (Phase 3 patient portal + PDFs). */
export async function getBookingByToken(token: string): Promise<BookingRow | null> {
  await ensureBookingSchema();
  const { rows } = await sql<BookingRow>`
    SELECT * FROM surgery_booking WHERE portal_token = ${token} LIMIT 1
  `;
  return rows[0] ?? null;
}

/* ----------------------------------------------------------------------------
 * Phase 4 — CC desk
 * ------------------------------------------------------------------------- */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string): boolean => UUID_RE.test(s);

/**
 * CC work queue: every real (non-test) booking, newest first, each joined to
 * its latest non-removed SREWS assessment for the risk tier + composite score.
 * The booking → assessment link is form_submission_uid = booking id (set by the
 * Phase 2 bridge). Falls back to a plain booking list if the assessments table
 * is unavailable, so the CC desk never hard-fails on the join.
 */
export async function listBookingsForCC(limit = 500): Promise<CCQueueRow[]> {
  await ensureBookingSchema();
  try {
    const { rows } = await sql<CCQueueRow>`
      SELECT b.*, a.risk_tier, a.composite_risk_score
      FROM surgery_booking b
      LEFT JOIN LATERAL (
        SELECT risk_tier, composite_risk_score
        FROM surgical_risk_assessments
        WHERE form_submission_uid = b.id::text AND removed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      ) a ON true
      WHERE b.is_test = false
      ORDER BY b.created_at DESC
      LIMIT ${limit}
    `;
    return rows;
  } catch {
    const { rows } = await sql<BookingRow>`
      SELECT * FROM surgery_booking WHERE is_test = false ORDER BY created_at DESC LIMIT ${limit}
    `;
    return rows.map((r) => ({ ...r, risk_tier: null, composite_risk_score: null }));
  }
}

/** Update the CC workflow status of one booking. Returns false if id unknown / status invalid. */
export async function updateBookingCcStatus(
  id: string,
  status: string,
  by: string | null,
): Promise<boolean> {
  if (!isUuid(id) || !CC_STATUSES.includes(status as CcStatus)) return false;
  await ensureBookingSchema();
  const { rowCount } = await sql`
    UPDATE surgery_booking
    SET cc_status = ${status}, cc_status_at = now(), cc_status_by = ${by}
    WHERE id = ${id}::uuid
  `;
  return (rowCount ?? 0) > 0;
}

/** Revoke (or restore) a patient's portal link. Returns false if id unknown. */
export async function setBookingRevoked(
  id: string,
  revoked: boolean,
  by: string | null,
): Promise<boolean> {
  if (!isUuid(id)) return false;
  await ensureBookingSchema();
  const { rowCount } = await sql`
    UPDATE surgery_booking
    SET revoked = ${revoked}, cc_status_at = now(), cc_status_by = COALESCE(${by}, cc_status_by)
    WHERE id = ${id}::uuid
  `;
  return (rowCount ?? 0) > 0;
}

/* ----------------------------------------------------------------------------
 * CC DTO — a plain, fully-serialisable shape for the CC desk page + list API.
 * Converts pg Date objects to ISO strings and bigint strings to numbers so it
 * crosses the server→client boundary cleanly.
 * ------------------------------------------------------------------------- */

export interface CcDto {
  id: string;
  patient_name: string;
  uhid: string;
  age: number | null;
  sex: string | null;
  contact: string | null;
  surgeon_name: string | null;
  surgical_specialty: string | null;
  proposed_procedure: string | null;
  laterality: string | null;
  surgery_date: string | null;
  surgery_time: string | null;
  admission_date: string | null;
  admission_time: string | null;
  payer: string | null;
  admission_type: string | null;
  package_amount_paise: number | null;
  advance_paise: number | null;
  flag: string | null;
  risk_tier: string | null;
  composite_risk_score: number | null;
  cc_status: string;
  cc_status_at: string | null;
  cc_status_by: string | null;
  counselled_by: string | null;
  created_at: string;
  portal_token: string;
  revoked: boolean;
}

const dateOnly = (v: string | Date | null): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return typeof v === 'string' ? v.slice(0, 10) : null;
  return d.toISOString().slice(0, 10);
};
const isoOrNull = (v: string | Date | null): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
};
const numOrNull = (v: string | number | null): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return isNaN(n) ? null : n;
};

export function toCcDto(r: CCQueueRow): CcDto {
  return {
    id: r.id,
    patient_name: r.patient_name,
    uhid: r.uhid,
    age: r.age,
    sex: r.sex,
    contact: r.contact,
    surgeon_name: r.surgeon_name,
    surgical_specialty: r.surgical_specialty,
    proposed_procedure: r.proposed_procedure,
    laterality: r.laterality,
    surgery_date: dateOnly(r.surgery_date),
    surgery_time: r.surgery_time,
    admission_date: dateOnly(r.admission_date),
    admission_time: r.admission_time,
    payer: r.payer,
    admission_type: r.admission_type,
    package_amount_paise: numOrNull(r.package_amount_paise),
    advance_paise: numOrNull(r.advance_paise),
    flag: r.flag,
    risk_tier: r.risk_tier,
    composite_risk_score: numOrNull(r.composite_risk_score),
    cc_status: r.cc_status || 'New',
    cc_status_at: isoOrNull(r.cc_status_at),
    cc_status_by: r.cc_status_by,
    counselled_by: r.counselled_by,
    created_at: isoOrNull(r.created_at) || new Date().toISOString(),
    portal_token: r.portal_token,
    revoked: r.revoked,
  };
}
