export type FieldType = 'text' | 'number' | 'paragraph' | 'radio' | 'section';

export interface FormField {
  id: string;           // camelCase identifier
  label: string;        // display label
  name?: string;        // alias for label (populated by enrichField)
  description?: string; // help text
  helper?: string;      // alias for description (populated by enrichField)
  type: FieldType;
  required: boolean;
  options?: string[];   // for radio type only
  validation?: { min?: number; max?: number; step?: number | 'any' }; // for number fields with range
}

export interface FormSection {
  title: string;
  description?: string;
  fields: FormField[];
}

export interface DepartmentForm {
  slug: string;
  title: string;
  department: string;
  name?: string;         // alias for department (populated by enrichForm)
  tab?: string;          // Google Sheet tab name (populated by enrichForm)
  description: string;
  sections: FormSection[];
  kpiFields?: string[];  // field labels to show as KPI cards (populated by enrichForm)
}

// Date section template
const dateSection: FormSection = {
  title: 'Date',
  fields: [
    {
      id: 'date',
      label: 'Date (DD-MM-YYYY)',
      type: 'text',
      required: true,
    },
  ],
};

// 1. EMERGENCY
const emergencyForm: DepartmentForm = {
  slug: 'emergency',
  title: 'EHRC Morning Meeting — Emergency Department',
  department: 'Emergency',
  description: 'Fill this before the daily morning meeting.\n★ Starred fields are mandatory.\nTakes under 3 minutes.\n\nSeparate genuine walk-in/ambulance emergencies from planned admissions routed through ED after hours.',
  sections: [
    dateSection,
    {
      title: '★ MANDATORY FIELDS',
      fields: [
        {
          id: 'genuineEmergencies',
          label: '# of genuine walk-in/ambulance emergencies (last 24h)',
          type: 'number',
          required: true,
        },
        {
          id: 'afterHoursAdmissions',
          label: '# of after-hours planned admissions routed through ED',
          type: 'number',
          required: true,
        },
        {
          id: 'doorToDoctorTat',
          label: 'Door-to-doctor TAT emergencies only (avg minutes)',
          type: 'number',
          required: true,
        },
        {
          id: 'patientsLwbs',
          label: '# of patients LWBS',
          type: 'number',
          required: true,
        },
        {
          id: 'deaths',
          label: '# of Deaths',
          type: 'number',
          required: true,
        },
        {
          id: 'mlcCases',
          label: '# of MLC cases registered',
          type: 'number',
          required: true,
        },
        {
          id: 'triageL1L2Count',
          label: 'Triage L1 + L2 count',
          type: 'number',
          required: true,
        },
        {
          id: 'edRevenueToday',
          label: 'ED revenue today (Rs.)',
          type: 'number',
          required: true,
        },
      ],
    },
    {
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'lamaDama',
          label: '# of LAMA/DAMA',
          type: 'number',
          required: false,
        },
        {
          id: 'criticalAlerts',
          label: '# of Critical alerts (Code Blue/Red/Yellow)',
          type: 'number',
          required: false,
        },
        {
          id: 'edIncidentReports',
          label: '# of ED incident reports',
          type: 'number',
          required: false,
        },
        {
          id: 'anticipatedChallenges',
          label: 'Anticipated challenges/other notes',
          type: 'paragraph',
          required: false,
        },
      ],
    },
  ],
};

