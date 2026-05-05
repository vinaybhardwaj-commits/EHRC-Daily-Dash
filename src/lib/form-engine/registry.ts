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
// S3b — native smart-form overrides (wave 2)
import { emergencySmartForm } from './smart-forms/emergency';
import { billingSmartForm } from './smart-forms/billing';
import { supplyChainSmartForm } from './smart-forms/supply-chain';
import { pharmacySmartForm } from './smart-forms/pharmacy';
// S3c — native smart-form overrides (wave 3)
import { trainingSmartForm } from './smart-forms/training';
import { customerCareSmartForm } from './smart-forms/customer-care';
import { patientSafetySmartForm } from './smart-forms/patient-safety';
import { financeSmartForm } from './smart-forms/finance';
// S3d — native smart-form overrides (wave 4)
import { radiologySmartForm } from './smart-forms/radiology';
import { facilitySmartForm } from './smart-forms/facility';
import { itSmartForm } from './smart-forms/it';
import { dietSmartForm } from './smart-forms/diet';
import { hrManpowerSmartForm } from './smart-forms/hr-manpower';
import { biomedicalSmartForm } from './smart-forms/biomedical';

// 2026-05-05: 2-new-depts launch — Quality & Accreditations + Infection Control.
import { qualityAccreditationSmartForm } from './smart-forms/quality-accreditation';
import { infectionControlSmartForm } from './smart-forms/infection-control';

// Convert all legacy forms once at module load
const legacyForms = adaptAllLegacyForms(FORMS_BY_SLUG);

// Smart form overrides — when a department form is upgraded, its slug is added here
// and it takes priority over the legacy-adapted version.
// S3a (21 Apr 2026): wave 1 — nursing, clinical-lab, ot.
// S3b (21 Apr 2026): wave 2 — emergency, billing, supply-chain, pharmacy.
// S3c (21 Apr 2026): wave 3 — training, customer-care, patient-safety, finance.
// S3d (21 Apr 2026): wave 4 — radiology, facility, it, diet, hr-manpower, biomedical.
// 2-new-depts launch (5 May 2026): added quality-accreditation + infection-control.
//                    All 19 dept slugs now serve native SmartFormConfigs; legacy-adapter remains as fallback only.
const smartFormOverrides: Record<string, SmartFormConfig> = {
  nursing: nursingSmartForm,
  'clinical-lab': clinicalLabSmartForm,
  ot: otSmartForm,
  emergency: emergencySmartForm,
  billing: billingSmartForm,
  'supply-chain': supplyChainSmartForm,
  pharmacy: pharmacySmartForm,
  training: trainingSmartForm,
  'customer-care': customerCareSmartForm,
  'patient-safety': patientSafetySmartForm,
  finance: financeSmartForm,
  radiology: radiologySmartForm,
  facility: facilitySmartForm,
  it: itSmartForm,
  diet: dietSmartForm,
  'hr-manpower': hrManpowerSmartForm,
  biomedical: biomedicalSmartForm,
  // 2-new-depts launch (5 May 2026)
  'quality-accreditation': qualityAccreditationSmartForm,
  'infection-control': infectionControlSmartForm,
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
  // S3a: clinical-lab + nursing conditionals migrated into ./smart-forms/{clinical-lab,nursing}.ts
  // S3d: facility + hr-manpower conditionals migrated into ./smart-forms/{facility,hr-manpower}.ts
  // All legacy conditional patches have now been inlined into their native SmartFormConfigs.
  // This array is intentionally empty — applyConditionalPatches() is retained as a no-op scaffold
  // in case future legacy-adapted forms need conditional overrides before migration.
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
