// Native Smart Form: Quality & Accreditations
// New dept (2026-05-05). Field set drawn from NABH 5th Edition daily quality-tracking
// conventions, scoped to ~2.5 min mandatory fill time. Per PRD §5.1.
// Form is dept-head-agnostic (filler identity captured via form_fillers, S2/R3 work).

import type { SmartFormConfig } from '../types';
import { dateSection } from './_date-section';

export const qualityAccreditationSmartForm: SmartFormConfig = {
  slug: 'quality-accreditation',
  title: 'EHRC Morning Meeting — Quality & Accreditations',
  department: 'Quality & Accreditations',
  description:
    'Fill this before the daily morning meeting.\n★ Starred fields are mandatory.\nTakes under 2.5 minutes.\n\nField set drawn from NABH daily quality-tracking conventions.',
  layout: 'responsive',
  version: 1,
  lastModified: '2026-05-05',
  _legacyTab: 'Quality',
  _legacyKpiFields: [
    'qualityAuditsRoundsToday',
    'openNonComplianceTotal',
    'adverseEventsToday',
  ],
  sections: [
    dateSection,
    {
      id: 'quality-mandatory',
      title: '★ MANDATORY FIELDS',
      fields: [
        {
          id: 'qualityAuditsRoundsToday',
          label: 'Quality audits / rounds completed today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'newNonComplianceToday',
          label: 'New non-compliances identified today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'openNonComplianceTotal',
          label: 'Open non-compliances — running total',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'adverseEventsToday',
          label: 'Adverse events today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'sentinelEventsToday',
          label: 'Sentinel events today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'nearMissesReportedToday',
          label: 'Near-misses reported today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'medicationErrorsReportedToday',
          label: 'Medication errors reported today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'documentationGapClosuresToday',
          label: 'NABH/JCI documentation gap closures done today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'criticalObservationOrEscalation',
          label: 'Critical observation or escalation',
          type: 'paragraph',
          required: true,
        },
      ],
    },
    {
      id: 'quality-optional',
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'qualityChampionTrainingToday',
          label: 'Quality champion training conducted today',
          type: 'text',
          required: false,
        },
        {
          id: 'mockDrillOrSimulationToday',
          label: 'Mock drill or simulation done today',
          type: 'text',
          required: false,
        },
        {
          id: 'qualityOtherNotes',
          label: 'Other notes',
          type: 'paragraph',
          required: false,
        },
      ],
    },
  ],
};
