/**
 * Surgical Risk — Deterministic fallback scorer.
 *
 * Per PRD §10: when Qwen tunnel is unreachable, score the booking
 * arithmetically using the same rubric. Also used as a validation oracle for
 * LLM output (per recalculate.ts decision-#21 divergence logging).
 *
 * Dependency direction: fallback.ts -> rubric.ts + types.ts only.
 * combineDateTime is also defined here as a private helper; recalculate.ts
 * imports it from this module.
 */

import type {
  FactorContribution,
  RiskAssessment,
  RiskTier,
  SubScore,
  SurgeryBookingPayload,
} from './types';
import {
  ageBandFor,
  buildRuntimeRubric,
  evaluateOverrideRules,
  maxTier,
  tierForCompositeRuntime,
  timingGapFor,
  type RuntimeRubric,
} from './runtime-rubric';

// ---- Shared datetime helper (re-exported for recalculate.ts to import) ----

/**
 * Combine a YYYY-MM-DD date with an HH:MM time into a Date object.
 * Returns null if either is missing/unparseable.
 */
export function combineDateTime(
  date: string | null | undefined,
  time: string | null | undefined
): Date | null {
  if (!date) return null;
  const dateStr = String(date).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const timeStr = time ? String(time).trim() : '00:00';
  const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})/);
  const hh = timeMatch ? timeMatch[1].padStart(2, '0') : '00';
  const mm = timeMatch ? timeMatch[2] : '00';
  // Treat as Asia/Kolkata local time (no TZ suffix). Sufficient for hour-gap math.
  const iso = `${dateStr}T${hh}:${mm}:00+05:30`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Compute hours between admission and surgery datetime. Returns null if either
 * is unparseable.
 */
export function computeTimingGapHours(form: SurgeryBookingPayload): number | null {
  const admDt = combineDateTime(form.admission_date, form.admission_time);
  const surDt = combineDateTime(form.surgery_date, form.surgery_time);
  if (!admDt || !surDt) return null;
  return (surDt.getTime() - admDt.getTime()) / 3_600_000;
}

// ---- Internal helpers ----

function lc(value: string | null | undefined): string {
  return (value || '').toLowerCase();
}

function containsAny(haystack: string, needles: string[]): boolean {
  const h = lc(haystack);
  return needles.some(n => h.includes(n.toLowerCase()));
}

function findKeyByDetect(
  text: string,
  detect: Array<{ key: string; matches: string[] }>
): string | null {
  const t = lc(text);
  for (const entry of detect) {
    if (entry.matches.some(m => t.includes(m.toLowerCase()))) return entry.key;
  }
  return null;
}

function clampScore(rubric: RuntimeRubric, n: number): number {
  return Math.min(rubric.sub_score_cap, Math.round(n * 10) / 10);
}

function sumFactors(factors: FactorContribution[]): number {
  return factors.reduce((s, f) => s + f.points, 0);
}

// ---- A. Patient Risk ----

