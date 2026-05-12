/**
 * Surgical Risk Rubric — v1.0 hard-coded configuration.
 *
 * Per PRD v2 decision #11: rubric weights + override rules + procedure tier
 * keyword lists live in TypeScript (NOT in DB). Changes go through code review +
 * deploy. Manual deploy is ~30s.
 *
 * THIS IS THE SOURCE OF TRUTH for rubric values used by:
 *   - prompt.ts (composes the system prompt sent to Qwen)
 *   - fallback.ts (computeDeterministicRisk — same arithmetic, no LLM)
 *   - recalculate.ts (server-side §13.3 enforcement on LLM output)
 *
 * If you tune weights/thresholds, you change THIS file. Do not duplicate values
 * in the other three files; import from here.
 */

import type { RiskTier, SurgicalRiskRubric } from './types';

export const RUBRIC_VERSION = '1.0';

// ---- Composite weights (decision #16 — accept 40/35/25 for v1) ----

export const COMPOSITE_WEIGHTS = {
  patient: 0.40,
  procedure: 0.35,
  system: 0.25,
} as const;

// ---- Tier thresholds (composite-score → tier) ----

export const TIER_THRESHOLDS = {
  green_max: 2.5,    // composite < 2.5  → GREEN
  amber_max: 5.0,    // 2.5 <= composite < 5.0  → AMBER
  red_max: 7.5,      // 5.0 <= composite < 7.5  → RED
  // composite >= 7.5 → CRITICAL
} as const;

export function tierForComposite(composite: number): RiskTier {
  if (composite < TIER_THRESHOLDS.green_max) return 'GREEN';
  if (composite < TIER_THRESHOLDS.amber_max) return 'AMBER';
  if (composite < TIER_THRESHOLDS.red_max) return 'RED';
  return 'CRITICAL';
}

// ---- A. Patient Risk ----

export const AGE_POINTS = (age: number | null | undefined): { points: number; band: string } => {
  if (age === null || age === undefined || !Number.isFinite(age)) return { points: 0, band: 'unknown' };
  if (age < 40) return { points: 0, band: '<40' };
  if (age < 65) return { points: 1, band: '40-64' };
  if (age < 75) return { points: 2, band: '65-74' };
  return { points: 3, band: '>=75' };
};

/**
 * Standard comorbidity → points map.
 * NOTE: Hypertension + Diabetes BOTH present → use HTN_DM_TOGETHER (1.5),
 * NOT HYPERTENSION (1.0) + DIABETES (1.0). The synergy rule is enforced in
 * applyComorbidities() below.
 */
export const COMORBIDITY_POINTS: Record<string, number> = {
  HYPOTHYROID: 0.5,
  HYPERTENSION: 1.0,
  DIABETES: 1.0,
  HTN_DM_TOGETHER: 1.5,        // Used instead of HYPERTENSION + DIABETES separately.
  RESPIRATORY_DISEASE: 1.5,
  OBESITY_BMI_35: 1.5,
  HEART_DISEASE: 2.0,
  KIDNEY_IMPAIRMENT: 2.0,
  BLOOD_THINNERS: 2.5,
  MI_STROKE_PAST_YEAR: 2.5,
  ANGIOPLASTY_CABG_PAST_YEAR: 2.5,
  ACTIVE_INFECTION: 3.0,
};

export const NON_STANDARD_COMORBIDITY_POINTS = 1.0;

/**
 * Match comorbidity string fragments (case-insensitive) → standard key.
 * Each entry: list of substrings that, when present in the comorbidities text,
 * indicate that condition.
 */
export const COMORBIDITY_DETECT: Array<{ key: string; matches: string[] }> = [
  { key: 'ACTIVE_INFECTION', matches: ['active infection', 'fever > 100', 'fever >100'] },
  { key: 'ANGIOPLASTY_CABG_PAST_YEAR', matches: ['angioplasty', 'cabg'] },
  { key: 'MI_STROKE_PAST_YEAR', matches: ['mi/stroke past year', 'mi past year', 'stroke past year', 'mi or stroke'] },
  { key: 'BLOOD_THINNERS', matches: ['blood thinner', 'anti coagulant', 'anticoagulant', 'anti platelet', 'antiplatelet'] },
  { key: 'KIDNEY_IMPAIRMENT', matches: ['kidney'] },
  { key: 'HEART_DISEASE', matches: ['heart disease'] },
  { key: 'OBESITY_BMI_35', matches: ['obesity', 'bmi>35', 'bmi > 35'] },
  { key: 'RESPIRATORY_DISEASE', matches: ['respiratory'] },
  { key: 'HYPERTENSION', matches: ['hypertension'] },
  { key: 'DIABETES', matches: ['diabetes'] },
  { key: 'HYPOTHYROID', matches: ['hypothyroid'] },
];

