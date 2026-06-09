/**
 * Booking → SREWS bridge.
 *
 * Phase 2: after a booking is saved, we run the EXISTING surgical-risk
 * assessment pipeline by POSTing the booking (as a SurgeryBookingPayload) to
 * the same app's /api/surgical-risk/assess endpoint, server-to-server, with the
 * X-Webhook-Secret it already expects. This reuses the LLM + fallback + dedup +
 * insert-into-surgical_risk_assessments flow with ZERO changes to SREWS code,
 * and the result shows up in the existing /admin/surgical-risk dashboard.
 *
 * form_submission_uid = the booking id, so each booking maps 1:1 to one
 * assessment (and assess dedups on it, so retries are safe).
 */
import type { SurgeryBookingPayload } from './types';
import type { BookingFormData } from './booking-types';

const csv = (a?: string[]): string | undefined => (a && a.length ? a.join(', ') : undefined);
const numOrUndef = (n?: number | null): number | undefined =>
  n === null || n === undefined || Number.isNaN(n) ? undefined : n;
const strOrUndef = (s?: string | null): string | undefined => {
  const t = (s ?? '').toString().trim();
  return t === '' ? undefined : t;
};

export function buildAssessPayload(
  d: BookingFormData,
  formSubmissionUid: string,
  submissionTimestampIso: string,
  flag: string,
): SurgeryBookingPayload {
  return {
    form_submission_uid: formSubmissionUid,
    submission_timestamp: submissionTimestampIso,
    patient_name: d.patient_name,
    uhid: d.uhid,
    age: numOrUndef(d.age),
    sex: strOrUndef(d.sex),
    contact: strOrUndef(d.contact),
    surgeon_name: strOrUndef(d.surgeon_name),
    surgical_specialty: strOrUndef(d.surgical_specialty),
    proposed_procedure: strOrUndef(d.proposed_procedure),
    laterality: strOrUndef(d.laterality),
    anaesthesia: strOrUndef(d.anaesthesia),
    urgency: strOrUndef(d.urgency),
    clinical_justification: strOrUndef(d.clinical_justification),
    comorbidities: csv(d.comorbidities),
    pac_status: strOrUndef(d.pac_status),
    pac_advice: strOrUndef(d.pac_advice),
    habits: csv(d.habits),
    transfer: d.transfer === null || d.transfer === undefined ? undefined : d.transfer ? 'Yes' : 'No',
    referring_hospital: strOrUndef(d.referring_hospital),
    surgery_date: strOrUndef(d.surgery_date),
    surgery_time: strOrUndef(d.surgery_time),
    admission_date: strOrUndef(d.admission_date),
    admission_time: strOrUndef(d.admission_time),
    special_requirements: strOrUndef(d.special_requirements),
    payer: strOrUndef(d.payer),
    insurance_details: strOrUndef(d.insurance_details),
    los: strOrUndef(d.los),
    admission_to: strOrUndef(d.admission_to),
    billing_bed: strOrUndef(d.billing_bed),
    staying_bed: strOrUndef(d.staying_bed),
    admission_type: strOrUndef(d.admission_type),
    package_amount: numOrUndef(d.package_amount),
    open_bill: strOrUndef(d.open_bill_items),
    advance: numOrUndef(d.advance),
    counselled_by: strOrUndef(d.counselled_by),
    admission_done_by: strOrUndef(d.admission_done_by),
    prescription_upload: strOrUndef(d.prescription_url),
    remarks: strOrUndef(d.remarks),
    flag_auto: strOrUndef(flag),
  };
}

export interface AssessResult {
  ok: boolean;
  tier?: string;
  status?: string;
  id?: string | number;
}

/** POST the payload to the app's own /assess endpoint (in-process via same origin). */
export async function runSrewsAssessment(
  origin: string,
  payload: SurgeryBookingPayload,
): Promise<AssessResult> {
  const secret = process.env.SURGERY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[booking→srews] SURGERY_WEBHOOK_SECRET not set; skipping assessment');
    return { ok: false };
  }
  try {
    const r = await fetch(`${origin}/api/surgical-risk/assess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': secret },
      body: JSON.stringify(payload),
    });
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      ok: r.ok,
      tier: typeof data.tier === 'string' ? data.tier : undefined,
      status: typeof data.status === 'string' ? data.status : undefined,
      id: data.id as string | number | undefined,
    };
  } catch (e) {
    console.warn('[booking→srews] assess call failed:', e);
    return { ok: false };
  }
}
