/**
 * SREWS UI derivations (R1 — triage + readability overhaul).
 *
 * Pure, client-side helpers over an existing assessment row. NO new data:
 * everything is read from fields the pipeline already computes. Used to
 * surface the "why" (dominant risk driver) and the top action on the
 * collapsed card, and to drive the needs-review band + risk-first sorting.
 */

import type { RiskTier, SurgicalRiskAssessmentRow, FactorContribution } from './types';

/** Composite weights (must match recalc.ts / rubric v1.0). */
export const SREWS_WEIGHTS = { patient: 0.40, procedure: 0.35, system: 0.25 } as const;

export type Dimension = 'patient' | 'procedure' | 'system';
export const DIMENSION_LABEL: Record<Dimension, string> = {
  patient: 'Patient',
  procedure: 'Procedure',
  system: 'System',
};

/** Sort key: CRITICAL > RED > AMBER > GREEN. */
export function tierRank(t: RiskTier): number {
  return t === 'CRITICAL' ? 3 : t === 'RED' ? 2 : t === 'AMBER' ? 1 : 0;
}

/** Which sub-score contributes most to the weighted composite. */
export function dominantDimension(row: SurgicalRiskAssessmentRow): Dimension {
  const p = Number(row.patient_risk_score) * SREWS_WEIGHTS.patient;
  const pr = Number(row.procedure_risk_score) * SREWS_WEIGHTS.procedure;
  const s = Number(row.system_risk_score) * SREWS_WEIGHTS.system;
  if (pr >= p && pr >= s) return 'procedure';
  if (p >= pr && p >= s) return 'patient';
  return 'system';
}

export interface Driver {
  factor: string;
  detail: string;
}

function topFactor(factors?: FactorContribution[]): FactorContribution | null {
  if (!factors || factors.length === 0) return null;
  return factors.reduce((m, f) => (Number(f.points) > Number(m.points) ? f : m));
}

/**
 * The single most important risk driver for the collapsed "Why:" line:
 * the highest-points factor in the dominant sub-score, falling back to the
 * highest-points factor anywhere, then to the first sentence of the summary.
 */
export function topDriver(row: SurgicalRiskAssessmentRow): Driver | null {
  const a = row.assessment_json;
  if (!a) return null;
  const dim = dominantDimension(row);
  const domSub = dim === 'patient' ? a.patient_risk : dim === 'procedure' ? a.procedure_risk : a.system_risk;

  let best = topFactor(domSub?.factors);
  if (!best) {
    for (const sub of [a.patient_risk, a.procedure_risk, a.system_risk]) {
      const c = topFactor(sub?.factors);
      if (c && (!best || Number(c.points) > Number(best.points))) best = c;
    }
  }
  if (best) return { factor: best.factor, detail: best.detail || '' };
  if (a.summary) return { factor: a.summary.split(/\.\s/)[0].slice(0, 140), detail: '' };
  return null;
}

/** First recommended action + how many more there are. */
export function topAction(row: SurgicalRiskAssessmentRow): { first: string; rest: number } | null {
  const acts = row.assessment_json?.recommended_actions;
  if (!acts || acts.length === 0) return null;
  return { first: acts[0], rest: acts.length - 1 };
}

/** ms epoch of the surgery (datetime if present, else date at 00:00), or null. */
export function surgeryMs(row: SurgicalRiskAssessmentRow): number | null {
  const raw = row.surgery_datetime || row.surgery_date;
  if (!raw) return null;
  const d = new Date(raw.includes('T') ? raw : raw + 'T00:00:00');
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Needs-review band rule (V, 19 Jun): unreviewed RED/CRITICAL whose surgery is
 * within the next 48h (with a 24h grace window backward so today's already-
 * started cases still surface). Removed cases never qualify.
 */
export function needsReview(row: SurgicalRiskAssessmentRow, nowMs: number): boolean {
  if (row.reviewed_at || row.removed_at) return false;
  if (row.risk_tier !== 'RED' && row.risk_tier !== 'CRITICAL') return false;
  const t = surgeryMs(row);
  if (t == null) return false;
  return t >= nowMs - 24 * 3600_000 && t <= nowMs + 48 * 3600_000;
}

/** Composite-desc comparator (stable-ish; tier as tiebreaker). */
export function byCompositeDesc(a: SurgicalRiskAssessmentRow, b: SurgicalRiskAssessmentRow): number {
  const d = Number(b.composite_risk_score) - Number(a.composite_risk_score);
  return d !== 0 ? d : tierRank(b.risk_tier) - tierRank(a.risk_tier);
}
