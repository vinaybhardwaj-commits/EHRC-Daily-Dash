/**
 * Parity test for the surgical scheduling flag.
 * Run from the repo root:  npx tsx scripts/test-flag.ts
 * Exits non-zero on any failure (CI-friendly). No test framework needed.
 *
 * Cases cover every branch + the dominant real-world case (blank surgery time
 * → "out of operational hours", which is why that flag fills most Sheet rows).
 */
import { computeFlag, FLAG, type FlagInput, type FlagValue } from '../src/lib/surgical-risk/flag';

const NO_REPORTS = 'Will do without any reports — work up at the hospital planned';
const REPORTS_7D = 'Will do with blood reports within last 7 days';

interface Case { name: string; input: FlagInput; expect: FlagValue; }

const cases: Case[] = [
  {
    name: 'blank surgery time → out of hours (the common real-world row)',
    input: { surgery_time: '', surgery_date: '2026-06-10', admission_date: '2026-06-10', admission_time: '06:00' },
    expect: FLAG.OUT_OF_HOURS,
  },
  {
    name: '21:30 surgery → out of hours',
    input: { surgery_time: '21:30', surgery_date: '2026-06-10', admission_date: '2026-06-10', admission_time: '06:00' },
    expect: FLAG.OUT_OF_HOURS,
  },
  {
    name: 'Fit for surgery + gap ≥ 4h → OK',
    input: { pac_advice: 'Fit for surgery', surgery_date: '2026-06-10', surgery_time: '10:00', admission_date: '2026-06-10', admission_time: '04:00' },
    expect: FLAG.OK,
  },
  {
    name: 'Provisionally fit + gap ≥ 4h → provisional OK',
    input: { pac_advice: 'Provisionally fit for surgery', surgery_date: '2026-06-10', surgery_time: '10:00', admission_date: '2026-06-10', admission_time: '04:00' },
    expect: FLAG.PROVISIONAL_OK,
  },
  {
    name: 'PAC pending + reports planned + clean + gap ≥ 4h → mostly OK',
    input: { pac_advice: 'PAC not yet done', pac_status: REPORTS_7D, comorbidities: 'None', habits: 'None', surgery_date: '2026-06-10', surgery_time: '10:00', admission_date: '2026-06-10', admission_time: '04:00' },
    expect: FLAG.MOSTLY_OK,
  },
  {
    name: 'PAC pending + no reports + clean + gap < 4h → need 4h',
    input: { pac_advice: 'PAC not yet done', pac_status: NO_REPORTS, comorbidities: 'None', habits: 'None', surgery_date: '2026-06-10', surgery_time: '10:00', admission_date: '2026-06-10', admission_time: '08:00' },
    expect: FLAG.NEED_4H,
  },
  {
    name: 'Needs tests only + gap < 4h → need 4h',
    input: { pac_advice: 'Needs further work up (tests only)', surgery_date: '2026-06-10', surgery_time: '10:00', admission_date: '2026-06-10', admission_time: '08:00' },
    expect: FLAG.NEED_4H,
  },
  {
    name: 'PAC pending + no reports + comorbidity + gap < 12h → need 12h',
    input: { pac_advice: 'PAC not yet done', pac_status: NO_REPORTS, comorbidities: 'Diabetes', habits: 'None', surgery_date: '2026-06-10', surgery_time: '10:00', admission_date: '2026-06-10', admission_time: '02:00' },
    expect: FLAG.NEED_12H,
  },
  {
    name: 'Needs specialist work-up + gap < 12h → discuss',
    input: { pac_advice: 'Needs further work up and specialist consultations', surgery_date: '2026-06-10', surgery_time: '10:00', admission_date: '2026-06-10', admission_time: '04:00' },
    expect: FLAG.DISCUSS,
  },
  {
    name: 'Semi-emergency (in hours) → discuss',
    input: { urgency: 'Semi-emergency (Surgery needed within 24 hrs, patient hemodynamically stable)', pac_advice: 'PAC not yet done', pac_status: NO_REPORTS, comorbidities: 'None', habits: 'None', surgery_date: '2026-06-10', surgery_time: '10:00', admission_date: '2026-06-10', admission_time: '04:00' },
    expect: FLAG.DISCUSS,
  },
  {
    name: 'In hours, PAC pending, no reports, clean, gap ≥ 4h, elective → no flag',
    input: { urgency: 'Elective (Planned surgery)', pac_advice: 'PAC not yet done', pac_status: NO_REPORTS, comorbidities: 'None', habits: 'None', surgery_date: '2026-06-10', surgery_time: '10:00', admission_date: '2026-06-10', admission_time: '04:00' },
    expect: '',
  },
];

let failed = 0;
for (const c of cases) {
  const got = computeFlag(c.input);
  const ok = got === c.expect;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`);
  if (!ok) {
    console.log(`        expected: ${JSON.stringify(c.expect)}`);
    console.log(`        got:      ${JSON.stringify(got)}`);
  }
}

console.log(`\n${cases.length - failed}/${cases.length} passed.`);
if (failed > 0) process.exit(1);
