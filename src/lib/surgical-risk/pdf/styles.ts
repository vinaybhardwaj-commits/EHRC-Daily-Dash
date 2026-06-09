/**
 * Shared constants, formatters, and StyleSheet for the booking PDFs.
 * Uses react-pdf's built-in Helvetica (no font registration needed).
 * NOTE: built-in PDF fonts don't include the ₹ glyph, so amounts use "Rs."
 * (which also matches the form's own "(Rs.)" labels).
 */
import { StyleSheet } from '@react-pdf/renderer';

export const HOSPITAL_NAME = 'EVEN HOSPITALS';
export const HOSPITAL_ADDRESS = 'Race Course Road, Bangalore 560001';

export const BANK: [string, string][] = [
  ['Name of the Account:', 'Balloon Health Care Pvt. Ltd.'],
  ['Account No.:', '50200111991320'],
  ['Account Type:', 'Current Account'],
  ['IFSC Code:', 'HDFC0001472'],
  ['Name & Address of the Bank:', 'HDFC BANK, 418/1, Near Kudalahalli Gate, ITPL Road, Bangalore - 560066, Karnataka, India'],
];

export const INCLUSIONS = [
  'Bed & nursing charges',
  'Routine medicines & consumables as per treatment / surgery / procedure planned',
  'Visit charges of the treating consultants',
  'Treatment / Surgery / Procedure charges as mentioned above',
  'Routine OT medicines & consumables',
];

export const EXCLUSIONS = [
  'Cross consultations (if any)',
  'High value investigations - CT, MRI etc. (if any)',
  'High value drugs (if any)',
  'Overstay charges (beyond expected length of stay)',
];

export const NOTES = [
  '1.  Kindly make 80% of the estimated cost as a deposit before surgery.',
  '2.  Cash payment limit is Rs.1.99 Lacs only as per Section 269ST of the Income Tax Act, 1961.',
  '3.  Accepted payment modes are Credit Cards, Debit Cards, Online Transfers, UPI, Cash.',
  '4.  Cash Refund limit is restricted to only Rs.10,000/-. Refund amount in excess will be done through Bank Transfer, for which it may take 4-5 working days.',
  '5.  Non Medical, Co-pay & other deductions by insurance should be paid by customer based on the insurance approval.',
];

export const DISCLAIMER =
  'DISCLAIMER: The cost mentioned above is an estimated cost. Final bill may vary due to various reasons like clinical conditions, change in line of treatment, other co-morbidities etc.';

export const CONSENT_FC =
  'I, the undersigned, acknowledge that I have been counselled regarding the estimated cost of treatment / procedure / surgery planned. I understand that this is a provisional estimate and that actual charges may vary based on the patient’s clinical condition, length of stay, or any unforeseen complications. I agree to take full responsibility for all charges incurred during the course of treatment, including those exceeding this estimate.';

export const CONSENT_ADM =
  'I have been explained (in language that I understand) about the diagnosis, need of admission, proposed line of management & possible outcome including risks & complications. I hereby give my consent for admission.';

export const SIG_LINE = '___________________________';

