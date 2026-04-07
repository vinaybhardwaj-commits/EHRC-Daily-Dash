// src/lib/form-engine/registry.ts
// Central form lookup — wraps legacy forms through the adapter, serves smart forms directly.
// Phase B: Added conditional show/hide patches for clinical lab, facilities, and nursing forms.

import { FORMS_BY_SLUG } from '../form-definitions';
import { adaptAllLegacyForms } from './legacy-adapter';
import type { SmartFormConfig, SmartFormField, ConditionRule } from './types';

// Convert all legacy forms once at module load
const legacyForms = adaptAllLegacyForms(FORMS_BY_SLUG);

// Future: smart form overrides will be registered here.
// When a department form is upgraded, add it to this map and it takes priority.
const smartFormOverrides: Record<string, SmartFormConfig> = {};

/* ── Conditional Show/Hide Patches ─────────────────────────────────── */
// These add showWhen conditions to fields that should only appear
// when a toggle radio is set to a specific value.

interface FieldPatch {
  fieldId: string;
  showWhen: ConditionRule;
}

interface FormPatch {
  slug: string;
  patches: FieldPatch[];
}

const conditionalPatches: FormPatch[] = [
  // DD.2: Clinical Lab — show critical value details only when "Yes"
  {
    slug: 'clinical-lab',
    patches: [
      {
        fieldId: 'criticalValueDetails',
        showWhen: { field: 'criticalValuesReportedToday', operator: 'eq', value: 'Yes' },
      },
      {
        fieldId: 'positiveCultureDetails',
        showWhen: { field: 'positiveCulturesToday', operator: 'gt', value: 0 },
      },
    ],
  },
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
  // DD.4: Nursing — show OT fields only when "Yes" to also reporting OT
  {
    slug: 'nursing',
    patches: [
      {
        fieldId: 'otTotalCasesDoneToday',
        showWhen: { field: 'alsoReportingOtData', operator: 'eq', value: 'Yes' },
      },
      {
        fieldId: 'otFirstCaseOnTimeStart',
        showWhen: { field: 'alsoReportingOtData', operator: 'eq', value: 'Yes' },
      },
      {
        fieldId: 'otDelayReason',
        showWhen: {
          logic: 'and',
          conditions: [
            { field: 'alsoReportingOtData', operator: 'eq', value: 'Yes' },
            { field: 'otFirstCaseOnTimeStart', operator: 'eq', value: 'No' },
          ],
        },
      },
      {
        fieldId: 'otCancellationsToday',
        showWhen: { field: 'alsoReportingOtData', operator: 'eq', value: 'Yes' },
      },
      {
        fieldId: 'otCancellationReasons',
        showWhen: {
          logic: 'and',
          conditions: [
            { field: 'alsoReportingOtData', operator: 'eq', value: 'Yes' },
            { field: 'otCancellationsToday', operator: 'gt', value: 0 },
          ],
        },
      },
    ],
  },
  // DD.3: HR — show hiring pipeline fields only on Mondays (when toggle is "Yes")
  {
    slug: 'hr-manpower',
    patches: [
      {
        fieldId: 'openPositionsCount',
        showWhen: { field: 'hiringPipelineApplicable', operator: 'eq', value: 'Yes' },
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
          field.showWhen = patch.showWhen;
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
