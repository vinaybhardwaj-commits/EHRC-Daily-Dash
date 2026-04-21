// S3a — Native Smart Form: Clinical Lab
// Migrated from legacy form-definitions.ts clinicalLabForm (slug 'clinical-lab').
// Field ids and types are preserved exactly to keep `department_data.entries[0].fields` key parity.
// Conditional patches that previously lived in registry.ts (clinical-lab critical values / positive cultures)
// are now native here via showWhen + requireWhen.

import type { SmartFormConfig } from '../types';
import { dateSection } from './_date-section';

export const clinicalLabSmartForm: SmartFormConfig = {
  slug: 'clinical-lab',
  title: 'EHRC Morning Meeting — Clinical Lab',
  department: 'Clinical Lab',
  description:
    'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Clinical Lab',
  layout: 'responsive',
  version: 2,
  lastModified: '2026-04-21',
  _legacyTab: 'Clinical Lab',
  _legacyKpiFields: ['tatPerformance', 'criticalReportsIssued', 'criticalValuesReportedToday'],
  sections: [
    dateSection,
    {
      id: 'clinical-lab-mandatory',
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'machineEquipmentStatus',
          label: 'Machine & equipment status',
          type: 'text',
          required: true,
        },
        {
          id: 'criticalReportsIssued',
          label: '# of Critical reports issued',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'tatPerformance',
          label: 'TAT performance',
          type: 'text',
          required: true,
        },
        {
          id: 'transfusionBloodIssues',
          label: 'Transfusion / blood request issues',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      id: 'clinical-lab-optional',
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'outsourcedTestsMtd',
          label: '# of Outsourced tests MTD',
          type: 'number',
          required: false,
          validation: { min: 0 },
        },
        {
          id: 'reagentShortages',
          label: 'Reagent shortages',
          type: 'text',
          required: false,
        },
        {
          id: 'sampleRecollectionErrors',
          label: 'Sample recollection / reporting errors',
          type: 'text',
          required: false,
        },
      ],
    },
    {
      id: 'clinical-lab-critical-values',
      title: 'CRITICAL VALUES & ALERTS',
      description: 'Report any critical values or positive cultures from today.',
      fields: [
        {
          id: 'criticalValuesReportedToday',
          label: 'Were any critical values reported today?',
          type: 'radio',
          required: true,
          options: ['Yes', 'No'],
        },
        {
          id: 'criticalValueDetails',
          label:
            'Critical value details (patient UHID, test, value, normal range, time reported, time communicated to physician, physician name, acknowledgment status)',
          description:
            'Enter one critical value per line. Format: UHID | Test | Value | Normal Range | Time Reported | Time Communicated | Physician | Ack (Yes/No)',
          type: 'paragraph',
          required: false,
          // Native port of registry.ts conditionalPatches[slug='clinical-lab'].criticalValueDetails
          showWhen: { field: 'criticalValuesReportedToday', operator: 'eq', value: 'Yes' },
          requireWhen: { field: 'criticalValuesReportedToday', operator: 'eq', value: 'Yes' },
        },
        {
          id: 'positiveCulturesToday',
          label: '# of positive cultures today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'positiveCultureDetails',
          label: 'Positive culture details (organism, specimen type, patient UHID)',
          description: 'Enter one culture per line. Format: Organism | Specimen Type | UHID',
          type: 'paragraph',
          required: false,
          // Native port of registry.ts conditionalPatches[slug='clinical-lab'].positiveCultureDetails
          showWhen: { field: 'positiveCulturesToday', operator: 'gt', value: 0 },
          requireWhen: { field: 'positiveCulturesToday', operator: 'gt', value: 0 },
        },
      ],
    },
  ],
};
