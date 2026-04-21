// S3b — Native Smart Form: Supply Chain & Procurement
// Migrated from legacy form-definitions.ts supplyChainForm (slug 'supply-chain').
// Field ids and types preserved exactly to keep `department_data.entries[0].fields` key parity.
// Legacy had no conditional patches in registry.ts for this slug.

import type { SmartFormConfig } from '../types';
import { dateSection } from './_date-section';

export const supplyChainSmartForm: SmartFormConfig = {
  slug: 'supply-chain',
  title: 'EHRC Morning Meeting — Supply Chain & Procurement',
  department: 'Supply Chain & Procurement',
  description:
    'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Supply Chain & Procurement',
  layout: 'responsive',
  version: 2,
  lastModified: '2026-04-21',
  _legacyTab: 'Supply Chain',
  _legacyKpiFields: ['grnPrepared', 'poIssued', 'itemsProcuredEmergency'],
  sections: [
    dateSection,
    {
      id: 'supply-chain-mandatory',
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'criticalStockAvailability',
          label: 'Critical stock availability (status)',
          type: 'text',
          required: true,
        },
        {
          id: 'grnPrepared',
          label: '# of GRN prepared',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'poIssued',
          label: '# of PO issued',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'itemsProcuredEmergency',
          label: '# of items procured in emergency / after 5pm',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
      ],
    },
    {
      id: 'supply-chain-optional',
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'shortagesBackorders',
          label: 'Shortages / backorders',
          type: 'text',
          required: false,
        },
        {
          id: 'procurementEscalations',
          label: 'Procurement escalations',
          type: 'text',
          required: false,
        },
        {
          id: 'highValuePurchaseAlerts',
          label: 'High-value purchase alerts',
          type: 'text',
          required: false,
        },
        {
          id: 'pendingConsumptionReporting',
          label: 'Pending consumption reporting issues by dept',
          type: 'paragraph',
          required: false,
        },
      ],
    },
  ],
};
