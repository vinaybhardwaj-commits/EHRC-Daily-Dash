/**
 * SPAS.5 — Runtime rubric builder + scoring helpers.
 *
 * The key abstraction that lets `fallback.ts` + `recalculate.ts` source their
 * scoring values from the DB-stored active config OR from the hardcoded
 * rubric.ts constants (when no active config exists).
 *
 * Architecture:
 *   /api/surgical-risk/assess + /api/surgical-risk/[id]/reassess fetch the
 *   active config via getActiveConfig() → buildRuntimeRubric(cfg) → pass
 *   into computeDeterministicRisk + recalculateFromLLMOutput.
 *
 * When buildRuntimeRubric receives null, it constructs a runtime rubric from
 * the hardcoded constants in rubric.ts (the SPAS.0 seed values) — the system
 * never breaks on admin-DB outages or missing-active-config edge cases.
 *
 * Override rules: stored in DB as kind+params shape. This file defines the
 * predicate registry (OVERRIDE_PREDICATES) that maps each OverrideRuleKind to
 * a runtime function. Adding a new rule KIND is a 2-step code change:
 *   1. Add the enum value in config-types.ts
 *   2. Add the predicate entry in OVERRIDE_PREDICATES below
 *
 * v2 may introduce a small DSL to author predicates from the admin UI.
 */

import type {
  RiskTier,
  SurgeryBookingPayload,
} from './types';
import type {
  SrewsConfig,
  OverrideRuleConfig,
  OverrideRuleKind,
  AgeBand,
  TimingGapBand,
  SchedulingFlagConfig,
  DetectGroup,
  ProcedureDetectGroup,
} from './config-types';
import {
  AGE_POINTS,                          // <-- function form; reused for fallback build
  ANAESTHESIA_DETECT,
  ANAESTHESIA_POINTS,
  COMORBIDITY_DETECT,
  COMORBIDITY_POINTS,
  COMPLEXITY_MULTIPLIER_POINTS,
  COMPLEXITY_MULTIPLIER_THRESHOLD,
  COMPOSITE_WEIGHTS,
  HABIT_DETECT,
  HABIT_POINTS,
  INFECTION_KEYWORDS,
  INFECTION_POINTS,
  INFO_COMPLETENESS,
  LATERALITY_BILATERAL_POINTS,
  NON_STANDARD_COMORBIDITY_POINTS,
  NON_SURGICAL_DETECT,
  PAC_ADVICE_DETECT,
  PAC_ADVICE_POINTS,
  PAC_STATUS_DETECT,
  PAC_STATUS_POINTS,
  PROCEDURE_COMPLEXITY_DETECT,
  PROCEDURE_TIERS,
  SCHEDULING_FLAG_DETECT,
  SPECIAL_REQUIREMENT_DETECT,
  SPECIAL_REQUIREMENT_POINTS,
  SUB_SCORE_CAP,
  TIER_THRESHOLDS,
  TIMING_GAP_POINTS,                   // <-- function form
  TRANSFER_LOGISTICS_POINTS,
  TRANSFER_PATIENT_POINTS,
  URGENCY_DETECT,
  URGENCY_POINTS,
} from './rubric';

// ─────────────────────────────────────────────────────────────────────────
// RuntimeRubric — the flattened, scoring-ready view of an active config.
// ─────────────────────────────────────────────────────────────────────────

export interface RuntimeRubric {
  version: string;

  // Composite + tiers
  composite_weights: { patient: number; procedure: number; system: number };
  tier_thresholds: { green_max: number; amber_max: number; red_max: number };
  sub_score_cap: number;

  // Patient
  age_bands: AgeBand[];
  comorbidity_points: Record<string, number>;
  comorbidity_detect: DetectGroup[];
  non_standard_comorbidity_points: number;
  habit_points: Record<string, number>;
  habit_detect: DetectGroup[];
  transfer_patient_points: number;
  complexity_multiplier_threshold: number;
  complexity_multiplier_points: number;