export function computePatientRisk(form: SurgeryBookingPayload, rubric: RuntimeRubric): SubScore {
  const factors: FactorContribution[] = [];

  // AGE
  const ageRes = ageBandFor(rubric, form.age);
  if (ageRes.points > 0) {
    factors.push({
      factor: `Age band ${ageRes.band}`,
      points: ageRes.points,
      detail: `${form.age ?? 'unknown'} years`,
    });
  }

  // COMORBIDITIES — detect each, apply HTN+DM synergy rule
  const comorbText = form.comorbidities || '';
  const detectedComorbs = new Set<string>();
  for (const entry of rubric.comorbidity_detect) {
    if (entry.matches.some(m => lc(comorbText).includes(m))) {
      detectedComorbs.add(entry.key);
    }
  }

  // HTN + DM synergy: if BOTH present, score 1.5 once instead of 1 + 1
  if (detectedComorbs.has('HYPERTENSION') && detectedComorbs.has('DIABETES')) {
    factors.push({
      factor: 'Hypertension + Diabetes (synergistic)',
      points: rubric.comorbidity_points.HTN_DM_TOGETHER,
      detail: 'Both present — synergistic vascular risk per rubric',
    });
    detectedComorbs.delete('HYPERTENSION');
    detectedComorbs.delete('DIABETES');
  }

  for (const key of detectedComorbs) {
    const points = rubric.comorbidity_points[key];
    if (points !== undefined) {
      factors.push({
        factor: key.toLowerCase().replace(/_/g, ' '),
        points,
        detail: 'Standard comorbidity',
      });
    }
  }

  // Non-standard comorbidity catch-all: parse comma-separated entries that
  // weren't matched by any standard rule. Conservative — only fires if the
  // text mentions a clearly distinct condition.
  // (For v1 deterministic fallback: skip non-standard heuristics; LLM handles
  // these better. Document the gap.)

  // HABITS
  const habitText = form.habits || '';
  const detectedHabits = new Set<string>();
  for (const entry of rubric.habit_detect) {
    if (entry.matches.some(m => lc(habitText).includes(m))) {
      detectedHabits.add(entry.key);
    }
  }
  for (const key of detectedHabits) {
    const points = rubric.habit_points[key];
    if (points !== undefined) {
      factors.push({
        factor: key.toLowerCase().replace(/_/g, ' '),
        points,
        detail: 'Habit',
      });
    }
  }

  // SPECIAL MODIFIERS
  if (lc(form.transfer) === 'yes') {
    factors.push({
      factor: 'Transfer patient',
      points: rubric.transfer_patient_points,
      detail: 'Unknown clinical baseline at transfer',
    });
  }

  // ≥3 distinct comorbidities (use RAW count BEFORE HTN+DM merging, since the
  // PRD says "≥ 3 distinct conditions present")
  const rawCount = rubric.comorbidity_detect.filter(e =>
    e.matches.some(m => lc(comorbText).includes(m))
  ).length;
  if (rawCount >= rubric.complexity_multiplier_threshold) {
    factors.push({
      factor: '>=3 comorbidities (complexity multiplier)',
      points: rubric.complexity_multiplier_points,
      detail: `${rawCount} distinct comorbidities present`,
    });
  }

  return { score: clampScore(rubric, sumFactors(factors)), factors };
}

// ---- B. Procedure Risk ----

