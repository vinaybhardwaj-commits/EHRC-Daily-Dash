/**
 * Surgical Risk — Google Sheet column-name → form-payload-key mappings.
 *
 * Per PRD v2 decision #10: live surgery booking sheet has 47 columns vs PRD
 * §5.1's listed 37. THREE duplicate logical fields exist (Anaesthesia at cols
 * 12 + 44, Preferred Surgery Time at cols 22 + 45, Prescription Upload at cols
 * 38 + 40 — same column added twice when the form question was edited). For
 * each duplicate, we read both candidate column names and prefer the
 * non-empty one (`findField` non-empty pattern, same as the existing overview
 * fix shipped 7 May 2026).
 *
 * SIX columns are EXCLUDED from LLM input because they're either auto-added
 * by Google Form (Timestamp, Email Address) or computed/derived columns (Age/Sex,
 * blank header, PAC DONE, PAC ANESTHESTIA) that would confuse the LLM if seen
 * as raw fields.
 *
 * Apps Script is responsible for applying this mapping when POSTing to /assess
 * — this file is the authoritative source of truth that Apps Script's snippet
 * derives from in SREWS.4.
 */

import type { SurgeryBookingPayload } from './types';

/**
 * For each form-payload field, list the Google Sheet column header name(s)
 * to look at, in preference order. First non-empty value wins.
 *
 * If a field has multiple entries here, that's a duplicate-column case
 * (form question was edited). If a field has only one entry, the column is
 * unique in the live sheet.
 */
export const FIELD_TO_SHEET_COLUMNS: Record<keyof SurgeryBookingPayload, string[]> = {
  form_submission_uid: [],   // Computed by Apps Script (hash of Timestamp+UHID+Patient_Name); never read from sheet
  submission_timestamp: ['Timestamp'],
  patient_name: ['Patient Name'],
  uhid: ['UHID'],
  age: ['Age'],
  sex: ['Sex'],
  contact: ['Contact Number'],
  surgeon_name: ['Surgeon Name'],
  surgical_specialty: ['Surgical Specialty'],
  proposed_procedure: ['Proposed Procedure'],
  laterality: ['Laterality'],
  // DUPLICATE COLUMN — both 12 ("Anaesthesia") and 44 ("Anaesthesia") exist; prefer non-empty.
  anaesthesia: ['Anaesthesia'],   // grep-finds both; runtime picks non-empty
  urgency: ['Urgency'],
  clinical_justification: ['Clinical Justification / Indication for surgery'],
  comorbidities: ['Known Co-morbidities'],
  pac_status: ['PAC (anaesthesia consultation)'],
  pac_advice: ["If PAC done, what is the anaesthetist's advice"],
  habits: ['Habits'],
  transfer: ['Transfer Patient'],
  referring_hospital: ['Referring Hospital'],
  surgery_date: ['Preferred Date for Surgery'],
  // DUPLICATE COLUMN — both 22 and 45 named "Preferred Surgery Time"; prefer non-empty.
  surgery_time: ['Preferred Surgery Time'],
  admission_date: ['Date for Admission'],
  admission_time: ['Admission latest by'],
  special_requirements: ['Special requirements: implants, consumables, equipment etc.'],
  payer: ['Payer'],
  insurance_details: ['Insurance Details'],
  los: ['Expected Length of Stay (No. of Days)'],
  admission_to: ['Admission To'],
  billing_bed: ['Billing Bed Category'],
  staying_bed: ['Staying Bed Category'],
  admission_type: ['Admission Type'],
  package_amount: ['Package Amount (Rs.)'],
  open_bill: ['Open Bill — Admission / Bed / Nursing / RMO / Doctor Visits / MRD / Food / Insurance Processing / Other charges'],
  advance: ['Advance to be Collected (Rs.)'],
  counselled_by: ['Counselled By (Name)'],
  admission_done_by: ['Admission Done By (Name)'],
  // DUPLICATE COLUMN — both 38 ("Prescription Upload (must mention date and time of surgery and admission) (paste link)")
  // and 40 ("Prescription Upload (must mention date and time of surgery and admission)") exist; prefer non-empty.
  prescription_upload: [
    'Prescription Upload (must mention date and time of surgery and admission) (paste link)',
    'Prescription Upload (must mention date and time of surgery and admission)',
  ],
  remarks: ['Remarks'],
  flag_auto: ['Flag (auto)'],
};

