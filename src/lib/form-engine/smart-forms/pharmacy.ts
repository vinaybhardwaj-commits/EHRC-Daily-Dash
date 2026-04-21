// S3b — Native Smart Form: Pharmacy
// Migrated from legacy form-definitions.ts pharmacyForm (slug 'pharmacy').
// Field ids and types preserved exactly to keep `department_data.entries[0].fields` key parity.
// Legacy had no conditional patches in registry.ts for this slug.

import type { SmartFormConfig } from '../types';
import { dateSection } from './_date-section';

export const pharmacySmartForm: SmartFormConfig = {
  slug: 'pharmacy',
  title: 'EHRC Morning Meeting — Pharmacy',
  department: 'Pharmacy',
  description:
    'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Pharmacy',
  layout: 'responsive',
  version: 2,
  lastModified: '2026-04-21',
  _legacyTab: 'Pharmacy',
  _legacyKpiFields: ['pharmacyRevenueIpToday', 'pharmacyRevenueOpToday', 'pharmacyRevenueMtd'],
  sections: [
    dateSection,
    {
      id: 'pharmacy-mandatory',
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'pharmacyRevenueIpToday',
          label: 'Pharmacy revenue — IP today (Rs.)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'pharmacyRevenueOpToday',
          label: 'Pharmacy revenue — OP today (Rs.)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'pharmacyRevenueMtd',
          label: 'Pharmacy revenue MTD (Rs.)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'stockoutsShortages',
          label: 'Stockouts / shortages',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      id: 'pharmacy-optional',
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'medicineStockValueIp',
          label: 'Medicine stock value — IP (Rs.)',
          type: 'number',
          required: false,
          validation: { min: 0 },
        },
        {
          id: 'medicineStockValueOp',
          label: 'Medicine stock value — OP (Rs.)',
          type: 'number',
          required: false,
          validation: { min: 0 },
        },
        {
          id: 'itemsExpiringWithin3Months',
          label: 'Items expiring within 3 months',
          type: 'text',
          required: false,
        },
      ],
    },
  ],
};
