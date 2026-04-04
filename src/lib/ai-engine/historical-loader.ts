/* ──────────────────────────────────────────────────────────────────
   Historical Data Loader
   Fetches recent department_data for anomaly detection context
   ────────────────────────────────────────────────────────────────── */

import { sql } from '@vercel/postgres';

/**
 * Load the last N days of form data for a department.
 * Returns an array of field maps (one per day), most recent first.
 * Normalizes both JSONB formats (key-value and fields).
 */
export async function loadHistoricalData(
  slug: string,
  currentDate: string,
  lookbackDays: number = 7
): Promise<Record<string, unknown>[]> {
  try {
    const result = await sql`
      SELECT date, entries
      FROM department_data
      WHERE slug = ${slug}
        AND date < ${currentDate}
      ORDER BY date DESC
      LIMIT ${lookbackDays}
    `;

    return result.rows.map(row => {
      const entries = row.entries;
      return normalizeEntries(entries);
    });
  } catch {
    // Table might not exist or other DB error — graceful fallback
    return [];
  }
}

/**
 * Normalize JSONB entries to a flat field map.
 * Handles both formats:
 *   [{key: "Revenue", value: "450000"}, ...]
 *   [{fields: {"Revenue": "450000", ...}}]
 */
function normalizeEntries(entries: unknown): Record<string, unknown> {
  if (!Array.isArray(entries)) return {};

  const fields: Record<string, unknown> = {};

  for (const entry of entries) {
    if (entry && typeof entry === 'object') {
      // Format 1: {key, value}
      if ('key' in entry && 'value' in entry) {
        fields[entry.key as string] = entry.value;
      }
      // Format 2: {fields: {...}}
      if ('fields' in entry && typeof entry.fields === 'object' && entry.fields !== null) {
        Object.assign(fields, entry.fields);
      }
    }
  }

  return fields;
}

/**
 * Map field labels from historical data to field IDs used in the rubric.
 * This handles the mismatch between form-definitions labels and rubric field IDs.
 */
export function mapFieldLabelsToIds(
  historicalFields: Record<string, unknown>,
  fieldMapping: Record<string, string[]>  // rubricFieldId → [possible label patterns]
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};

  for (const [fieldId, patterns] of Object.entries(fieldMapping)) {
    for (const pattern of patterns) {
      const lowerPattern = pattern.toLowerCase();
      for (const [key, value] of Object.entries(historicalFields)) {
        if (key.toLowerCase().includes(lowerPattern)) {
          mapped[fieldId] = value;
          break;
        }
      }
      if (fieldId in mapped) break;
    }
  }

  return mapped;
}

/**
 * Customer Care field mapping: rubric field IDs → form label patterns.
 * These patterns match the labels in form-definitions.ts.
 */
export const CUSTOMER_CARE_FIELD_MAP: Record<string, string[]> = {
  opdAppointmentsInPerson: ['opd appointments today', 'in-person'],
  opdAppointmentsTele: ['tele', 'teleconsult'],
  opdNoShows: ['no-show', 'no show'],
  patientsLeftWithoutSeen: ['left without being seen', 'lwbs'],
  patientsWaitingOver10Min: ['waiting over 10', 'wait time'],
  healthCheckAppointments: ['health check'],
  newComplaintsReceived: ['new complaints received'],
  complaintsClosed: ['complaints closed'],
  totalComplaintsPending: ['total complaints pending', 'pending complaints'],
  oldestComplaintAge: ['oldest complaint'],
  customerEscalations: ['escalation'],
  doctorsOnLeave: ['doctors on leave'],
  doctorsLate: ['doctors late', 'doctors running late'],
  patientsAffectedByDelays: ['patients affected by delay'],
  googleReviewsReceived: ['google reviews received'],
  averageStarRating: ['average star rating', 'star rating'],
  videoTestimonialsCollected: ['video testimonial'],
  vipInternationalAlerts: ['vip', 'international'],
  callCentrePerformance: ['call centre', 'call center'],
  otherNotes: ['other notes', 'notes'],
};

/**
 * Emergency Department field mapping.
 */
export const EMERGENCY_FIELD_MAP: Record<string, string[]> = {
  genuineEmergencies: ['genuine', 'walk-in', 'ambulance emergencies'],
  afterHoursAdmissions: ['after-hours', 'after hours', 'planned admissions'],
  doorToDoctorTat: ['door-to-doctor', 'door to doctor', 'tat'],
  patientsLwbs: ['lwbs', 'left without being seen'],
  deaths: ['death'],
  mlcCases: ['mlc'],
  triageL1L2Count: ['triage', 'l1', 'l2'],
  edRevenueToday: ['ed revenue', 'revenue today'],
  lamaDama: ['lama', 'dama'],
  criticalAlerts: ['critical alert', 'code blue', 'code red', 'code yellow'],
  edIncidentReports: ['incident report'],
  anticipatedChallenges: ['anticipated', 'challenges', 'other notes'],
};

