// S3c — Native Smart Form: Finance
// Migrated from legacy form-definitions.ts financeForm (slug 'finance').
// Field ids and types preserved exactly to keep `department_data.entries[0].fields` key parity.
// Legacy had no conditional patches in registry.ts for this slug.

import type { SmartFormConfig } from '../types';
import { dateSection } from './_date-section';

export const financeSmartForm: SmartFormConfig = {
  slug: 'finance',
  title: 'EHRC Morning Meeting — Finance',
  department: 'Finance',
  description:
    'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Finance',
  layout: 'responsive',
  version: 2,
  lastModified: '2026-04-21',
  _legacyTab: 'Finance',
  _legacyKpiFields: ['revenueForDay', 'totalRevenueMtd', 'arpob'],
  sections: [
    dateSection,
    {
      id: 'finance-mandatory',
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'revenueForDay',
          label: 'Revenue for the day (Rs.)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'totalRevenueMtd',
          label: 'Total revenue MTD (Rs.)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'midnightCensus',
          label: 'Midnight census — total IP patients',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'surgeriesMtd',
          label: 'Surgeries MTD',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'arpob',
          label: 'ARPOB — Avg Revenue Per Occupied Bed (Rs.)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
      ],
    },
    {
      id: 'finance-optional',
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'opdRevenueMtd',
          label: 'OPD revenue MTD (Rs.)',
          type: 'number',
          required: false,
          validation: { min: 0 },
        },
        {
          id: 'revenueLeakageAlerts',
          label: 'Revenue leakage alerts',
          type: 'text',
          required: false,
        },
        {
          id: 'financeNotes',
          label: 'Other finance notes',
          type: 'paragraph',
          required: false,
        },
      ],
    },
  ],
};
