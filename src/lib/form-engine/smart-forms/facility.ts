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
  _legacyKpiFields: ['facilityReadiness', 'safetyIssues', 'housekeepingReadiness', 'backupOxygenCylindersAvailable'],
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
      id: 'facility-oxygen-cylinders',
      title: 'OXYGEN CYLINDER TRACKER',
      description:
        'Daily oxygen cylinder consumption (left + right manifold), backup census, and replenishment status. Critical infrastructure — fill every day without fail.',
      fields: [
        {
          id: 'leftManifoldCylindersChangedToday',
          label: 'Left manifold — cylinders changed today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'rightManifoldCylindersChangedToday',
          label: 'Right manifold — cylinders changed today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'backupOxygenCylindersAvailable',
          label: 'Backup oxygen cylinders available',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'pendingOxygenOrder',
          label: 'Pending oxygen cylinder order?',
          type: 'radio',
          required: true,
          options: ['Yes', 'No'],
        },
        {
          id: 'oxygenCylindersOrdered',
          label: 'Cylinders ordered',
          type: 'number',
          required: false,
          validation: { min: 1 },
          showWhen: { field: 'pendingOxygenOrder', operator: 'eq', value: 'Yes' },
          requireWhen: { field: 'pendingOxygenOrder', operator: 'eq', value: 'Yes' },
        },
        {
          id: 'oxygenCylindersExpectedArrival',
          label: 'Expected arrival date',
          description: 'If exact day is unknown, enter your best estimate.',
          type: 'date',
          required: false,
          showWhen: { field: 'pendingOxygenOrder', operator: 'eq', value: 'Yes' },
          requireWhen: { field: 'pendingOxygenOrder', operator: 'eq', value: 'Yes' },
        },
        {
          id: 'oxygenCylindersOrderNotes',
          label: 'Order notes (optional)',
          description: 'e.g., supplier confirmed, awaiting truck dispatch, partial delivery expected.',
          type: 'text',
          required: false,
          showWhen: { field: 'pendingOxygenOrder', operator: 'eq', value: 'Yes' },
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