// 2. CUSTOMER CARE
const customerCareForm: DepartmentForm = {
  slug: 'customer-care',
  title: 'EHRC Morning Meeting — Customer Care',
  department: 'Customer Care',
  description: 'Fill this before the daily morning meeting.\n★ Starred fields are mandatory.\nTakes under 3 minutes to complete.\n\nTIP: Keep a tally sheet at the front desk for patients who leave OPD without being seen.',
  sections: [
    dateSection,
    {
      title: '★ OPD VOLUMES',
      description: "Yesterday's appointment and attendance numbers.",
      fields: [
        {
          id: 'opdAppointmentsInPerson',
          label: '# of OPD appointments — in-person',
          type: 'number',
          required: true,
        },
        {
          id: 'opdAppointmentsTele',
          label: '# of OPD appointments — tele',
          type: 'number',
          required: true,
        },
        {
          id: 'opdNoShows',
          label: '# of OPD no-shows (patients who booked but did not arrive)',
          type: 'number',
          required: true,
        },
        {
          id: 'patientsLeftWithoutSeen',
          label: '# of patients who left OPD without being seen (gave up waiting)',
          type: 'number',
          required: true,
        },
        {
          id: 'patientsWaitingOver10Min',
          label: '# of patients waiting > 10 min in OPD (at peak)',
          type: 'number',
          required: true,
        },
        {
          id: 'healthCheckAppointments',
          label: '# of Health check appointments',
          type: 'number',
          required: true,
        },
      ],
    },
    {
      title: '★ COMPLAINTS',
      description: 'Track the flow — not just the pile. New vs closed tells us if we\'re keeping up.',
      fields: [
        {
          id: 'newComplaintsReceived',
          label: '# of new complaints received today',
          type: 'number',
          required: true,
        },
        {
          id: 'complaintsClosed',
          label: '# of complaints closed / resolved today',
          type: 'number',
          required: true,
        },
        {
          id: 'totalComplaintsPending',
          label: '# of total complaints currently pending resolution',
          type: 'number',
          required: true,
        },
        {
          id: 'oldestComplaintAge',
          label: 'Age of oldest open complaint (days)',
          type: 'number',
          required: true,
        },
        {
          id: 'customerEscalations',
          label: '# of customer escalations (complaints escalated to senior management)',
          type: 'number',
          required: true,
        },
      ],
    },
    {
      title: '★ DOCTOR PUNCTUALITY',
      description: 'Tracks patient impact — not just whether doctors were late.',
      fields: [
        {
          id: 'doctorsOnLeave',
          label: 'Doctors on leave today (names, or write NIL)',
          type: 'text',
          required: true,
        },
        {
          id: 'doctorsLate',
          label: 'Doctors late > 10 min (names, or write NIL)',
          type: 'text',
          required: true,
        },
        {
          id: 'patientsAffectedByDelays',
          label: '# of patients affected by doctor delays',
          type: 'number',
          required: true,
        },
      ],
    },
    {
      title: '★ REPUTATION',
      description: 'Google is our public scorecard. Rating matters as much as count.',
      fields: [
        {
          id: 'googleReviewsReceived',
          label: '# of Google Reviews received today',
          type: 'number',
          required: true,
        },
        {
          id: 'averageStarRating',
          label: 'Average star rating of new Google Reviews (1–5, enter 0 if no reviews today)',
          type: 'number',
          required: true,
          validation: { min: 0, max: 5, step: 0.1 },
        },
        {
          id: 'videoTestimonialsCollected',
          label: '# of Video Testimonials collected',
          type: 'number',
          required: true,
        },
      ],
    },
    {
      title: 'OPTIONAL — ALERTS & NOTES',
      description: 'Fill only if relevant.',
      fields: [
        {
          id: 'vipInternationalAlerts',
          label: 'VIP / International patient alerts',
          type: 'text',
          required: false,
        },
        {
          id: 'callCentrePerformance',
          label: 'Call centre / front office performance note',
          type: 'text',
          required: false,
        },
        {
          id: 'otherNotes',
          label: 'Any other notes',
          type: 'paragraph',
          required: false,
        },
      ],
    },
  ],
};

