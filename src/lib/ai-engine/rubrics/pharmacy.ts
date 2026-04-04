import type { DepartmentRubric } from '../types';

export const pharmacyRubric: DepartmentRubric = {
  slug: 'pharmacy',
  version: '1.0',
  context: {
    department_name: 'Pharmacy',
    typical_daily_volume: 'Rs. 1-3L IP revenue, Rs. 50K-1.5L OP revenue, 0-2 stockouts',
    key_concerns: [
      'Stockout impact on patient care',
      'Revenue tracking (IP vs OP split)',
      'Expiring medicine management',
      'Revenue trends vs hospital census',
    ],
    historical_context:
      'EHRC Pharmacy serves both inpatients and outpatients. Stockouts force patients to buy externally (revenue loss + patient dissatisfaction). Expiring items within 3 months need return/liquidation action. Revenue should roughly track hospital census.',
  },
  rules: [
    {
      id: 'pharm-stockout',
      name: 'Stockout or shortage reported',
      description: 'Any stockout directly impacts patient care and revenue',
      severity: 'high',
      condition: {
        type: 'pattern',
        config: { field: 'stockoutsShortages', pattern: '^(nil|NIL|none|N\\/A|-|na|NA|Nil|No|no|No shortage|no shortage)$', invert: true },
      },
      question_template:
        'Stockout/shortage reported: "{stockoutsShortages}". Which medicines are affected? Are patients being asked to buy externally? Has procurement been alerted?',
      context_fields: ['stockoutsShortages', 'pharmacyRevenueIpToday', 'pharmacyRevenueOpToday'],
      enabled: true,
    },
    {
      id: 'pharm-revenue-ip-drop',
      name: 'IP pharmacy revenue significant drop',
      description: 'Inpatient revenue below rolling average — may indicate stockout or billing issue',
      severity: 'high',
      condition: {
        type: 'historical',
        config: { field: 'pharmacyRevenueIpToday', deviation_pct: 40, lookback_days: 7, direction: 'drop' },
      },
      question_template:
        'IP pharmacy revenue today (Rs. {pharmacyRevenueIpToday}) is {deviation_pct}% below the 7-day average. Is this due to low census, stockouts, or a billing gap?',
      context_fields: ['pharmacyRevenueIpToday', 'pharmacyRevenueMtd', 'stockoutsShortages'],
      enabled: true,
    },
    {
      id: 'pharm-expiry-flagged',
      name: 'Items expiring within 3 months',
      description: 'Expiry items flagged — needs return/liquidation action',
      severity: 'medium',
      condition: {
        type: 'pattern',
        config: { field: 'itemsExpiringWithin3Months', pattern: '^(nil|NIL|none|N\\/A|-|na|NA|Nil|No|no|0)$', invert: true },
      },
      question_template:
        'Items expiring within 3 months: "{itemsExpiringWithin3Months}". What is the plan — return to supplier, transfer to another branch, or liquidation?',
      context_fields: ['itemsExpiringWithin3Months', 'stockoutsShortages'],
      enabled: true,
    },
  ],
};
