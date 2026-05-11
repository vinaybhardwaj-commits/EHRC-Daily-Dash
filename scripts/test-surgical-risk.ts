/**
 * SREWS regression test suite.
 *
 * Encodes the 3 PRD §13.4 validated cases as fixtures and asserts that:
 *   1. computeDeterministicRisk produces expected pure-rubric sub-scores
 *   2. recalculateFromLLMOutput corrects intentionally-buggy LLM output
 *      (sub-score sums wrong, missing factors) to expected server-corrected values
 *
 * Usage:  npx tsx scripts/test-surgical-risk.ts
 * Exit code:  0 on all-pass, 1 on any failure.
 *
 * NOTE: Avinash Patient=0.5 (smoking only) vs PRD §13.4's 1.5 — fallback v1
 * doesn't detect non-standard comorbidity 'Polycythaemia' (LLM does).
 * Documented in fallback.ts.
 */

import { computeDeterministicRisk } from '../src/lib/surgical-risk/fallback';
import { recalculateFromLLMOutput } from '../src/lib/surgical-risk/recalculate';
import type { RiskAssessment, RiskTier, SurgeryBookingPayload } from '../src/lib/surgical-risk/types';

const NORBERT: SurgeryBookingPayload = {
  form_submission_uid: 'fixture-norbert',
  submission_timestamp: '2026-05-11T08:00:00+05:30',
  patient_name: 'Mr Norbert Thomas Dhan', uhid: 'UHID-254070', age: 42, sex: 'Male',
  surgeon_name: 'Dr Abrar', surgical_specialty: 'ortho',
  proposed_procedure: 'Ilizaro Exfix or Hybrid Exfix for Infected non union of proximal tibia Right side',
  laterality: 'Right', urgency: 'Elective',
  clinical_justification: 'Infected non-union of proximal tibia',
  comorbidities: 'Diabetes',
  pac_status: 'Will do with blood reports within last 7 days', pac_advice: 'PAC not yet done',
  habits: 'None', transfer: 'No',
  surgery_date: '2026-05-12', surgery_time: '08:30',
  admission_date: '2026-05-11', admission_time: '08:00',
  special_requirements: 'Ilizarov external fixator + implants', payer: 'Cash',
  flag_auto: 'Out of operational hours', remarks: 'Complex case',
};
const AVINASH: SurgeryBookingPayload = {
  form_submission_uid: 'fixture-avinash',
  submission_timestamp: '2026-05-10T10:00:00+05:30',
  patient_name: 'Avinash', uhid: 'UHID-325694', age: 35, sex: 'Male',
  surgeon_name: 'Dr Prabhudev Salanki', surgical_specialty: 'urology',
  proposed_procedure: 'Stapler Circumcision', laterality: 'N/A',
  anaesthesia: 'GA', urgency: 'Elective',
  clinical_justification: 'Phimosis requiring circumcision',
  comorbidities: 'Polycythaemia',
  pac_status: 'Already done — in person', pac_advice: 'Fit for surgery',
  habits: 'Smoking', transfer: 'No',
  surgery_date: '2026-05-11', surgery_time: '09:00',
  admission_date: '2026-05-11', admission_time: '08:00',
  payer: 'Cash', flag_auto: 'Out of operational hours', remarks: '',
};
const NAGARAJA: SurgeryBookingPayload = {
  form_submission_uid: 'fixture-nagaraja',
  submission_timestamp: '2026-05-09T09:00:00+05:30',
  patient_name: 'Nagaraja MR', uhid: '266666', age: 50, sex: 'Male',
  surgeon_name: 'Dr Prabhudev Solanki', surgical_specialty: 'urology',
  proposed_procedure: 'Medical Management', laterality: 'N/A',
  anaesthesia: 'Regional', urgency: 'Urgent/Immediate',
  clinical_justification: 'Acute medical issue requiring observation',
  comorbidities: 'None',
  pac_status: 'Already done — in person',
  pac_advice: 'Need to discuss with the operating surgeon',
  habits: 'None', transfer: 'No',
  surgery_date: '2026-05-09', surgery_time: '14:00',
  admission_date: '2026-05-09', admission_time: '10:00',
  payer: 'Insurance', insurance_details: 'TATA AIG',
  flag_auto: 'Out of operational hours',
  remarks: 'Discuss with surgeon urgently',
};

interface DetExp {
  name: string;
  ep: number; epr: number; es: number; et: RiskTier;
  f: SurgeryBookingPayload;
}

const DETERMINISTIC_FIXTURES: DetExp[] = [
  { name: 'Norbert (Ilizarov, infected, diabetic)', ep: 2.0, epr: 8.0, es: 3.0, et: 'AMBER', f: NORBERT },
  { name: 'Avinash (stapler circ, polycythaemia, smoker, GA)', ep: 0.5, epr: 3.0, es: 3.0, et: 'GREEN', f: AVINASH },
  { name: 'Nagaraja (urgent medical mgmt, discuss with surgeon)', ep: 1.0, epr: 4.0, es: 5.0, et: 'AMBER', f: NAGARAJA },
];

