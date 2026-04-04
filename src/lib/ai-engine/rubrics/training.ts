import type { DepartmentRubric } from '../types';

export const trainingRubric: DepartmentRubric = {
  slug: 'training',
  version: '1.0',
  context: {
    department_name: 'Training',
    typical_daily_volume: '1 training session/day, 10-30 participants',
    key_concerns: [
      'Training conducted vs skipped days',
      'Participant attendance numbers',
      'MTD progress against training calendar',
    ],
    historical_context:
      'EHRC Training conducts daily sessions for clinical and non-clinical staff. NABH requires documented training with attendance. Low participant counts or skipped days raise compliance risk.',
  },
  rules: [
    {
      id: 'train-no-topic',
      name: 'Training topic is NIL or dismissive',
      description: 'No training conducted today — compliance risk',
      severity: 'medium',
      condition: {
        type: 'pattern',
        config: { field: 'trainingConductedTopic', pattern: '^(nil|NIL|none|N\\/A|-|na|NA|Nil|No|no|not conducted|none conducted)$', invert: false },
      },
      question_template:
        'No training was conducted today. Was this planned (holiday, no scheduled session) or was a session skipped? How does this affect the MTD target?',
      context_fields: ['trainingConductedTopic', 'mtdTrainingsStatus'],
      enabled: true,
    },
    {
      id: 'train-low-participants',
      name: 'Very low participant count',
      description: 'Training conducted but almost no one attended',
      severity: 'medium',
      condition: {
        type: 'threshold',
        config: { field: 'trainingParticipants', operator: 'lt', value: 5 },
      },
      question_template:
        'Only {trainingParticipants} participant(s) attended today\'s training on "{trainingConductedTopic}". Was this a targeted session, or was attendance lower than expected?',
      context_fields: ['trainingParticipants', 'trainingConductedTopic', 'mtdTrainingsStatus'],
      enabled: true,
    },
    {
      id: 'train-mtd-behind',
      name: 'MTD training status behind schedule',
      description: 'MTD trainings text suggests being behind plan',
      severity: 'high',
      condition: {
        type: 'pattern',
        config: { field: 'mtdTrainingsStatus', pattern: '(behind|delay|miss|gap|short|under|fewer|less than|below)', invert: false },
      },
      question_template:
        'MTD training status: "{mtdTrainingsStatus}". How many sessions are behind schedule? Is there a catch-up plan for the rest of the month?',
      context_fields: ['mtdTrainingsStatus', 'trainingConductedTopic', 'trainingParticipants'],
      enabled: true,
    },
  ],
};