/**
 * Finance field mapping.
 */
export const FINANCE_FIELD_MAP: Record<string, string[]> = {
  revenueForDay: ['revenue for the day', 'daily revenue'],
  totalRevenueMtd: ['total revenue mtd', 'revenue mtd'],
  midnightCensus: ['midnight census', 'ip patients'],
  surgeriesMtd: ['surgeries mtd'],
  arpob: ['arpob', 'avg revenue per occupied bed'],
  opdRevenueMtd: ['opd revenue'],
  revenueLeakageAlerts: ['revenue leakage', 'leakage alert'],
  financeNotes: ['finance notes', 'other finance'],
};

/**
 * Clinical Lab field mapping.
 */
export const CLINICAL_LAB_FIELD_MAP: Record<string, string[]> = {
  machineEquipmentStatus: ['machine', 'equipment status'],
  criticalReportsIssued: ['critical report'],
  tatPerformance: ['tat performance', 'turnaround'],
  transfusionBloodIssues: ['transfusion', 'blood request', 'blood issue'],
  outsourcedTestsMtd: ['outsourced test'],
  reagentShortages: ['reagent shortage', 'reagent'],
  sampleRecollectionErrors: ['sample recollection', 'reporting error'],
};

/**
 * Patient Safety & Quality field mapping.
 */
export const PATIENT_SAFETY_FIELD_MAP: Record<string, string[]> = {
  nearMissIncidents: ['near-miss', 'near miss'],
  adverseEvents: ['adverse event'],
  sentinelEvents: ['sentinel event'],
  patientFalls: ['patient fall'],
  medicationErrors: ['medication error'],
  underReportingFlag: ['under-reporting', 'under reporting', 'unreported'],
  openRcasInProgress: ['open rca', 'rca in progress', 'rca currently'],
  openRcasPastDue: ['rca past due', 'rca past their due'],
  correctiveActionsClosed: ['corrective action', 'actions closed'],
  rcaSummary: ['rca summary'],
  centralLineBundleCompliance: ['central line', 'clabsi'],
  urinaryCathetherBundleCompliance: ['urinary catheter', 'cauti'],
  ventilatorBundleCompliance: ['ventilator', 'vap'],
  surgicalSiteBundleCompliance: ['surgical site', 'ssi'],
  newNabhNonCompliances: ['new nabh non-compliance', 'new nabh'],
  nabhNonComplainancesClosed: ['nabh non-compliance closed', 'nabh closed'],
  totalOpenNabhNonCompliances: ['total open nabh', 'open nabh'],
  openAuditFindingsPastDue: ['audit finding', 'audit past due'],
  clinicalAuditStatus: ['clinical audit'],
  nonClinicalAuditStatus: ['non-clinical audit'],
  staffSafetyBriefing: ['safety briefing', 'staff who received'],
  safetyTopicToday: ['safety topic', 'topic of safety'],
  qualitySafetyNotes: ['quality', 'safety notes'],
};

/**
 * Facility (FMS) field mapping.
 */
export const FACILITY_FIELD_MAP: Record<string, string[]> = {
  facilityReadiness: ['facility readiness', 'power', 'water', 'gases'],
  safetyIssues: ['safety issue'],
  housekeepingReadiness: ['housekeeping', 'room readiness'],
  preventiveMaintenanceUpdate: ['preventive maintenance'],
  facilityOtherNotes: ['other notes', 'facility notes'],
};

/**
 * Billing field mapping.
 */
export const BILLING_FIELD_MAP: Record<string, string[]> = {
  pipelineCases: ['pipeline cases', 'active pipeline'],
  otCasesAwaitingBilling: ['ot cases awaiting', 'ot billing clearance'],
  damaLama: ['dama', 'lama', 'dama/lama'],
  financialCounsellingDone: ['financial counselling', 'counselling done'],
  highRiskAlerts: ['high-risk', 'high risk alert'],
  surgeriesPlannedNextDay: ['surgeries planned', 'planned next day'],
};

/**
 * Supply Chain & Procurement field mapping.
 */
export const SUPPLY_CHAIN_FIELD_MAP: Record<string, string[]> = {
  criticalStockAvailability: ['critical stock', 'stock availability'],
  itemsProcuredEmergency: ['emergency procurement', 'procured emergency', 'after 5pm'],
  shortagesBackorders: ['shortage', 'backorder'],
  highValuePurchaseAlerts: ['high-value purchase', 'high value'],
  procurementEscalations: ['procurement escalation', 'escalation'],
  grnProcessedToday: ['grn processed', 'goods received'],
  poRaisedToday: ['po raised', 'purchase order'],
};

/**
 * Pharmacy field mapping.
 */
