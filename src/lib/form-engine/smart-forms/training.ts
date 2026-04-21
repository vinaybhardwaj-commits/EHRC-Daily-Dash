// S3c — Native Smart Form: Training
// Migrated from legacy form-definitions.ts trainingForm (slug 'training').
// Field ids and types preserved exactly to keep `department_data.entries[0].fields` key parity.
// Legacy had no conditional patches in registry.ts for this slug.

import type { SmartFormConfig } from '../types';
import { dateSection } from './_date-section';

export const trainingSmartForm: SmartFormConfig = {
  slug: 'training',
  title: 'EHRC Morning Meeting — Training',
  department: 'Training',
  description:
    'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Training',
  layout: 'responsive',
  version: 2,
  lastModified: '2026-04-21',
  _legacyTab: 'Training',
  _legacyKpiFields: ['trainingConductedTopic', 'trainingParticipants', 'mtdTrainingsStatus'],
  sections: [
    dateSection,
    {
      id: 'training-mandatory',
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'trainingConductedTopic',
          label: 'Training conducted today (topic)',
          type: 'text',
          required: true,
        },
        {
          id: 'trainingParticipants',
          label: '# of participants',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'mtdTrainingsStatus',
          label: 'MTD trainings completed vs planned',
          type: 'text',
          required: true,
        },
      ],
    },
  ],
};
