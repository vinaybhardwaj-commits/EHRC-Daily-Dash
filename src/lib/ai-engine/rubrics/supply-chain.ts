import type { DepartmentRubric } from '../types';

export const supplyChainRubric: DepartmentRubric = {
  slug: 'supply-chain',
  version: '1.0',
  context: {
    department_name: 'Supply Chain & Procurement',
    typical_daily_volume: '10-30 GRN, 5-15 PO, 0-3 emergency procurements',
    key_concerns: [
      'Critical stock availability for patient care',
      'Emergency procurement frequency (cost and process indicator)',
      'Shortage and backorder management',
      'High-value purchase governance',
    ],
    historical_context:
      'EHRC Supply Chain manages procurement, inventory, and distribution of medical supplies and consumables. Emergency after-hours procurement is expensive and indicates planning gaps. Critical stock shortages directly impact patient care.',
  },
  rules: [
    {
      id: 'sc-critical-stock-issue',
      name: 'Critical stock availability issue',
      description: 'Critical stock status indicates a shortage or risk',
      severity: 'critical',
      condition: {
        type: 'pattern',
        config: { field: 'criticalStockAvailability', pattern: '(low|short|out|unavail|critical|red|stockout|delay|pending|issue|risk)', invert: false },
      },
      question_template:
        'Critical stock status flagged: "{criticalStockAvailability}". Which items are affected? Is patient care impacted? What is the expected resolution?',
      context_fields: ['criticalStockAvailability', 'shortagesBackorders', 'itemsProcuredEmergency'],
      enabled: true,
    },
    {
      id: 'sc-emergency-procurement-spike',
      name: 'High emergency procurement count',
      description: 'Multiple items procured in emergency — suggests planning failure',
      severity: 'high',
      condition: {
        type: 'threshold',
        config: { field: 'itemsProcuredEmergency', operator: 'gt', value: 3 },
      },
      question_template:
        '{itemsProcuredEmergency} items were procured in emergency / after 5pm. Which departments requested these? Is this a recurring pattern or a one-off?',
      context_fields: ['itemsProcuredEmergency', 'criticalStockAvailability', 'shortagesBackorders'],
      enabled: true,
    },
    {
      id: 'sc-shortages-flagged',
      name: 'Shortages or backorders reported',
      description: 'Shortage field has meaningful content requiring follow-up',
      severity: 'medium',
      condition: {
        type: 'pattern',
        config: { field: 'shortagesBackorders', pattern: '^(nil|NIL|none|N\\/A|-|na|NA|Nil|No|no)$', invert: true },
      },
      question_template:
        'Shortages/backorders reported: "{shortagesBackorders}". What is the ETA for restocking? Are alternative suppliers being contacted?',
      context_fields: ['shortagesBackorders', 'criticalStockAvailability', 'procurementEscalations'],
      enabled: true,
    },
    {
      id: 'sc-high-value-alert',
      name: 'High-value purchase alert',
      description: 'High-value purchase flagged — needs GM visibility',
      severity: 'medium',
      condition: {
        type: 'pattern',
        config: { field: 'highValuePurchaseAlerts', pattern: '^(nil|NIL|none|N\\/A|-|na|NA|Nil|No|no)$', invert: true },
      },
      question_template:
        'High-value purchase alert: "{highValuePurchaseAlerts}". Has this been approved through the standard procurement process? What is the amount and urgency?',
      context_fields: ['highValuePurchaseAlerts', 'procurementEscalations'],
      enabled: true,
    },
  ],
};
