/**
 * SPAS — SREWS Config Admin types.
 *
 * Mirrors srews_configs + srews_config_audit DB schema (migration v14).
 * No business logic in this file — just shapes.
 *
 * Per PRD_SPAS_v1 decisions:
 *   #1 Full scope: prompt + rubric weights/thresholds + factor points + keyword lists + override rules
 *   #2 Forward-only re-processing (new config applies to bookings AFTER activation)
 *   #4 Tiered activation warnings based on impact %
 *   #5 Dry-run scope: 11 real cases (synthetic edge cases v2)
 *   #7 Per-case re-assess rate limit: 1/hour + super_admin override
 *   #8 Keep all versions forever
 *
 * v1 LIMITATION (documented for V): override rules are kind+params-editable,
 * NOT arbitrary-predicate-editable. The `kind` field maps to a TS predicate
 * registered in rubric.ts (or its successor); admins tune `params`, `forceTier`,
 * `description`, and `enabled` from the UI. Adding new rule KINDS still requires
 * a deploy. v2 may introduce a small DSL.
 */

import type { RiskTier } from './types';

// ─────────────────────────────────────────────────────────────────────────
// Top-level config
// ─────────────────────────────────────────────────────────────────────────

export type ConfigStatus = 'draft' | 'active' | 'archived';