/**
 * Sheet columns to EXCLUDE from LLM input.
 * Auto-added by Google Form: Timestamp, Email Address (Timestamp is captured separately
 * as submission_timestamp). Derived/computed columns: Age/Sex (joined display field),
 * blank-header column (hidden helper), PAC DONE (Y/N derived from PAC col), PAC ANESTHESTIA
 * (typo'd derived column).
 */
export const EXCLUDED_SHEET_COLUMNS: ReadonlySet<string> = new Set([
  'Email Address',
  'Age / Sex',
  '',  // blank-header column (col 43)
  'PAC DONE',
  'PAC ANESTHESTIA',
  // 'Timestamp' is read but mapped to submission_timestamp, not excluded.
]);

/**
 * Pick the first non-empty value among a list of candidate columns.
 * Used for duplicate-column merging (Anaesthesia / Preferred Surgery Time / Prescription Upload).
 *
 * @param row Map of column name → cell value (string or empty)
 * @param candidates Ordered list of column names to try
 * @returns First non-empty trimmed value, or '' if all candidates are empty
 */
export function pickNonEmpty(row: Record<string, string>, candidates: string[]): string {
  for (const col of candidates) {
    const val = row[col];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

/**
 * Build a SurgeryBookingPayload from a single sheet row (a Record<columnName, cellValue>).
 *
 * This is the authoritative mapping function. Apps Script will replicate this
 * logic in `.gs` for the webhook + time-trigger handlers (SREWS.4) — keep
 * field IDs and column names in sync between the two implementations.
 */
export function buildPayloadFromSheetRow(
  row: Record<string, string>,
  formSubmissionUid: string
): SurgeryBookingPayload {
  const get = (field: keyof SurgeryBookingPayload): string => {
    const cols = FIELD_TO_SHEET_COLUMNS[field];
    if (!cols || cols.length === 0) return '';
    return pickNonEmpty(row, cols);
  };

  const ageRaw = get('age');
  const age = ageRaw ? parseInt(ageRaw, 10) : undefined;

  return {
    form_submission_uid: formSubmissionUid,
    submission_timestamp: get('submission_timestamp'),
    patient_name: get('patient_name'),
    uhid: get('uhid'),
    age: Number.isFinite(age) ? age : undefined,
    sex: get('sex') || undefined,
    contact: get('contact') || undefined,
    surgeon_name: get('surgeon_name') || undefined,
    surgical_specialty: get('surgical_specialty') || undefined,
    proposed_procedure: get('proposed_procedure') || undefined,
    laterality: get('laterality') || undefined,
    anaesthesia: get('anaesthesia') || undefined,
    urgency: get('urgency') || undefined,
    clinical_justification: get('clinical_justification') || undefined,
    comorbidities: get('comorbidities') || undefined,
    pac_status: get('pac_status') || undefined,
    pac_advice: get('pac_advice') || undefined,
    habits: get('habits') || undefined,
    transfer: get('transfer') || undefined,
    referring_hospital: get('referring_hospital') || undefined,
    surgery_date: get('surgery_date') || undefined,
    surgery_time: get('surgery_time') || undefined,
    admission_date: get('admission_date') || undefined,
    admission_time: get('admission_time') || undefined,
    special_requirements: get('special_requirements') || undefined,
    payer: get('payer') || undefined,
    insurance_details: get('insurance_details') || undefined,
    los: get('los') || undefined,
    admission_to: get('admission_to') || undefined,
    billing_bed: get('billing_bed') || undefined,
    staying_bed: get('staying_bed') || undefined,
    admission_type: get('admission_type') || undefined,
    package_amount: get('package_amount') || undefined,
    open_bill: get('open_bill') || undefined,
    advance: get('advance') || undefined,
    counselled_by: get('counselled_by') || undefined,
    admission_done_by: get('admission_done_by') || undefined,
    prescription_upload: get('prescription_upload') || undefined,
    remarks: get('remarks') || undefined,
    flag_auto: get('flag_auto') || undefined,
  };
}
