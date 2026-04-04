import type { DepartmentRubric } from '../types';

export const clinicalLabRubric: DepartmentRubric = {
  slug: 'clinical-lab',
  version: '1.0',
  context: {
    department_name: 'Clinical Lab',
    typical_daily_volume: '200-400 tests/day, 2-8 critical reports, 0-2 reagent shortages',
    key_concerns: [
      'Equipment uptime and machine status',
      'Critical report turnaround time (TAT)',
      'Reagent availability and shortages',
      'Sample recollection/error rates',
      'Outsourced test volume control',
    ],
    historical_context:
      'EHRC Clinical Lab supports all inpatient and outpatient diagnostics. Equipment downtime directly impacts patient care. Critical reports (panic values) require immediate communication to treating physicians. Reagent shortages can force outsourcing at higher cost.',
  },
  rules: [
    // ── CRITICAL ──
    {
      id: 'lab-equipment-down',
      name: 'Equipment status flagged non-operational',
      description: 'Machine status indicates downtime — impacts test availability',
      severity: 'critical',
      condition: {
        type: 'pattern',
        config: {
          field: 'machineEquipmentStatus',
          pattern: '(down|not working|out of order|breakdown|non.?functional|repair|service|fault|error|offline)',
          invert: false,
        },
      },
      question_template:
        'Machine/equipment status: "{machineEquipmentStatus}" — which machines are affected? What is the estimated time to resolution? Are samples being rerouted?',
      context_fields: ['machineEquipmentStatus', 'criticalReportsIssued', 'tatPerformance', 'reagentShortages'],
      enabled: true,
    },

    // ── HIGH ──
    {
      id: 'lab-tat-issue',
      name: 'TAT performance flagged as delayed',
      description: 'TAT performance text suggests delays beyond acceptable limits',
      severity: 'high',
      condition: {
        type: 'pattern',
        config: {
          field: 'tatPerformance',
          pattern: '(delay|late|slow|breach|miss|exceed|pending|backlog|>.*hour)',
          invert: false,
        },
      },
      question_template:
        'TAT performance today: "{tatPerformance}". Which tests are affected? Are there specific bottleneck stages (collection, processing, reporting)?',
      context_fields: ['tatPerformance', 'machineEquipmentStatus', 'criticalReportsIssued'],
      enabled: true,
    },
    {
      id: 'lab-blood-bank-issues',
      name: 'Blood bank / transfusion issues flagged',
      description: 'Transfusion or blood request issues reported — patient safety concern',
      severity: 'high',
      condition: {
        type: 'pattern',
        config: {
          field: 'transfusionBloodIssues',
          pattern: '(nil|NIL|none|N\\/A|-|na|NA|Nil|no issue)',
          invert: true,
        },
      },
      question_template:
        'You reported transfusion/blood issues: "{transfusionBloodIssues}". Were any patients affected? Is this a supply issue or a cross-match/compatibility problem?',
      context_fields: ['transfusionBloodIssues', 'criticalReportsIssued'],
      enabled: true,
    },

    // ── MEDIUM ──
    {
      id: 'lab-reagent-shortage',
      name: 'Reagent shortage reported',
      description: 'Reagent shortages can force test outsourcing and increase costs',
      severity: 'medium',
      condition: {
        type: 'pattern',
        config: {
          field: 'reagentShortages',
          pattern: '(nil|NIL|none|N\\/A|-|na|NA|Nil|no shortage)',
          invert: true,
        },
      },
      question_template:
        'Reagent shortages reported: "{reagentShortages}". Which tests are affected? Is this impacting TAT? Has procurement been alerted?',
      context_fields: ['reagentShortages', 'outsourcedTestsMtd', 'machineEquipmentStatus'],
      enabled: true,
    },
    {
      id: 'lab-recollection-errors',
      name: 'Sample recollection or reporting errors',
      description: 'Sample errors indicate pre-analytical quality issues',
      severity: 'medium',
      condition: {
        type: 'pattern',
        config: {
          field: 'sampleRecollectionErrors',
          pattern: '(nil|NIL|none|N\\/A|-|na|NA|Nil|no error)',
          invert: true,
        },
      },
      question_template:
        'Sample recollection/reporting errors today: "{sampleRecollectionErrors}". Which department(s) had issues? Is this a training or process gap?',
      context_fields: ['sampleRecollectionErrors', 'tatPerformance', 'criticalReportsIssued'],
      enabled: true,
    },
  ],
};
