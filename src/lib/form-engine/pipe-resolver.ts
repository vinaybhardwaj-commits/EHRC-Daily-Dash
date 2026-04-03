// src/lib/form-engine/pipe-resolver.ts
// Response piping — resolves {{fieldId}} and {{fieldId|formatter}} tokens in strings

import type { PipeToken, PipeFormatter } from './types';

type FormState = Record<string, string | number | boolean | string[] | undefined>;

const PIPE_REGEX = /\{\{(\w+)(?:\|(\w+))?\}\}/g;

/**
 * Parse a string and extract all pipe tokens.
 */
export function parsePipeTokens(text: string): PipeToken[] {
  const tokens: PipeToken[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(PIPE_REGEX.source, 'g');

  while ((match = regex.exec(text)) !== null) {
    tokens.push({
      raw: match[0],
      fieldId: match[1],
      formatter: (match[2] as PipeFormatter) || undefined,
    });
  }
  return tokens;
}

/**
 * Check if a string contains any pipe tokens.
 */
export function hasPipeTokens(text: string): boolean {
  return PIPE_REGEX.test(text);
}

/**
 * Format a value according to the specified formatter.
 */
function applyFormatter(value: string | number | boolean | string[] | undefined, formatter?: PipeFormatter): string {
  if (value === undefined || value === null || value === '') return '';

  const str = Array.isArray(value) ? value.join(', ') : String(value);

  switch (formatter) {
    case 'currency':
      return formatIndianCurrency(typeof value === 'number' ? value : parseFloat(str));
    case 'uppercase':
      return str.toUpperCase();
    case 'lowercase':
      return str.toLowerCase();
    case 'number':
      return formatIndianNumber(typeof value === 'number' ? value : parseFloat(str));
    case 'date':
      return str; // pass through — dates are already formatted
    case 'default':
    default:
      return str;
  }
}

/**
 * Format a number in Indian notation (1,23,456).
 */
function formatIndianNumber(n: number): string {
  if (isNaN(n)) return '';
  const s = Math.abs(n).toFixed(0);
  if (s.length <= 3) return (n < 0 ? '-' : '') + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  return (n < 0 ? '-' : '') + formatted;
}

/**
 * Format a number as Indian currency (\u20b9 with lakhs notation).
 */
function formatIndianCurrency(n: number): string {
  if (isNaN(n)) return '';
  return '\u20b9' + formatIndianNumber(n);
}

/**
 * Resolve all pipe tokens in a string using the current form state.
 * Returns the string with all {{fieldId}} replaced with actual values.
 * Unresolved tokens (field has no value) are replaced with empty string.
 */
export function resolvePipes(text: string, state: FormState): string {
  return text.replace(PIPE_REGEX, (_match, fieldId: string, formatter?: string) => {
    const value = state[fieldId];
    return applyFormatter(value, formatter as PipeFormatter);
  });
}

/**
 * Resolve pipes in any string property of an object (shallow).
 * Used to pipe values into field labels, descriptions, placeholders, etc.
 */
export function resolvePipesInField<T extends Record<string, unknown>>(
  obj: T,
  stringKeys: (keyof T)[],
  state: FormState,
): T {
  const result = { ...obj };
  for (const key of stringKeys) {
    const val = result[key];
    if (typeof val === 'string' && hasPipeTokens(val)) {
      (result as Record<string, unknown>)[key as string] = resolvePipes(val, state);
    }
  }
  return result;
}
