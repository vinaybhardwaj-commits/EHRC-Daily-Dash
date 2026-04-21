// S3a — Native Smart Form: OT (Operation Theatre)
// Migrated from legacy form-definitions.ts otForm (slug 'ot').
// Field ids and types are preserved exactly to keep `department_data.entries[0].fields` key parity.
// No conditional patches existed in registry.ts for this slug — simplified per DD.4 (7 Apr 2026).

import type { SmartFormConfig } from '../types';
import { dateSection } from './_date-section';

export const otSmartForm: SmartFormConfig = {
  slug: 'ot',
  title: 'EHRC Morning Meeting — OT Daily Summary',
  department: 'OT',
  description:
    'Fill this before the daily morning meeting.\nShould take under 2 minutes.\nDepartment: OT',
  layout: 'responsive',
  version: 2,
  lastModified: '2026-04-21',
  _legacyTab: 'OT',
  _legacyKpiFields: ['totalCasesDoneToday', 'firstCaseOnTimeStart', 'cancellationsToday'],
  sections: [
    dateSection,
    {
      id: 'ot-daily-summary',
      title: 'OT DAILY SUMMARY',
      fields: [
        {
          id: 'totalCasesDoneToday',
          label: 'Total cases done today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'firstCaseOnTimeStart',
          label: 'First case on-time start?',
          type: 'radio',
          required: true,
          options: ['Yes', 'No'],
        },
        {
          id: 'delayReason',
          label: 'If No: delay reason',
          type: 'paragraph',
          required: false,
        },
        {
          id: 'cancellationsToday',
          label: 'Cancellations today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'cancellationReasons',
          label: 'If any: cancellation reasons',
          type: 'paragraph',
          required: false,
        },
      ],
    },
  ],
};
