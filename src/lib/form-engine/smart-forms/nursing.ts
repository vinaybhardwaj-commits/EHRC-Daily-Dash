// S3a — Native Smart Form: Nursing
// Migrated from legacy form-definitions.ts nursingForm (slug 'nursing').
// Field ids and types are preserved exactly to keep `department_data.entries[0].fields` key parity.
// Conditional patches that previously lived in registry.ts (nursing OT conditionals) are now native here.

import type { SmartFormConfig } from '../types';
import { dateSection } from './_date-section';

export const nursingSmartForm: SmartFormConfig = {
  slug: 'nursing',
  title: 'EHRC Morning Meeting — Nursing',
  department: 'Nursing',
  description:
    'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Nursing',
  layout: 'responsive',
  version: 2,
  lastModified: '2026-04-21',
  _legacyTab: 'Nursing',
  _legacyKpiFields: ['midnightCensusNursing', 'staffingMatrixNurses', 'dailyHaiIpcStatus'],
  sections: [
    dateSection,
    {
      id: 'nursing-mandatory',
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'midnightCensusNursing',
          label: 'Midnight census — patient count',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'staffingMatrixNurses',
          label: 'Staffing matrix — nurses on duty',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'escalationsConcerns',
          label: 'Escalations / concerns',
          type: 'paragraph',
          required: true,
        },
        {
          id: 'dailyHaiIpcStatus',
          label: 'Daily HAI/IPC status (CLABSI,VAP,CAUTI,SSI)',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      id: 'nursing-optional',
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'patientComplaintsSatisfaction',
          label: 'Patient complaints & satisfaction',
          type: 'text',
          required: false,
        },
        {
          id: 'infectionControlUpdate',
          label: 'Infection control update',
          type: 'text',
          required: false,
        },
        {
          id: 'biomedicalWasteIncidents',
          label: 'Biomedical waste incidents',
          type: 'number',
          required: false,
          validation: { min: 0 },
        },
        {
          id: 'cafeteriaDialysisUpdate',
          label: 'Cafeteria / dialysis update',
          type: 'text',
          required: false,
        },
      ],
    },
    {
      id: 'nursing-ot-support',
      title: 'OT SUPPORT',
      description:
        'OT metrics captured by nursing. Fill the OT section below if you are also reporting OT data today.',
      fields: [
        {
          id: 'otCasesAssistedToday',
          label: 'OT cases assisted today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'preOpChecklistsCompleted',
          label: 'Pre-op checklists completed',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'postOpHandoffsCompleted',
          label: 'Post-op handoffs completed',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'otTurnaroundIssues',
          label: 'OT turnaround issues (delays, equipment, staffing)',
          type: 'paragraph',
          required: false,
        },
      ],
    },
    {
      id: 'nursing-also-reporting-ot',
      title: 'ALSO REPORTING OT DATA TODAY?',
      description:
        'If the OT coordinator is unavailable, you can report OT daily summary data here. This will count as the OT submission for today.',
      fields: [
        {
          id: 'alsoReportingOtData',
          label: 'Are you also reporting OT data today?',
          type: 'radio',
          required: true,
          options: ['Yes', 'No'],
        },
        {
          id: 'otTotalCasesDoneToday',
          label: 'Total OT cases done today',
          type: 'number',
          required: false,
          validation: { min: 0 },
          showWhen: { field: 'alsoReportingOtData', operator: 'eq', value: 'Yes' },
          requireWhen: { field: 'alsoReportingOtData', operator: 'eq', value: 'Yes' },
        },
        {
          id: 'otFirstCaseOnTimeStart',
          label: 'First case on-time start?',
          type: 'radio',
          required: false,
          options: ['Yes', 'No'],
          showWhen: { field: 'alsoReportingOtData', operator: 'eq', value: 'Yes' },
          requireWhen: { field: 'alsoReportingOtData', operator: 'eq', value: 'Yes' },
        },
        {
          id: 'otDelayReason',
          label: 'If No: delay reason',
          type: 'paragraph',
          required: false,
          showWhen: {
            logic: 'and',
            conditions: [
              { field: 'alsoReportingOtData', operator: 'eq', value: 'Yes' },
              { field: 'otFirstCaseOnTimeStart', operator: 'eq', value: 'No' },
            ],
          },
        },
        {
          id: 'otCancellationsToday',
          label: 'OT cancellations today',
          type: 'number',
          required: false,
          validation: { min: 0 },
          showWhen: { field: 'alsoReportingOtData', operator: 'eq', value: 'Yes' },
          requireWhen: { field: 'alsoReportingOtData', operator: 'eq', value: 'Yes' },
        },
        {
          id: 'otCancellationReasons',
          label: 'If any: OT cancellation reasons',
          type: 'paragraph',
          required: false,
          showWhen: {
            logic: 'and',
            conditions: [
              { field: 'alsoReportingOtData', operator: 'eq', value: 'Yes' },
              { field: 'otCancellationsToday', operator: 'gt', value: 0 },
            ],
          },
        },
      ],
    },
  ],
};
