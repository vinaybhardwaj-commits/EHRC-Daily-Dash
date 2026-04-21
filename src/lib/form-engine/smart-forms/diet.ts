// S3d — Native Smart Form: Diet
// Migrated from legacy form-definitions.ts dietForm (slug 'diet').
// Field ids and types preserved exactly to keep `department_data.entries[0].fields` key parity.
// Legacy had no conditional patches in registry.ts for this slug.

import type { SmartFormConfig } from '../types';
import { dateSection } from './_date-section';

export const dietSmartForm: SmartFormConfig = {
  slug: 'diet',
  title: 'EHRC Morning Meeting — Diet',
  department: 'Diet',
  description:
    'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Diet',
  layout: 'responsive',
  version: 2,
  lastModified: '2026-04-21',
  _legacyTab: 'Clinical Nutrition, F&B',
  _legacyKpiFields: ['dietPatientsCensus', 'bcaDoneToday', 'bcaMtdTotal'],
  sections: [
    dateSection,
    {
      id: 'diet-mandatory',
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'dietPatientsCensus',
          label: 'Daily census — diet patients',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'bcaDoneToday',
          label: 'BCA done today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'bcaMtdTotal',
          label: 'BCA MTD total',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'foodFeedbackSummary',
          label: 'Food feedback summary',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      id: 'diet-optional',
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'dischargePlanWithDiet',
          label: 'Discharge plan completed with diet',
          type: 'text',
          required: false,
        },
        {
          id: 'kitchenUpdate',
          label: 'Kitchen update',
          type: 'text',
          required: false,
        },
        {
          id: 'delaysIncidents',
          label: 'Delays / incidents',
          type: 'text',
          required: false,
        },
      ],
    },
  ],
};
