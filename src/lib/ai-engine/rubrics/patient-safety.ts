import type { DepartmentRubric } from '../types';

export const patientSafetyRubric: DepartmentRubric = {
  slug: 'patient-safety',
  version: '1.0',
  context: {
    department_name: 'Patient Safety & Quality',
    typical_daily_volume: '0-3 near misses, 0-1 adverse events, 3-8 open RCAs, 85-100% bundle compliance',
    key_concerns: [
      'Under-reporting of incidents (safety culture indicator)',
      'Sentinel events requiring immediate RCA',
      'HAI bundle compliance rates',
      'NABH non-compliance aging',
      'Open RCA follow-through',
    ],
    historical_context:
      'EHRC Patient Safety tracks incident reporting, RCA completion, HAI bundle compliance, and NABH audit status. Under-reporting is the biggest risk — a day with zero incidents across all categories may indicate hiding rather than safety. High near-miss reporting is a positive indicator of safety culture.',
  },
  rules: [
    // ── CRITICAL ──
    {
      id: 'ps-sentinel-no-rca',
      name: 'Sentinel event without new RCA',
      description: 'Sentinel event reported but no RCA summary or corrective action initiated',
      severity: 'critical',
      condition: {
        type: 'missing',
        config: {
          trigger_field: 'sentinelEvents',
          trigger_operator: 'gt',
          trigger_value: 0,
          required_field: 'rcaSummary',
        },
      },
      question_template:
        'You reported {sentinelEvents} sentinel event(s) but the RCA summary is empty. Has a root cause analysis been initiated? Who is leading it?',
      context_fields: ['sentinelEvents', 'adverseEvents', 'rcaSummary', 'openRcasInProgress'],
      enabled: true,
    },
    {
      id: 'ps-bundle-non-compliance',
      name: 'HAI bundle marked non-compliant',
      description: 'One or more HAI prevention bundles marked as "No — bundle not followed"',
      severity: 'critical',
      condition: {
        type: 'pattern',
        config: {
          field: 'centralLineBundleCompliance',
          pattern: 'No.*bundle not followed',
          invert: false,
        },
      },
      question_template:
        'Central line bundle compliance marked as "No — bundle not followed". Which ICU/ward was this? What steps are being taken to address the lapse today?',
      context_fields: ['centralLineBundleCompliance', 'urinaryCathetherBundleCompliance', 'ventilatorBundleCompliance', 'surgicalSiteBundleCompliance'],
      enabled: true,
    },

    // ── HIGH ──
    {
      id: 'ps-under-reporting-flag',
      name: 'Under-reporting suspected',
      description: 'Under-reporting flag has meaningful content (not NIL) — safety culture concern',
      severity: 'high',
      condition: {
        type: 'pattern',
        config: {
          field: 'underReportingFlag',
          pattern: '^(nil|NIL|none|N\\/A|-|na|NA|Nil|No|no)$',
          invert: true,
        },
      },
      question_template:
        'You flagged potential under-reporting: "{underReportingFlag}". What is the plan to address this — follow-up with the department, anonymous reporting reminder, or patient safety walk?',
      context_fields: ['underReportingFlag', 'nearMissIncidents', 'adverseEvents', 'sentinelEvents'],
      enabled: true,
    },
    {
      id: 'ps-rca-past-due',
      name: 'RCAs past their due date',
      description: 'Open RCAs beyond deadline — follow-through gap',
      severity: 'high',
      condition: {
        type: 'threshold',
        config: {
          field: 'openRcasPastDue',
          operator: 'gt',
          value: 2,
        },
      },
      question_template:
        '{openRcasPastDue} RCAs are past their due date (of {openRcasInProgress} total open). Which cases are most overdue and what is the bottleneck in closing them?',
      context_fields: ['openRcasPastDue', 'openRcasInProgress', 'correctiveActionsClosed'],
      enabled: true,
    },
    {
      id: 'ps-nabh-backlog-growing',
      name: 'NABH non-compliance backlog growing',
      description: 'More new non-compliances than closed — backlog expanding',
      severity: 'high',
      condition: {
        type: 'cross_field',
        config: {
          field_a: 'newNabhNonCompliances',
          field_b: 'nabhNonComplainancesClosed',
          relationship: 'a_gt_b',
        },
      },
      question_template:
        'You identified {newNabhNonCompliances} new NABH non-compliances but closed only {nabhNonComplainancesClosed}, with {totalOpenNabhNonCompliances} total open. Is the backlog manageable or do we need additional resources?',
      context_fields: ['newNabhNonCompliances', 'nabhNonComplainancesClosed', 'totalOpenNabhNonCompliances', 'openAuditFindingsPastDue'],
      enabled: true,
    },

    // ── MEDIUM ──
    {
      id: 'ps-zero-incidents-all',
      name: 'Zero incidents across all categories',
      description: 'No near-misses, adverse events, falls, or medication errors — may indicate under-reporting',
      severity: 'medium',
      condition: {
        type: 'cross_field',
        config: {
          field_a: 'nearMissIncidents',
          field_b: 'adverseEvents',
          relationship: 'sum_exceeds',
          threshold: -1,
        },
      },
      question_template:
        'All incident categories are at zero today (near misses: {nearMissIncidents}, adverse: {adverseEvents}, falls: {patientFalls}, medication errors: {medicationErrors}). Is this a genuinely safe day, or could there be under-reporting?',
      context_fields: ['nearMissIncidents', 'adverseEvents', 'sentinelEvents', 'patientFalls', 'medicationErrors', 'underReportingFlag'],
      enabled: false, // Enabling would require custom logic — keep disabled until we add a "all_zero" rule type
    },
    {
      id: 'ps-audit-delayed-escalation',
      name: 'Clinical or non-clinical audit delayed with escalation needed',
      description: 'Audit status marked as needing escalation',
      severity: 'medium',
      condition: {
        type: 'pattern',
        config: {
          field: 'clinicalAuditStatus',
          pattern: 'needs escalation',
          invert: false,
        },
      },
      question_template:
        'Clinical audit status is "{clinicalAuditStatus}". What specifically needs escalation and to whom? Is this blocking NABH preparation?',
      context_fields: ['clinicalAuditStatus', 'nonClinicalAuditStatus', 'totalOpenNabhNonCompliances'],
      enabled: true,
    },
  ],
};
