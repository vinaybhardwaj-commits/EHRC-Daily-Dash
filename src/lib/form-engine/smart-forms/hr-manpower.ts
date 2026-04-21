// S3d — Native Smart Form: HR & Manpower
// Migrated from legacy form-definitions.ts hrManpowerForm (slug 'hr-manpower').
// Field ids and types preserved exactly to keep `department_data.entries[0].fields` key parity.
// Conditional patches previously in registry.ts (6 weekly-hiring fields gated on
// hiringPipelineApplicable='Yes', with openPositionsCount also requireWhen)
// are now inlined natively on each field object.

import type { SmartFormConfig } from '../types';
import { dateSection } from './_date-section';

const HIRING_SHOW_WHEN = {
  field: 'hiringPipelineApplicable',
  operator: 'eq',
  value: 'Yes',
} as const;

export const hrManpowerSmartForm: SmartFormConfig = {
  slug: 'hr-manpower',
  title: 'EHRC Morning Meeting — HR & Manpower',
  department: 'HR & Manpower',
  description:
    'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: HR & Manpower',
  layout: 'responsive',
  version: 2,
  lastModified: '2026-04-21',
  _legacyTab: 'Human Resources',
  _legacyKpiFields: ['newJoinersToday', 'resignationsExitsToday', 'replacementStatus'],
  sections: [
    dateSection,
    {
      id: 'hr-mandatory',
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'newJoinersToday',
          label: 'New joiners today (names / nil)',
          type: 'text',
          required: true,
        },
        {
          id: 'resignationsExitsToday',
          label: 'Resignations / exits today (names / nil)',
          type: 'text',
          required: true,
        },
        {
          id: 'replacementStatus',
          label: 'Replacement status',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      id: 'hr-optional',
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'mandatoryTrainingInduction',
          label: 'Mandatory training / induction status',
          type: 'text',
          required: false,
        },
        {
          id: 'doctorProfileCreation',
          label: 'New doctor profile creation status',
          type: 'text',
          required: false,
        },
        {
          id: 'hrOtherNotes',
          label: 'Other notes',
          type: 'text',
          required: false,
        },
      ],
    },
    {
      id: 'hr-hiring-pipeline',
      title: 'WEEKLY HIRING PIPELINE (Mondays only)',
      description:
        'Update open positions and hiring status. Fill this section on Mondays only — skip on other days.',
      fields: [
        {
          id: 'hiringPipelineApplicable',
          label: 'Is today Monday? (Fill hiring pipeline)',
          type: 'radio',
          required: true,
          options: ['Yes', 'No'],
        },
        {
          id: 'openPositionsCount',
          label: 'Total open positions',
          type: 'number',
          required: false,
          validation: { min: 0 },
          showWhen: HIRING_SHOW_WHEN,
          requireWhen: HIRING_SHOW_WHEN,
        },
        {
          id: 'openPositionsList',
          label: 'Open positions list (role, department, days open, status)',
          description:
            'One position per line. Format: Role | Department | Days Open | Status (Sourcing / Interviewing / Offer / On Hold)',
          type: 'paragraph',
          required: false,
          showWhen: HIRING_SHOW_WHEN,
        },
        {
          id: 'interviewsScheduledThisWeek',
          label: 'Interviews scheduled this week',
          type: 'number',
          required: false,
          validation: { min: 0 },
          showWhen: HIRING_SHOW_WHEN,
        },
        {
          id: 'offersExtendedThisWeek',
          label: 'Offers extended this week',
          type: 'number',
          required: false,
          validation: { min: 0 },
          showWhen: HIRING_SHOW_WHEN,
        },
        {
          id: 'expectedJoinersThisWeek',
          label: 'Expected joiners this week (name, role, date)',
          description: 'One joiner per line. Format: Name | Role | Expected Join Date',
          type: 'paragraph',
          required: false,
          showWhen: HIRING_SHOW_WHEN,
        },
        {
          id: 'criticalVacancies',
          label: 'Critical vacancies (impacting patient care or operations)',
          description: 'List any vacancy that is urgent or impacting service delivery.',
          type: 'paragraph',
          required: false,
          showWhen: HIRING_SHOW_WHEN,
        },
      ],
    },
  ],
};