export const PHARMACY_FIELD_MAP: Record<string, string[]> = {
  pharmacyRevenueIpToday: ['ip revenue', 'inpatient revenue', 'ip pharmacy revenue'],
  pharmacyRevenueOpToday: ['op revenue', 'outpatient revenue', 'op pharmacy revenue'],
  pharmacyRevenueMtd: ['pharmacy revenue mtd', 'revenue mtd'],
  stockoutsShortages: ['stockout', 'shortage', 'out of stock'],
  itemsExpiringWithin3Months: ['expiring', 'expiry', 'items expiring'],
};

/**
 * Training field mapping.
 */
export const TRAINING_FIELD_MAP: Record<string, string[]> = {
  trainingConductedTopic: ['training conducted', 'topic', 'training topic'],
  trainingParticipants: ['participant', 'attendees', 'number of participant'],
  mtdTrainingsStatus: ['mtd training', 'mtd status', 'trainings completed mtd'],
};

/**
 * Radiology field mapping.
 */
export const RADIOLOGY_FIELD_MAP: Record<string, string[]> = {
  xrayCasesYesterday: ['x-ray', 'xray', 'x ray cases'],
  usgCasesYesterday: ['usg', 'ultrasound'],
  ctCasesYesterday: ['ct cases', 'ct scan'],
  equipmentStatus: ['equipment status', 'machine status'],
  reportsDoneInHouse: ['reports done', 'in-house reports'],
  pendingReports: ['pending reports', 'reports pending'],
  criticalResultsEscalated: ['critical results', 'critical finding', 'escalated'],
  filmContrastStock: ['film', 'contrast stock', 'film/contrast'],
  radiationSafetyLog: ['radiation safety', 'safety log'],
};

/**
 * Operation Theatre field mapping.
 */
export const OT_FIELD_MAP: Record<string, string[]> = {
  otCasesDoneYesterday: ['ot cases done', 'cases done yesterday', 'surgeries done'],
  firstCaseDelayMinutes: ['first case delay', 'delay minutes'],
  firstCaseDelayReason: ['delay reason', 'reason for delay'],
  escalationsBySurgeon: ['surgeon escalation', 'escalation by surgeon'],
  timesTeamLeftOt: ['team left ot', 'left before', 'left ot'],
};

/**
 * HR & Manpower field mapping.
 */
export const HR_MANPOWER_FIELD_MAP: Record<string, string[]> = {
  newJoinersToday: ['new joiner', 'joiners today'],
  resignationsExitsToday: ['resignation', 'exits today', 'exit'],
  replacementStatus: ['replacement status', 'replacement'],
  mandatoryTrainingInduction: ['mandatory training', 'induction'],
  doctorProfileCreation: ['doctor profile', 'profile creation'],
  hrOtherNotes: ['hr other notes', 'hr notes'],
};

/**
 * Diet & Nutrition field mapping.
 */
export const DIET_FIELD_MAP: Record<string, string[]> = {
  dietPatientsCensus: ['diet patient', 'patient census', 'census'],
  bcaDoneToday: ['bca done', 'bca today'],
  bcaMtdTotal: ['bca mtd', 'mtd total'],
  foodFeedbackSummary: ['food feedback', 'feedback summary'],
  dischargePlanWithDiet: ['discharge plan', 'diet plan'],
  kitchenUpdate: ['kitchen update', 'kitchen'],
  delaysIncidents: ['delay', 'incident', 'kitchen incident'],
};

/**
 * Biomedical Engineering field mapping.
 */
export const BIOMEDICAL_FIELD_MAP: Record<string, string[]> = {
  equipmentReadiness: ['equipment readiness', 'readiness'],
  breakdownUpdates: ['breakdown', 'breakdown update'],
  pendingRepairs: ['pending repair', 'repairs pending'],
  preventiveMaintenanceCompliance: ['preventive maintenance', 'pm compliance'],
  biomedicalOtherNotes: ['biomedical notes', 'other notes'],
};

/**
 * Nursing field mapping.
 */
export const NURSING_FIELD_MAP: Record<string, string[]> = {
  midnightCensusNursing: ['midnight census', 'census'],
  staffingMatrixNurses: ['staffing matrix', 'nurse staffing', 'staffing'],
  escalationsConcerns: ['escalation', 'concern'],
  dailyHaiIpcStatus: ['hai', 'ipc', 'infection'],
  patientComplaintsSatisfaction: ['patient complaint', 'satisfaction'],
  infectionControlUpdate: ['infection control', 'infection update'],
  biomedicalWasteIncidents: ['biomedical waste', 'bmw incident'],
  cafeteriaDialysisUpdate: ['cafeteria', 'dialysis'],
};

/**
 * IT field mapping.
 */
export const IT_FIELD_MAP: Record<string, string[]> = {
  hisUptimeDowntime: ['his uptime', 'his downtime', 'uptime/downtime'],
  pendingItTickets: ['pending it ticket', 'it tickets', 'pending tickets'],
  upgradesPatchesProgress: ['upgrade', 'patch', 'progress'],
  integrationIssues: ['integration issue', 'integration'],
  itOtherNotes: ['it other notes', 'it notes'],
};
