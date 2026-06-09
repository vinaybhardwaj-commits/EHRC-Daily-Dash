/**
 * Surgery booking — shared option lists + payload type.
 * Single source of truth for the form, the API route, and the flag engine.
 * Ported from the legacy Apps Script OPTIONS/Q config.
 */

export const OPTIONS = {
  SEX: ['Female', 'Male', 'Other'],
  LATERALITY: ['Left', 'Right', 'Bilateral', 'N/A'],
  ANAESTHESIA: ['Local', 'Regional', 'Spinal', 'GA'],
  URGENCY: [
    'Elective (Planned surgery)',
    'Semi-emergency (Surgery needed within 24 hrs, patient hemodynamically stable)',
    'Urgent/Immediate (Acute threat to life/limb/organ)',
  ],
  COMORBIDITIES: [
    'None', 'Hypertension', 'Diabetes', 'Hypothyroid', 'Heart Disease',
    'Kidney Impairment', 'Respiratory Disease', 'Obesity / BMI > 35',
    'Blood Thinners / Anti Coagulant / Anti Platelet Therapy',
    'Active infection / fever > 100.4°F in the past 7 days',
    'MI or stroke in the past year', 'Angioplasty / CABG in the past year',
  ],
  PAC: [
    'Already done — video consultation PAC done',
    'Already done — in person',
    'Will do with blood reports within last 7 days',
    'Will do with blood reports and imaging reports',
    'Will do without any reports — work up at the hospital planned',
  ],
  PAC_ADVICE: [
    'PAC not yet done', 'Fit for surgery', 'Provisionally fit for surgery',
    'Needs further work up (tests only)',
    'Needs further work up and specialist consultations',
    'Need to discuss with the operating surgeon',
  ],
  HABITS: ['None', 'Smoking', 'Alcohol', 'Any other recreational drugs'],
  PAYER: ['Insurance', 'Cash'],
  ADMISSION_TO: ['Ward', 'ICU', 'Daycare'],
  BED_CATEGORY: ['Single Room / Private', 'Twin Sharing / Semi Private', 'Suite Room', 'Daycare / Multi-bed'],
  ADMISSION_TYPE: ['Package', 'Open Bill'],
} as const;

/** What the form POSTs to /api/surgical-risk/booking. */
export interface BookingFormData {
  patient_name: string;
  uhid: string;
  age?: number | null;
  sex?: string;
  contact?: string;
  surgeon_name?: string;
  surgical_specialty?: string;
  proposed_procedure?: string;
  laterality?: string;
  anaesthesia?: string;
  urgency?: string;
  clinical_justification?: string;
  comorbidities?: string[];          // multi-select → stored comma-joined
  pac_status?: string;
  pac_advice?: string;
  habits?: string[];                 // multi-select → stored comma-joined
  transfer?: boolean | null;
  referring_hospital?: string;
  surgery_date?: string;             // 'YYYY-MM-DD'
  surgery_time?: string;             // 'HH:MM'
  admission_date?: string;
  admission_time?: string;
  special_requirements?: string;
  payer?: string;
  insurance_details?: string;
  los?: string;
  admission_to?: string;
  billing_bed?: string;
  staying_bed?: string;
  admission_type?: string;
  package_amount?: number | null;    // rupees (stored as paise)
  open_bill_items?: string;
  advance?: number | null;           // rupees (stored as paise)
  counselled_by?: string;            // auto-filled from form-filler name
  submitted_by_device?: string;      // form-filler device id
  admission_done_by?: string;
  prescription_url?: string;         // Vercel Blob URL
  remarks?: string;
  is_test?: boolean;
}
