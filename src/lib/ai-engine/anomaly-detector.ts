/* ──────────────────────────────────────────────────────────────────
   AI Question Engine — Anomaly Detector
   Evaluates rubric rules against a form submission + historical data
   ────────────────────────────────────────────────────────────────── */

import type {
  DepartmentRubric,
  DetectedAnomaly,
  AnomalyRule,
  ThresholdCondition,
  CrossFieldCondition,
  HistoricalCondition,
  PatternCondition,
  MissingCondition,
} from './types';

const MAX_ANOMALIES = 5;

/* ── Field value helpers ─────────────────────────────────────────── */

function toNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '' || val === 'NIL' || val === 'Nil' || val === 'nil') return null;
  const n = typeof val === 'number' ? val : Number(String(val).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

function isEmptyValue(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  const s = String(val).trim().toLowerCase();
  return s === '' || s === 'nil' || s === 'na' || s === 'n/a' || s === '-' || s === 'none';
}

function isNonEmptyText(val: unknown): boolean {
  return !isEmptyValue(val);
}

/* ── Rule evaluators ─────────────────────────────────────────────── */

function evalThreshold(
  cond: ThresholdCondition,
  formData: Record<string, unknown>
): { triggered: boolean; values: Record<string, unknown> } {
  const raw = formData[cond.field];
  const num = toNumber(raw);
  const values: Record<string, unknown> = { [cond.field]: raw };

  if (num === null) return { triggered: false, values };

  let triggered = false;
  switch (cond.operator) {
    case 'gt':  triggered = num > (cond.value as number); break;
    case 'gte': triggered = num >= (cond.value as number); break;
    case 'lt':  triggered = num < (cond.value as number); break;
    case 'lte': triggered = num <= (cond.value as number); break;
    case 'eq':  triggered = num === (cond.value as number); break;
    case 'neq': triggered = num !== (cond.value as number); break;
    case 'between': {
      const [lo, hi] = cond.value as [number, number];
      triggered = num >= lo && num <= hi;
      break;
    }
    case 'outside': {
      const [lo2, hi2] = cond.value as [number, number];
      triggered = num < lo2 || num > hi2;
      break;
    }
  }
  return { triggered, values };
}

function evalCrossField(
  cond: CrossFieldCondition,
  formData: Record<string, unknown>
): { triggered: boolean; values: Record<string, unknown> } {
  const rawA = formData[cond.field_a];
  const rawB = formData[cond.field_b];
  const values: Record<string, unknown> = {
    [cond.field_a]: rawA,
    [cond.field_b]: rawB,
  };

  switch (cond.relationship) {
    case 'a_implies_b': {
      // If A has a non-empty/non-zero value, B should too
      const aPresent = isNonEmptyText(rawA) && toNumber(rawA) !== 0;
      const bZero = toNumber(rawB) === 0 || isEmptyValue(rawB);
      return { triggered: aPresent && bZero, values };
    }
    case 'a_excludes_b': {
      const aPresent = isNonEmptyText(rawA);
      const bPresent = isNonEmptyText(rawB);
      return { triggered: aPresent && bPresent, values };
    }
    case 'a_gt_b': {
      const numA = toNumber(rawA);
      const numB = toNumber(rawB);
      if (numA === null || numB === null) return { triggered: false, values };
      return { triggered: numA > numB, values };
    }
    case 'sum_exceeds': {
      const numA = toNumber(rawA);
      const numB = toNumber(rawB);
      if (numA === null || numB === null) return { triggered: false, values };
      return { triggered: numA + numB > (cond.threshold ?? 0), values };
    }
  }
}

function evalHistorical(
  cond: HistoricalCondition,
  formData: Record<string, unknown>,
  historicalData: Record<string, unknown>[]
): { triggered: boolean; values: Record<string, unknown>; historical_values: number[]; historical_avg: number; deviation_pct: number } {
  const currentVal = toNumber(formData[cond.field]);
  const historical = historicalData
    .map(d => toNumber(d[cond.field]))
    .filter((n): n is number => n !== null);

  const result = {
    triggered: false,
    values: { [cond.field]: formData[cond.field] } as Record<string, unknown>,
    historical_values: historical,
    historical_avg: 0,
    deviation_pct: 0,
  };

  if (currentVal === null || historical.length < 3) return result;

  const avg = historical.reduce((a, b) => a + b, 0) / historical.length;
  result.historical_avg = avg;

  if (avg === 0) return result;

  const pctChange = ((currentVal - avg) / avg) * 100;
  result.deviation_pct = Math.round(Math.abs(pctChange));

  const direction = cond.direction ?? 'both';

  if (direction === 'drop') {
    result.triggered = pctChange < 0 && Math.abs(pctChange) >= cond.deviation_pct;
  } else if (direction === 'spike') {
    result.triggered = pctChange > 0 && pctChange >= cond.deviation_pct;
  } else {
    result.triggered = Math.abs(pctChange) >= cond.deviation_pct;
  }

  return result;
}

function evalPattern(
  cond: PatternCondition,
  formData: Record<string, unknown>
): { triggered: boolean; values: Record<string, unknown> } {
  const raw = formData[cond.field];
  const values: Record<string, unknown> = { [cond.field]: raw };

  if (isEmptyValue(raw)) return { triggered: cond.invert, values };

  const str = String(raw);
  const regex = new RegExp(cond.pattern, 'i');
  const matches = regex.test(str);
  return { triggered: cond.invert ? !matches : matches, values };
}

function evalMissing(
  cond: MissingCondition,
  formData: Record<string, unknown>
): { triggered: boolean; values: Record<string, unknown> } {
  const triggerRaw = formData[cond.trigger_field];
  const requiredRaw = formData[cond.required_field];
  const values: Record<string, unknown> = {
    [cond.trigger_field]: triggerRaw,
    [cond.required_field]: requiredRaw,
  };

  // Check if trigger condition is met
  let triggerMet = false;
  const triggerNum = toNumber(triggerRaw);

  switch (cond.trigger_operator) {
    case 'gt':
      triggerMet = triggerNum !== null && triggerNum > (cond.trigger_value as number);
      break;
    case 'gte':
      triggerMet = triggerNum !== null && triggerNum >= (cond.trigger_value as number);
      break;
    case 'eq':
      triggerMet = String(triggerRaw) === String(cond.trigger_value);
      break;
    case 'neq':
      triggerMet = String(triggerRaw) !== String(cond.trigger_value);
      break;
    default:
      triggerMet = isNonEmptyText(triggerRaw);
  }

  if (!triggerMet) return { triggered: false, values };

  // Trigger is met — check if required field is missing
  return { triggered: isEmptyValue(requiredRaw), values };
}

/* ── Template interpolation ──────────────────────────────────────── */

function interpolateTemplate(
  template: string,
  formData: Record<string, unknown>,
  extras: Record<string, unknown> = {}
): string {
  const allVars = { ...formData, ...extras };
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = allVars[key];
    if (val === null || val === undefined) return '[not provided]';
    return String(val);
  });
}