// ---- Habits ----

export const HABIT_POINTS: Record<string, number> = {
  SMOKING: 0.5,
  ALCOHOL: 0.5,
  RECREATIONAL_DRUGS: 1.0,
};

export const HABIT_DETECT: Array<{ key: string; matches: string[] }> = [
  { key: 'RECREATIONAL_DRUGS', matches: ['recreational drug', 'recreational'] },
  { key: 'SMOKING', matches: ['smok'] },
  { key: 'ALCOHOL', matches: ['alcohol'] },
];

// ---- Patient special modifiers ----

export const TRANSFER_PATIENT_POINTS = 1.0;
export const COMPLEXITY_MULTIPLIER_THRESHOLD = 3;
export const COMPLEXITY_MULTIPLIER_POINTS = 0.5;

// ---- B. Procedure Risk ----

export const ANAESTHESIA_POINTS: Record<string, number> = {
  LOCAL: 0,
  REGIONAL_OR_SPINAL: 1,    // Default if unspecified per PRD §13.2 v2 fix #6.
  GA: 2,
};

export const ANAESTHESIA_DETECT: Array<{ key: string; matches: string[] }> = [
  { key: 'GA', matches: ['general anaesth', 'general anesth', 'g a', 'ga ', 'ga,', '(ga)'] },
  { key: 'REGIONAL_OR_SPINAL', matches: ['spinal', 'regional', 'epidural', 'block'] },
  { key: 'LOCAL', matches: ['local anaesth', 'local anesth', 'local infiltration'] },
];

// Procedure complexity classification — keyword lists per tier (PRD §13.2).

export const PROCEDURE_TIERS = {
  MINOR: 0,
  INTERMEDIATE: 1,
  MAJOR: 3,
  COMPLEX: 5,
} as const;

export const PROCEDURE_COMPLEXITY_DETECT: Array<{ tier: keyof typeof PROCEDURE_TIERS; matches: string[] }> = [
  // Detection runs in this order; FIRST match wins. List COMPLEX first so a
  // procedure mentioning "TKR for fracture" doesn't get downgraded to MAJOR.
  {
    tier: 'COMPLEX',
    matches: [
      'tkr', 'total knee', 'thr', 'total hip', 'spinal fusion', 'multi-level spine',
      'multilevel spine', 'ilizarov', 'ilizaro', 'external fixat', 'external fixation',
      'exfix', 'hybrid exfix', 'pelvic surgery',
      'radical prostatectomy', 'whipple', 'colectomy', 'bowel resection',
      'cabg', 'valve replace', 'craniotomy', 'reconstructive surgery',
      'multi-organ', 'multiorgan',
    ],
  },
  {
    tier: 'MAJOR',
    matches: [
      'lap chole', 'laparoscopic chole', 'lap appendi', 'laparoscopic appendi',
      'lap hernia', 'laparoscopic hernia', 'hysterectomy', 'turp',
      'ureteroscopy', 'lithotripsy', 'septoplasty', 'tonsillectomy',
      'thyroidectomy', 'mastectomy', 'orif', 'open reduction internal',
      'spine decompression', 'laser hemorrhoidopexy', 'sphincterotomy',
      'pilonidal', 'pilonidal flap',
    ],
  },
  {
    tier: 'INTERMEDIATE',
    matches: [
      'stapler circumcision', 'circumcision', 'lipoma', 'hernia repair',
      'open hernia', 'endoscopy', 'colonoscopy', 'cataract', 'd&c', 'd & c',
      'eua', 'examination under anaesth', 'examination under anesth',
      'minor hardware removal', 'hardware removal',
    ],
  },
  {
    tier: 'MINOR',
    matches: [
      'biopsy', 'biopsies', 'wound debridement', 'i&d', 'incision and drainage',
      'simple excision', 'cyst removal', 'foreign body removal', 'suturing',
    ],
  },
];

