import type { DepartmentRubric } from '../types';

export const radiologyRubric: DepartmentRubric = {
  slug: 'radiology',
  version: '1.0',
  context: {
    department_name: 'Radiology',
    typical_daily_volume: '20-40 X-rays, 10-20 USG, 5-15 CT cases/day',
    key_concerns: [
      'Equipment downtime impacting patient care',
      'Pending reports backlog',
      'Critical results escalation compliance',
      'Film and contrast stock availability',
    ],
    historical_context:
      'EHRC Radiology provides X-ray, USG, and CT imaging. Equipment downtime directly blocks diagnostics. Pending reports delay treatment decisions. Critical results (e.g. stroke, PE) must be escalated immediately per NABH. Film/contrast stockouts force referrals out.',
  },
  rules: [
    {
      id: 'rad-equipment-down',
      name: 'Equipment status issue flagged',
      description: 'Any equipment not fully operational — blocks diagnostic workflow',
      severity: 'critical',
      condition: {
        type: 'pattern',
        config: { field: 'equipmentStatus', pattern: '(down|fault|repair|issue|not working|offline|error|maintenance|partial)', invert: false },
      },
      question_template:
        'Equipment status flagged: "{equipmentStatus}". Which modality is affected (X-ray, USG, CT)? What is the expected resolution time? Are patients being redirected?',
      context_fields: ['equipmentStatus', 'xrayCasesYesterday', 'ctCasesYesterday'],
      enabled: true,
    },
    {
      id: 'rad-pending-reports-backlog',
      name: 'Pending reports backlog',
      description: 'High pending report count delays clinical decisions',
      severity: 'high',
      condition: {
        type: 'threshold',
        config: { field: 'pendingReports', operator: 'gt', value: 10 },
      },
      question_template:
        '{pendingReports} reports are pending. Which modality has the most backlog? Is this due to radiologist availability or equipment issues?',
      context_fields: ['pendingReports', 'reportsDoneInHouse', 'equipmentStatus'],
      enabled: true,
    },
    {
      id: 'rad-critical-results-not-escalated',
      name: 'Critical results escalation gap',
      description: 'Critical results found but escalation field is empty/nil — NABH compliance risk',
      severity: 'critical',
      condition: {
        type: 'pattern',
        config: { field: 'criticalResultsEscalated', pattern: '^(nil|NIL|none|N\\/A|-|na|NA|Nil|No|no|0)$', invert: false },
      },
      question_template:
        'No critical results were escalated today. Were there truly zero critical findings, or were escalations missed? This is a NABH compliance requirement.',
      context_fields: ['criticalResultsEscalated', 'xrayCasesYesterday', 'ctCasesYesterday'],
      enabled: true,
    },
    {
      id: 'rad-film-contrast-stock-issue',
      name: 'Film or contrast stock issue',
      description: 'Low film/contrast stock may block imaging',
      severity: 'high',
      condition: {
        type: 'pattern',
        config: { field: 'filmContrastStock', pattern: '(low|short|out|unavail|critical|nil|order|pending|delay)', invert: false },
      },
      question_template:
        'Film/contrast stock issue: "{filmContrastStock}". Which consumable is affected? Has procurement been alerted? Is this impacting scheduled scans?',
      context_fields: ['filmContrastStock', 'equipmentStatus', 'ctCasesYesterday'],
      enabled: true,
    },
    {
      id: 'rad-ct-volume-drop',
      name: 'CT case volume significant drop',
      description: 'CT cases well below average — may indicate equipment or scheduling issue',
      severity: 'medium',
      condition: {
        type: 'historical',
        config: { field: 'ctCasesYesterday', deviation_pct: 50, lookback_days: 7, direction: 'drop' },
      },
      question_template:
        'CT cases yesterday ({ctCasesYesterday}) are {deviation_pct}% below the 7-day average. Is this due to equipment downtime, scheduling gaps, or low referrals?',
      context_fields: ['ctCasesYesterday', 'equipmentStatus', 'pendingReports'],
      enabled: true,
    },
  ],
};
