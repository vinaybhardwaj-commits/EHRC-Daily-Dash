// src/lib/form-engine/registry.ts
// Central form lookup — wraps legacy forms through the adapter, serves smart forms directly.
// Phase B: Added conditional show/hide patches for clinical lab, facilities, and nursing forms.

import { FORMS_BY_SLUG } from '../form-definitions';
import { adaptAllLegacyForms } from './legacy-adapter';
import type { SmartFormConfig, SmartFormField, ConditionRule } from './types';
// S3a — native smart-form overrides (wave 1)
import { nursingSmartForm } from './smart-forms/nursing';
import { clinicalLabSmartForm } from './smart-forms/clinical-lab';
import { otSmartForm } from './smart-forms/ot';

// Convert all legacy forms once at module load
const legacyForms = adaptAllLegacyForms(FORMS_BY_SLUG);

// Smart form overrides — when a department form is upgraded, its slug is added here
// and it takes priority over the legacy-adapted version.
// S3a (21 Apr 2026): wave 1 — nursing, clinical-lab, ot.
const smartFormOverrides: Record<string, SmartFormConfig> = {
  nursing: nursingSmartForm,
  'clinical-lab': clinicalLabSmartForm,
  ot: otSmartForm,
};

/* ── Conditional Show/Hide Patches ─────────────────────────────────── */
// These add showWhen conditions to fields that should only appear
// when a toggle radio is set to a specific value.

interface FieldPatch {
  fieldId: string;
  showWhen?: ConditionRule;
  requireWhen?: ConditionRule;
}

interface FormPatch {
  slug: string;
  patches: FieldPatch[];
}

const conditionalPatches: FormPatch[] = [
  // S3a: clinical-lab conditionals migrated into ./smart-forms/clinical-lab.ts
  // DD.5: Facilities — show breakdown details only when "Yes"
  {
    slug: 'facility',
    patches: [
      {
        fieldId: 'breakdownDetails',
        showWhen: { field: 'majorBreakdownToday', operator: 'eq', value: 'Yes' },
      },
    ],
  },
  // S3a: nursing conditionals migrated into ./smart-forms/nursing.ts
  // DD.3: HR — show hiring pipeline fields only on Mondays (when toggle is "Yes")
  {
    slug: 'hr-manpower',
    patches: [
      {
        fieldId: 'openPositionsCount',
        showWhen: { field: 'hiringPipelineApplicable', operator: 'eq', value: 'Yes' },
        requireWhen: { field: 'hiringPipelineApplicable', operator: 'eq', value: 'Yes' },
      },
      {
        fieldId: 'openPositionsList',
        showWhen: { field: 'hiringPipelineApplicable', operator: 'eq', value: 'Yes' },
      },
      {
        fieldId: 'interviewsScheduledThisWeek',
        showWhen: { field: 'hiringPipelineApplicable', operator: 'eq', value: 'Yes' },
      },
      {
        fieldId: 'offersExtendedThisWeek',
        showWhen: { field: 'hiringPipelineApplicable', operator: 'eq', value: 'Yes' },
      },
      {
        fieldId: 'expectedJoinersThisWeek',
        showWhen: { field: 'hiringPipelineApplicable', operator: 'eq', value: 'Yes' },
      },
      {
        fieldId: 'criticalVacancies',
        showWhen: { field: 'hiringPipelineApplicable', operator: 'eq', value: 'Yes' },
      },
    ],
  },
];

/**
 * Apply conditional show/hide patches to legacy-adapted forms.
 * This adds showWhen conditions to fields without requiring SmartFormConfig overrides.
 */
function applyConditionalPatches(): void {
  for (const formPatch of conditionalPatches) {
    const form = legacyForms[formPatch.slug];
    if (!form) continue;

    for (const patch of formPatch.patches) {
      // Find the field across all sections
      for (const section of form.sections) {
        const field = section.fields.find((f: SmartFormField) => f.id === patch.fieldId);
        if (field) {
          if (patch.showWhen) field.showWhen = patch.showWhen;
          if (patch.requireWhen) field.requireWhen = patch.requireWhen;
          break;
        }
      }
    }
  }
}

// Apply patches at module load (after legacy adaptation)
applyConditionalPatches();

/* ── Public API ─────────────────────────────────────────────────────── */

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
