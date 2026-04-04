import type { DepartmentRubric } from '../types';

export const billingRubric: DepartmentRubric = {
  slug: 'billing',
  version: '1.0',
  context: {
    department_name: 'Billing',
    typical_daily_volume: '30-60 pipeline cases, 5-15 OT cases pending billing, 2-8 counselling sessions',
    key_concerns: [
      'Pipeline case backlog and clearance speed',
      'OT billing clearance delays',
      'DAMA/LAMA financial impact',
      'Financial counselling coverage',
    ],
    historical_context:
      'EHRC Billing tracks the revenue pipeline from admission to discharge. Pipeline cases are active patients with pending billing. OT cases awaiting clearance block discharge. DAMA/LAMA cases represent revenue leakage. Financial counselling reduces surprise bills and DAMA.',
  },
  rules: [
    {
      id: 'bill-pipeline-spike',
      name: 'Pipeline cases unusually high',
      description: 'Active pipeline count significantly above average — billing bottleneck risk',
      severity: 'high',
      condition: {
        type: 'historical',
        config: { field: 'pipelineCases', deviation_pct: 40, lookback_days: 7, direction: 'spike' },
      },
      question_template:
        'Pipeline cases today ({pipelineCases}) are {deviation_pct}% above the 7-day average. Is there a discharge backlog, TPA delay, or staffing issue causing the buildup?',
      context_fields: ['pipelineCases', 'otCasesAwaitingBilling', 'financialCounsellingDone'],
      enabled: true,
    },
    {
      id: 'bill-ot-clearance-backlog',
      name: 'OT cases awaiting billing clearance',
      description: 'High count of OT cases pending billing — delays surgeries and discharges',
      severity: 'high',
      condition: {
        type: 'threshold',
        config: { field: 'otCasesAwaitingBilling', operator: 'gt', value: 10 },
      },
      question_template:
        '{otCasesAwaitingBilling} OT cases are awaiting billing clearance. Which cases are most overdue? Is this impacting tomorrow\'s OT schedule?',
      context_fields: ['otCasesAwaitingBilling', 'pipelineCases', 'surgeriesPlannedNextDay'],
      enabled: true,
    },
    {
      id: 'bill-dama-lama',
      name: 'DAMA/LAMA cases reported',
      description: 'Any DAMA/LAMA represents revenue loss and possible care gap',
      severity: 'medium',
      condition: {
        type: 'threshold',
        config: { field: 'damaLama', operator: 'gt', value: 0 },
      },
      question_template:
        'You reported {damaLama} DAMA/LAMA case(s). Were financial counselling sessions done for these patients beforehand? What was the primary reason for leaving?',
      context_fields: ['damaLama', 'financialCounsellingDone', 'highRiskAlerts'],
      enabled: true,
    },
    {
      id: 'bill-high-risk-flagged',
      name: 'High-risk patient alerts flagged',
      description: 'High-risk alerts field has meaningful content — needs morning meeting discussion',
      severity: 'medium',
      condition: {
        type: 'pattern',
        config: { field: 'highRiskAlerts', pattern: '^(nil|NIL|none|N\\/A|-|na|NA|Nil|No|no)$', invert: true },
      },
      question_template:
        'High-risk patient alert: "{highRiskAlerts}". What is the current billing status and counselling plan for these patients?',
      context_fields: ['highRiskAlerts', 'financialCounsellingDone', 'pipelineCases'],
      enabled: true,
    },
  ],
};
