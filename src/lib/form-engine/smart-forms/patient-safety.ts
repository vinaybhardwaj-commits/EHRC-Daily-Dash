// S3c — Native Smart Form: Patient Safety & Quality
// Migrated from legacy form-definitions.ts patientSafetyForm (slug 'patient-safety').
// Field ids and types preserved exactly to keep `department_data.entries[0].fields` key parity.
// Legacy had no conditional patches in registry.ts for this slug.

import type { SmartFormConfig } from '../types';
import { dateSection } from './_date-section';

const BUNDLE_OPTIONS = [
  'Yes — full compliance',
  'Partial — some steps missed',
  'No — bundle not followed',
  'N/A — no patients on this device today',
];

const AUDIT_OPTIONS = ['On track', 'Delayed — minor', 'Delayed — needs escalation', 'Not applicable today'];

export const patientSafetySmartForm: SmartFormConfig = {
  slug: 'patient-safety',
  title: 'EHRC Morning Meeting — Patient Safety & Quality',
  department: 'Patient Safety & Quality',
  description:
    'Fill this before the daily morning meeting.\n★ Starred fields are mandatory.\n\nThis form is a safety intelligence tool, not just a compliance checklist.\nAccurate daily data here directly supports NABH accreditation and drives RCA follow-through.',
  layout: 'responsive',
  version: 2,
  lastModified: '2026-04-21',
  _legacyTab: 'Patient Safety',
  _legacyKpiFields: ['adverseEvents', 'openRcasPastDue', 'totalOpenNabhNonCompliances'],
  sections: [
    dateSection,
    {
      id: 'incident-reporting',
      title: '★ INCIDENT REPORTING',
      description:
        'Report ALL incidents — near misses included. High near-miss reporting = healthy safety culture.\nNear miss: no patient harm, caught before reaching patient.\nAdverse event: reached patient, caused harm.\nSentinel event: serious harm, death, or never-event.',
      fields: [
        {
          id: 'nearMissIncidents',
          label: '# of Near-miss incidents reported today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'adverseEvents',
          label: '# of Adverse events reported today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'sentinelEvents',
          label: '# of Sentinel events reported today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'patientFalls',
          label: '# of Patient falls today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'medicationErrors',
          label: '# of Medication errors today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'underReportingFlag',
          label:
            'Under-reporting flag — any incident type you suspect was not reported today? (write NIL if none)',
          description:
            "Mandatory — not about naming individuals. About identifying where the culture of hiding exists.\ne.g. 'Likely medication error in ICU not reported' or 'OT team may have had a near miss'\nThis field is reviewed only by hospital leadership.",
          type: 'text',
          required: true,
        },
      ],
    },
    {
      id: 'rca-followthrough',
      title: '★ RCA & FOLLOW-THROUGH',
      description:
        "The biggest patient safety gap is not incidents — it's incidents with no follow-through.\nThese fields track the aging of open RCAs.",
      fields: [
        {
          id: 'openRcasInProgress',
          label: '# of open RCAs currently in progress (total pending)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'openRcasPastDue',
          label: '# of open RCAs past their due date',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'correctiveActionsClosed',
          label: '# of corrective actions closed today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'rcaSummary',
          label: 'RCA summary — any new RCA initiated or closed today? (brief details, or write NIL)',
          type: 'paragraph',
          required: true,
        },
      ],
    },
    {
      id: 'hai-bundles',
      title: '★ HAI BUNDLE COMPLIANCE',
      description:
        'Daily bundle compliance is the best leading indicator for HAI rates.\nBundle = the prevention checklist for each device/procedure.\nIf unsure, check with ICU/nursing in-charge before the meeting.',
      fields: [
        {
          id: 'centralLineBundleCompliance',
          label: 'Central Line bundle compliance today (CLABSI prevention)',
          type: 'radio',
          required: true,
          options: BUNDLE_OPTIONS,
        },
        {
          id: 'urinaryCatheterBundleCompliance',
          label: 'Urinary Catheter bundle compliance today (CAUTI prevention)',
          type: 'radio',
          required: true,
          options: BUNDLE_OPTIONS,
        },
        {
          id: 'ventilatorBundleCompliance',
          label: 'Ventilator bundle compliance today (VAP prevention)',
          type: 'radio',
          required: true,
          options: BUNDLE_OPTIONS,
        },
        {
          id: 'surgicalSiteBundleCompliance',
          label: 'Surgical site care bundle compliance today (SSI prevention)',
          type: 'radio',
          required: true,
          options: BUNDLE_OPTIONS,
        },
      ],
    },
    {
      id: 'nabh-audits',
      title: '★ NABH & AUDIT STATUS',
      description: 'Track the flow of non-compliances — not just that they exist.',
      fields: [
        {
          id: 'newNabhNonCompliances',
          label: '# of new NABH non-compliances identified today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'nabhNonComplainancesClosed',
          label: '# of NABH non-compliances closed today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'totalOpenNabhNonCompliances',
          label: '# of total open NABH non-compliances (running total)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'openAuditFindingsPastDue',
          label: '# of open audit findings past their due date',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'clinicalAuditStatus',
          label: 'Clinical audit status today',
          type: 'radio',
          required: true,
          options: AUDIT_OPTIONS,
        },
        {
          id: 'nonClinicalAuditStatus',
          label: 'Non-clinical audit status today',
          type: 'radio',
          required: true,
          options: AUDIT_OPTIONS,
        },
      ],
    },
    {
      id: 'safety-comm',
      title: '★ SAFETY COMMUNICATION',
      description:
        "NABH requires documented daily safety communication. This replaces the 'quality training reminders' field.",
      fields: [
        {
          id: 'staffSafetyBriefing',
          label: '# of staff who received a safety briefing or communication today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'safetyTopicToday',
          label: 'Topic of safety communication today (or write NIL)',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      id: 'ps-optional',
      title: 'OPTIONAL — ADDITIONAL NOTES',
      description: 'Fill only if relevant.',
      fields: [
        {
          id: 'qualitySafetyNotes',
          label: 'Any other quality / safety notes',
          type: 'paragraph',
          required: false,
        },
      ],
    },
  ],
};
