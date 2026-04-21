// S3d — Native Smart Form: Biomedical
// Migrated from legacy form-definitions.ts biomedicalForm (slug 'biomedical').
// Field ids and types preserved exactly to keep `department_data.entries[0].fields` key parity.
// Legacy had no conditional patches in registry.ts for this slug.

import type { SmartFormConfig } from '../types';
import { dateSection } from './_date-section';

export const biomedicalSmartForm: SmartFormConfig = {
  slug: 'biomedical',
  title: 'EHRC Morning Meeting — Biomedical',
  department: 'Biomedical',
  description:
    'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Biomedical',
  layout: 'responsive',
  version: 2,
  lastModified: '2026-04-21',
  _legacyTab: 'Biomedical',
  _legacyKpiFields: ['equipmentReadiness', 'breakdownUpdates', 'pendingRepairs'],
  sections: [
    dateSection,
    {
      id: 'biomedical-mandatory',
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'equipmentReadiness',
          label: 'Equipment readiness — OT, ICU, etc.',
          type: 'text',
          required: true,
        },
        {
          id: 'breakdownUpdates',
          label: 'Breakdown updates',
          type: 'text',
          required: true,
        },
        {
          id: 'pendingRepairs',
          label: 'Pending repairs',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      id: 'biomedical-optional',
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'preventiveMaintenanceCompliance',
          label: 'Preventive maintenance compliance',
          type: 'text',
          required: false,
        },
        {
          id: 'biomedicalOtherNotes',
          label: 'Other notes',
          type: 'text',
          required: false,
        },
      ],
    },
  ],
};
