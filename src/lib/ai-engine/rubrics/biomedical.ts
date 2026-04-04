import type { DepartmentRubric } from '../types';

export const biomedicalRubric: DepartmentRubric = {
  slug: 'biomedical',
  version: '1.0',
  context: {
    department_name: 'Biomedical Engineering',
    typical_daily_volume: '0-3 breakdowns, 2-5 pending repairs, PM schedule ongoing',
    key_concerns: [
      'Equipment readiness for clinical departments',
      'Breakdown response time and resolution',
      'Preventive maintenance compliance',
      'Pending repair backlog',
    ],
    historical_context:
      'EHRC Biomedical maintains all medical equipment — ventilators, monitors, OT tables, imaging machines, dialysis units, etc. Equipment downtime directly impacts patient care. NABH requires documented PM schedules with >90% compliance. Breakdown backlog growing means risk accumulating.',
  },
  rules: [
    {
      id: 'bme-readiness-issue',
      name: 'Equipment readiness not fully operational',
      description: 'Any equipment readiness issue may impact patient care',
      severity: 'critical',
      condition: {
        type: 'pattern',
        config: { field: 'equipmentReadiness', pattern: '(down|not ready|issue|fault|partial|offline|critical|risk|red)', invert: false },
      },
      question_template:
        'Equipment readiness flagged: "{equipmentReadiness}". Which equipment and department is affected? Is patient care impacted? ETA for resolution?',
      context_fields: ['equipmentReadiness', 'breakdownUpdates', 'pendingRepairs'],
      enabled: true,
    },
    {
      id: 'bme-breakdown-active',
      name: 'Active breakdown reported',
      description: 'Equipment breakdown needs immediate attention and tracking',
      severity: 'high',
      condition: {
        type: 'pattern',
        config: { field: 'breakdownUpdates', pattern: '^(nil|NIL|none|N\\/A|-|na|NA|Nil|No|no)$', invert: true },
      },
      question_template:
        'Breakdown reported: "{breakdownUpdates}". Which department is impacted? Is a service engineer on-site? What is the expected repair time?',
      context_fields: ['breakdownUpdates', 'equipmentReadiness', 'pendingRepairs'],
      enabled: true,
    },
    {
      id: 'bme-pending-repairs-high',
      name: 'High pending repair count',
      description: 'Growing repair backlog means accumulating risk',
      severity: 'high',
      condition: {
        type: 'threshold',
        config: { field: 'pendingRepairs', operator: 'gt', value: 5 },
      },
      question_template:
        '{pendingRepairs} repairs are pending. Which are the oldest? Are any critical care equipment items in this backlog? What is the bottleneck — parts, vendor, or manpower?',
      context_fields: ['pendingRepairs', 'breakdownUpdates', 'equipmentReadiness'],
      enabled: true,
    },
    {
      id: 'bme-pm-non-compliance',
      name: 'Preventive maintenance compliance issue',
      description: 'PM compliance below threshold is a NABH audit risk',
      severity: 'medium',
      condition: {
        type: 'pattern',
        config: { field: 'preventiveMaintenanceCompliance', pattern: '(behind|delay|miss|gap|low|below|pending|overdue|incomplete|not done)', invert: false },
      },
      question_template:
        'PM compliance flagged: "{preventiveMaintenanceCompliance}". Which equipment categories are behind? NABH requires >90% PM compliance. What is the catch-up plan?',
      context_fields: ['preventiveMaintenanceCompliance', 'pendingRepairs', 'equipmentReadiness'],
      enabled: true,
    },
  ],
};