export function computeProcedureRisk(form: SurgeryBookingPayload, rubric: RuntimeRubric): SubScore {
  const factors: FactorContribution[] = [];
  const procedureText = `${form.proposed_procedure || ''} ${form.clinical_justification || ''}`;

  // NON-SURGICAL DETECTOR
  const isNonSurgical = rubric.non_surgical_detect.some(p => lc(form.proposed_procedure).includes(p));

  // ANAESTHESIA (default Regional/Spinal +1 if unspecified)
  // The form's anaesthesia field is a SELECT with exact values
  // ('Local', 'Regional', 'Spinal', 'GA') — handle exact match first, then
  // fall back to substring detection for any free-text variations.
  const anaesText = (form.anaesthesia || '').trim();
  const anaesLc = anaesText.toLowerCase();
  let anaesKey: string | null = null;
  if (anaesLc === 'ga' || anaesLc === 'g.a.' || anaesLc === 'g a' || anaesLc === '(ga)') {
    anaesKey = 'GA';
  } else if (anaesLc === 'local') {
    anaesKey = 'LOCAL';
  } else if (anaesLc === 'regional' || anaesLc === 'spinal' || anaesLc === 'regional/spinal') {
    anaesKey = 'REGIONAL_OR_SPINAL';
  } else if (anaesText) {
    anaesKey = findKeyByDetect(anaesText, rubric.anaesthesia_detect);
  }
  if (!anaesKey) {
    anaesKey = 'REGIONAL_OR_SPINAL';
    factors.push({
      factor: 'Anaesthesia (assumed Regional/Spinal)',
      points: rubric.anaesthesia_points.REGIONAL_OR_SPINAL,
      detail: 'Type not specified — default per rubric',
    });
  } else {
    const points = rubric.anaesthesia_points[anaesKey];
    if (points > 0) {
      factors.push({
        factor: `Anaesthesia: ${anaesKey.toLowerCase().replace(/_/g, ' ')}`,
        points,
        detail: form.anaesthesia || '',
      });
    }
  }

  // PROCEDURE COMPLEXITY
  if (isNonSurgical) {
    factors.push({
      factor: 'Non-surgical admission',
      points: 0,
      detail: 'Procedure text indicates medical management — complexity = 0',
    });
  } else {
    let matchedTier: string | null = null;
    for (const entry of rubric.procedure_complexity_detect) {
      if (entry.matches.some(m => lc(procedureText).includes(m))) {
        matchedTier = entry.tier;
        break;
      }
    }
    if (matchedTier && rubric.procedure_tier_points[matchedTier] > 0) {
      factors.push({
        factor: `Procedure complexity: ${matchedTier.toLowerCase()}`,
        points: rubric.procedure_tier_points[matchedTier],
        detail: form.proposed_procedure || '',
      });
    }
  }

  // URGENCY
  const urgencyKey = findKeyByDetect(form.urgency || '', rubric.urgency_detect);
  if (urgencyKey && rubric.urgency_points[urgencyKey] > 0) {
    factors.push({
      factor: `Urgency: ${urgencyKey.toLowerCase().replace(/_/g, ' ')}`,
      points: rubric.urgency_points[urgencyKey],
      detail: form.urgency || '',
    });
  }

  // LATERALITY (only Bilateral)
  if (lc(form.laterality) === 'bilateral') {
    factors.push({
      factor: 'Bilateral laterality',
      points: rubric.laterality_bilateral_points,
      detail: 'Longer procedure / more tissue trauma',
    });
  }

  // SPECIAL REQUIREMENTS
  if (containsAny(form.special_requirements || '', rubric.special_requirement_detect)) {
    factors.push({
      factor: 'Special requirements',
      points: rubric.special_requirement_points,
      detail: 'Implants/prosthetics/external fixator/specialised equipment',
    });
  }

  // INFECTED/CONTAMINATED FIELD
  if (containsAny(procedureText, rubric.infection_keywords)) {
    factors.push({
      factor: 'Infected/contaminated field',
      points: rubric.infection_points,
      detail: 'Infection-related keyword in procedure or justification text',
    });
  }

  return { score: clampScore(rubric, sumFactors(factors)), factors };
}

// ---- C. System Risk ----