// 3. PATIENT SAFETY & QUALITY
const patientSafetyForm: DepartmentForm = {
  slug: 'patient-safety',
  title: 'EHRC Morning Meeting — Patient Safety & Quality',
  department: 'Patient Safety & Quality',
  description: 'Fill this before the daily morning meeting.\n★ Starred fields are mandatory.\n\nThis form is a safety intelligence tool, not just a compliance checklist.\nAccurate daily data here directly supports NABH accreditation and drives RCA follow-through.',
  sections: [
    dateSection,
    {
      title: '★ INCIDENT REPORTING',
      description: 'Report ALL incidents — near misses included. High near-miss reporting = healthy safety culture.\nNear miss: no patient harm, caught before reaching patient.\nAdverse event: reached patient, caused harm.\nSentinel event: serious harm, death, or never-event.',
      fields: [
        {
          id: 'nearMissIncidents',
          label: '# of Near-miss incidents reported today',
          type: 'number',
          required: true,
        },
        {
          id: 'adverseEvents',
          label: '# of Adverse events reported today',
          type: 'number',
          required: true,
        },
        {
          id: 'sentinelEvents',
          label: '# of Sentinel events reported today',
          type: 'number',
          required: true,
        },
        {
          id: 'patientFalls',
          label: '# of Patient falls today',
          type: 'number',
          required: true,
        },
        {
          id: 'medicationErrors',
          label: '# of Medication errors today',
          type: 'number',
          required: true,
        },
        {
          id: 'underReportingFlag',
          label: 'Under-reporting flag — any incident type you suspect was not reported today? (write NIL if none)',
          description: 'Mandatory — not about naming individuals. About identifying where the culture of hiding exists.\ne.g. \'Likely medication error in ICU not reported\' or \'OT team may have had a near miss\'\nThis field is reviewed only by hospital leadership.',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      title: '★ RCA & FOLLOW-THROUGH',
      description: 'The biggest patient safety gap is not incidents — it\'s incidents with no follow-through.\nThese fields track the aging of open RCAs.',
      fields: [
        {
          id: 'openRcasInProgress',
          label: '# of open RCAs currently in progress (total pending)',
          type: 'number',
          required: true,
        },
        {
          id: 'openRcasPastDue',
          label: '# of open RCAs past their due date',
          type: 'number',
          required: true,
        },
        {
          id: 'correctiveActionsClosed',
          label: '# of corrective actions closed today',
          type: 'number',
          required: true,
        },
        {
          id: 'rcaSummary',
          label: 'RCA summary — any new RCA initiated or closed today? (brief details, or write NIL)',
          type: 'paragraph',
          required: true,
        },
      ],
    },
    {
      title: '★ HAI BUNDLE COMPLIANCE',
      description: 'Daily bundle compliance is the best leading indicator for HAI rates.\nBundle = the prevention checklist for each device/procedure.\nIf unsure, check with ICU/nursing in-charge before the meeting.',
      fields: [
        {
          id: 'centralLineBundleCompliance',
          label: 'Central Line bundle compliance today (CLABSI prevention)',
          type: 'radio',
          required: true,
          options: [
            'Yes — full compliance',
            'Partial — some steps missed',
            'No — bundle not followed',
            'N/A — no patients on this device today',
          ],
        },
        {
          id: 'urinaryCathetherBundleCompliance',
          label: 'Urinary Catheter bundle compliance today (CAUTI prevention)',
          type: 'radio',
          required: true,
          options: [
            'Yes — full compliance',
            'Partial — some steps missed',
            'No — bundle not followed',
            'N/A — no patients on this device today',
          ],
        },
        {
          id: 'ventilatorBundleCompliance',
          label: 'Ventilator bundle compliance today (VAP prevention)',
          type: 'radio',
          required: true,
          options: [
            'Yes — full compliance',
            'Partial — some steps missed',
            'No — bundle not followed',
            'N/A — no patients on this device today',
          ],
        },
        {
          id: 'surgicalSiteBundleCompliance',
          label: 'Surgical site care bundle compliance today (SSI prevention)',
          type: 'radio',
          required: true,
          options: [
            'Yes — full compliance',
            'Partial — some steps missed',
            'No — bundle not followed',
            'N/A — no patients on this device today',
          ],
        },
      ],
    },
    {
      title: '★ NABH & AUDIT STATUS',
      description: 'Track the flow of non-compliances — not just that they exist.',
      fields: [
        {
          id: 'newNabhNonCompliances',
          label: '# of new NABH non-compliances identified today',
          type: 'number',
          required: true,
        },
        {
          id: 'nabhNonComplainancesClosed',
          label: '# of NABH non-compliances closed today',
          type: 'number',
          required: true,
        },
        {
          id: 'totalOpenNabhNonCompliances',
          label: '# of total open NABH non-compliances (running total)',
          type: 'number',
          required: true,
        },
        {
          id: 'openAuditFindingsPastDue',
          label: '# of open audit findings past their due date',
          type: 'number',
          required: true,
        },
        {
          id: 'clinicalAuditStatus',
          label: 'Clinical audit status today',
          type: 'radio',
          required: true,
          options: ['On track', 'Delayed — minor', 'Delayed — needs escalation', 'Not applicable today'],
        },
        {
          id: 'nonClinicalAuditStatus',
          label: 'Non-clinical audit status today',
          type: 'radio',
          required: true,
          options: ['On track', 'Delayed — minor', 'Delayed — needs escalation', 'Not applicable today'],
        },
      ],
    },
    {
      title: '★ SAFETY COMMUNICATION',
      description: 'NABH requires documented daily safety communication. This replaces the \'quality training reminders\' field.',
      fields: [
        {
          id: 'staffSafetyBriefing',
          label: '# of staff who received a safety briefing or communication today',
          type: 'number',
          required: true,
        },
        {
          id: 'safetyTopicToday',
          label: 'Topic of safety communication today (or write NIL)',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      title: 'OPTIONAL — ADDITIONAL NOTES',
      description: 'Fill only if relevant.',
      fields: [
        {
          id: 'qualitySafetyNotes',
          label: 'Any other quality / safety notes',
          type: 'paragraph',
          required: false,
        },
      ],
    },
  ],
};

// 4. FINANCE
const financeForm: DepartmentForm = {
  slug: 'finance',
  title: 'EHRC Morning Meeting — Finance',
  department: 'Finance',
  description: 'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Finance',
  sections: [
    dateSection,
    {
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'revenueForDay',
          label: 'Revenue for the day (Rs.)',
          type: 'number',
          required: true,
        },
        {
          id: 'totalRevenueMtd',
          label: 'Total revenue MTD (Rs.)',
          type: 'number',
          required: true,
        },
        {
          id: 'midnightCensus',
          label: 'Midnight census — total IP patients',
          type: 'number',
          required: true,
        },
        {
          id: 'surgeriesMtd',
          label: 'Surgeries MTD',
          type: 'number',
          required: true,
        },
        {
          id: 'arpob',
          label: 'ARPOB — Avg Revenue Per Occupied Bed (Rs.)',
          type: 'number',
          required: true,
        },
      ],
    },
    {
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'opdRevenueMtd',
          label: 'OPD revenue MTD (Rs.)',
          type: 'number',
          required: false,
        },
        {
          id: 'revenueLeakageAlerts',
          label: 'Revenue leakage alerts',
          type: 'text',
          required: false,
        },
        {
          id: 'financeNotes',
          label: 'Other finance notes',
          type: 'paragraph',
          required: false,
        },
      ],
    },
  ],
};

