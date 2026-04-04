import type { DepartmentRubric } from '../types';

export const hrManpowerRubric: DepartmentRubric = {
  slug: 'hr-manpower',
  version: '1.0',
  context: {
    department_name: 'HR & Manpower',
    typical_daily_volume: '0-3 joiners/exits per day, ongoing training induction',
    key_concerns: [
      'Staff attrition without replacement plan',
      'Mandatory training/induction compliance',
      'Doctor profile creation for new consultants',
      'Net staffing balance (joiners vs exits)',
    ],
    historical_context:
      'EHRC HR tracks daily workforce changes. High exits without replacements strain clinical departments. NABH requires documented induction for all new staff. Doctor profiles must be created in HIS on day one for billing and ordering.',
  },
  rules: [
    {
      id: 'hr-exits-no-replacement',
      name: 'Resignations/exits with no replacement plan',
      description: 'Staff leaving without replacement status creates operational risk',
      severity: 'high',
      condition: {
        type: 'missing',
        config: { trigger_field: 'resignationsExitsToday', trigger_operator: 'gt', trigger_value: 0, required_field: 'replacementStatus' },
      },
      question_template:
        '{resignationsExitsToday} resignation(s)/exit(s) reported but replacement status is empty. Which department is losing staff? What is the replacement timeline?',
      context_fields: ['resignationsExitsToday', 'replacementStatus', 'newJoinersToday'],
      enabled: true,
    },
    {
      id: 'hr-high-exits',
      name: 'Multiple exits in a single day',
      description: 'Multiple staff leaving same day may indicate systemic issue',
      severity: 'high',
      condition: {
        type: 'threshold',
        config: { field: 'resignationsExitsToday', operator: 'gt', value: 2 },
      },
      question_template:
        '{resignationsExitsToday} staff exits today — is there a common department or reason? Are these planned separations or sudden resignations?',
      context_fields: ['resignationsExitsToday', 'replacementStatus', 'newJoinersToday'],
      enabled: true,
    },
    {
      id: 'hr-training-induction-gap',
      name: 'Mandatory training/induction not done',
      description: 'New joiners without induction is a NABH compliance risk',
      severity: 'medium',
      condition: {
        type: 'pattern',
        config: { field: 'mandatoryTrainingInduction', pattern: '(pending|not done|nil|NIL|none|N\\/A|-|na|NA|No|no|skip|delay)', invert: false },
      },
      question_template:
        'Mandatory training/induction status: "{mandatoryTrainingInduction}". Are new joiners waiting for induction? NABH requires documented induction within 24 hours.',
      context_fields: ['mandatoryTrainingInduction', 'newJoinersToday', 'hrOtherNotes'],
      enabled: true,
    },
    {
      id: 'hr-doctor-profile-pending',
      name: 'Doctor profile creation pending',
      description: 'New doctor without HIS profile blocks billing and orders',
      severity: 'medium',
      condition: {
        type: 'pattern',
        config: { field: 'doctorProfileCreation', pattern: '(pending|not done|nil|NIL|none|N\\/A|-|na|NA|No|no|delay|waiting)', invert: false },
      },
      question_template:
        'Doctor profile creation status: "{doctorProfileCreation}". Which doctor(s) are pending? This blocks billing and clinical orders in HIS.',
      context_fields: ['doctorProfileCreation', 'newJoinersToday', 'hrOtherNotes'],
      enabled: true,
    },
  ],
};
