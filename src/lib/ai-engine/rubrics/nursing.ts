import type { DepartmentRubric } from '../types';

export const nursingRubric: DepartmentRubric = {
  slug: 'nursing',
  version: '1.0',
  context: {
    department_name: 'Nursing',
    typical_daily_volume: '40-80 midnight census, staffing matrix varies by shift',
    key_concerns: [
      'Staffing adequacy vs patient census',
      'HAI/IPC incidents (hospital-acquired infections)',
      'Patient complaints and satisfaction',
      'Biomedical waste and infection control compliance',
    ],
    historical_context:
      'EHRC Nursing is the largest clinical workforce. Staffing matrix must align with census — understaffing risks patient safety. HAI (Hospital Acquired Infections) are a critical NABH indicator. IPC (Infection Prevention & Control) non-compliance triggers escalation. Biomedical waste incidents have regulatory implications.',
  },
  rules: [
    {
      id: 'nurs-understaffed',
      name: 'Staffing matrix below requirement',
      description: 'Nurse staffing below census need — patient safety risk',
      severity: 'critical',
      condition: {
        type: 'pattern',
        config: { field: 'staffingMatrixNurses', pattern: '(short|deficit|below|under|gap|insufficient|critical|red|less)', invert: false },
      },
      question_template:
        'Nursing staffing flagged: "{staffingMatrixNurses}" against midnight census of {midnightCensusNursing}. Which wards are short? What is the plan for next shift?',
      context_fields: ['staffingMatrixNurses', 'midnightCensusNursing', 'escalationsConcerns'],
      enabled: true,
    },
    {
      id: 'nurs-hai-ipc-incident',
      name: 'HAI or IPC incident reported',
      description: 'Hospital-acquired infection or IPC non-compliance — critical NABH indicator',
      severity: 'critical',
      condition: {
        type: 'pattern',
        config: { field: 'dailyHaiIpcStatus', pattern: '^(nil|NIL|none|N\\/A|-|na|NA|Nil|No|no|All clear|all clear)$', invert: true },
      },
      question_template:
        'HAI/IPC status: "{dailyHaiIpcStatus}". What type of infection/incident? Which ward and patient? Has the infection control team been notified?',
      context_fields: ['dailyHaiIpcStatus', 'infectionControlUpdate', 'midnightCensusNursing'],
      enabled: true,
    },
    {
      id: 'nurs-patient-complaints',
      name: 'Patient complaints reported',
      description: 'Nursing complaints affect satisfaction scores and need follow-up',
      severity: 'medium',
      condition: {
        type: 'pattern',
        config: { field: 'patientComplaintsSatisfaction', pattern: '^(nil|NIL|none|N\\/A|-|na|NA|Nil|No|no)$', invert: true },
      },
      question_template:
        'Patient complaints: "{patientComplaintsSatisfaction}". Which ward and shift? Has the complaint been acknowledged and a response timeline set?',
      context_fields: ['patientComplaintsSatisfaction', 'escalationsConcerns', 'midnightCensusNursing'],
      enabled: true,
    },
    {
      id: 'nurs-biomedical-waste-incident',
      name: 'Biomedical waste incident',
      description: 'BMW incident has regulatory and safety implications',
      severity: 'high',
      condition: {
        type: 'pattern',
        config: { field: 'biomedicalWasteIncidents', pattern: '^(nil|NIL|none|N\\/A|-|na|NA|Nil|No|no)$', invert: true },
      },
      question_template:
        'Biomedical waste incident: "{biomedicalWasteIncidents}". What type of incident? Was it a segregation error, spill, or needle-stick? Has it been reported to the BMW committee?',
      context_fields: ['biomedicalWasteIncidents', 'infectionControlUpdate', 'dailyHaiIpcStatus'],
      enabled: true,
    },
    {
      id: 'nurs-escalations-active',
      name: 'Nursing escalations or concerns flagged',
      description: 'Escalations need GM awareness and follow-up',
      severity: 'high',
      condition: {
        type: 'pattern',
        config: { field: 'escalationsConcerns', pattern: '^(nil|NIL|none|N\\/A|-|na|NA|Nil|No|no)$', invert: true },
      },
      question_template:
        'Nursing escalation: "{escalationsConcerns}". Is this a staffing, clinical, or interdepartmental issue? What action has been taken?',
      context_fields: ['escalationsConcerns', 'staffingMatrixNurses', 'midnightCensusNursing'],
      enabled: true,
    },
  ],
};