/**
 * Procedure-text patterns that indicate this is NOT actually a surgical case
 * (per v2 prompt fix #4). When matched, procedure complexity points = 0.
 */
export const NON_SURGICAL_DETECT: string[] = [
  'medical management', 'observation', 'conservative management', 'investigation',
  'medical admission', 'no surgery',
];

// ---- Urgency ----

export const URGENCY_POINTS: Record<string, number> = {
  ELECTIVE: 0,
  SEMI_EMERGENCY: 1,
  URGENT_IMMEDIATE: 3,
};

export const URGENCY_DETECT: Array<{ key: string; matches: string[] }> = [
  { key: 'URGENT_IMMEDIATE', matches: ['urgent', 'immediate', 'acute threat', 'within hours'] },
  { key: 'SEMI_EMERGENCY', matches: ['semi-emergency', 'semi emergency', 'within 24', 'within 24h'] },
  { key: 'ELECTIVE', matches: ['elective', 'planned'] },
];

// ---- Laterality ----

export const LATERALITY_BILATERAL_POINTS = 0.5;

// ---- Special requirements + infection keywords ----

export const SPECIAL_REQUIREMENT_POINTS = 1;

export const SPECIAL_REQUIREMENT_DETECT: string[] = [
  'implant', 'prosthetic', 'external fixator', 'specialised equipment',
  'specialized equipment', 'fixator',
];

export const INFECTION_POINTS = 1;

export const INFECTION_KEYWORDS: string[] = [
  'infected', 'abscess', 'septic', 'contaminated', 'non-union', 'nonunion',
  'osteomyelitis', 'necrotising', 'necrotizing', 'perforation', 'peritonitis',
  'gangrene',
];

// ---- C. System Risk ----

export const PAC_STATUS_POINTS: Record<string, number> = {
  DONE_VIDEO_OR_INPERSON: 0,
  WILL_DO_WITH_BLOOD_REPORTS: 2,
  WILL_DO_WITH_REPORTS_AND_IMAGING: 2,
  WILL_DO_WITHOUT_ANY_REPORTS: 3,
};

export const PAC_STATUS_DETECT: Array<{ key: string; matches: string[] }> = [
  { key: 'WILL_DO_WITHOUT_ANY_REPORTS', matches: ['without any reports', 'work up at hospital', 'without reports'] },
  { key: 'WILL_DO_WITH_REPORTS_AND_IMAGING', matches: ['imaging reports', 'with imaging'] },
  { key: 'WILL_DO_WITH_BLOOD_REPORTS', matches: ['blood reports', 'will do with', 'with blood'] },
  { key: 'DONE_VIDEO_OR_INPERSON', matches: ['already done', 'in person', 'in-person', 'video consultation'] },
];

export const PAC_ADVICE_POINTS: Record<string, number> = {
  FIT: 0,
  PROVISIONALLY_FIT: 1,
  NEEDS_WORK_UP_TESTS_ONLY: 2,
  NEEDS_WORK_UP_AND_SPECIALIST_CONSULTS: 3,
  NEED_TO_DISCUSS_WITH_SURGEON: 3,
  PAC_NOT_YET_DONE: 0,
};

export const PAC_ADVICE_DETECT: Array<{ key: string; matches: string[] }> = [
  { key: 'NEED_TO_DISCUSS_WITH_SURGEON', matches: ['discuss with the operating surgeon', 'discuss with surgeon', 'discuss with the surgeon'] },
  { key: 'NEEDS_WORK_UP_AND_SPECIALIST_CONSULTS', matches: ['specialist consult', 'work up and specialist'] },
  { key: 'NEEDS_WORK_UP_TESTS_ONLY', matches: ['needs further work up', 'needs work up', 'tests only'] },
  { key: 'PROVISIONALLY_FIT', matches: ['provisionally fit'] },
  { key: 'FIT', matches: ['fit for surgery', ' fit', 'fit '] },
  { key: 'PAC_NOT_YET_DONE', matches: ['pac not yet done', 'not yet done'] },
];

// ---- Booking timing ----