/* ── Main detect function ────────────────────────────────────────── */

export async function detectAnomalies(
  slug: string,
  formData: Record<string, unknown>,
  rubric: DepartmentRubric,
  historicalData: Record<string, unknown>[]
): Promise<DetectedAnomaly[]> {
  const anomalies: DetectedAnomaly[] = [];

  for (const rule of rubric.rules) {
    if (!rule.enabled) continue;

    let triggered = false;
    let values: Record<string, unknown> = {};
    let historical_values: number[] | undefined;
    let historical_avg: number | undefined;
    let deviation_pct: number | undefined;

    const { condition } = rule;

    switch (condition.type) {
      case 'threshold': {
        const r = evalThreshold(condition.config, formData);
        triggered = r.triggered;
        values = r.values;
        break;
      }
      case 'cross_field': {
        const r = evalCrossField(condition.config, formData);
        triggered = r.triggered;
        values = r.values;
        break;
      }
      case 'historical': {
        const r = evalHistorical(condition.config, formData, historicalData);
        triggered = r.triggered;
        values = r.values;
        historical_values = r.historical_values;
        historical_avg = r.historical_avg;
        deviation_pct = r.deviation_pct;
        break;
      }
      case 'pattern': {
        const r = evalPattern(condition.config, formData);
        triggered = r.triggered;
        values = r.values;
        break;
      }
      case 'missing': {
        const r = evalMissing(condition.config, formData);
        triggered = r.triggered;
        values = r.values;
        break;
      }
    }

    if (triggered) {
      anomalies.push({
        rule_id: rule.id,
        rule_name: rule.name,
        severity: rule.severity,
        triggered_values: values,
        historical_values,
        historical_avg,
        deviation_pct,
        fallback_question: interpolateTemplate(rule.question_template, formData, {
          deviation_pct: deviation_pct ?? 0,
        }),
      });
    }

    if (anomalies.length >= MAX_ANOMALIES) break;
  }

  // Sort by severity: critical > high > medium > low
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  anomalies.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return anomalies;
}