  // Procedure
  anaesthesia_points: Record<string, number>;
  anaesthesia_detect: DetectGroup[];
  procedure_tier_points: Record<string, number>;
  procedure_complexity_detect: ProcedureDetectGroup[];
  non_surgical_detect: string[];
  urgency_points: Record<string, number>;
  urgency_detect: DetectGroup[];
  laterality_bilateral_points: number;
  special_requirement_points: number;
  special_requirement_detect: string[];
  infection_points: number;
  infection_keywords: string[];

  // System
  pac_status_points: Record<string, number>;
  pac_status_detect: DetectGroup[];
  pac_advice_points: Record<string, number>;
  pac_advice_detect: DetectGroup[];
  timing_gap_bands: TimingGapBand[];
  scheduling_flags: SchedulingFlagConfig[];
  info_completeness: {
    blank_clinical_justification_points: number;
    blank_insurance_when_payer_is_insurance_points: number;
    blank_remarks_on_non_elective_points: number;
  };
  transfer_logistics_points: number;

  // Overrides
  override_rules: OverrideRuleConfig[];

  // LEGAL.3 — Legal/Regulatory keyword detect (optional; may be absent in older configs)
  legal_risk_detect?: LegalRiskCategory[];
}

export interface LegalRiskCategory {
  category: string;
  label: string;
  matches: string[];
  points: number;
}

// ─────────────────────────────────────────────────────────────────────────
// buildRuntimeRubric — single entry. Returns a fully-typed RuntimeRubric
// regardless of whether the source is a DB config or the hardcoded fallback.
// ─────────────────────────────────────────────────────────────────────────