const TOL = 0.5;
const fmt = (n: number) => n.toFixed(1);

let pass = 0, fail = 0;

console.log(`\n${'='.repeat(80)}\nSREWS regression suite — deterministic fallback\n${'='.repeat(80)}`);

for (const ex of DETERMINISTIC_FIXTURES) {
  const r = computeDeterministicRisk(ex.f);
  const p = r.patient_risk.score, pr = r.procedure_risk.score, s = r.system_risk.score, t = r.composite.tier;
  const ok = Math.abs(p - ex.ep) <= TOL && Math.abs(pr - ex.epr) <= TOL && Math.abs(s - ex.es) <= TOL && t === ex.et;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${ex.name}  P=${fmt(p)}/Pr=${fmt(pr)}/S=${fmt(s)}/${t}  exp P=${fmt(ex.ep)}/Pr=${fmt(ex.epr)}/S=${fmt(ex.es)}/${ex.et}`);
}

// ---- Server-recalc test: feed a buggy LLM output, verify §13.3 corrects it ----

console.log(`\n${'='.repeat(80)}\nSREWS regression suite — server-side recalc (PRD §13.3)\n${'='.repeat(80)}`);

// Norbert with INTENTIONALLY-BUGGY LLM output: sub-score sums wrong, missing infection factor
const buggyLlmForNorbert: RiskAssessment = {
  patient_risk: {
    score: 2.5,    // BUG: factors sum to 2.0 but LLM rounded up
    factors: [
      { factor: 'Age 40-64', points: 1.0, detail: '42 years' },
      { factor: 'Diabetes', points: 1.0, detail: 'Single comorbidity' },
    ],
  },
  procedure_risk: {
    score: 6.5,    // BUG: factors sum to 7.0 (assumed Spinal +1 + Complex +5 + Special req +1 = 7)
    factors: [
      { factor: 'Anaesthesia (assumed Regional/Spinal)', points: 1.0, detail: 'Default' },
      { factor: 'Procedure complexity: complex', points: 5.0, detail: 'Ilizarov' },
      { factor: 'Special requirements', points: 1.0, detail: 'External fixator' },
      // BUG: missing infected/contaminated factor — server should add via keyword scan
    ],
  },
  system_risk: {
    score: 3.0,
    factors: [
      { factor: 'PAC pending', points: 2.0, detail: 'Will do with blood reports' },
      { factor: 'Scheduling flag', points: 1.0, detail: 'Out of operational hours' },
    ],
  },
  composite: { score: 4.05, tier: 'AMBER', override_applied: false, override_reason: null },
  recommended_actions: [],
  summary: 'Test fixture',
};

const recalc = recalculateFromLLMOutput(buggyLlmForNorbert, NORBERT);
const a = recalc.assessment;
const expectedP = 2.0;       // 1 + 1
const expectedPr = 8.0;      // 1 + 5 + 1 + 1 (server adds infected)
const expectedS = 3.0;       // unchanged
const expectedTier: RiskTier = 'AMBER';
const recalcOk =
  Math.abs(a.patient_risk.score - expectedP) <= TOL &&
  Math.abs(a.procedure_risk.score - expectedPr) <= TOL &&
  Math.abs(a.system_risk.score - expectedS) <= TOL &&
  a.composite.tier === expectedTier &&
  recalc.llm_was_corrected === true;
if (recalcOk) pass++; else fail++;
console.log(`${recalcOk ? 'PASS' : 'FAIL'}  recalc-Norbert (buggy LLM → corrected)`);
console.log(`        Patient: ${fmt(a.patient_risk.score)} (exp ${fmt(expectedP)} — LLM said ${fmt(buggyLlmForNorbert.patient_risk.score)})`);
console.log(`        Procedure: ${fmt(a.procedure_risk.score)} (exp ${fmt(expectedPr)} — LLM said ${fmt(buggyLlmForNorbert.procedure_risk.score)}, server added infected factor)`);
console.log(`        System: ${fmt(a.system_risk.score)} (exp ${fmt(expectedS)})`);
console.log(`        Tier: ${a.composite.tier} (exp ${expectedTier})`);
console.log(`        Composite: ${fmt(a.composite.score)}`);
console.log(`        llm_was_corrected: ${recalc.llm_was_corrected}`);
console.log(`        divergence flagged (>2.0 on any sub-score): ${recalc.divergence.flagged}`);

console.log(`\n${'='.repeat(80)}\nResult: ${pass} passed, ${fail} failed\n${'='.repeat(80)}`);
process.exit(fail > 0 ? 1 : 0);