// 5. BILLING
const billingForm: DepartmentForm = {
  slug: 'billing',
  title: 'EHRC Morning Meeting — Billing',
  department: 'Billing',
  description: 'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Billing',
  sections: [
    dateSection,
    {
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'pipelineCases',
          label: '# of Pipeline cases (active, pending billing)',
          type: 'number',
          required: true,
        },
        {
          id: 'otCasesAwaitingBilling',
          label: '# of OT cases with billing clearance pending',
          type: 'number',
          required: true,
        },
        {
          id: 'damaLama',
          label: '# of DAMA / LAMA',
          type: 'number',
          required: true,
        },
        {
          id: 'financialCounsellingDone',
          label: '# of Financial counselling sessions done today',
          type: 'number',
          required: true,
        },
      ],
    },
    {
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'interimFinancialCounselling',
          label: '# of Interim financial counselling done',
          type: 'number',
          required: false,
        },
        {
          id: 'icuNicuCensus',
          label: 'ICU / NICU census',
          type: 'number',
          required: false,
        },
        {
          id: 'surgeriesPlannedNextDay',
          label: 'Surgeries planned for next day (details)',
          type: 'paragraph',
          required: false,
        },
        {
          id: 'highRiskAlerts',
          label: 'High-risk patient alerts',
          type: 'paragraph',
          required: false,
        },
        {
          id: 'ipAdmissionsWithPriorConsultation',
          label: '# of IP admissions where prior OPD / doctor consultation existed (planned, routed via ED after hours)',
          description: 'Cross-check against ED head\'s night register count. Pull from system — look for admissions with a prior OPD visit or doctor note on file.',
          type: 'number',
          required: false,
        },
      ],
    },
  ],
};

// 6. SUPPLY CHAIN
const supplyChainForm: DepartmentForm = {
  slug: 'supply-chain',
  title: 'EHRC Morning Meeting — Supply Chain & Procurement',
  department: 'Supply Chain & Procurement',
  description: 'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Supply Chain & Procurement',
  sections: [
    dateSection,
    {
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'criticalStockAvailability',
          label: 'Critical stock availability (status)',
          type: 'text',
          required: true,
        },
        {
          id: 'grnPrepared',
          label: '# of GRN prepared',
          type: 'number',
          required: true,
        },
        {
          id: 'poIssued',
          label: '# of PO issued',
          type: 'number',
          required: true,
        },
        {
          id: 'itemsProcuredEmergency',
          label: '# of items procured in emergency / after 5pm',
          type: 'number',
          required: true,
        },
      ],
    },
    {
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'shortagesBackorders',
          label: 'Shortages / backorders',
          type: 'text',
          required: false,
        },
        {
          id: 'procurementEscalations',
          label: 'Procurement escalations',
          type: 'text',
          required: false,
        },
        {
          id: 'highValuePurchaseAlerts',
          label: 'High-value purchase alerts',
          type: 'text',
          required: false,
        },
        {
          id: 'pendingConsumptionReporting',
          label: 'Pending consumption reporting issues by dept',
          type: 'paragraph',
          required: false,
        },
      ],
    },
  ],
};

