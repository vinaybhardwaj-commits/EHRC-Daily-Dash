// S3b — Native Smart Form: Billing
// Migrated from legacy form-definitions.ts billingForm (slug 'billing').
// Field ids and types preserved exactly to keep `department_data.entries[0].fields` key parity.
// Legacy had no conditional patches in registry.ts for this slug.

import type { SmartFormConfig } from '../types';
import { dateSection } from './_date-section';

export const billingSmartForm: SmartFormConfig = {
  slug: 'billing',
  title: 'EHRC Morning Meeting — Billing',
  department: 'Billing',
  description:
    'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Billing',
  layout: 'responsive',
  version: 2,
  lastModified: '2026-04-21',
  _legacyTab: 'Billing',
  _legacyKpiFields: ['pipelineCases', 'otCasesAwaitingBilling', 'financialCounsellingDone'],
  sections: [
    dateSection,
    {
      id: 'billing-mandatory',
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'pipelineCases',
          label: '# of Pipeline cases (active, pending billing)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'otCasesAwaitingBilling',
          label: '# of OT cases with billing clearance pending',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'damaLama',
          label: '# of DAMA / LAMA',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'financialCounsellingDone',
          label: '# of Financial counselling sessions done today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
      ],
    },
    {
      id: 'billing-optional',
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'interimFinancialCounselling',
          label: '# of Interim financial counselling done',
          type: 'number',
          required: false,
          validation: { min: 0 },
        },
        {
          id: 'icuNicuCensus',
          label: 'ICU / NICU census',
          type: 'number',
          required: false,
          validation: { min: 0 },
        },
        {
          id: 'surgeriesPlannedNextDay',
          label: 'Surgeries planned for next day (details)',
          type: 'paragraph',
          required: false,
        },
        {
          id: 'highRiskAlerts',
          label: 'High-risk patient alerts',
          type: 'paragraph',
          required: false,
        },
        {
          id: 'ipAdmissionsWithPriorConsultation',
          label: '# of IP admissions where prior OPD / doctor consultation existed (planned, routed via ED after hours)',
          description: "Cross-check against ED head's night register count. Pull from system — look for admissions with a prior OPD visit or doctor note on file.",
          type: 'number',
          required: false,
          validation: { min: 0 },
        },
      ],
    },
  ],
};
