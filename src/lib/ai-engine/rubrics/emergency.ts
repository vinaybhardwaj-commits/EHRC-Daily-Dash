import type { DepartmentRubric } from '../types';

export const emergencyRubric: DepartmentRubric = {
  slug: 'emergency',
  version: '1.0',
  context: {
    department_name: 'Emergency Department',
    typical_daily_volume: '15-30 genuine emergencies, 5-15 after-hours admissions, 1-5 MLC cases',
    key_concerns: [
      'Door-to-doctor TAT for genuine emergencies',
      'Deaths and LAMA/DAMA rates',
      'MLC case documentation',
      'LWBS (left without being seen) rate',
      'Code activations and critical alerts',
    ],
    historical_context:
      'EHRC Emergency Department sees a mix of genuine walk-in/ambulance emergencies and planned admissions routed through ED after hours. Low door-to-doctor TAT is critical for genuine emergencies. Deaths and LAMA/DAMA must always have documented context.',
  },
  rules: [
    // ── CRITICAL ──
    {
      id: 'ed-deaths-no-details',
      name: 'Deaths reported without context',
      description: 'Deaths reported but no anticipated challenges or notes provided for context',
      severity: 'critical',
      condition: {
        type: 'missing',
        config: {
          trigger_field: 'deaths',
          trigger_operator: 'gt',
          trigger_value: 0,
          required_field: 'anticipatedChallenges',
        },
      },
      question_template:
        'You reported {deaths} death(s) in the ED today but provided no notes or context. Could you share details — was this expected (terminal patient) or unexpected? Any clinical review initiated?',
      context_fields: ['deaths', 'genuineEmergencies', 'criticalAlerts', 'anticipatedChallenges'],
      enabled: true,
    },
    {
      id: 'ed-sentinel-no-incident',
      name: 'Critical alerts without incident reports',
      description: 'Code Blue/Red/Yellow activations but zero incident reports filed',
      severity: 'critical',
      condition: {
        type: 'cross_field',
        config: {
          field_a: 'criticalAlerts',
          field_b: 'edIncidentReports',
          relationship: 'a_implies_b',
        },
      },
      question_template:
        'You reported {criticalAlerts} critical alert(s) (Code Blue/Red/Yellow) but {edIncidentReports} incident reports. Were incident reports filed for each code activation?',
      context_fields: ['criticalAlerts', 'edIncidentReports', 'deaths'],
      enabled: true,
    },

    // ── HIGH ──
    {
      id: 'ed-high-tat',
      name: 'Door-to-doctor TAT exceeds 15 minutes',
      description: 'Average TAT for genuine emergencies is too high',
      severity: 'high',
      condition: {
        type: 'threshold',
        config: {
          field: 'doorToDoctorTat',
          operator: 'gt',
          value: 15,
        },
      },
      question_template:
        'Door-to-doctor TAT today is {doorToDoctorTat} minutes — above the 15-minute target. What caused the delay (staffing, surge volume, triage bottleneck)?',
      context_fields: ['doorToDoctorTat', 'genuineEmergencies', 'triageL1L2Count'],
      enabled: true,
    },
    {
      id: 'ed-lama-dama-spike',
      name: 'LAMA/DAMA count unusually high',
      description: 'LAMA/DAMA significantly above rolling average — possible care or communication issue',
      severity: 'high',
      condition: {
        type: 'historical',
        config: {
          field: 'lamaDama',
          deviation_pct: 50,
          lookback_days: 7,
          direction: 'spike',
        },
      },
      question_template:
        'LAMA/DAMA count today ({lamaDama}) is {deviation_pct}% above the 7-day average. Were there specific cases driving this? Any financial counselling gaps identified?',
      context_fields: ['lamaDama', 'genuineEmergencies', 'deaths'],
      enabled: true,
    },
    {
      id: 'ed-revenue-drop',
      name: 'ED revenue significant drop',
      description: 'Daily ED revenue is well below the rolling average',
      severity: 'high',
      condition: {
        type: 'historical',
        config: {
          field: 'edRevenueToday',
          deviation_pct: 40,
          lookback_days: 7,
          direction: 'drop',
        },
      },
      question_template:
        'ED revenue today (Rs. {edRevenueToday}) is {deviation_pct}% below the 7-day average. Was this a low-volume day, or were there billing/collection issues?',
      context_fields: ['edRevenueToday', 'genuineEmergencies', 'afterHoursAdmissions'],
      enabled: true,
    },

    // ── MEDIUM ──
    {
      id: 'ed-lwbs-high',
      name: 'High LWBS count',
      description: 'Patients leaving without being seen is above expected threshold',
      severity: 'medium',
      condition: {
        type: 'threshold',
        config: {
          field: 'patientsLwbs',
          operator: 'gt',
          value: 3,
        },
      },
      question_template:
        '{patientsLwbs} patients left without being seen. Was this due to long wait times, specific time of day, or patients triaged to lower acuity?',
      context_fields: ['patientsLwbs', 'genuineEmergencies', 'doorToDoctorTat', 'triageL1L2Count'],
      enabled: true,
    },
    {
      id: 'ed-volume-spike',
      name: 'Unusual surge in emergency volume',
      description: 'Genuine emergency count significantly above average — may indicate mass casualty or seasonal surge',
      severity: 'medium',
      condition: {
        type: 'historical',
        config: {
          field: 'genuineEmergencies',
          deviation_pct: 60,
          lookback_days: 7,
          direction: 'spike',
        },
      },
      question_template:
        'Genuine emergency volume today ({genuineEmergencies}) is {deviation_pct}% above the 7-day average. Was there a specific event (accident, outbreak) or seasonal pattern driving this?',
      context_fields: ['genuineEmergencies', 'triageL1L2Count', 'doorToDoctorTat', 'criticalAlerts'],
      enabled: true,
    },
  ],
};
