import type { DepartmentRubric } from '../types';

export const otRubric: DepartmentRubric = {
  slug: 'ot',
  version: '1.0',
  context: {
    department_name: 'Operation Theatre',
    typical_daily_volume: '5-15 OT cases/day, first case target 08:30',
    key_concerns: [
      'First case delay (impacts full-day schedule)',
      'Surgeon escalations (satisfaction and retention)',
      'Team leaving OT prematurely (safety concern)',
      'Case volume vs capacity utilization',
    ],
    historical_context:
      'EHRC OT runs scheduled and emergency surgeries. First case delay cascades through the day. Surgeon escalations indicate process or equipment issues. Team leaving OT early is a patient safety concern flagged by NABH.',
  },
  rules: [
    {
      id: 'ot-first-case-severe-delay',
      name: 'First case delay > 30 minutes',
      description: 'Severe first case delay cascades through entire day schedule',
      severity: 'high',
      condition: {
        type: 'threshold',
        config: { field: 'firstCaseDelayMinutes', operator: 'gt', value: 30 },
      },
      question_template:
        'First OT case was delayed by {firstCaseDelayMinutes} minutes. Reason given: "{firstCaseDelayReason}". How many subsequent cases were impacted? Is this a recurring pattern?',
      context_fields: ['firstCaseDelayMinutes', 'firstCaseDelayReason', 'otCasesDoneYesterday'],
      enabled: true,
    },
    {
      id: 'ot-surgeon-escalations',
      name: 'Surgeon escalations reported',
      description: 'Any surgeon escalation needs GM visibility — impacts retention',
      severity: 'high',
      condition: {
        type: 'pattern',
        config: { field: 'escalationsBySurgeon', pattern: '^(nil|NIL|none|N\\/A|-|na|NA|Nil|No|no)$', invert: true },
      },
      question_template:
        'Surgeon escalation reported: "{escalationsBySurgeon}". Which surgeon and what was the issue? Has it been resolved? Is this a repeat concern?',
      context_fields: ['escalationsBySurgeon', 'firstCaseDelayMinutes', 'otCasesDoneYesterday'],
      enabled: true,
    },
    {
      id: 'ot-team-left-early',
      name: 'Team left OT prematurely',
      description: 'Staff leaving OT before case completion is a safety concern',
      severity: 'critical',
      condition: {
        type: 'threshold',
        config: { field: 'timesTeamLeftOt', operator: 'gt', value: 0 },
      },
      question_template:
        'Team left OT {timesTeamLeftOt} time(s) before case completion. Which role left and why? This is a patient safety concern — was an incident report filed?',
      context_fields: ['timesTeamLeftOt', 'escalationsBySurgeon', 'otCasesDoneYesterday'],
      enabled: true,
    },
    {
      id: 'ot-low-case-volume',
      name: 'OT case volume below average',
      description: 'Low case count may indicate cancellations or scheduling gaps',
      severity: 'medium',
      condition: {
        type: 'historical',
        config: { field: 'otCasesDoneYesterday', deviation_pct: 40, lookback_days: 7, direction: 'drop' },
      },
      question_template:
        'Only {otCasesDoneYesterday} OT cases done yesterday — {deviation_pct}% below the 7-day average. Were there cancellations, surgeon no-shows, or scheduling gaps?',
      context_fields: ['otCasesDoneYesterday', 'firstCaseDelayMinutes', 'escalationsBySurgeon'],
      enabled: true,
    },
  ],
};
