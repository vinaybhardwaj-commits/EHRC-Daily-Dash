import type { DepartmentRubric } from '../types';

export const customerCareRubric: DepartmentRubric = {
  slug: 'customer-care',
  version: '1.0',
  context: {
    department_name: 'Customer Care',
    typical_daily_volume: '200-350 OPD appointments, 2-8 complaints, 5-15 Google reviews',
    key_concerns: [
      'OPD volume and no-show rates',
      'Complaint resolution speed',
      'Doctor punctuality and patient impact',
      'Google review scores and patient reputation',
    ],
    historical_context:
      'EHRC is a 150-bed multi-specialty hospital in Bangalore. Customer Care tracks OPD volumes, complaints, doctor delays, and reputation metrics daily for the morning meeting.',
  },
  rules: [
    // ── CRITICAL ──
    {
      id: 'cc-escalations-no-details',
      name: 'Escalations without context',
      description: 'Customer escalations reported but no notes or VIP alerts provided',
      severity: 'critical',
      condition: {
        type: 'missing',
        config: {
          trigger_field: 'customerEscalations',
          trigger_operator: 'gt',
          trigger_value: 0,
          required_field: 'vipInternationalAlerts',
        },
      },
      question_template:
        'You reported {customerEscalations} customer escalation(s) today. Could you provide details on what these escalations were about? Are any related to VIP or international patients?',
      context_fields: ['customerEscalations', 'newComplaintsReceived', 'vipInternationalAlerts'],
      enabled: true,
    },

    // ── HIGH ──
    {
      id: 'cc-doctors-late-no-impact',
      name: 'Doctors late but zero patients affected',
      description: 'Contradictory: doctors are running late but no patients were reported as affected',
      severity: 'high',
      condition: {
        type: 'cross_field',
        config: {
          field_a: 'doctorsLate',
          field_b: 'patientsAffectedByDelays',
          relationship: 'a_implies_b',
        },
      },
      question_template:
        'You mentioned doctors running late ({doctorsLate}) but reported {patientsAffectedByDelays} patients affected by delays. Were patients truly unaffected, or were some impacted?',
      context_fields: ['doctorsLate', 'patientsAffectedByDelays', 'doctorsOnLeave', 'opdAppointmentsInPerson'],
      enabled: true,
    },
    {
      id: 'cc-complaint-backlog-growing',
      name: 'Complaint backlog growing',
      description: 'More complaints received than closed, with pending count rising',
      severity: 'high',
      condition: {
        type: 'cross_field',
        config: {
          field_a: 'newComplaintsReceived',
          field_b: 'complaintsClosed',
          relationship: 'a_gt_b',
        },
      },
      question_template:
        'You received {newComplaintsReceived} new complaints but closed only {complaintsClosed}, with {totalComplaintsPending} pending. Is there a bottleneck in resolution? What is the plan to bring the backlog down?',
      context_fields: ['newComplaintsReceived', 'complaintsClosed', 'totalComplaintsPending', 'oldestComplaintAge'],
      enabled: true,
    },
    {
      id: 'cc-review-score-drop',
      name: 'Google review score drop',
      description: 'Average star rating is significantly below historical average',
      severity: 'high',
      condition: {
        type: 'historical',
        config: {
          field: 'averageStarRating',
          deviation_pct: 20,
          lookback_days: 7,
          direction: 'drop',
        },
      },
      question_template:
        'Today\'s average Google rating ({averageStarRating}) is {deviation_pct}% below the 7-day average. Were there specific negative reviews driving this down?',
      context_fields: ['averageStarRating', 'googleReviewsReceived'],
      enabled: true,
    },

    // ── MEDIUM ──
    {
      id: 'cc-high-no-shows',
      name: 'Unusually high no-show rate',
      description: 'OPD no-shows are significantly above average',
      severity: 'medium',
      condition: {
        type: 'historical',
        config: {
          field: 'opdNoShows',
          deviation_pct: 50,
          lookback_days: 7,
          direction: 'spike',
        },
      },
      question_template:
        'OPD no-shows today ({opdNoShows}) are {deviation_pct}% above the 7-day average. Is there a pattern (specific doctor, time slot, or specialty)?',
      context_fields: ['opdNoShows', 'opdAppointmentsInPerson', 'opdAppointmentsTele'],
      enabled: true,
    },
    {
      id: 'cc-lwbs-high',
      name: 'Patients left without being seen',
      description: 'LWBS count is unusually high relative to volume',
      severity: 'medium',
      condition: {
        type: 'threshold',
        config: {
          field: 'patientsLeftWithoutSeen',
          operator: 'gt',
          value: 5,
        },
      },
      question_template:
        '{patientsLeftWithoutSeen} patients left without being seen today. What were the main reasons (long wait times, specific departments, specific time of day)?',
      context_fields: ['patientsLeftWithoutSeen', 'patientsWaitingOver10Min', 'opdAppointmentsInPerson'],
      enabled: true,
    },
  ],
};