// 7. FACILITY
const facilityForm: DepartmentForm = {
  slug: 'facility',
  title: 'EHRC Morning Meeting — Facility',
  department: 'Facility',
  description: 'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Facility',
  sections: [
    dateSection,
    {
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'facilityReadiness',
          label: 'Facility readiness — power / water / gases',
          type: 'text',
          required: true,
        },
        {
          id: 'safetyIssues',
          label: 'Safety issues',
          type: 'text',
          required: true,
        },
        {
          id: 'housekeepingReadiness',
          label: 'Housekeeping & room readiness',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'preventiveMaintenanceUpdate',
          label: 'Preventive maintenance update',
          type: 'text',
          required: false,
        },
        {
          id: 'facilityOtherNotes',
          label: 'Other notes',
          type: 'text',
          required: false,
        },
      ],
    },
    {
      title: 'MAJOR BREAKDOWNS & INCIDENTS',
      description: 'Report any major equipment or system breakdowns today.',
      fields: [
        {
          id: 'majorBreakdownToday',
          label: 'Any major breakdown today?',
          type: 'radio',
          required: true,
          options: ['Yes', 'No'],
        },
        {
          id: 'breakdownDetails',
          label: 'Breakdown details (equipment/system, impact, status, estimated repair timeline)',
          description: 'Enter one breakdown per line. Format: Equipment | Impact (Patient Safety Risk / Service Disruption / Cost Impact / Minor) | Status (Active / Contained / Resolved) | Timeline',
          type: 'paragraph',
          required: false,
        },
      ],
    },
  ],
};

// 8. PHARMACY
const pharmacyForm: DepartmentForm = {
  slug: 'pharmacy',
  title: 'EHRC Morning Meeting — Pharmacy',
  department: 'Pharmacy',
  description: 'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Pharmacy',
  sections: [
    dateSection,
    {
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'pharmacyRevenueIpToday',
          label: 'Pharmacy revenue — IP today (Rs.)',
          type: 'number',
          required: true,
        },
        {
          id: 'pharmacyRevenueOpToday',
          label: 'Pharmacy revenue — OP today (Rs.)',
          type: 'number',
          required: true,
        },
        {
          id: 'pharmacyRevenueMtd',
          label: 'Pharmacy revenue MTD (Rs.)',
          type: 'number',
          required: true,
        },
        {
          id: 'stockoutsShortages',
          label: 'Stockouts / shortages',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'medicineStockValueIp',
          label: 'Medicine stock value — IP (Rs.)',
          type: 'number',
          required: false,
        },
        {
          id: 'medicineStockValueOp',
          label: 'Medicine stock value — OP (Rs.)',
          type: 'number',
          required: false,
        },
        {
          id: 'itemsExpiringWithin3Months',
          label: 'Items expiring within 3 months',
          type: 'text',
          required: false,
        },
      ],
    },
  ],
};

// 9. TRAINING
const trainingForm: DepartmentForm = {
  slug: 'training',
  title: 'EHRC Morning Meeting — Training',
  department: 'Training',
  description: 'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Training',
  sections: [
    dateSection,
    {
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'trainingConductedTopic',
          label: 'Training conducted today (topic)',
          type: 'text',
          required: true,
        },
        {
          id: 'trainingParticipants',
          label: '# of participants',
          type: 'number',
          required: true,
        },
        {
          id: 'mtdTrainingsStatus',
          label: 'MTD trainings completed vs planned',
          type: 'text',
          required: true,
        },
      ],
    },
  ],
};

// 10. CLINICAL LAB
const clinicalLabForm: DepartmentForm = {
  slug: 'clinical-lab',
  title: 'EHRC Morning Meeting — Clinical Lab',
  department: 'Clinical Lab',
  description: 'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Clinical Lab',
  sections: [
    dateSection,
    {
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'machineEquipmentStatus',
          label: 'Machine & equipment status',
          type: 'text',
          required: true,
        },
        {
          id: 'criticalReportsIssued',
          label: '# of Critical reports issued',
          type: 'number',
          required: true,
        },
        {
          id: 'tatPerformance',
          label: 'TAT performance',
          type: 'text',
          required: true,
        },
        {
          id: 'transfusionBloodIssues',
          label: 'Transfusion / blood request issues',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'outsourcedTestsMtd',
          label: '# of Outsourced tests MTD',
          type: 'number',
          required: false,
        },
        {
          id: 'reagentShortages',
          label: 'Reagent shortages',
          type: 'text',
          required: false,
        },
        {
          id: 'sampleRecollectionErrors',
          label: 'Sample recollection / reporting errors',
          type: 'text',
          required: false,
        },
      ],
    },
    {
      title: 'CRITICAL VALUES & ALERTS',
      description: 'Report any critical values or positive cultures from today.',
      fields: [
        {
          id: 'criticalValuesReportedToday',
          label: 'Were any critical values reported today?',
          type: 'radio',
          required: true,
          options: ['Yes', 'No'],
        },
        {
          id: 'criticalValueDetails',
          label: 'Critical value details (patient UHID, test, value, normal range, time reported, time communicated to physician, physician name, acknowledgment status)',
          description: 'Enter one critical value per line. Format: UHID | Test | Value | Normal Range | Time Reported | Time Communicated | Physician | Ack (Yes/No)',
          type: 'paragraph',
          required: false,
        },
        {
          id: 'positiveCulturesToday',
          label: '# of positive cultures today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'positiveCultureDetails',
          label: 'Positive culture details (organism, specimen type, patient UHID)',
          description: 'Enter one culture per line. Format: Organism | Specimen Type | UHID',
          type: 'paragraph',
          required: false,
        },
      ],
    },
  ],
};

