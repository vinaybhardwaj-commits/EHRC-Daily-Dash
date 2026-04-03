// src/lib/form-engine/condition-evaluator.ts
// Runtime evaluation of show/hide/require rules based on current form state

import type { Condition, ConditionGroup, ConditionRule } from './types';

type FormState = Record<string, string | number | boolean | string[] | undefined>;

/**
 * Evaluate a single condition against the current form state.
 */
function evaluateCondition(condition: Condition, state: FormState): boolean {
  const fieldValue = state[condition.field];
  const { operator, value: targetValue } = condition;

  // Emptiness checks
  if (operator === 'is_empty') {
    return fieldValue === undefined || fieldValue === null || fieldValue === '' ||
      (Array.isArray(fieldValue) && fieldValue.length === 0);
  }
  if (operator === 'is_not_empty') {
    return fieldValue !== undefined && fieldValue !== null && fieldValue !== '' &&
      !(Array.isArray(fieldValue) && fieldValue.length === 0);
  }

  // Coerce values for comparison
  const fv = fieldValue;
  const tv = targetValue;

  // Equality
  if (operator === 'eq') return fv == tv; // eslint-disable-line eqeqeq
  if (operator === 'neq') return fv != tv; // eslint-disable-line eqeqeq

  // Numeric comparisons
  const numFv = typeof fv === 'string' ? parseFloat(fv) : typeof fv === 'number' ? fv : NaN;
  const numTv = typeof tv === 'string' ? parseFloat(tv) : typeof tv === 'number' ? tv : NaN;

  if (operator === 'gt') return !isNaN(numFv) && !isNaN(numTv) && numFv > numTv;
  if (operator === 'gte') return !isNaN(numFv) && !isNaN(numTv) && numFv >= numTv;
  if (operator === 'lt') return !isNaN(numFv) && !isNaN(numTv) && numFv < numTv;
  if (operator === 'lte') return !isNaN(numFv) && !isNaN(numTv) && numFv <= numTv;

  // Array membership
  if (operator === 'in') {
    const arr = Array.isArray(tv) ? tv : [tv];
    return arr.includes(fv as string);
  }
  if (operator === 'not_in') {
    const arr = Array.isArray(tv) ? tv : [tv];
    return !arr.includes(fv as string);
  }

  // String contains
  if (operator === 'contains') {
    const str = String(fv ?? '').toLowerCase();
    const search = String(tv ?? '').toLowerCase();
    return str.includes(search);
  }
  if (operator === 'not_contains') {
    const str = String(fv ?? '').toLowerCase();
    const search = String(tv ?? '').toLowerCase();
    return !str.includes(search);
  }

  return false;
}

/**
 * Recursively evaluate a condition group (AND/OR logic with nesting).
 */
function evaluateGroup(group: ConditionGroup, state: FormState): boolean {
  const results = group.conditions.map(c => evaluateRule(c, state));
  return group.logic === 'and'
    ? results.every(Boolean)
    : results.some(Boolean);
}

/**
 * Evaluate any condition rule (single condition or group).
 */
export function evaluateRule(rule: ConditionRule, state: FormState): boolean {
  if ('logic' in rule) {
    return evaluateGroup(rule as ConditionGroup, state);
  }
  return evaluateCondition(rule as Condition, state);
}

/**
 * Determine if a field should be visible given the current state.
 * If no showWhen rule, the field is always visible.
 */
export function isFieldVisible(
  showWhen: ConditionRule | undefined,
  state: FormState,
): boolean {
  if (!showWhen) return true;
  return evaluateRule(showWhen, state);
}

/**
 * Determine if a field is required given the current state.
 * Takes into account both static `required` flag and dynamic `requireWhen`.
 */
export function isFieldRequired(
  required: boolean | undefined,
  requireWhen: ConditionRule | undefined,
  state: FormState,
): boolean {
  if (requireWhen) return evaluateRule(requireWhen, state);
  return required ?? false;
}
