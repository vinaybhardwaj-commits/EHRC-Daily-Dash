// S3b — Native Smart Form: Emergency
// Migrated from legacy form-definitions.ts emergencyForm (slug 'emergency').
// Field ids and types preserved exactly to keep `department_data.entries[0].fields` key parity.
// Legacy had no conditional patches in registry.ts for this slug (none needed).

import type { SmartFormConfig } from '../types';
import { dateSection } from './_date-section';

export const emergencySmartForm: SmartFormConfig = {
  slug: 'emergency',
  title: 'EHRC Morning Meeting — Emergency Department',
  department: 'Emergency',
  description:
    'Fill this before the daily morning meeting.\n★ Starred fields are mandatory.\nTakes under 3 minutes.\n\nSeparate genuine walk-in/ambulance emergencies from planned admissions routed through ED after hours.',
  layout: 'responsive',
  version: 2,
  lastModified: '2026-04-21',
  _legacyTab: 'ED',
  _legacyKpiFields: ['genuineEmergencies', 'doorToDoctorTat'],
  sections: [
    dateSection,
    {
      id: 'emergency-mandatory',
      title: '★ MANDATORY FIELDS',
      fields: [
        {
          id: 'genuineEmergencies',
          label: '# of genuine walk-in/ambulance emergencies (last 24h)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'afterHoursAdmissions',
          label: '# of after-hours planned admissions routed through ED',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'doorToDoctorTat',
          label: 'Door-to-doctor TAT emergencies only (avg minutes)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'patientsLwbs',
          label: '# of patients LWBS',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'deaths',
          label: '# of Deaths',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'mlcCases',
          label: '# of MLC cases registered',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'triageL1L2Count',
          label: 'Triage L1 + L2 count',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
      ],
    },
    {
      id: 'emergency-oncall-contact',
      title: 'ON-CALL SPECIALIST CONTACT',
      description:
        'In the last 24h, did the ED doctor have any trouble contacting an on-call specialist or hospitalist? Flip to YES below if there was even one incident — then add one row per attempt.',
      fields: [
        {
          id: 'contactDifficultyToday',
          label: 'Any trouble contacting an on-call specialist or hospitalist?',
          type: 'toggle',
          required: true,
        },
        {
          id: 'contactDifficultyIncidents',
          label: 'Incidents',
          description: 'Add one row per specialist contact difficulty in the last 24h.',
          type: 'repeater',
          required: false,
          showWhen: { field: 'contactDifficultyToday', operator: 'eq', value: true },
          requireWhen: { field: 'contactDifficultyToday', operator: 'eq', value: true },
          repeaterConfig: {
            minRows: 1,
            maxRows: 10,
            addLabel: '+ Add another incident',
            emptyMessage: 'No incidents added yet.',
            fields: [
              {
                id: 'specialistName',
                label: 'Specialist name',
                type: 'text',
                required: true,
                placeholder: 'e.g., Dr. Mehta',
              },
              {
                id: 'specialty',
                label: 'Specialty / role',
                type: 'text',
                required: true,
                placeholder: 'e.g., Cardiology, Hospitalist',
              },
              {
                id: 'attemptTime',
                label: 'Time of contact attempt (24h)',
                type: 'time',
                required: true,
              },
              {
                id: 'outcome',
                label: 'What happened?',
                type: 'text',
                required: true,
                placeholder: 'e.g., reached after 35 min via backup; patient transferred to ICU during wait',
              },
            ],
          },
        },
      ],
    },
    {
      id: 'emergency-optional',
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'lamaDama',
          label: '# of LAMA/DAMA',
          type: 'number',
          required: false,
          validation: { min: 0 },
        },
        {
          id: 'criticalAlerts',
          label: '# of Critical alerts (Code Blue/Red/Yellow)',
          type: 'number',
          required: false,
          validation: { min: 0 },
        },
        {
          id: 'edIncidentReports',
          label: '# of ED incident reports',
          type: 'number',
          required: false,
          validation: { min: 0 },
        },
        {
          id: 'anticipatedChallenges',
          label: 'Anticipated challenges/other notes',
          type: 'paragraph',
          required: false,
        },
      ],
    },
  ],
};