// 11. RADIOLOGY
const radiologyForm: DepartmentForm = {
  slug: 'radiology',
  title: 'EHRC Morning Meeting — Radiology',
  department: 'Radiology',
  description: 'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Radiology',
  sections: [
    dateSection,
    {
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'xrayCasesYesterday',
          label: '# of X-Ray cases (yesterday)',
          type: 'number',
          required: true,
        },
        {
          id: 'usgCasesYesterday',
          label: '# of USG cases (yesterday)',
          type: 'number',
          required: true,
        },
        {
          id: 'ctCasesYesterday',
          label: '# of CT cases (yesterday)',
          type: 'number',
          required: true,
        },
        {
          id: 'equipmentStatus',
          label: 'Equipment status — CT / MRI / USG uptime',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'reportsDoneInHouse',
          label: '# of Reports done in-house',
          type: 'number',
          required: false,
        },
        {
          id: 'pendingReports',
          label: 'Pending reports — critical / non-critical',
          type: 'text',
          required: false,
        },
        {
          id: 'criticalResultsEscalated',
          label: 'Critical results escalated within TAT',
          type: 'text',
          required: false,
        },
        {
          id: 'filmContrastStock',
          label: 'Film / contrast stock status',
          type: 'text',
          required: false,
        },
        {
          id: 'radiationSafetyLog',
          label: 'Radiation safety log',
          type: 'text',
          required: false,
        },
      ],
    },
  ],
};

// 12. OT (Simplified — DD.4, 7 Apr 2026)
const otForm: DepartmentForm = {
  slug: 'ot',
  title: 'EHRC Morning Meeting — OT Daily Summary',
  department: 'OT',
  description: 'Fill this before the daily morning meeting.\nShould take under 2 minutes.\nDepartment: OT',
  sections: [
    dateSection,
    {
      title: 'OT DAILY SUMMARY',
      fields: [
        {
          id: 'totalCasesDoneToday',
          label: 'Total cases done today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'firstCaseOnTimeStart',
          label: 'First case on-time start?',
          type: 'radio',
          required: true,
          options: ['Yes', 'No'],
        },
        {
          id: 'delayReason',
          label: 'If No: delay reason',
          type: 'paragraph',
          required: false,
        },
        {
          id: 'cancellationsToday',
          label: 'Cancellations today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'cancellationReasons',
          label: 'If any: cancellation reasons',
          type: 'paragraph',
          required: false,
        },
      ],
    },
  ],
};

// 13. HR & MANPOWER
const hrManpowerForm: DepartmentForm = {
  slug: 'hr-manpower',
  title: 'EHRC Morning Meeting — HR & Manpower',
  department: 'HR & Manpower',
  description: 'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: HR & Manpower',
  sections: [
    dateSection,
    {
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'newJoinersToday',
          label: 'New joiners today (names / nil)',
          type: 'text',
          required: true,
        },
        {
          id: 'resignationsExitsToday',
          label: 'Resignations / exits today (names / nil)',
          type: 'text',
          required: true,
        },
        {
          id: 'replacementStatus',
          label: 'Replacement status',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'mandatoryTrainingInduction',
          label: 'Mandatory training / induction status',
          type: 'text',
          required: false,
        },
        {
          id: 'doctorProfileCreation',
          label: 'New doctor profile creation status',
          type: 'text',
          required: false,
        },
        {
          id: 'hrOtherNotes',
          label: 'Other notes',
          type: 'text',
          required: false,
        },
      ],
    },
    {
      title: 'WEEKLY HIRING PIPELINE (Mondays only)',
      description: 'Update open positions and hiring status. Fill this section on Mondays only — skip on other days.',
      fields: [
        {
          id: 'hiringPipelineApplicable',
          label: 'Is today Monday? (Fill hiring pipeline)',
          type: 'radio',
          required: true,
          options: ['Yes', 'No'],
        },
        {
          id: 'openPositionsCount',
          label: 'Total open positions',
          type: 'number',
          required: false,
          validation: { min: 0 },
        },
        {
          id: 'openPositionsList',
          label: 'Open positions list (role, department, days open, status)',
          description: 'One position per line. Format: Role | Department | Days Open | Status (Sourcing / Interviewing / Offer / On Hold)',
          type: 'paragraph',
          required: false,
        },
        {
          id: 'interviewsScheduledThisWeek',
          label: 'Interviews scheduled this week',
          type: 'number',
          required: false,
          validation: { min: 0 },
        },
        {
          id: 'offersExtendedThisWeek',
          label: 'Offers extended this week',
          type: 'number',
          required: false,
          validation: { min: 0 },
        },
        {
          id: 'expectedJoinersThisWeek',
          label: 'Expected joiners this week (name, role, date)',
          description: 'One joiner per line. Format: Name | Role | Expected Join Date',
          type: 'paragraph',
          required: false,
        },
        {
          id: 'criticalVacancies',
          label: 'Critical vacancies (impacting patient care or operations)',
          description: 'List any vacancy that is urgent or impacting service delivery.',
          type: 'paragraph',
          required: false,
        },
      ],
    },
  ],
};