export function buildRuntimeRubric(cfg: SrewsConfig | null): RuntimeRubric {
  if (cfg) {
    return {
      version: cfg.version,
      composite_weights: cfg.composite_weights,
      tier_thresholds: cfg.tier_thresholds,
      sub_score_cap: Number(cfg.sub_score_cap),

      age_bands: cfg.patient_config.age_bands,
      comorbidity_points: cfg.patient_config.comorbidity_points,
      comorbidity_detect: cfg.detect_lists.comorbidity_detect,
      non_standard_comorbidity_points: cfg.patient_config.non_standard_comorbidity_points,
      habit_points: cfg.patient_config.habit_points,
      habit_detect: cfg.detect_lists.habit_detect,
      transfer_patient_points: cfg.patient_config.transfer_patient_points,
      complexity_multiplier_threshold: cfg.patient_config.complexity_multiplier_threshold,
      complexity_multiplier_points: cfg.patient_config.complexity_multiplier_points,

      anaesthesia_points: cfg.procedure_config.anaesthesia_points,
      anaesthesia_detect: cfg.detect_lists.anaesthesia_detect,
      procedure_tier_points: cfg.procedure_config.procedure_tier_points,
      procedure_complexity_detect: cfg.detect_lists.procedure_complexity_detect,
      non_surgical_detect: cfg.detect_lists.non_surgical_detect,
      urgency_points: cfg.procedure_config.urgency_points,
      urgency_detect: cfg.detect_lists.urgency_detect,
      laterality_bilateral_points: cfg.procedure_config.laterality_bilateral_points,
      special_requirement_points: cfg.procedure_config.special_requirement_points,
      special_requirement_detect: cfg.detect_lists.special_requirement_detect,
      infection_points: cfg.procedure_config.infection_points,
      infection_keywords: cfg.detect_lists.infection_keywords,

      pac_status_points: cfg.system_config.pac_status_points,
      pac_status_detect: cfg.detect_lists.pac_status_detect,
      pac_advice_points: cfg.system_config.pac_advice_points,
      pac_advice_detect: cfg.detect_lists.pac_advice_detect,
      timing_gap_bands: cfg.system_config.timing_gap_bands,
      scheduling_flags: cfg.system_config.scheduling_flags,
      info_completeness: cfg.system_config.info_completeness,
      transfer_logistics_points: cfg.system_config.transfer_logistics_points,

      override_rules: cfg.override_rules,
      legal_risk_detect: (cfg.detect_lists as unknown as { legal_risk_detect?: LegalRiskCategory[] }).legal_risk_detect || [],
    };
  }

  // Hardcoded fallback path (used when DB unavailable / no active config).
  return {
    version: '1.0-hardcoded-fallback',
    composite_weights: { patient: COMPOSITE_WEIGHTS.patient, procedure: COMPOSITE_WEIGHTS.procedure, system: COMPOSITE_WEIGHTS.system },
    tier_thresholds: { green_max: TIER_THRESHOLDS.green_max, amber_max: TIER_THRESHOLDS.amber_max, red_max: TIER_THRESHOLDS.red_max },
    sub_score_cap: SUB_SCORE_CAP,

    age_bands: [
      { min: null, max: 39, points: 0, label: '<40' },
      { min: 40,   max: 64, points: 1, label: '40-64' },
      { min: 65,   max: 74, points: 2, label: '65-74' },
      { min: 75,   max: null, points: 3, label: '>=75' },
    ],
    comorbidity_points: COMORBIDITY_POINTS,
    comorbidity_detect: COMORBIDITY_DETECT,
    non_standard_comorbidity_points: NON_STANDARD_COMORBIDITY_POINTS,
    habit_points: HABIT_POINTS,
    habit_detect: HABIT_DETECT,
    transfer_patient_points: TRANSFER_PATIENT_POINTS,
    complexity_multiplier_threshold: COMPLEXITY_MULTIPLIER_THRESHOLD,
    complexity_multiplier_points: COMPLEXITY_MULTIPLIER_POINTS,

    anaesthesia_points: ANAESTHESIA_POINTS,
    anaesthesia_detect: ANAESTHESIA_DETECT,
    procedure_tier_points: PROCEDURE_TIERS,
    procedure_complexity_detect: PROCEDURE_COMPLEXITY_DETECT,
    non_surgical_detect: NON_SURGICAL_DETECT,
    urgency_points: URGENCY_POINTS,
    urgency_detect: URGENCY_DETECT,
    laterality_bilateral_points: LATERALITY_BILATERAL_POINTS,
    special_requirement_points: SPECIAL_REQUIREMENT_POINTS,
    special_requirement_detect: SPECIAL_REQUIREMENT_DETECT,
    infection_points: INFECTION_POINTS,
    infection_keywords: INFECTION_KEYWORDS,

    pac_status_points: PAC_STATUS_POINTS,
    pac_status_detect: PAC_STATUS_DETECT,
    pac_advice_points: PAC_ADVICE_POINTS,
    pac_advice_detect: PAC_ADVICE_DETECT,
    timing_gap_bands: [
      { min_hours: 12, max_hours: null, points: 0, label: '>=12h' },
      { min_hours: 4,  max_hours: 12,   points: 1, label: '4-12h' },
      { min_hours: 0.01, max_hours: 4,  points: 2, label: '<4h' },
      { min_hours: null, max_hours: 0,  points: 3, label: 'same-day or negative / unclear' },
    ],
    scheduling_flags: SCHEDULING_FLAG_DETECT,
    info_completeness: INFO_COMPLETENESS,
    transfer_logistics_points: TRANSFER_LOGISTICS_POINTS,

    // Hardcoded override rules in kind+params shape (mirrors SPAS.0 seed)
    override_rules: HARDCODED_OVERRIDE_RULES,

    // LEGAL.3 — hardcoded fallback has no legal detection; admin must configure in DB
    legal_risk_detect: [],
  };
}

