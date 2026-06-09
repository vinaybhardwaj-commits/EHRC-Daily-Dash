/**
 * Surgery booking — DB layer (Vercel Postgres).
 *
 * Phase 1: lazy, self-migrating. ensureBookingSchema() runs CREATE TABLE
 * IF NOT EXISTS on first use, so there is NO separate migration step to run.
 * Idempotent + additive — safe to call on every request (guarded to run once
 * per warm lambda). Zero new dependencies (uses @vercel/postgres + node crypto).
 */
import { sql } from '@vercel/postgres';
import { randomUUID } from 'crypto';
import { computeFlag, type FlagValue } from './flag';
import type { BookingFormData } from './booking-types';

let schemaReady = false;

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
      revoked               boolean NOT NULL DEFAULT false
    )
  `;
  schemaReady = true;
}

export interface InsertResult {
  id: string;
  portal_token: string;
  flag: FlagValue;
}

const toPaise = (rupees?: number | null): number | null =>
  rupees === null || rupees === undefined || isNaN(rupees) ? null : Math.round(rupees * 100);

const csv = (arr?: string[]): string | null =>
  arr && arr.length ? arr.join(', ') : null;

const clean = (s?: string | null): string | null => {
  const t = (s ?? '').toString().trim();
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
