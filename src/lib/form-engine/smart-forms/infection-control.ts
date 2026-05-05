// Native Smart Form: Infection Control
// New dept (2026-05-05). Field set drawn from CDC/HICPAC daily IPC surveillance + NHSN
// reporting conventions, scoped to ~2.5 min mandatory fill time. Per PRD §5.2.
// Form is dept-head-agnostic (filler identity captured via form_fillers, S2/R3 work).
//
// Note: Nursing form's `dailyHaiIpcStatus` text field intentionally retained for v1
// (V's call 5 May 2026 — leave both, IPC form is analytically authoritative).

import type { SmartFormConfig } from '../types';
import { dateSection } from './_date-section';

export const infectionControlSmartForm: SmartFormConfig = {
  slug: 'infection-control',
  title: 'EHRC Morning Meeting — Infection Control',
  department: 'Infection Control',
  description:
    'Fill this before the daily morning meeting.\n★ Starred fields are mandatory.\nTakes under 2.5 minutes on a calm day; ~3 minutes on outbreak/audit days.\n\nField set drawn from CDC/HICPAC daily IPC surveillance + NHSN conventions.',
  layout: 'responsive',
  version: 1,
  lastModified: '2026-05-05',
  _legacyTab: 'IPC',
  _legacyKpiFields: [
    'activeHaiCensus',
    'newHaiCasesToday',
    'patientsInIsolationTotal',
  ],
  sections: [
    dateSection,
    {
      id: 'infection-control-mandatory',
      title: '★ MANDATORY FIELDS',
      fields: [
        {
          id: 'activeHaiCensus',
          label: 'Active HAI cases — total census',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'newHaiCasesToday',
          label: 'New HAI cases identified today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'clabsiCountActive',
          label: 'CLABSI count (active)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'cautiCountActive',
          label: 'CAUTI count (active)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'vapCountActive',
          label: 'VAP count (active)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'ssiCountActive',
          label: 'SSI count (active)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'patientsInIsolationTotal',
          label: 'Patients in isolation — total',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'handHygieneAuditDoneToday',
          label: 'Hand hygiene compliance audit done today?',
          type: 'radio',
          required: true,
          options: ['Yes', 'No'],
        },
        {
          id: 'handHygieneCompliancePct',
          label: 'Hand hygiene compliance %',
          type: 'number',
          required: false,
          validation: { min: 0, max: 100 },
          showWhen: { field: 'handHygieneAuditDoneToday', operator: 'eq', value: 'Yes' },
          requireWhen: { field: 'handHygieneAuditDoneToday', operator: 'eq', value: 'Yes' },
        },
        {
          id: 'sharpsInjuriesToday',
          label: 'Sharps injuries / needlestick today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'outbreakAlertActive',
          label: 'Outbreak alert active?',
          type: 'toggle',
          required: true,
        },
        {
          id: 'outbreakDetails',
          label: 'Outbreak details (organism, ward, action taken)',
          description: 'Briefly: which organism, which ward(s), what containment action was initiated.',
          type: 'paragraph',
          required: false,
          showWhen: { field: 'outbreakAlertActive', operator: 'eq', value: true },
          requireWhen: { field: 'outbreakAlertActive', operator: 'eq', value: true },
        },
      ],
    },
    {
      id: 'infection-control-optional',
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'antibioticStewardshipRoundsToday',
          label: 'Antibiotic stewardship rounds done today',
          type: 'text',
          required: false,
        },
        {
          id: 'environmentalCleaningAudit',
          label: 'Environmental cleaning audit (pass/fail summary)',
          type: 'text',
          required: false,
        },
        {
          id: 'infectionControlOtherNotes',
          label: 'Other notes',
          type: 'paragraph',
          required: false,
        },
      ],
    },
  ],
};