const HARDCODED_OVERRIDE_RULES: OverrideRuleConfig[] = [
  {
    id: 'sub_score_max_5',
    enabled: true,
    kind: 'sub_score_threshold',
    params: { threshold: 5 },
    forceTier: 'AMBER',
    description: 'Any single sub-score >= 5 forces minimum tier of AMBER',
  },
  {
    id: 'age_75_with_ga',
    enabled: true,
    kind: 'age_and_anaesthesia',
    params: { min_age: 75, anaesthesia_pattern: '\\bg\\s*a\\b|general anaesth|general anesth' },
    forceTier: 'RED',
    description: 'Patient age >= 75 with GA forces RED',
  },
  {
    id: 'infection_with_ga',
    enabled: true,
    kind: 'infection_and_anaesthesia',
    params: { anaesthesia_pattern: '\\bg\\s*a\\b|general anaesth|general anesth' },
    forceTier: 'RED',
    description: 'Active infection (per keyword scan) with GA forces RED',
  },
  {
    id: 'blood_thinners_with_major_complex',
    enabled: true,
    kind: 'comorbidity_and_procedure_tier',
    params: { comorbidity_pattern: 'blood thinner|anti coag|anticoag|anti platelet|antiplatelet', min_procedure_score: 3 },
    forceTier: 'RED',
    description: 'Blood thinners present with Major or Complex procedure forces RED',
  },
  {
    id: 'urgent_with_pac_pending',
    enabled: true,
    kind: 'urgency_and_pac_pending',
    params: { urgency_pattern: 'urgent|immediate', pac_status_pending_pattern: 'will do' },
    forceTier: 'CRITICAL',
    description: 'Urgent/Immediate urgency with PAC not yet done forces CRITICAL',
  },
  {
    id: 'sub_score_max_10',
    enabled: true,
    kind: 'sub_score_exact',
    params: { value: 10 },
    forceTier: 'CRITICAL',
    description: 'Any single sub-score at maximum (10) forces CRITICAL',
  },
  {
    id: 'legal_factor_present',
    enabled: true,
    kind: 'legal_factor_present',
    params: {},
    forceTier: 'RED',
    description: 'Any legal/regulatory factor (MLC / PNDT / MTP / THOTA / Surrogacy / Sterilization / Minor consent) forces minimum tier of RED',
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Override rule predicate registry — kind → executable predicate
// ─────────────────────────────────────────────────────────────────────────

type SubScoreTriple = { patient: number; procedure: number; system: number };
type OverridePredicate = (
  params: Record<string, unknown>,
  form: SurgeryBookingPayload,
  subs: SubScoreTriple,
  hasInfection: boolean,
  hasLegalFlag: boolean
) => boolean;

const safeRegex = (pattern: unknown): RegExp | null => {
  if (typeof pattern !== 'string' || !pattern) return null;
  try { return new RegExp(pattern, 'i'); } catch { return null; }
};

export const OVERRIDE_PREDICATES: Record<OverrideRuleKind, OverridePredicate> = {
  sub_score_threshold: (params, _form, subs) => {
    const threshold = Number(params.threshold);
    if (!Number.isFinite(threshold)) return false;
    return Math.max(subs.patient, subs.procedure, subs.system) >= threshold;
  },
  age_and_anaesthesia: (params, form) => {
    const minAge = Number(params.min_age);
    const re = safeRegex(params.anaesthesia_pattern);
    if (!Number.isFinite(minAge) || !re) return false;
    const age = Number(form.age || 0);
    return age >= minAge && re.test(String(form.anaesthesia || ''));
  },
  infection_and_anaesthesia: (params, form, _subs, hasInfection) => {
    const re = safeRegex(params.anaesthesia_pattern);
    if (!re) return false;
    return hasInfection && re.test(String(form.anaesthesia || ''));
  },
  comorbidity_and_procedure_tier: (params, form, subs) => {
    const re = safeRegex(params.comorbidity_pattern);
    const min = Number(params.min_procedure_score);
    if (!re || !Number.isFinite(min)) return false;
    return re.test(String(form.comorbidities || '')) && subs.procedure >= min;
  },
  urgency_and_pac_pending: (params, form) => {
    const urgRe = safeRegex(params.urgency_pattern);
    const pacRe = safeRegex(params.pac_status_pending_pattern);
    if (!urgRe || !pacRe) return false;
    return urgRe.test(String(form.urgency || '')) && pacRe.test(String(form.pac_status || ''));
  },
  sub_score_exact: (params, _form, subs) => {
    const value = Number(params.value);
    if (!Number.isFinite(value)) return false;
    return Math.max(subs.patient, subs.procedure, subs.system) === value;
  },
  // LEGAL.3 — fires when any factor in the assessment has name starting 'Legal:'.
  // The presence of the flag is computed during scoring (fallback.ts / recalculate.ts)
  // and threaded through to this predicate via the hasLegalFlag context bit.
  legal_factor_present: (_params, _form, _subs, _hasInfection, hasLegalFlag) => {
    return hasLegalFlag === true;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Tier helpers — read thresholds from rubric
// ─────────────────────────────────────────────────────────────────────────

export function tierForCompositeRuntime(rubric: RuntimeRubric, composite: number): RiskTier {
  if (composite < rubric.tier_thresholds.green_max) return 'GREEN';
  if (composite < rubric.tier_thresholds.amber_max) return 'AMBER';
  if (composite < rubric.tier_thresholds.red_max)   return 'RED';
  return 'CRITICAL';
}

const TIER_ORDER: Record<RiskTier, number> = { GREEN: 0, AMBER: 1, RED: 2, CRITICAL: 3 };
export function maxTier(a: RiskTier, b: RiskTier): RiskTier {
  return TIER_ORDER[a] >= TIER_ORDER[b] ? a : b;
}

// ─────────────────────────────────────────────────────────────────────────
// Functional helpers — read bands/lookups from rubric
// ─────────────────────────────────────────────────────────────────────────

export function ageBandFor(rubric: RuntimeRubric, age: number | null | undefined): { points: number; band: string } {
  if (age === null || age === undefined || !Number.isFinite(age)) return { points: 0, band: 'unknown' };
  for (const band of rubric.age_bands) {
    const minOk = band.min === null || age >= band.min;
    const maxOk = band.max === null || age <= band.max;
    if (minOk && maxOk) return { points: band.points, band: band.label };
  }
  // Fallback to legacy function form if no band matches (shouldn't happen with seed bands)
  return AGE_POINTS(age);
}

export function timingGapFor(rubric: RuntimeRubric, gapHours: number | null): { points: number; band: string } {
  if (gapHours === null || !Number.isFinite(gapHours)) {
    // Use the explicit null-handling band if present, else default to 3 pts
    const nullBand = rubric.timing_gap_bands.find(b => b.min_hours === null && (b.max_hours === null || b.max_hours <= 0));
    if (nullBand) return { points: nullBand.points, band: nullBand.label };
    return { points: 3, band: 'unclear / same-day no time' };
  }
  for (const band of rubric.timing_gap_bands) {
    const minOk = band.min_hours === null || gapHours >= band.min_hours;
    const maxOk = band.max_hours === null || gapHours < band.max_hours;
    if (minOk && maxOk) return { points: band.points, band: band.label };
  }
  return TIMING_GAP_POINTS(gapHours); // legacy fallback
}

// ─────────────────────────────────────────────────────────────────────────
// Override rule evaluation
// ─────────────────────────────────────────────────────────────────────────

export interface OverrideEvalResult {
  applied: OverrideRuleConfig | null;
  tier: RiskTier;
}

export function evaluateOverrideRules(
  rubric: RuntimeRubric,
  form: SurgeryBookingPayload,
  subs: SubScoreTriple,
  hasInfection: boolean,
  initialTier: RiskTier,
  hasLegalFlag: boolean = false
): OverrideEvalResult {
  let tier = initialTier;
  let appliedRule: OverrideRuleConfig | null = null;

  for (const rule of rubric.override_rules) {
    if (!rule.enabled) continue;
    const predicate = OVERRIDE_PREDICATES[rule.kind];
    if (!predicate) {
      // Unknown kind (e.g. a future kind added in DB but no predicate in code).
      // Log and skip — system stays safe.
      console.warn('[runtime-rubric] unknown override rule kind, skipping:', rule.kind);
      continue;
    }
    if (predicate(rule.params, form, subs, hasInfection, hasLegalFlag)) {
      const newTier = maxTier(tier, rule.forceTier);
      if (newTier !== tier) {
        tier = newTier;
        appliedRule = rule;
      } else if (!appliedRule && newTier === rule.forceTier) {
        appliedRule = rule;
      }
    }
  }
  return { applied: appliedRule, tier };
}