export interface SrewsConfig {
  id: number;                          // DB BIGSERIAL
  version: string;                     // '1.0', '1.1', '2.0' — must be unique
  status: ConfigStatus;
  system_prompt: string;
  composite_weights: CompositeWeights;
  tier_thresholds: TierThresholds;
  sub_score_cap: number;               // default 10
  divergence_threshold: number;        // default 2.0
  patient_config: PatientConfig;
  procedure_config: ProcedureConfig;
  system_config: SystemConfig;
  override_rules: OverrideRuleConfig[];
  detect_lists: DetectLists;
  changelog: string | null;
  created_by: string | null;
  created_at: string;                  // ISO timestamp
  activated_at: string | null;
  activated_by: string | null;
  archived_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Top-level scoring shape
// ─────────────────────────────────────────────────────────────────────────

export interface CompositeWeights {
  patient: number;
  procedure: number;
  system: number;
}

export interface TierThresholds {
  green_max: number;
  amber_max: number;
  red_max: number;
}

// ─────────────────────────────────────────────────────────────────────────
// A. Patient Risk config
// ─────────────────────────────────────────────────────────────────────────

export interface PatientConfig {
  age_bands: AgeBand[];
  comorbidity_points: Record<string, number>;
  non_standard_comorbidity_points: number;
  habit_points: Record<string, number>;
  transfer_patient_points: number;
  complexity_multiplier_threshold: number;
  complexity_multiplier_points: number;
}

export interface AgeBand {
  min: number | null;
  max: number | null;                  // null = open-ended upper
  points: number;
  label: string;                       // e.g. '<40', '40-64', '65-74', '>=75'
}

// ─────────────────────────────────────────────────────────────────────────
// B. Procedure Risk config
// ─────────────────────────────────────────────────────────────────────────

export interface ProcedureConfig {
  anaesthesia_points: Record<string, number>;
  procedure_tier_points: Record<string, number>;   // MINOR / INTERMEDIATE / MAJOR / COMPLEX
  urgency_points: Record<string, number>;
  laterality_bilateral_points: number;
  special_requirement_points: number;
  infection_points: number;
}

// ─────────────────────────────────────────────────────────────────────────
// C. System Risk config
// ─────────────────────────────────────────────────────────────────────────

export interface SystemConfig {
  pac_status_points: Record<string, number>;
  pac_advice_points: Record<string, number>;
  timing_gap_bands: TimingGapBand[];
  scheduling_flags: SchedulingFlagConfig[];
  info_completeness: {
    blank_clinical_justification_points: number;
    blank_insurance_when_payer_is_insurance_points: number;
    blank_remarks_on_non_elective_points: number;
  };
  transfer_logistics_points: number;
}

export interface TimingGapBand {
  min_hours: number | null;            // null = -Infinity
  max_hours: number | null;            // null = +Infinity
  points: number;
  label: string;
}

export interface SchedulingFlagConfig {
  matches: string[];
  points: number;
  label: string;
}

// ─────────────────────────────────────────────────────────────────────────
// D. Override rules (kind+params model — v1 limitation, see file header)
// ─────────────────────────────────────────────────────────────────────────

export type OverrideRuleKind =
  | 'sub_score_threshold'              // any sub-score >= N → forceTier
  | 'age_and_anaesthesia'              // age >= N AND anaesthesia matches → forceTier
  | 'infection_and_anaesthesia'        // infection keyword AND anaesthesia matches → forceTier
  | 'comorbidity_and_procedure_tier'   // comorbidity keyword AND procedure >= N → forceTier
  | 'urgency_and_pac_pending'          // urgency matches AND pac_status pending → forceTier
  | 'sub_score_exact'                  // any sub-score == N → forceTier (used for max=10 → CRITICAL)
  | 'legal_factor_present';            // any factor with name starting 'Legal:' → forceTier (LEGAL.3)

export interface OverrideRuleConfig {
  id: string;                          // stable id, e.g. 'sub_score_max_5'
  enabled: boolean;
  kind: OverrideRuleKind;
  params: Record<string, unknown>;     // shape depends on kind (see below)
  forceTier: RiskTier;
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Detect lists (keyword detection used by both LLM-fallback + recalc)
// ─────────────────────────────────────────────────────────────────────────

export interface DetectLists {
  comorbidity_detect: DetectGroup[];   // key + matches[]
  habit_detect: DetectGroup[];
  anaesthesia_detect: DetectGroup[];
  procedure_complexity_detect: ProcedureDetectGroup[];   // tier + matches[]
  non_surgical_detect: string[];
  urgency_detect: DetectGroup[];
  special_requirement_detect: string[];
  infection_keywords: string[];
  pac_status_detect: DetectGroup[];
  pac_advice_detect: DetectGroup[];
}

export interface DetectGroup {
  key: string;
  matches: string[];
}

export interface ProcedureDetectGroup {
  tier: 'MINOR' | 'INTERMEDIATE' | 'MAJOR' | 'COMPLEX';
  matches: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────────────────

export type AuditAction =
  | 'created'
  | 'edited'
  | 'activated'
  | 'archived'
  | 'reassessed_case'
  | 'dry_run';

export interface SrewsConfigAuditEntry {
  id: number;
  config_id: number | null;
  action: AuditAction;
  actor: string | null;
  from_version: string | null;
  to_version: string | null;
  diff: unknown;                       // JSONB — shape varies by action
  impact: ActivationImpact | null;     // populated for 'activated' + 'dry_run'
  notes: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Activation impact (used for dry-run + activation safety gate, decision #4)
// ─────────────────────────────────────────────────────────────────────────

export interface ActivationImpact {
  cases_evaluated: number;
  cases_tier_changed: number;
  cases_tier_unchanged: number;
  pct_changed: number;                 // 0-100
  tier_transitions: TierTransition[];
  severity: 'green' | 'yellow' | 'red';  // <25% / 25-50% / >50% per decision #4
  per_case_diffs?: CaseDiff[];         // detailed breakdown shown in UI
}

export interface TierTransition {
  from: RiskTier;
  to: RiskTier;
  count: number;
}

export interface CaseDiff {
  assessment_id: number;
  patient_name: string;
  uhid: string;
  surgery_date: string;
  current: {
    patient: number;
    procedure: number;
    system: number;
    composite: number;
    tier: RiskTier;
  };
  proposed: {
    patient: number;
    procedure: number;
    system: number;
    composite: number;
    tier: RiskTier;
  };
}
