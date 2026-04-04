import type { DepartmentRubric } from '../types';

export const dietRubric: DepartmentRubric = {
  slug: 'diet',
  version: '1.0',
  context: {
    department_name: 'Diet & Nutrition',
    typical_daily_volume: '30-80 patient census, 5-15 BCAs/day, MTD target ~200+',
    key_concerns: [
      'BCA completion rate vs patient census',
      'Food feedback and patient satisfaction',
      'Kitchen incidents or delays',
      'Discharge planning with diet component',
    ],
    historical_context:
      'EHRC Diet department provides nutrition assessment (BCA — Body Composition Analysis) and meal services for inpatients. BCA should be done for most admitted patients. Negative food feedback directly impacts patient satisfaction scores. Kitchen delays or incidents need immediate resolution.',
  },
  rules: [
    {
      id: 'diet-bca-coverage-low',
      name: 'BCA coverage low relative to census',
      description: 'Few BCAs done compared to patient census — missed assessments',
      severity: 'high',
      condition: {
        type: 'cross_field',
        config: { field_a: 'dietPatientsCensus', field_b: 'bcaDoneToday', relationship: 'a_gt_b', threshold: 5 },
      },
      question_template:
        'Patient census is {dietPatientsCensus} but only {bcaDoneToday} BCAs done today. Are new admissions being assessed? What is preventing coverage?',
      context_fields: ['dietPatientsCensus', 'bcaDoneToday', 'bcaMtdTotal'],
      enabled: true,
    },
    {
      id: 'diet-negative-food-feedback',
      name: 'Negative food feedback reported',
      description: 'Patient complaints about food affect satisfaction scores',
      severity: 'medium',
      condition: {
        type: 'pattern',
        config: { field: 'foodFeedbackSummary', pattern: '(complaint|cold|late|bad|poor|stale|wrong|missing|insect|hair|unhygienic|dirty)', invert: false },
      },
      question_template:
        'Negative food feedback: "{foodFeedbackSummary}". Which ward/patient reported this? Has the kitchen been informed? What corrective action was taken?',
      context_fields: ['foodFeedbackSummary', 'kitchenUpdate', 'delaysIncidents'],
      enabled: true,
    },
    {
      id: 'diet-kitchen-incident',
      name: 'Kitchen delays or incidents reported',
      description: 'Kitchen issues impact meal delivery and patient care',
      severity: 'high',
      condition: {
        type: 'pattern',
        config: { field: 'delaysIncidents', pattern: '^(nil|NIL|none|N\\/A|-|na|NA|Nil|No|no)$', invert: true },
      },
      question_template:
        'Kitchen incident/delay reported: "{delaysIncidents}". Was meal service disrupted? How many patients were affected? Has this been escalated?',
      context_fields: ['delaysIncidents', 'kitchenUpdate', 'foodFeedbackSummary'],
      enabled: true,
    },
    {
      id: 'diet-zero-bca',
      name: 'No BCAs done today',
      description: 'Zero BCAs when patients exist suggests department not functioning',
      severity: 'high',
      condition: {
        type: 'threshold',
        config: { field: 'bcaDoneToday', operator: 'lt', value: 1 },
      },
      question_template:
        'Zero BCAs done today with {dietPatientsCensus} patients in census. Is the BCA equipment working? Was the dietitian available?',
      context_fields: ['bcaDoneToday', 'dietPatientsCensus', 'bcaMtdTotal'],
      enabled: true,
    },
  ],
};
