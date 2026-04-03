// src/lib/form-engine/legacy-adapter.ts
// Converts legacy form-definitions.ts DepartmentForm → SmartFormConfig
// Zero behavior change — existing forms work identically through the new engine.

import type { DepartmentForm, FormField, FormSection } from '../form-definitions';
import type { SmartFormConfig, SmartFormSection, SmartFormField, SmartFieldType } from './types';

/**
 * Map legacy field types to SmartFieldType.
 * Legacy only has: text, number, paragraph, radio, section
 */
function mapFieldType(legacyType: string): SmartFieldType {
  switch (legacyType) {
    case 'text': return 'text';
    case 'number': return 'number';
    case 'paragraph': return 'paragraph';
    case 'radio': return 'radio';
    default: return 'text';
  }
}

/**
 * Convert a single legacy FormField to a SmartFormField.
 */
function adaptField(field: FormField): SmartFormField {
  if (field.type === 'section') {
    // Section-type fields in legacy are just visual dividers.
    // In the new engine, sections are top-level. We convert them
    // into a text field with no input (the section structure handles headers).
    return {
      id: field.id,
      label: field.label,
      description: field.description,
      type: 'text',
      required: false,
      validation: undefined,
    };
  }

  const smartField: SmartFormField = {
    id: field.id,
    label: field.label,
    description: field.description || field.helper,
    type: mapFieldType(field.type),
    required: field.required,
  };

  // Carry over validation
  if (field.validation) {
    smartField.validation = {
      min: field.validation.min,
      max: field.validation.max,
    };
  }

  // Carry over options for radio fields
  if (field.options) {
    smartField.options = [...field.options];
  }

  return smartField;
}

/**
 * Convert a legacy FormSection to a SmartFormSection.
 */
function adaptSection(section: FormSection, index: number): SmartFormSection {
  return {
    id: `section-${index}`,
    title: section.title,
    description: section.description,
    fields: section.fields
      .filter(f => f.type !== 'section') // skip section-type pseudo-fields
      .map(adaptField),
  };
}

/**
 * Convert a full legacy DepartmentForm to a SmartFormConfig.
 * The resulting config should render identically to the original.
 */
export function adaptLegacyForm(form: DepartmentForm): SmartFormConfig {
  return {
    slug: form.slug,
    title: form.title,
    department: form.department,
    description: form.description,
    layout: 'scroll', // legacy forms are always scroll layout
    sections: form.sections.map(adaptSection),
    version: 1,
    _isLegacy: true,
    _legacyTab: form.tab,
    _legacyKpiFields: form.kpiFields,
  };
}

/**
 * Convert all legacy forms to SmartFormConfig.
 * Returns a map of slug → SmartFormConfig.
 */
export function adaptAllLegacyForms(
  forms: Record<string, DepartmentForm>,
): Record<string, SmartFormConfig> {
  const result: Record<string, SmartFormConfig> = {};
  for (const [slug, form] of Object.entries(forms)) {
    result[slug] = adaptLegacyForm(form);
  }
  return result;
}