/* ----------------------------------------------------------- formatters */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function safe(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export function fmtDate(v: unknown): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(typeof v === 'string' && v.length <= 10 ? `${v}T00:00:00` : String(v));
  if (isNaN(d.getTime())) return String(v);
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

export function fmtDateTime(v: unknown): string {
  const d = v instanceof Date ? v : new Date(String(v));
  if (isNaN(d.getTime())) return String(v ?? '');
  return `${fmtDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtAgeSex(age: unknown, sex: unknown): string {
  const a = safe(age);
  const s = safe(sex);
  if (a && s) return `${a} / ${s}`;
  return a || s || '';
}

/** paise (string|number|null) -> "Rs. 1,15,000" with Indian grouping. */
export function fmtAmountPaise(paise: unknown): string {
  if (paise === null || paise === undefined || paise === '') return '';
  const n = Number(paise);
  if (isNaN(n)) return String(paise);
  const rupees = n / 100;
  return `Rs. ${rupees.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/* --------------------------------------------------------------- styles */

const NAVY = '#1f4e78';
const BLUE = '#2e75b6';
const SECTION_BG = '#d9e1f2';
const INC_BG = '#e2efda';
const EXC_BG = '#fce4d6';
const DISCLAIMER_BG = '#fff2cc';
const CONSENT_BG = '#f4b084';

export const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 34, paddingHorizontal: 34, fontFamily: 'Helvetica', fontSize: 9, color: '#1a1a1a' },

  title: { fontFamily: 'Helvetica-Bold', fontSize: 15, textAlign: 'center', color: '#ffffff', backgroundColor: NAVY, paddingVertical: 6 },
  sub: { fontSize: 9, textAlign: 'center', color: '#444444', marginTop: 2 },
  title2: { fontFamily: 'Helvetica-Bold', fontSize: 12, textAlign: 'center', color: '#ffffff', backgroundColor: BLUE, paddingVertical: 4, marginTop: 6 },
  rule: { borderBottomWidth: 1, borderBottomColor: NAVY, marginTop: 4, marginBottom: 2 },

  section: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: NAVY, backgroundColor: SECTION_BG, paddingVertical: 4, paddingHorizontal: 6, marginTop: 8 },

  row: { flexDirection: 'row', marginTop: 3 },
  label: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  value: { fontSize: 9, flexGrow: 1 },
  // two label/value pairs per line
  cellHalf: { flexDirection: 'row', width: '50%', paddingRight: 8 },
  cellFull: { flexDirection: 'row', width: '100%' },
  lblNarrow: { fontFamily: 'Helvetica-Bold', fontSize: 9, width: 110 },
  lblWide: { fontFamily: 'Helvetica-Bold', fontSize: 9, width: 150 },
  val: { fontSize: 9, flex: 1 },

  incExcHead: { flexDirection: 'row', marginTop: 8 },
  incHead: { width: '50%', fontFamily: 'Helvetica-Bold', fontSize: 9, textAlign: 'center', backgroundColor: INC_BG, paddingVertical: 3 },
  excHead: { width: '50%', fontFamily: 'Helvetica-Bold', fontSize: 9, textAlign: 'center', backgroundColor: EXC_BG, paddingVertical: 3 },
  incExcRow: { flexDirection: 'row' },
  incCell: { width: '50%', fontSize: 8, paddingVertical: 2, paddingRight: 6 },
  excCell: { width: '50%', fontSize: 8, paddingVertical: 2, paddingRight: 6 },

  disclaimer: { fontSize: 8, backgroundColor: DISCLAIMER_BG, padding: 6, marginTop: 8 },
  noteHead: { fontFamily: 'Helvetica-Bold', fontSize: 9, marginTop: 8 },
  note: { fontSize: 8, marginTop: 2 },

  bankHead: { fontFamily: 'Helvetica-Bold', fontSize: 9, backgroundColor: SECTION_BG, paddingVertical: 3, paddingHorizontal: 6, marginTop: 8 },

  consentHead: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: '#ffffff', backgroundColor: CONSENT_BG, textAlign: 'center', paddingVertical: 4, marginTop: 8 },
  consentBody: { fontSize: 8, marginTop: 4, lineHeight: 1.4 },

  sigRow: { flexDirection: 'row', marginTop: 10 },
  sigLabel: { fontFamily: 'Helvetica-Bold', fontSize: 9, width: 90 },
  sigLine: { fontSize: 9, width: 150 },

  flagBanner: { fontFamily: 'Helvetica-Bold', fontSize: 10, textAlign: 'center', paddingVertical: 5, marginTop: 6 },

  footer: { position: 'absolute', bottom: 16, left: 34, right: 34, fontSize: 7, textAlign: 'center', color: '#666666' },
});