export function computeSystemRisk(form: SurgeryBookingPayload, rubric: RuntimeRubric): SubScore {
  const factors: FactorContribution[] = [];

  // PAC STATUS (independent from advice)
  const pacStatusKey = findKeyByDetect(form.pac_status || '', rubric.pac_status_detect);
  if (pacStatusKey && rubric.pac_status_points[pacStatusKey] > 0) {
    factors.push({
      factor: `PAC status: ${pacStatusKey.toLowerCase().replace(/_/g, ' ')}`,
      points: rubric.pac_status_points[pacStatusKey],
      detail: form.pac_status || '',
    });
  }

  // PAC ADVICE (independent from status)
  const pacAdviceKey = findKeyByDetect(form.pac_advice || '', rubric.pac_advice_detect);
  if (pacAdviceKey && rubric.pac_advice_points[pacAdviceKey] > 0) {
    factors.push({
      factor: `PAC advice: ${pacAdviceKey.toLowerCase().replace(/_/g, ' ')}`,
      points: rubric.pac_advice_points[pacAdviceKey],
      detail: form.pac_advice || '',
    });
  }

  // TIMING GAP
  const gapH = computeTimingGapHours(form);
  const gapRes = timingGapFor(rubric, gapH);
  if (gapRes.points > 0) {
    factors.push({
      factor: 'Timing gap',
      points: gapRes.points,
      detail: gapH !== null
        ? `${Math.round(gapH * 10) / 10}h gap (${gapRes.band})`
        : `${gapRes.band}`,
    });
  }

  // SCHEDULING FLAG
  const flagText = form.flag_auto || '';
  for (const entry of rubric.scheduling_flags) {
    if (entry.matches.some(m => lc(flagText).includes(m))) {
      factors.push({
        factor: `Scheduling flag: ${entry.label}`,
        points: entry.points,
        detail: flagText,
      });
      break;     // Only the highest-priority flag scores; subsequent rules are subset.
    }
  }

  // INFORMATION COMPLETENESS
  const cj = (form.clinical_justification || '').trim();
  if (cj.length < 5 || /^na$|^n\/a$/i.test(cj)) {
    factors.push({
      factor: 'Clinical justification missing',
      points: rubric.info_completeness.blank_clinical_justification_points,
      detail: cj ? `"${cj}" too short` : 'blank',
    });
  }

  if (lc(form.payer) === 'insurance') {
    const ins = (form.insurance_details || '').trim();
    if (!ins || /^n\/?a$/i.test(ins)) {
      factors.push({
        factor: 'Insurance details missing',
        points: rubric.info_completeness.blank_insurance_when_payer_is_insurance_points,
        detail: 'Payer=Insurance but Insurance Details blank',
      });
    }
  }

  const isNonElective = /semi-?emergency|urgent|immediate/i.test(form.urgency || '');
  if (isNonElective && !(form.remarks || '').trim()) {
    factors.push({
      factor: 'Remarks blank on non-elective case',
      points: rubric.info_completeness.blank_remarks_on_non_elective_points,
      detail: 'Non-elective case should have context in Remarks',
    });
  }

  // TRANSFER LOGISTICS
  if (lc(form.transfer) === 'yes' && !(form.referring_hospital || '').trim()) {
    factors.push({
      factor: 'Transfer logistics: referring hospital missing',
      points: rubric.transfer_logistics_points,
      detail: 'Transfer=Yes but no referring hospital recorded',
    });
  }

  return { score: clampScore(rubric, sumFactors(factors)), factors };
}

// ---- Composite + override application ----

export function applyOverridesAndComposite(
  form: SurgeryBookingPayload,
  patient: SubScore,
  procedure: SubScore,
  system: SubScore,
  rubric: RuntimeRubric
): RiskAssessment['composite'] {
  const composite = Math.round(
    (patient.score * rubric.composite_weights.patient +
      procedure.score * rubric.composite_weights.procedure +
      system.score * rubric.composite_weights.system) * 100
  ) / 100;

  const baselineTier: RiskTier = tierForCompositeRuntime(rubric, composite);

  // Detect infection once (used by override rule 3)
  const procText = `${form.proposed_procedure || ''} ${form.clinical_justification || ''}`;
  const hasInfection = containsAny(procText, rubric.infection_keywords);

  // Apply override rules via runtime predicate registry. Tier can only go UP.
  const { applied, tier } = evaluateOverrideRules(
    rubric, form,
    { patient: patient.score, procedure: procedure.score, system: system.score },
    hasInfection,
    baselineTier
  );

  return {
    score: Math.round(composite * 10) / 10,
    tier,
    override_applied: applied !== null && baselineTier !== tier,
    override_reason: applied && baselineTier !== tier
      ? `${applied.id}: ${applied.description}`
      : null,
  };
}

// ---- Public entry point ----

export function computeDeterministicRisk(
  form: SurgeryBookingPayload,
  rubric: RuntimeRubric = buildRuntimeRubric(null)
): RiskAssessment {
  const patient_risk = computePatientRisk(form, rubric);
  const procedure_risk = computeProcedureRisk(form, rubric);
  const system_risk = computeSystemRisk(form, rubric);
  const composite = applyOverridesAndComposite(form, patient_risk, procedure_risk, system_risk, rubric);

  return {
    patient_risk,
    procedure_risk,
    system_risk,
    composite,
    recommended_actions: [],   // Fallback can't generate actions — leave empty
    summary: 'LLM unavailable — scores computed from deterministic rubric only.',
  };
}
