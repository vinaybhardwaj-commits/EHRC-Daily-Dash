/**
 * Surgical scheduling flag — deterministic verdict computed on every booking.
 *
 * Direct 1:1 TypeScript port of computeFlag_() from the legacy Apps Script.
 * Operational window 06:30–18:30 inclusive; gap = surgery − admission (hours).
 * Branch order is significant: out-of-hours short-circuits first.
 *
 * Pure + side-effect-free → unit-testable (see scripts/test-flag.ts).
 */

export const OPERATIONAL = { start: { h: 6, m: 30 }, end: { h: 18, m: 30 } } as const;

export const FLAG = {
  OUT_OF_HOURS:   'Requested time of surgery out of operational hours',
  OK:             'Requested time and dates OK',
  PROVISIONAL_OK: 'Requested time and dates provisionally OK',
  MOSTLY_OK:      "Requested time and dates most likely OK, subject to anaesthetist's advice",
  NEED_4H:        'More time after admission (at least 4 working hours) required before requested OT time',
  NEED_12H:       'More time after admission (at least 12 working hours) required before requested OT time',
  DISCUSS:        'Anaesthetist + facility head need to discuss with the operating surgeon',
} as const;

export type FlagValue = (typeof FLAG)[keyof typeof FLAG] | '';

export interface FlagInput {
  urgency?: string | null;
  comorbidities?: string | string[] | null;
  pac_status?: string | null;
  pac_advice?: string | null;
  habits?: string | string[] | null;
  surgery_date?: string | Date | null;   // 'YYYY-MM-DD'
  surgery_time?: string | null;           // 'HH:MM' (24h) — blank ⇒ treated as out of hours
  admission_date?: string | Date | null;
  admission_time?: string | null;
}

interface TimeOfDay { h: number; m: number; }

/** Parse 'HH:MM' or 'H:MM AM/PM' → {h,m}. Returns null if blank/unparseable. */
export function parseTimeOfDay(v?: string | null): TimeOfDay | null {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

function combineDateTime(d?: string | Date | null, t?: string | null): Date | null {
  if (!d) return null;
  const date = d instanceof Date ? new Date(d.getTime()) : new Date(`${d}T00:00:00`);
  if (isNaN(date.getTime())) return null;
  const tod = parseTimeOfDay(t);
  date.setHours(tod ? tod.h : 0, tod ? tod.m : 0, 0, 0);
  return date;
}

function inOperationalHours(t: TimeOfDay | null): boolean {
  if (!t) return false;
  const mins = t.h * 60 + t.m;
  return mins >= (OPERATIONAL.start.h * 60 + OPERATIONAL.start.m) &&
         mins <= (OPERATIONAL.end.h * 60 + OPERATIONAL.end.m);
}

/** True only if every selected value is "None" (matches legacy isOnlyNone_). */
function isOnlyNone(v?: string | string[] | null): boolean {
  if (!v) return false;
  const parts = (Array.isArray(v) ? v : String(v).split(','))
    .map(s => s.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every(p => /^none$/i.test(p));
}

export function computeFlag(b: FlagInput): FlagValue {
  // 1. Out-of-hours short-circuits everything (also catches a blank surgery time).
  const surgeryTime = parseTimeOfDay(b.surgery_time);
  if (!inOperationalHours(surgeryTime)) return FLAG.OUT_OF_HOURS;

  const surgeryAt = combineDateTime(b.surgery_date, b.surgery_time);
  const admissionAt = combineDateTime(b.admission_date, b.admission_time);
  const gapH = surgeryAt && admissionAt
    ? (surgeryAt.getTime() - admissionAt.getTime()) / 3_600_000
    : null;

  const pacAdvice = (b.pac_advice || '').trim();
  const pac = (b.pac_status || '').trim();
  const urgency = (b.urgency || '').trim();
  const noComorb = isOnlyNone(b.comorbidities);
  const noHabits = isOnlyNone(b.habits);
  const reportsPlanned =
    pac === 'Will do with blood reports within last 7 days' ||
    pac === 'Will do with blood reports and imaging reports';
  const noReports = /^Will do without any reports/.test(pac); // tolerant of em-dash vs hyphen

  if (pacAdvice === 'Fit for surgery' && gapH !== null && gapH >= 4) return FLAG.OK;
  if (pacAdvice === 'Provisionally fit for surgery' && gapH !== null && gapH >= 4) return FLAG.PROVISIONAL_OK;

  if (pacAdvice === 'PAC not yet done' && reportsPlanned && noComorb && noHabits && gapH !== null && gapH >= 4)
    return FLAG.MOSTLY_OK;

  if ((pacAdvice === 'PAC not yet done' && noReports && noComorb && noHabits && gapH !== null && gapH < 4) ||
      (pacAdvice === 'Needs further work up (tests only)' && gapH !== null && gapH < 4))
    return FLAG.NEED_4H;

  if (pacAdvice === 'PAC not yet done' && noReports && (!noComorb || !noHabits) && gapH !== null && gapH < 12)
    return FLAG.NEED_12H;

  if ((pacAdvice === 'Needs further work up and specialist consultations' && gapH !== null && gapH < 12) ||
      (pacAdvice === 'Need to discuss with the operating surgeon' && gapH !== null && gapH < 12) ||
      /^Semi-emergency/.test(urgency) || /^Urgent\/Immediate/.test(urgency))
    return FLAG.DISCUSS;

  return '';
}
