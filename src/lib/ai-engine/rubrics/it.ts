import type { DepartmentRubric } from '../types';

export const itRubric: DepartmentRubric = {
  slug: 'it',
  version: '1.0',
  context: {
    department_name: 'IT',
    typical_daily_volume: '5-20 pending tickets, HIS uptime target 99.5%+',
    key_concerns: [
      'HIS (Hospital Information System) downtime',
      'Pending IT ticket backlog',
      'Integration issues between systems',
      'Security patches and upgrade progress',
    ],
    historical_context:
      'EHRC IT maintains the Hospital Information System (HIS), network, and integrations (lab, pharmacy, billing). HIS downtime halts admissions, billing, and clinical orders. Ticket backlog growing indicates capacity issues. Integration failures break data flow between departments.',
  },
  rules: [
    {
      id: 'it-his-downtime',
      name: 'HIS downtime or instability reported',
      description: 'Any HIS downtime blocks hospital operations',
      severity: 'critical',
      condition: {
        type: 'pattern',
        config: { field: 'hisUptimeDowntime', pattern: '(down|outage|slow|unstable|intermittent|issue|error|crash|offline|degraded)', invert: false },
      },
      question_template:
        'HIS status: "{hisUptimeDowntime}". What is the nature of the issue? How long has it been down? Which departments are impacted? Is manual backup in place?',
      context_fields: ['hisUptimeDowntime', 'integrationIssues', 'pendingItTickets'],
      enabled: true,
    },
    {
      id: 'it-ticket-backlog-high',
      name: 'Pending IT ticket count high',
      description: 'Growing ticket backlog indicates capacity or prioritization issue',
      severity: 'high',
      condition: {
        type: 'threshold',
        config: { field: 'pendingItTickets', operator: 'gt', value: 15 },
      },
      question_template:
        '{pendingItTickets} IT tickets pending. How many are critical/patient-impacting? What is the oldest open ticket? Is additional support needed?',
      context_fields: ['pendingItTickets', 'hisUptimeDowntime', 'itOtherNotes'],
      enabled: true,
    },
    {
      id: 'it-integration-issues',
      name: 'System integration issues reported',
      description: 'Integration failures break data flow between departments',
      severity: 'high',
      condition: {
        type: 'pattern',
        config: { field: 'integrationIssues', pattern: '^(nil|NIL|none|N\\/A|-|na|NA|Nil|No|no)$', invert: true },
      },
      question_template:
        'Integration issue: "{integrationIssues}". Which systems are affected? Is data flowing manually as a workaround? ETA for fix?',
      context_fields: ['integrationIssues', 'hisUptimeDowntime', 'pendingItTickets'],
      enabled: true,
    },
    {
      id: 'it-upgrades-stalled',
      name: 'Upgrades or patches stalled',
      description: 'Stalled upgrades may indicate security risk or vendor issues',
      severity: 'medium',
      condition: {
        type: 'pattern',
        config: { field: 'upgradesPatchesProgress', pattern: '(stall|delay|block|pending|hold|stuck|fail|issue|not started)', invert: false },
      },
      question_template:
        'Upgrade/patch status: "{upgradesPatchesProgress}". What is blocking progress? Are there security implications from the delay?',
      context_fields: ['upgradesPatchesProgress', 'hisUptimeDowntime', 'itOtherNotes'],
      enabled: true,
    },
  ],
};
