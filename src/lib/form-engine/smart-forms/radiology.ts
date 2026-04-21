// S3d — Native Smart Form: Radiology
// Migrated from legacy form-definitions.ts radiologyForm (slug 'radiology').
// Field ids and types preserved exactly to keep `department_data.entries[0].fields` key parity.
// Legacy had no conditional patches in registry.ts for this slug.

import type { SmartFormConfig } from '../types';
import { dateSection } from './_date-section';

export const radiologySmartForm: SmartFormConfig = {
  slug: 'radiology',
  title: 'EHRC Morning Meeting — Radiology',
  department: 'Radiology',
  description:
    'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Radiology',
  layout: 'responsive',
  version: 2,
  lastModified: '2026-04-21',
  _legacyTab: 'Radiology',
  _legacyKpiFields: ['xrayCasesYesterday', 'usgCasesYesterday', 'ctCasesYesterday'],
  sections: [
    dateSection,
    {
      id: 'radiology-mandatory',
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'xrayCasesYesterday',
          label: '# of X-Ray cases (yesterday)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'usgCasesYesterday',
          label: '# of USG cases (yesterday)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'ctCasesYesterday',
          label: '# of CT cases (yesterday)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'equipmentStatus',
          label: 'Equipment status — CT / MRI / USG uptime',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      id: 'radiology-optional',
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'reportsDoneInHouse',
          label: '# of Reports done in-house',
          type: 'number',
          required: false,
          validation: { min: 0 },
        },
        {
          id: 'pendingReports',
          label: 'Pending reports — critical / non-critical',
          type: 'text',
          required: false,
        },
        {
          id: 'criticalResultsEscalated',
          label: 'Critical results escalated within TAT',
          type: 'text',
          required: false,
        },
        {
          id: 'filmContrastStock',
          label: 'Film / contrast stock status',
          type: 'text',
          required: false,
        },
        {
          id: 'radiationSafetyLog',
          label: 'Radiation safety log',
          type: 'text',
          required: false,
        },
      ],
    },
  ],
};
