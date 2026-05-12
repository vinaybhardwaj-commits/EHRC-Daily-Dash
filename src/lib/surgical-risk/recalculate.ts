/**
 * Surgical Risk — Server-side recalculation per PRD §13.3.
 *
 * The LLM (Qwen 2.5 14B) provides factor classification but produces wrong
 * sums in ~60% of cases (V's 11 May 2026 testing). The server enforces all
 * arithmetic. Per decision #21, also corrects:
 *   - missed infection keywords (LLM misses ~40%)
 *   - laterality (only Bilateral = +0.5; LLM sometimes adds it for unilateral)
 *   - timing gap (datetime arithmetic; LLM unreliable)
 * And logs a warning when LLM ↔ server-corrected differs by > 2.0 on any
 * sub-score (decision #21 divergence logging — useful for spotting LLM drift).
 *
 * Public entry: recalculateFromLLMOutput(llmOutput, formData) → corrected RiskAssessment.
 */

import type {
  FactorContribution,
  RiskAssessment,
  SurgeryBookingPayload,
} from './types';
import {
  buildRuntimeRubric,
  evaluateOverrideRules,
  tierForCompositeRuntime,
  timingGapFor,
  type RuntimeRubric,
} from './runtime-rubric';
import { combineDateTime, computeTimingGapHours } from './fallback';

const DIVERGENCE_THRESHOLD = 2.0;

function lc(value: string | null | undefined): string {
  return (value || '').toLowerCase();
}

function clampSubScore(rubric: RuntimeRubric, n: number): number {
  return Math.min(rubric.sub_score_cap, Math.round(n * 10) / 10);
}

function sumFactors(factors: FactorContribution[]): number {
  return factors.reduce((s, f) => s + f.points, 0);
}

/**
 * Result of recalculation, including divergence info for caller to optionally
 * log to DB column llm_divergence_logged.
 */
export interface RecalculatedAssessment {
  assessment: RiskAssessment;
  divergence: {
    patient_delta: number;
    procedure_delta: number;
    system_delta: number;
    flagged: boolean;          // true if any delta > DIVERGENCE_THRESHOLD
  };
  llm_was_corrected: boolean;  // true if any sub-score, tier, or override changed
}

/**
 * Apply PRD §13.3 server-side recalculation to LLM output. Mutates a deep
 * clone of the input to avoid surprising callers. Returns the corrected
 * assessment + divergence diagnostics.
 *
 * 7-step process per PRD §13.3:
 *   1. Recalculate each sub-score by summing factor points
 *   2. Server-side keyword scan for infection
 *   3. Server-side laterality correction (only Bilateral = +0.5)
 *   4. Server-side timing gap calc
 *   5. Recalculate composite from sub-scores
 *   6. Apply tier thresholds
 *   7. Apply override rules
 */