// 14. DIET
const dietForm: DepartmentForm = {
  slug: 'diet',
  title: 'EHRC Morning Meeting — Diet',
  department: 'Diet',
  description: 'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Diet',
  sections: [
    dateSection,
    {
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'dietPatientsCensus',
          label: 'Daily census — diet patients',
          type: 'number',
          required: true,
        },
        {
          id: 'bcaDoneToday',
          label: 'BCA done today',
          type: 'number',
          required: true,
        },
        {
          id: 'bcaMtdTotal',
          label: 'BCA MTD total',
          type: 'number',
          required: true,
        },
        {
          id: 'foodFeedbackSummary',
          label: 'Food feedback summary',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'dischargePlanWithDiet',
          label: 'Discharge plan completed with diet',
          type: 'text',
          required: false,
        },
        {
          id: 'kitchenUpdate',
          label: 'Kitchen update',
          type: 'text',
          required: false,
        },
        {
          id: 'delaysIncidents',
          label: 'Delays / incidents',
          type: 'text',
          required: false,
        },
      ],
    },
  ],
};

// 15. BIOMEDICAL
const biomedicalForm: DepartmentForm = {
  slug: 'biomedical',
  title: 'EHRC Morning Meeting — Biomedical',
  department: 'Biomedical',
  description: 'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Biomedical',
  sections: [
    dateSection,
    {
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'equipmentReadiness',
          label: 'Equipment readiness — OT, ICU, etc.',
          type: 'text',
          required: true,
        },
        {
          id: 'breakdownUpdates',
          label: 'Breakdown updates',
          type: 'text',
          required: true,
        },
        {
          id: 'pendingRepairs',
          label: 'Pending repairs',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'preventiveMaintenanceCompliance',
          label: 'Preventive maintenance compliance',
          type: 'text',
          required: false,
        },
        {
          id: 'biomedicalOtherNotes',
          label: 'Other notes',
          type: 'text',
          required: false,
        },
      ],
    },
  ],
};

// 16. NURSING
const nursingForm: DepartmentForm = {
  slug: 'nursing',
  title: 'EHRC Morning Meeting — Nursing',
  department: 'Nursing',
  description: 'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: Nursing',
  sections: [
    dateSection,
    {
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'midnightCensusNursing',
          label: 'Midnight census — patient count',
          type: 'number',
          required: true,
        },
        {
          id: 'staffingMatrixNurses',
          label: 'Staffing matrix — nurses on duty',
          type: 'number',
          required: true,
        },
        {
          id: 'escalationsConcerns',
          label: 'Escalations / concerns',
          type: 'paragraph',
          required: true,
        },
        {
          id: 'dailyHaiIpcStatus',
          label: 'Daily HAI/IPC status (CLABSI,VAP,CAUTI,SSI)',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'patientComplaintsSatisfaction',
          label: 'Patient complaints & satisfaction',
          type: 'text',
          required: false,
        },
        {
          id: 'infectionControlUpdate',
          label: 'Infection control update',
          type: 'text',
          required: false,
        },
        {
          id: 'biomedicalWasteIncidents',
          label: 'Biomedical waste incidents',
          type: 'number',
          required: false,
        },
        {
          id: 'cafeteriaDialysisUpdate',
          label: 'Cafeteria / dialysis update',
          type: 'text',
          required: false,
        },
      ],
    },
    {
      title: 'OT SUPPORT',
      description: 'OT metrics captured by nursing. Fill the OT section below if you are also reporting OT data today.',
      fields: [
        {
          id: 'otCasesAssistedToday',
          label: 'OT cases assisted today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'preOpChecklistsCompleted',
          label: 'Pre-op checklists completed',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'postOpHandoffsCompleted',
          label: 'Post-op handoffs completed',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'otTurnaroundIssues',
          label: 'OT turnaround issues (delays, equipment, staffing)',
          type: 'paragraph',
          required: false,
        },
      ],
    },
    {
      title: 'ALSO REPORTING OT DATA TODAY?',
      description: 'If the OT coordinator is unavailable, you can report OT daily summary data here. This will count as the OT submission for today.',
      fields: [
        {
          id: 'alsoReportingOtData',
          label: 'Are you also reporting OT data today?',
          type: 'radio',
          required: true,
          options: ['Yes', 'No'],
        },
        {
          id: 'otTotalCasesDoneToday',
          label: 'Total OT cases done today',
          type: 'number',
          required: false,
          validation: { min: 0 },
        },
        {
          id: 'otFirstCaseOnTimeStart',
          label: 'First case on-time start?',
          type: 'radio',
          required: false,
          options: ['Yes', 'No'],
        },
        {
          id: 'otDelayReason',
          label: 'If No: delay reason',
          type: 'paragraph',
          required: false,
        },
        {
          id: 'otCancellationsToday',
          label: 'OT cancellations today',
          type: 'number',
          required: false,
          validation: { min: 0 },
        },
        {
          id: 'otCancellationReasons',
          label: 'If any: OT cancellation reasons',
          type: 'paragraph',
          required: false,
        },
      ],
    },
  ],
};

