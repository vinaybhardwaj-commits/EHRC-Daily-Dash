import type { DepartmentRubric } from '../types';

export const financeRubric: DepartmentRubric = {
  slug: 'finance',
  version: '1.0',
  context: {
    department_name: 'Finance',
    typical_daily_volume: 'Rs. 8-15L daily revenue, 50-80 midnight census, 10-20 surgeries MTD',
    key_concerns: [
      'Daily and MTD revenue tracking',
      'ARPOB (Average Revenue Per Occupied Bed)',
      'Revenue leakage detection',
      'Census vs revenue correlation',
    ],
    historical_context:
      'EHRC Finance tracks revenue, occupancy, and surgical volume daily. Revenue drops or ARPOB anomalies often correlate with billing gaps, discharge spikes, or low census. The morning meeting expects Finance to flag deviations proactively.',
  },
  rules: [
    // ── CRITICAL ──
    {
      id: 'fin-revenue-crash',
      name: 'Daily revenue severe drop',
      description: 'Revenue for the day dropped dramatically compared to rolling average',
      severity: 'critical',
      condition: {
        type: 'historical',
        config: {
          field: 'revenueForDay',
          deviation_pct: 50,
          lookback_days: 7,
          direction: 'drop',
        },
      },
      question_template:
        'Daily revenue (Rs. {revenueForDay}) is {deviation_pct}% below the 7-day average. Was this due to low admissions, a discharge surge, or a billing backlog?',
      context_fields: ['revenueForDay', 'totalRevenueMtd', 'midnightCensus', 'surgeriesMtd'],
      enabled: true,
    },

    // ── HIGH ──
    {
      id: 'fin-arpob-drop',
      name: 'ARPOB below expected range',
      description: 'Average Revenue Per Occupied Bed is significantly below normal',
      severity: 'high',
      condition: {
        type: 'historical',
        config: {
          field: 'arpob',
          deviation_pct: 30,
          lookback_days: 7,
          direction: 'drop',
        },
      },
      question_template:
        'ARPOB today (Rs. {arpob}) is {deviation_pct}% below the 7-day average. Are there more low-value admissions, or is there a revenue capture issue?',
      context_fields: ['arpob', 'midnightCensus', 'revenueForDay'],
      enabled: true,
    },
    {
      id: 'fin-census-revenue-mismatch',
      name: 'High census but low revenue',
      description: 'Midnight census is above average but revenue is below — possible billing gap',
      severity: 'high',
      condition: {
        type: 'cross_field',
        config: {
          field_a: 'midnightCensus',
          field_b: 'revenueForDay',
          relationship: 'a_gt_b',
        },
      },
      question_template:
        'Midnight census is {midnightCensus} (healthy) but daily revenue is Rs. {revenueForDay}. Are there unbilled patients, pending discharges, or TPA delays holding up revenue?',
      context_fields: ['midnightCensus', 'revenueForDay', 'arpob', 'revenueLeakageAlerts'],
      enabled: true,
    },

    // ── MEDIUM ──
    {
      id: 'fin-leakage-not-nil',
      name: 'Revenue leakage alert flagged',
      description: 'Finance flagged a revenue leakage alert — needs discussion in morning meeting',
      severity: 'medium',
      condition: {
        type: 'pattern',
        config: {
          field: 'revenueLeakageAlerts',
          pattern: '^(nil|NIL|none|N\\/A|-|na|NA|Nil)$',
          invert: true,
        },
      },
      question_template:
        'You flagged a revenue leakage alert: "{revenueLeakageAlerts}". What is the estimated impact and what corrective action is being taken?',
      context_fields: ['revenueLeakageAlerts', 'revenueForDay', 'totalRevenueMtd'],
      enabled: true,
    },
    {
      id: 'fin-surgery-count-stall',
      name: 'Surgeries MTD not progressing',
      description: 'Surgery count appears stagnant — possible OT scheduling issue',
      severity: 'medium',
      condition: {
        type: 'historical',
        config: {
          field: 'surgeriesMtd',
          deviation_pct: 30,
          lookback_days: 5,
          direction: 'drop',
        },
      },
      question_template:
        'Surgeries MTD ({surgeriesMtd}) appears lower than the recent trend. Are there OT scheduling issues, cancellations, or a seasonal dip?',
      context_fields: ['surgeriesMtd', 'midnightCensus', 'revenueForDay'],
      enabled: true,
    },
  ],
};
