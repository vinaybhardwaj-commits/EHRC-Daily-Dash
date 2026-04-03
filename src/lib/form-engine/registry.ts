// src/lib/form-engine/registry.ts
// Central form lookup — wraps legacy forms through the adapter, serves smart forms directly.

import { FORMS_BY_SLUG } from '../form-definitions';
import { adaptAllLegacyForms } from './legacy-adapter';
import type { SmartFormConfig } from './types';

// Convert all legacy forms once at module load
const legacyForms = adaptAllLegacyForms(FORMS_BY_SLUG);

// Future: smart form overrides will be registered here.
// When a department form is upgraded, add it to this map and it takes priority.
const smartFormOverrides: Record<string, SmartFormConfig> = {};

/**
 * Get a form config by slug.
 * Priority: smart form override > legacy adapted form.
 */
export function getFormConfig(slug: string): SmartFormConfig | undefined {
  return smartFormOverrides[slug] || legacyForms[slug];
}

/**
 * Get all form configs (merged: overrides take priority).
 */
export function getAllFormConfigs(): Record<string, SmartFormConfig> {
  return { ...legacyForms, ...smartFormOverrides };
}

/**
 * Get all form slugs.
 */
export function getAllFormSlugs(): string[] {
  return Object.keys(getAllFormConfigs());
}

/**
 * Register a smart form override (replaces the legacy version for this slug).
 * Used when upgrading a department's form to smart mode.
 */
export function registerSmartForm(config: SmartFormConfig): void {
  smartFormOverrides[config.slug] = config;
}

/**
 * Check if a form is still using the legacy adapter or has been upgraded.
 */
export function isLegacyForm(slug: string): boolean {
  const config = getFormConfig(slug);
  return config?._isLegacy ?? false;
}