// 17. IT
const itForm: DepartmentForm = {
  slug: 'it',
  title: 'EHRC Morning Meeting — IT',
  department: 'IT',
  description: 'Fill this before the daily morning meeting.\nStarred fields (★) are mandatory — should take under 2 minutes.\nDepartment: IT',
  sections: [
    dateSection,
    {
      title: 'MANDATORY FIELDS',
      fields: [
        {
          id: 'hisUptimeDowntime',
          label: 'HIS uptime / downtime status',
          type: 'text',
          required: true,
        },
        {
          id: 'pendingItTickets',
          label: '# of Pending IT tickets',
          type: 'number',
          required: true,
        },
        {
          id: 'upgradesPatchesProgress',
          label: 'Upgrades / patches in progress',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      title: 'OPTIONAL FIELDS',
      fields: [
        {
          id: 'integrationIssues',
          label: 'Integration issues',
          type: 'text',
          required: false,
        },
        {
          id: 'itOtherNotes',
          label: 'Other notes',
          type: 'text',
          required: false,
        },
      ],
    },
  ],
};

// Google Sheet tab names (mirrors sheets-config.ts SHEET_TAB_MAP)
const SLUG_TO_TAB: Record<string, string> = {
  'emergency': 'ED',
  'customer-care': 'Customer Care',
  'patient-safety': 'Patient Safety',
  'finance': 'Finance',
  'billing': 'Billing',
  'supply-chain': 'Supply Chain',
  'facility': 'FMS',
  'it': 'IT',
  'nursing': 'Nursing',
  'pharmacy': 'Pharmacy',
  'clinical-lab': 'Clinical Lab',
  'radiology': 'Radiology',
  'ot': 'OT',
  'hr-manpower': 'Human Resources',
  'training': 'Training',
  'diet': 'Clinical Nutrition, F&B',
  'biomedical': 'Biomedical',
};

// Helper to enrich form defs with backward-compat fields
function enrichField(field: FormField): FormField {
  return {
    ...field,
    name: field.label,
    helper: field.description,
  };
}

function enrichForm(form: DepartmentForm): DepartmentForm {
  const enrichedSections = form.sections.map(s => ({
    ...s,
    fields: s.fields.map(enrichField),
  }));
  // KPI fields = required numeric fields (shown as metric cards on dashboard)
  const kpiFields = enrichedSections
    .flatMap(s => s.fields)
    .filter(f => f.required && (f.type === 'number' || f.type === 'radio'))
    .map(f => f.label);

  return {
    ...form,
    sections: enrichedSections,
    name: form.department,
    tab: SLUG_TO_TAB[form.slug] || form.department,
    kpiFields,
  };
}

// Export all forms
export const DEPARTMENT_FORMS: DepartmentForm[] = [
  emergencyForm,
  customerCareForm,
  patientSafetyForm,
  financeForm,
  billingForm,
  supplyChainForm,
  facilityForm,
  pharmacyForm,
  trainingForm,
  clinicalLabForm,
  radiologyForm,
  otForm,
  hrManpowerForm,
  dietForm,
  biomedicalForm,
  nursingForm,
  itForm,
].map(enrichForm);

// Create lookup map by slug
export const FORMS_BY_SLUG: Record<string, DepartmentForm> = DEPARTMENT_FORMS.reduce(
  (acc, form) => {
    acc[form.slug] = form;
    return acc;
  },
  {} as Record<string, DepartmentForm>,
);

// Backward-compatible aliases used by existing components
export type DepartmentFormDef = DepartmentForm;
export const FORM_DEFINITIONS = DEPARTMENT_FORMS;
