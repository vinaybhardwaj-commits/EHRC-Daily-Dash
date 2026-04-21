// S3d — Native Smart Form: IT
// Migrated from legacy form-definitions.ts itForm (slug 'it').
// Field ids and types preserved exactly to keep `department_data.entries[0].fields` key parity.
// Legacy had no conditional patches in registry.ts for this slug.

import type { SmartFormConfig } from '../types';
import { dateSection } from './_date-section';

export const itSmartForm: SmartFormConfig = {
  slug: 'it',
  title: 'EHRC Morning Meeting — IT',
  department: 'IT',
  description:
    'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: IT',
  layout: 'responsive',
  version: 2,
  lastModified: '2026-04-21',
  _legacyTab: 'IT',
  _legacyKpiFields: ['hisUptimeDowntime', 'pendingItTickets', 'upgradesPatchesProgress'],
  sections: [
    dateSection,
    {
      id: 'it-mandatory',
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'hisUptimeDowntime',
          label: 'HIS uptime / downtime status',
          type: 'text',
          required: true,
        },
        {
          id: 'pendingItTickets',
          label: '# of Pending IT tickets',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'upgradesPatchesProgress',
          label: 'Upgrades / patches in progress',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      id: 'it-optional',
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'integrationIssues',
          label: 'Integration issues',
          type: 'text',
          required: false,
        },
        {
          id: 'itOtherNotes',
          label: 'Other notes',
          type: 'text',
          required: false,
        },
      ],
    },
  ],
};