export function recalculateFromLLMOutput(
  llmOutput: RiskAssessment,
  formData: SurgeryBookingPayload,
  rubric: RuntimeRubric = buildRuntimeRubric(null)
): RecalculatedAssessment {
  // Deep clone so original LLM output is preserved (caller may store both)
  const out: RiskAssessment = JSON.parse(JSON.stringify(llmOutput));

  // Capture original sub-scores for divergence calc
  const llmPatient = out.patient_risk.score;
  const llmProcedure = out.procedure_risk.score;
  const llmSystem = out.system_risk.score;

  // ---- Step 1: Sum each sub-score's factors ----
  for (const key of ['patient_risk', 'procedure_risk', 'system_risk'] as const) {
    out[key].score = clampSubScore(rubric, sumFactors(out[key].factors));
  }

  // ---- Step 2: Server-side infection-keyword scan ----
  const procText = `${formData.proposed_procedure || ''} ${formData.clinical_justification || ''}`;
  const hasInfection = rubric.infection_keywords.some(k => lc(procText).includes(k));
  if (hasInfection && !out.procedure_risk.factors.some(f => f.factor.toLowerCase().includes('infect') || f.factor.toLowerCase().includes('contamina'))) {
    out.procedure_risk.factors.push({
      factor: 'Infected/contaminated field',
      points: rubric.infection_points,
      detail: 'Keyword detected in procedure/justification text (server-side scan)',
    });
    out.procedure_risk.score = clampSubScore(rubric, sumFactors(out.procedure_risk.factors));
  }

  // ---- Step 3: Laterality correction ----
  const lat = lc(formData.laterality);
  const isBilateral = lat === 'bilateral';
  const latFactorIdx = out.procedure_risk.factors.findIndex(f => f.factor.toLowerCase().includes('lateral'));
  if (latFactorIdx >= 0) {
    out.procedure_risk.factors[latFactorIdx].points = isBilateral ? rubric.laterality_bilateral_points : 0;
    out.procedure_risk.factors[latFactorIdx].detail = isBilateral ? 'Bilateral (+0.5 per rubric)' : `${formData.laterality || 'unspecified'} → 0 per rubric (only Bilateral scores)`;
    if (!isBilateral) {
      // 0-point factors are still listed for transparency, but cleaner to drop
      // when corrected to 0
      out.procedure_risk.factors.splice(latFactorIdx, 1);
    }
    out.procedure_risk.score = clampSubScore(rubric, sumFactors(out.procedure_risk.factors));
  } else if (isBilateral) {
    // LLM missed Bilateral entirely
    out.procedure_risk.factors.push({
      factor: 'Bilateral laterality',
      points: rubric.laterality_bilateral_points,
      detail: 'Server-added (LLM omitted)',
    });
    out.procedure_risk.score = clampSubScore(rubric, sumFactors(out.procedure_risk.factors));
  }

  // ---- Step 4: Booking timing server-correction ----
  const gapH = computeTimingGapHours(formData);
  const gapRes = timingGapFor(rubric, gapH);
  const timingFactorIdx = out.system_risk.factors.findIndex(f => /timing|gap|admission|booking timing|surgery time/i.test(f.factor));
  if (timingFactorIdx >= 0) {
    out.system_risk.factors[timingFactorIdx].points = gapRes.points;
    out.system_risk.factors[timingFactorIdx].factor = 'Booking timing';
    out.system_risk.factors[timingFactorIdx].detail = gapH !== null
      ? `${Math.round(gapH * 10) / 10}h between admission and surgery (server-calculated, ${gapRes.band})`
      : `${gapRes.band} (server-calculated)`;
    if (gapRes.points === 0) {
      out.system_risk.factors.splice(timingFactorIdx, 1);
    }
    out.system_risk.score = clampSubScore(rubric, sumFactors(out.system_risk.factors));
  } else if (gapRes.points > 0) {
    // LLM missed timing factor entirely
    out.system_risk.factors.push({
      factor: 'Booking timing',
      points: gapRes.points,
      detail: gapH !== null
        ? `${Math.round(gapH * 10) / 10}h between admission and surgery (server-added — LLM omitted, ${gapRes.band})`
        : `${gapRes.band} (server-added)`,
    });
    out.system_risk.score = clampSubScore(rubric, sumFactors(out.system_risk.factors));
  }

  // ---- Step 5: Composite ----
  const p = out.patient_risk.score;
  const pr = out.procedure_risk.score;
  const s = out.system_risk.score;
  const composite = Math.round(
    (p * rubric.composite_weights.patient + pr * rubric.composite_weights.procedure + s * rubric.composite_weights.system) * 100
  ) / 100;
  out.composite.score = Math.round(composite * 10) / 10;

  // ---- Step 6: Tier thresholds ----
  const baseTier = tierForCompositeRuntime(rubric, composite);

  // ---- Step 7: Override rules ----
  const { applied: appliedRule, tier } = evaluateOverrideRules(
    rubric, formData,
    { patient: p, procedure: pr, system: s },
    hasInfection, baseTier
  );

  out.composite.tier = tier;
  out.composite.override_applied = tier !== baseTier;
  out.composite.override_reason = appliedRule && tier !== baseTier
    ? `${appliedRule.id}: ${appliedRule.description}`
    : null;

  // ---- Divergence diagnostics ----
  const patient_delta = Math.abs(out.patient_risk.score - llmPatient);
  const procedure_delta = Math.abs(out.procedure_risk.score - llmProcedure);
  const system_delta = Math.abs(out.system_risk.score - llmSystem);
  const flagged = patient_delta > DIVERGENCE_THRESHOLD ||
                  procedure_delta > DIVERGENCE_THRESHOLD ||
                  system_delta > DIVERGENCE_THRESHOLD;

  if (flagged) {
    console.warn(
      `[surgical-risk] LLM ↔ server divergence > ${DIVERGENCE_THRESHOLD} for booking ${formData.form_submission_uid}`,
      { patient_delta, procedure_delta, system_delta, llm: { p: llmPatient, pr: llmProcedure, s: llmSystem }, server: { p, pr, s } }
    );
  }

  const llm_was_corrected =
    patient_delta > 0 || procedure_delta > 0 || system_delta > 0 ||
    out.composite.tier !== llmOutput.composite.tier;

  return {
    assessment: out,
    divergence: { patient_delta, procedure_delta, system_delta, flagged },
    llm_was_corrected,
  };
}