export const TIMING_GAP_POINTS = (gapHours: number | null): { points: number; band: string } => {
  if (gapHours === null || !Number.isFinite(gapHours)) return { points: 3, band: 'unclear / same-day no time' };
  if (gapHours >= 12) return { points: 0, band: '>=12h' };
  if (gapHours >= 4) return { points: 1, band: '4-12h' };
  if (gapHours > 0) return { points: 2, band: '<4h' };
  return { points: 3, band: 'same-day or negative' };
};

// ---- Scheduling flag ----

export const SCHEDULING_FLAG_DETECT: Array<{ matches: string[]; points: number; label: string }> = [
  { matches: ['anaesthetist + facility head need to discuss', 'anaesthetist and facility head'], points: 2, label: 'Anaesthetist+facility-head discussion needed' },
  { matches: ['out of operational hours'], points: 1, label: 'Out of operational hours' },
  { matches: ['more time', 'at least 4 working hours', 'at least 12 working hours'], points: 1, label: 'Insufficient working-hours buffer' },
];

// ---- Information completeness ----

export const INFO_COMPLETENESS = {
  blank_clinical_justification_points: 1,        // <5 chars OR "NA"
  blank_insurance_when_payer_is_insurance_points: 1,
  blank_remarks_on_non_elective_points: 0.5,
} as const;

// ---- Transfer logistics ----

export const TRANSFER_LOGISTICS_POINTS = 1;        // Transfer=Yes AND blank Referring Hospital

// ---- Caps ----

export const SUB_SCORE_CAP = 10;

// ---- D. Override rules (decision #17 — accept 6 PRD rules) ----

import type { OverrideRule } from './types';

export const OVERRIDE_RULES: OverrideRule[] = [
  {
    id: 'sub_score_max_5',
    description: 'Any single sub-score >= 5 forces minimum tier of AMBER',
    appliesIf: (_form, subs) => Math.max(subs.patient, subs.procedure, subs.system) >= 5,
    forceTier: 'AMBER',
  },
  {
    id: 'age_75_with_ga',
    description: 'Patient age >= 75 with GA forces RED',
    appliesIf: (form) => Number(form.age || 0) >= 75 && /\bg\s*a\b|general anaesth|general anesth/i.test(String(form.anaesthesia || '')),
    forceTier: 'RED',
  },
  {
    id: 'infection_with_ga',
    description: 'Active infection (per keyword scan) with GA forces RED',
    appliesIf: (form, _subs, hasInfection) => hasInfection && /\bg\s*a\b|general anaesth|general anesth/i.test(String(form.anaesthesia || '')),
    forceTier: 'RED',
  },
  {
    id: 'blood_thinners_with_major_complex',
    description: 'Blood thinners present with Major or Complex procedure forces RED',
    appliesIf: (form, subs) => /blood thinner|anti coag|anticoag|anti platelet|antiplatelet/i.test(String(form.comorbidities || '')) && subs.procedure >= 3,
    forceTier: 'RED',
  },
  {
    id: 'urgent_with_pac_pending',
    description: 'Urgent/Immediate urgency with PAC not yet done forces CRITICAL',
    appliesIf: (form) => /urgent|immediate/i.test(String(form.urgency || '')) && /will do/i.test(String(form.pac_status || '')),
    forceTier: 'CRITICAL',
  },
  {
    id: 'sub_score_max_10',
    description: 'Any single sub-score at maximum (10) forces CRITICAL',
    appliesIf: (_form, subs) => Math.max(subs.patient, subs.procedure, subs.system) === 10,
    forceTier: 'CRITICAL',
  },
];

// ---- Tier ordering helper (used by override rule application) ----

const TIER_ORDER: Record<RiskTier, number> = { GREEN: 0, AMBER: 1, RED: 2, CRITICAL: 3 };

export function maxTier(a: RiskTier, b: RiskTier): RiskTier {
  return TIER_ORDER[a] >= TIER_ORDER[b] ? a : b;
}

// ---- Bundled rubric for prompt + recalculate consumption ----

export const SURGICAL_RISK_RUBRIC: SurgicalRiskRubric = {
  version: RUBRIC_VERSION,
  weights: COMPOSITE_WEIGHTS,
  overrideRules: OVERRIDE_RULES,
};
