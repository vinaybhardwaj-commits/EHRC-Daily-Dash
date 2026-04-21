// S3d — Native Smart Form: Facility
// Migrated from legacy form-definitions.ts facilityForm (slug 'facility').
// Field ids and types preserved exactly to keep `department_data.entries[0].fields` key parity.
// Conditional patch previously in registry.ts (breakdownDetails gated on majorBreakdownToday='Yes')
// is now inlined natively on the field object.

import type { SmartFormConfig } from '../types';
import { dateSection } from './_date-section';

export const facilitySmartForm: SmartFormConfig = {
  slug: 'facility',
  title: 'EHRC Morning Meeting — Facility',
  department: 'Facility',
  description:
    'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Facility',
  layout: 'responsive',
  version: 2,
  lastModified: '2026-04-21',
  _legacyTab: 'FMS',
  _legacyKpiFields: ['facilityReadiness', 'safetyIssues', 'housekeepingReadiness'],
  sections: [
    dateSection,
    {
      id: 'facility-mandatory',
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'facilityReadiness',
          label: 'Facility readiness — power / water / gases',
          type: 'text',
          required: true,
        },
        {
          id: 'safetyIssues',
          label: 'Safety issues',
          type: 'text',
          required: true,
        },
        {
          id: 'housekeepingReadiness',
          label: 'Housekeeping & room readiness',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      id: 'facility-optional',
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'preventiveMaintenanceUpdate',
          label: 'Preventive maintenance update',
          type: 'text',
          required: false,
        },
        {
          id: 'facilityOtherNotes',
          label: 'Other notes',
          type: 'text',
          required: false,
        },
      ],
    },
    {
      id: 'facility-breakdowns',
      title: 'MAJOR BREAKDOWNS & INCIDENTS',
      description: 'Report any major equipment or system breakdowns today.',
      fields: [
        {
          id: 'majorBreakdownToday',
          label: 'Any major breakdown today?',
          type: 'radio',
          required: true,
          options: ['Yes', 'No'],
        },
        {
          id: 'breakdownDetails',
          label: 'Breakdown details (equipment/system, impact, status, estimated repair timeline)',
          description:
            'Enter one breakdown per line. Format: Equipment | Impact (Patient Safety Risk / Service Disruption / Cost Impact / Minor) | Status (Active / Contained / Resolved) | Timeline',
          type: 'paragraph',
          required: false,
          showWhen: { field: 'majorBreakdownToday', operator: 'eq', value: 'Yes' },
        },
      ],
    },
  ],
};
