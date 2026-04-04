import type { DepartmentRubric } from '../types';

export const facilityRubric: DepartmentRubric = {
  slug: 'facility',
  version: '1.0',
  context: {
    department_name: 'Facility (FMS)',
    typical_daily_volume: 'Daily readiness check for power/water/gases, housekeeping rounds, 0-2 safety issues',
    key_concerns: [
      'Power, water, and medical gas availability',
      'Safety issue identification and resolution',
      'Housekeeping and room readiness for admissions',
      'Preventive maintenance schedule adherence',
    ],
    historical_context:
      'EHRC Facility Management ensures uninterrupted hospital infrastructure. Any issue with power, water, or medical gases is immediately critical. Safety issues must be documented even if minor. "All green" submissions on consecutive days warrant verification.',
  },
  rules: [
    // ── CRITICAL ──
    {
      id: 'fms-readiness-issue',
      name: 'Facility readiness issue flagged',
      description: 'Power, water, or gas availability issue detected in readiness text',
      severity: 'critical',
      condition: {
        type: 'pattern',
        config: {
          field: 'facilityReadiness',
          pattern: '(down|issue|fail|low|shortage|interrupt|outage|fault|repair|backup|generator|fluctuat|leak)',
          invert: false,
        },
      },
      question_template:
        'Facility readiness flagged: "{facilityReadiness}". What is the current status and estimated time to resolution? Are patient areas affected?',
      context_fields: ['facilityReadiness', 'safetyIssues', 'housekeepingReadiness'],
      enabled: true,
    },

    // ── HIGH ──
    {
      id: 'fms-safety-issues',
      name: 'Safety issues reported',
      description: 'Safety issues field has non-trivial content — requires morning meeting attention',
      severity: 'high',
      condition: {
        type: 'pattern',
        config: {
          field: 'safetyIssues',
          pattern: '^(nil|NIL|none|N\\/A|-|na|NA|Nil|No|no|no issue|No issue|None|NONE)$',
          invert: true,
        },
      },
      question_template:
        'Safety issues reported: "{safetyIssues}". Has this been communicated to the relevant team? What is the mitigation plan and timeline?',
      context_fields: ['safetyIssues', 'facilityReadiness', 'housekeepingReadiness'],
      enabled: true,
    },
    {
      id: 'fms-housekeeping-not-ready',
      name: 'Housekeeping / room readiness issue',
      description: 'Housekeeping readiness flagged as not complete — impacts admissions',
      severity: 'high',
      condition: {
        type: 'pattern',
        config: {
          field: 'housekeepingReadiness',
          pattern: '(not ready|delay|pending|dirty|unclean|shortage|incomplete|issue|staff shortage)',
          invert: false,
        },
      },
      question_template:
        'Housekeeping readiness: "{housekeepingReadiness}". How many rooms are affected? Will this impact today\'s planned admissions or surgeries?',
      context_fields: ['housekeepingReadiness', 'facilityReadiness'],
      enabled: true,
    },

    // ── MEDIUM ──
    {
      id: 'fms-pm-overdue',
      name: 'Preventive maintenance overdue or delayed',
      description: 'PM update suggests overdue or delayed maintenance tasks',
      severity: 'medium',
      condition: {
        type: 'pattern',
        config: {
          field: 'preventiveMaintenanceUpdate',
          pattern: '(overdue|delay|pending|skip|not done|postpone|reschedul|miss|behind)',
          invert: false,
        },
      },
      question_template:
        'Preventive maintenance update: "{preventiveMaintenanceUpdate}". Which equipment/areas are behind schedule? Is there a patient safety risk?',
      context_fields: ['preventiveMaintenanceUpdate', 'facilityReadiness', 'safetyIssues'],
      enabled: true,
    },
  ],
};
