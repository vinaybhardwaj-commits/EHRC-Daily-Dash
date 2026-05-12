/**
 * Surgical Risk Early Warning System — type definitions.
 *
 * SREWS module of EHRC Daily Dash, per PRD v2 (11 May 2026).
 *
 * The LLM (Qwen 2.5 14B via Cloudflare tunnel) produces factor classification;
 * the server enforces all arithmetic (sub-score sums, composite, tier) per
 * PRD §13.3 server-side recalculation spec.
 */

// ---- LLM/Server output schema ----

export interface FactorContribution {
  factor: string;
  points: number;
  detail: string;
}

export interface SubScore {
  score: number;
  factors: FactorContribution[];
}

export type RiskTier = 'GREEN' | 'AMBER' | 'RED' | 'CRITICAL';

export interface RiskAssessment {
  patient_risk: SubScore;
  procedure_risk: SubScore;
  system_risk: SubScore;
  composite: {
    score: number;
    tier: RiskTier;
    override_applied: boolean;
    override_reason: string | null;
  };
  recommended_actions: string[];
  summary: string;
}

// ---- Rubric configuration (hard-coded per decision #11; lives in rubric.ts in SREWS.1) ----

export interface RubricWeight {
  patient: number;     // 0.40 in v1.0
  procedure: number;   // 0.35
  system: number;      // 0.25
}

export interface OverrideRule {
  id: string;
  description: string;
  appliesIf: (formData: SurgeryBookingPayload, subScores: { patient: number; procedure: number; system: number }, hasInfection: boolean) => boolean;
  forceTier: RiskTier;
}

export interface SurgicalRiskRubric {
  version: string;     // '1.0' for v1
  weights: RubricWeight;
  overrideRules: OverrideRule[];
  // Tier thresholds are constants (GREEN<2.5, AMBER<5, RED<7.5, CRITICAL>=7.5),
  // not configurable per decision — they're applied directly in recalc.ts.
}

// ---- Form payload (incoming from Apps Script webhook + time-trigger) ----

/**
 * Surgery booking payload. Comes from Apps Script POSTing form data after
 * the duplicate-column merge (per decision #10). All fields optional except
 * those marked with a non-null type — those are required for the assessment
 * to be valid.
 */
export interface SurgeryBookingPayload {
  // Identity
  form_submission_uid: string;       // Stable hash from Apps Script (decision #8)
  submission_timestamp: string;       // ISO 8601 from Google Form's auto Timestamp
  patient_name: string;
  uhid: string;
  age?: number;
  sex?: string;
  contact?: string;

  // Clinical
  surgeon_name?: string;
  surgical_specialty?: string;
  proposed_procedure?: string;
  laterality?: string;
  anaesthesia?: string;
  urgency?: string;
  clinical_justification?: string;
  comorbidities?: string;
  pac_status?: string;
  pac_advice?: string;
  habits?: string;

  // Logistics
  transfer?: string;
  referring_hospital?: string;
  surgery_date?: string;              // YYYY-MM-DD
  surgery_time?: string;              // HH:MM
  admission_date?: string;            // YYYY-MM-DD
  admission_time?: string;            // HH:MM
  special_requirements?: string;

  // Financial / admin
  payer?: string;
  insurance_details?: string;
  los?: string;
  admission_to?: string;
  billing_bed?: string;
  staying_bed?: string;
  admission_type?: string;
  package_amount?: string | number;
  open_bill?: string;
  advance?: string | number;
  counselled_by?: string;
  admission_done_by?: string;
  prescription_upload?: string;

  // Context
  remarks?: string;
  flag_auto?: string;
}

// ---- DB row shape (matches surgical_risk_assessments table from migration v13) ----

export interface SurgicalRiskAssessmentRow {
  id: number;
  form_submission_uid: string;
  submission_timestamp: string;
  patient_name: string;
  uhid: string;
  age: number | null;
  sex: string | null;
  surgeon_name: string | null;
  surgical_specialty: string | null;
  proposed_procedure: string | null;
  surgery_date: string | null;
  surgery_datetime: string | null;
  admission_date: string | null;
  admission_datetime: string | null;
  patient_risk_score: number;
  procedure_risk_score: number;
  system_risk_score: number;
  composite_risk_score: number;
  risk_tier: RiskTier;
  assessment_json: RiskAssessment;
  llm_model: string;
  llm_latency_ms: number | null;
  llm_divergence_logged: boolean;
  rubric_version: string;
  raw_form_data: SurgeryBookingPayload;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  /** DASH.1 — soft-remove */
  removed_at?: string | null;
  removed_by?: string | null;
  remove_reason?: string | null;
}
