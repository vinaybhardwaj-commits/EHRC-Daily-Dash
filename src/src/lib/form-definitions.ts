// Complete form definitions extracted from all 17 Google Forms
// Each department has sections with fields, types, and required status

export interface FormField {
  name: string;
  type: 'number' | 'text' | 'paragraph' | 'radio';
  required: boolean;
  helper?: string;
  options?: string[]; // for radio fields
}

export interface FormSection {
  title: string;
  description?: string;
  fields: FormField[];
}

export interface DepartmentFormDef {
  name: string;
  slug: string;
  tab: string;
  description: string;
  owner?: string;
  sections: FormSection[];
  kpiFields: string[]; // fields to show as KPI cards
  trendFields: string[]; // numeric fields to chart over time
}

export const FORM_DEFINITIONS: DepartmentFormDef[] = [
  {
    name: 'Emergency',
    slug: 'emergency',
    tab: 'ED',
    description: 'Keep genuine emergencies and planned admissions separate.',
    sections: [
      {
        title: 'Mandatory',
        fields: [
          { name: '# of genuine walk-in / ambulance emergencies (last 24h)', type: 'number', required: true, helper: 'Do NOT include planned admissions routed through ED' },
          { name: '# of after-hours planned admissions routed through ED', type: 'number', required: true, helper: 'Estimate from night register' },
          { name: 'Door-to-doctor TAT — emergencies only (average minutes, last 24h)', type: 'number', required: true, helper: 'Exclude planned admissions' },
          { name: '# of patients Left Without Being Seen / LWBS', type: 'number', required: true, helper: 'Enter 0 if none' },
          { name: '# of Deaths', type: 'number', required: true, helper: 'Enter 0 if none' },
          { name: '# of MLC cases registered', type: 'number', required: true, helper: 'Enter 0 if none' },
          { name: 'Triage L1 + L2 count (critical / emergent cases only)', type: 'number', required: true },
          { name: 'ED revenue today (Rs.)', type: 'number', required: true, helper: 'Total ED billing for the day' },
        ],
      },
      {
        title: 'Optional',
        fields: [
          { name: '# of LAMA / DAMA', type: 'number', required: false },
          { name: '# of Critical alerts (Code Blue / Red / Yellow)', type: 'number', required: false },
          { name: '# of ED incident reports', type: 'number', required: false, helper: 'Near miss or sentinel events' },
          { name: 'Anticipated challenges / other notes', type: 'paragraph', required: false },
        ],
      },
    ],
    kpiFields: [
      '# of genuine walk-in / ambulance emergencies (last 24h)',
      'Triage L1 + L2 count (critical / emergent cases only)',
      'Door-to-doctor TAT — emergencies only (average minutes, last 24h)',
      '# of Deaths',
      '# of Critical alerts (Code Blue / Red / Yellow)',
      'ED revenue today (Rs.)',
    ],
    trendFields: [
      '# of genuine walk-in / ambulance emergencies (last 24h)',
      'ED revenue today (Rs.)',
      'Triage L1 + L2 count (critical / emergent cases only)',
    ],
  },
  {
    name: 'Customer Care',
    slug: 'customer-care',
    tab: 'Customer Care',
    description: 'OPD volumes, complaints, doctor punctuality, reputation.',
    owner: 'Lavanya',
    sections: [
      {
        title: 'OPD Volumes',
        description: "Yesterday's appointment and attendance numbers.",
        fields: [
          { name: '# of OPD appointments — in-person', type: 'number', required: true, helper: 'Total scheduled in-person OPD appointments for the day' },
          { name: '# of OPD appointments — tele', type: 'number', required: true, helper: 'Total scheduled tele-consultation appointments' },
          { name: '# of OPD no-shows (patients who booked but did not arrive)', type: 'number', required: true, helper: 'Check appointment register vs actual attendance. Enter 0 if none.' },
          { name: '# of patients who left OPD without being seen (gave up waiting)', type: 'number', required: true, helper: 'Use tally mark sheet at front desk. Enter 0 if none.' },
          { name: '# of patients waiting > 10 min in OPD (at peak)', type: 'number', required: true, helper: 'Approximate count at busiest point of the day' },
          { name: '# of Health check appointments', type: 'number', required: true, helper: 'Enter 0 if none' },
        ],
      },
      {
        title: 'Complaints',
        description: 'Track the flow — not just the pile. New vs closed tells us if we are keeping up.',
        fields: [
          { name: '# of new complaints received today', type: 'number', required: true, helper: 'All channels: in-person, phone, WhatsApp, online. Enter 0 if none.' },
          { name: '# of complaints closed / resolved today', type: 'number', required: true, helper: 'Enter 0 if none' },
          { name: '# of total complaints currently pending resolution', type: 'number', required: true, helper: 'Running total from your register' },
          { name: 'Age of oldest open complaint (days)', type: 'number', required: true, helper: 'How many days has the oldest unresolved complaint been open? Enter 0 if no pending complaints.' },
          { name: '# of customer escalations (complaints escalated to senior management)', type: 'number', required: true, helper: 'Enter 0 if none' },
        ],
      },
      {
        title: 'Doctor Punctuality',
        description: 'Tracks patient impact — not just whether doctors were late.',
        fields: [
          { name: 'Doctors on leave today (names, or write NIL)', type: 'text', required: true, helper: 'So patients calling to book are informed proactively' },
          { name: 'Doctors late > 10 min (names, or write NIL)', type: 'text', required: true },
          { name: '# of patients affected by doctor delays (kept waiting due to late/absent doctor)', type: 'number', required: true, helper: 'Approximate count. Enter 0 if none.' },
        ],
      },
      {
        title: 'Reputation',
        description: 'Google is our public scorecard. Rating matters as much as count.',
        fields: [
          { name: '# of Google Reviews received today', type: 'number', required: true, helper: 'Enter 0 if none' },
          { name: 'Average star rating of new Google Reviews (1–5, enter 0 if no reviews today)', type: 'number', required: true, helper: 'Check Google Business profile.' },
          { name: '# of Video Testimonials collected', type: 'number', required: true, helper: 'Enter 0 if none' },
        ],
      },
      {
        title: 'Optional — Alerts & Notes',
        fields: [
          { name: 'VIP / International patient alerts', type: 'text', required: false, helper: 'Names, special requirements, or expected arrival time' },
          { name: 'Call centre / front office performance note', type: 'text', required: false, helper: 'Any issues with call handling, response time, or staff concerns' },
          { name: 'Any other notes', type: 'paragraph', required: false },
        ],
      },
    ],
    kpiFields: [
      '# of OPD appointments — in-person',
      '# of OPD no-shows (patients who booked but did not arrive)',
      '# of new complaints received today',
      '# of total complaints currently pending resolution',
      '# of Google Reviews received today',
      '# of patients affected by doctor delays (kept waiting due to late/absent doctor)',
    ],
    trendFields: [
      '# of OPD appointments — in-person',
      '# of new complaints received today',
      '# of complaints closed / resolved today',
      '# of Google Reviews received today',
    ],
  },
  {
    name: 'Patient Safety & Quality',
    slug: 'patient-safety',
    tab: 'Patient Safety',
    description: 'Incident reporting, RCA follow-through, HAI bundle compliance, NABH audit status.',
    owner: 'Dr. Ankita Priya',
    sections: [
      {
        title: 'Incident Reporting',
        description: 'Report ALL incidents — near misses included. High near-miss reporting = healthy safety culture.',
        fields: [
          { name: '# of Near-miss incidents reported today', type: 'number', required: true, helper: 'Near misses = caught before reaching patient.' },
          { name: '# of Adverse events reported today', type: 'number', required: true, helper: 'Adverse = reached patient, caused some harm.' },
          { name: '# of Sentinel events reported today', type: 'number', required: true, helper: 'Sentinel = serious harm, death, or never-event.' },
          { name: '# of Patient falls today', type: 'number', required: true, helper: 'Includes all falls regardless of severity.' },
          { name: '# of Medication errors today', type: 'number', required: true, helper: 'Wrong drug / dose / route / patient / time. Enter 0 if none.' },
          { name: 'Under-reporting flag — any incident type you suspect was not reported today? (write NIL if none)', type: 'text', required: true },
        ],
      },
      {
        title: 'RCA & Follow-Through',
        description: 'The biggest patient safety gap is not incidents — it is incidents with no follow-through.',
        fields: [
          { name: '# of open RCAs currently in progress (total pending)', type: 'number', required: true },
          { name: '# of open RCAs past their due date', type: 'number', required: true, helper: 'Due dates: Near-miss = 72h, Adverse = 7 days, Sentinel = 24h.' },
          { name: '# of corrective actions closed today', type: 'number', required: true },
          { name: 'RCA summary — any new RCA initiated or closed today? (brief details, or write NIL)', type: 'paragraph', required: true },
        ],
      },
      {
        title: 'HAI Bundle Compliance',
        description: 'Daily bundle compliance is the best leading indicator for HAI rates.',
        fields: [
          { name: 'Central Line bundle compliance today (CLABSI prevention)', type: 'radio', required: true, options: ['Yes — full compliance', 'Partial — some steps missed', 'No — bundle not followed', 'N/A — no patients on this device today'] },
          { name: 'Urinary Catheter bundle compliance today (CAUTI prevention)', type: 'radio', required: true, options: ['Yes — full compliance', 'Partial — some steps missed', 'No — bundle not followed', 'N/A — no patients on this device today'] },
          { name: 'Ventilator bundle compliance today (VAP prevention)', type: 'radio', required: true, options: ['Yes — full compliance', 'Partial — some steps missed', 'No — bundle not followed', 'N/A — no patients on this device today'] },
          { name: 'Surgical site care bundle compliance today (SSI prevention)', type: 'radio', required: true, options: ['Yes — full compliance', 'Partial — some steps missed', 'No — bundle not followed', 'N/A — no patients on this device today'] },
        ],
      },
      {
        title: 'NABH & Audit Status',
        description: 'Track the flow of non-compliances — not just that they exist.',
        fields: [
          { name: '# of new NABH non-compliances identified today', type: 'number', required: true },
          { name: '# of NABH non-compliances closed today', type: 'number', required: true },
          { name: '# of total open NABH non-compliances (running total)', type: 'number', required: true, helper: 'This number should trend downward over time.' },
          { name: '# of open audit findings past their due date', type: 'number', required: true },
          { name: 'Clinical audit status today', type: 'radio', required: true, options: ['On track', 'Delayed — minor', 'Delayed — needs escalation', 'Not applicable today'] },
          { name: 'Non-clinical audit status today', type: 'radio', required: true, options: ['On track', 'Delayed — minor', 'Delayed — needs escalation', 'Not applicable today'] },
        ],
      },
      {
        title: 'Safety Communication',
        description: 'NABH requires documented daily safety communication.',
        fields: [
          { name: '# of staff who received a safety briefing or communication today', type: 'number', required: true },
          { name: 'Topic of safety communication today (or write NIL)', type: 'text', required: true },
        ],
      },
      {
        title: 'Optional',
        fields: [
          { name: 'Any other quality / safety notes', type: 'paragraph', required: false },
        ],
      },
    ],
    kpiFields: [
      '# of Near-miss incidents reported today',
      '# of Adverse events reported today',
      '# of Sentinel events reported today',
      '# of open RCAs past their due date',
      '# of total open NABH non-compliances (running total)',
      '# of Medication errors today',
    ],
    trendFields: [
      '# of Near-miss incidents reported today',
      '# of Adverse events reported today',
      '# of total open NABH non-compliances (running total)',
      '# of corrective actions closed today',
    ],
  },
  {
    name: 'Finance',
    slug: 'finance',
    tab: 'Finance',
    description: 'Revenue, census, surgeries, ARPOB.',
    sections: [
      {
        title: 'Mandatory',
        fields: [
          { name: 'Revenue for the day (Rs.)', type: 'number', required: true },
          { name: 'Total revenue MTD (Rs.)', type: 'number', required: true },
          { name: 'Midnight census — total IP patients', type: 'number', required: true },
          { name: 'Surgeries MTD', type: 'number', required: true },
          { name: 'ARPOB — Avg Revenue Per Occupied Bed (Rs.)', type: 'number', required: true },
        ],
      },
      {
        title: 'Optional',
        fields: [
          { name: 'OPD revenue MTD (Rs.)', type: 'number', required: false },
          { name: 'Revenue leakage alerts', type: 'text', required: false },
          { name: 'Other finance notes', type: 'paragraph', required: false },
        ],
      },
    ],
    kpiFields: [
      'Revenue for the day (Rs.)',
      'Total revenue MTD (Rs.)',
      'Midnight census — total IP patients',
      'Surgeries MTD',
      'ARPOB — Avg Revenue Per Occupied Bed (Rs.)',
      'OPD revenue MTD (Rs.)',
    ],
    trendFields: [
      'Revenue for the day (Rs.)',
      'Total revenue MTD (Rs.)',
      'Midnight census — total IP patients',
      'ARPOB — Avg Revenue Per Occupied Bed (Rs.)',
    ],
  },
  {
    name: 'Billing',
    slug: 'billing',
    tab: 'Billing',
    description: 'Pipeline cases, billing clearance, counselling.',
    sections: [
      {
        title: 'Mandatory',
        fields: [
          { name: '# of Pipeline cases (active, pending billing)', type: 'number', required: true },
          { name: '# of OT cases with billing clearance pending', type: 'number', required: true },
          { name: '# of DAMA / LAMA', type: 'number', required: true },
          { name: '# of Financial counselling sessions done today', type: 'number', required: true },
        ],
      },
      {
        title: 'Optional',
        fields: [
          { name: '# of Interim financial counselling done', type: 'number', required: false },
          { name: 'ICU / NICU census', type: 'number', required: false },
          { name: 'Surgeries planned for next day (details)', type: 'paragraph', required: false },
          { name: 'High-risk patient alerts', type: 'paragraph', required: false },
          { name: '# of IP admissions where prior OPD / doctor consultation existed (planned, routed via ED after hours)', type: 'number', required: false },
        ],
      },
    ],
    kpiFields: [
      '# of Pipeline cases (active, pending billing)',
      '# of OT cases with billing clearance pending',
      '# of DAMA / LAMA',
      '# of Financial counselling sessions done today',
    ],
    trendFields: [
      '# of Pipeline cases (active, pending billing)',
      '# of Financial counselling sessions done today',
    ],
  },
  {
    name: 'Supply Chain & Procurement',
    slug: 'supply-chain',
    tab: 'Supply Chain',
    description: 'Stock availability, GRNs, POs, emergency procurement.',
    sections: [
      {
        title: 'Mandatory',
        fields: [
          { name: 'Critical stock availability (status)', type: 'text', required: true },
          { name: '# of GRN prepared', type: 'number', required: true },
          { name: '# of PO issued', type: 'number', required: true },
          { name: '# of items procured in emergency / after 5pm', type: 'number', required: true },
        ],
      },
      {
        title: 'Optional',
        fields: [
          { name: 'Shortages / backorders', type: 'text', required: false },
          { name: 'Procurement escalations', type: 'text', required: false },
          { name: 'High-value purchase alerts', type: 'text', required: false },
          { name: 'Pending consumption reporting issues by dept', type: 'paragraph', required: false },
        ],
      },
    ],
    kpiFields: [
      'Critical stock availability (status)',
      '# of GRN prepared',
      '# of PO issued',
      '# of items procured in emergency / after 5pm',
    ],
    trendFields: [
      '# of GRN prepared',
      '# of PO issued',
      '# of items procured in emergency / after 5pm',
    ],
  },
  {
    name: 'Facility',
    slug: 'facility',
    tab: 'FMS',
    description: 'Facility readiness, safety, housekeeping.',
    sections: [
      {
        title: 'Mandatory',
        fields: [
          { name: 'Facility readiness — power / water / gases', type: 'text', required: true },
          { name: 'Safety issues', type: 'text', required: true },
          { name: 'Housekeeping & room readiness', type: 'text', required: true },
        ],
      },
      {
        title: 'Optional',
        fields: [
          { name: 'Preventive maintenance update', type: 'text', required: false },
          { name: 'Other notes', type: 'text', required: false },
        ],
      },
    ],
    kpiFields: [
      'Facility readiness — power / water / gases',
      'Safety issues',
      'Housekeeping & room readiness',
    ],
    trendFields: [],
  },
  {
    name: 'Pharmacy',
    slug: 'pharmacy',
    tab: 'Pharmacy',
    description: 'Revenue (IP/OP), stockouts, stock values.',
    sections: [
      {
        title: 'Mandatory',
        fields: [
          { name: 'Pharmacy revenue — IP today (Rs.)', type: 'number', required: true },
          { name: 'Pharmacy revenue — OP today (Rs.)', type: 'number', required: true },
          { name: 'Pharmacy revenue MTD (Rs.)', type: 'number', required: true },
          { name: 'Stockouts / shortages', type: 'text', required: true },
        ],
      },
      {
        title: 'Optional',
        fields: [
          { name: 'Medicine stock value — IP (Rs.)', type: 'number', required: false },
          { name: 'Medicine stock value — OP (Rs.)', type: 'number', required: false },
          { name: 'Items expiring within 3 months', type: 'text', required: false },
        ],
      },
    ],
    kpiFields: [
      'Pharmacy revenue — IP today (Rs.)',
      'Pharmacy revenue — OP today (Rs.)',
      'Pharmacy revenue MTD (Rs.)',
      'Stockouts / shortages',
    ],
    trendFields: [
      'Pharmacy revenue — IP today (Rs.)',
      'Pharmacy revenue — OP today (Rs.)',
      'Pharmacy revenue MTD (Rs.)',
    ],
  },
  {
    name: 'Clinical Lab',
    slug: 'clinical-lab',
    tab: 'Clinical Lab',
    description: 'Equipment status, critical reports, TAT, transfusion.',
    sections: [
      {
        title: 'Mandatory',
        fields: [
          { name: 'Machine & equipment status', type: 'text', required: true },
          { name: '# of Critical reports issued', type: 'number', required: true },
          { name: 'TAT performance', type: 'text', required: true },
          { name: 'Transfusion / blood request issues', type: 'text', required: true },
        ],
      },
      {
        title: 'Optional',
        fields: [
          { name: '# of Outsourced tests MTD', type: 'number', required: false },
          { name: 'Reagent shortages', type: 'text', required: false },
          { name: 'Sample recollection / reporting errors', type: 'text', required: false },
        ],
      },
    ],
    kpiFields: [
      '# of Critical reports issued',
      'TAT performance',
      'Machine & equipment status',
      '# of Outsourced tests MTD',
    ],
    trendFields: [
      '# of Critical reports issued',
      '# of Outsourced tests MTD',
    ],
  },
  {
    name: 'Radiology',
    slug: 'radiology',
    tab: 'Radiology',
    description: 'Case volumes (X-Ray/USG/CT), equipment uptime, reporting.',
    sections: [
      {
        title: 'Mandatory',
        fields: [
          { name: '# of X-Ray cases (yesterday)', type: 'number', required: true },
          { name: '# of USG cases (yesterday)', type: 'number', required: true },
          { name: '# of CT cases (yesterday)', type: 'number', required: true },
          { name: 'Equipment status — CT / MRI / USG uptime', type: 'text', required: true },
        ],
      },
      {
        title: 'Optional',
        fields: [
          { name: '# of Reports done in-house', type: 'number', required: false },
          { name: 'Pending reports — critical / non-critical', type: 'text', required: false },
          { name: 'Critical results escalated within TAT', type: 'text', required: false },
          { name: 'Film / contrast stock status', type: 'text', required: false },
          { name: 'Radiation safety log', type: 'text', required: false },
        ],
      },
    ],
    kpiFields: [
      '# of X-Ray cases (yesterday)',
      '# of USG cases (yesterday)',
      '# of CT cases (yesterday)',
      '# of Reports done in-house',
    ],
    trendFields: [
      '# of X-Ray cases (yesterday)',
      '# of USG cases (yesterday)',
      '# of CT cases (yesterday)',
    ],
  },
  {
    name: 'OT',
    slug: 'ot',
    tab: 'OT',
    description: 'Cases done, first case delay, surgeon escalations.',
    sections: [
      {
        title: 'Mandatory',
        fields: [
          { name: '# of OT cases done (yesterday)', type: 'number', required: true },
          { name: 'First case delay — time in minutes', type: 'number', required: true },
          { name: 'First case delay — reason', type: 'text', required: true },
          { name: '# of Escalations by surgeon', type: 'number', required: true },
        ],
      },
      {
        title: 'Optional',
        fields: [
          { name: '# of times team left OT for consumables', type: 'number', required: false },
        ],
      },
    ],
    kpiFields: [
      '# of OT cases done (yesterday)',
      'First case delay — time in minutes',
      '# of Escalations by surgeon',
      '# of times team left OT for consumables',
    ],
    trendFields: [
      '# of OT cases done (yesterday)',
      'First case delay — time in minutes',
    ],
  },
  {
    name: 'HR & Manpower',
    slug: 'hr-manpower',
    tab: 'Human Resources',
    description: 'Joiners, exits, replacement status, training.',
    sections: [
      {
        title: 'Mandatory',
        fields: [
          { name: 'New joiners today (names / nil)', type: 'text', required: true },
          { name: 'Resignations / exits today (names / nil)', type: 'text', required: true },
          { name: 'Replacement status', type: 'text', required: true },
        ],
      },
      {
        title: 'Optional',
        fields: [
          { name: 'Mandatory training / induction status', type: 'text', required: false },
          { name: 'New doctor profile creation status', type: 'text', required: false },
          { name: 'Other notes', type: 'text', required: false },
        ],
      },
    ],
    kpiFields: [
      'New joiners today (names / nil)',
      'Resignations / exits today (names / nil)',
      'Replacement status',
    ],
    trendFields: [],
  },
  {
    name: 'Training',
    slug: 'training',
    tab: 'Training',
    description: 'Daily training conducted, participants, MTD progress.',
    sections: [
      {
        title: 'Mandatory',
        fields: [
          { name: 'Training conducted today (topic)', type: 'text', required: true },
          { name: '# of participants', type: 'number', required: true },
          { name: 'MTD trainings completed vs planned', type: 'text', required: true },
        ],
      },
    ],
    kpiFields: [
      'Training conducted today (topic)',
      '# of participants',
      'MTD trainings completed vs planned',
    ],
    trendFields: [
      '# of participants',
    ],
  },
  {
    name: 'Diet',
    slug: 'diet',
    tab: 'Clinical Nutrition, F&B',
    description: 'Diet census, BCA, food feedback.',
    sections: [
      {
        title: 'Mandatory',
        fields: [
          { name: 'Daily census — diet patients', type: 'number', required: true },
          { name: 'BCA done today', type: 'number', required: true },
          { name: 'BCA MTD total', type: 'number', required: true },
          { name: 'Food feedback summary', type: 'text', required: true },
        ],
      },
      {
        title: 'Optional',
        fields: [
          { name: 'Discharge plan completed with diet', type: 'text', required: false },
          { name: 'Kitchen update', type: 'text', required: false },
          { name: 'Delays / incidents', type: 'text', required: false },
        ],
      },
    ],
    kpiFields: [
      'Daily census — diet patients',
      'BCA done today',
      'BCA MTD total',
      'Food feedback summary',
    ],
    trendFields: [
      'Daily census — diet patients',
      'BCA done today',
      'BCA MTD total',
    ],
  },
  {
    name: 'Biomedical',
    slug: 'biomedical',
    tab: 'Biomedical',
    description: 'Equipment readiness, breakdowns, repairs, PM compliance.',
    sections: [
      {
        title: 'Mandatory',
        fields: [
          { name: 'Equipment readiness — OT, ICU, etc.', type: 'text', required: true },
          { name: 'Breakdown updates', type: 'text', required: true },
          { name: 'Pending repairs', type: 'text', required: true },
        ],
      },
      {
        title: 'Optional',
        fields: [
          { name: 'Preventive maintenance compliance', type: 'text', required: false },
          { name: 'Other notes', type: 'text', required: false },
        ],
      },
    ],
    kpiFields: [
      'Equipment readiness — OT, ICU, etc.',
      'Breakdown updates',
      'Pending repairs',
    ],
    trendFields: [],
  },
  {
    name: 'Nursing',
    slug: 'nursing',
    tab: 'Nursing',
    description: 'Census, staffing, escalations, HAI/IPC status.',
    sections: [
      {
        title: 'Mandatory',
        fields: [
          { name: 'Midnight census — patient count', type: 'number', required: true },
          { name: 'Staffing matrix — nurses on duty', type: 'number', required: true },
          { name: 'Escalations / concerns', type: 'paragraph', required: true },
          { name: 'Daily HAI/IPC status (CLABSI,VAP,CAUTI,SSI)', type: 'text', required: true },
        ],
      },
      {
        title: 'Optional',
        fields: [
          { name: 'Patient complaints & satisfaction', type: 'text', required: false },
          { name: 'Infection control update', type: 'text', required: false },
          { name: 'Biomedical waste incidents', type: 'number', required: false },
          { name: 'Cafeteria / dialysis update', type: 'text', required: false },
        ],
      },
    ],
    kpiFields: [
      'Midnight census — patient count',
      'Staffing matrix — nurses on duty',
      'Daily HAI/IPC status (CLABSI,VAP,CAUTI,SSI)',
    ],
    trendFields: [
      'Midnight census — patient count',
      'Staffing matrix — nurses on duty',
    ],
  },
  {
    name: 'IT',
    slug: 'it',
    tab: 'IT',
    description: 'HIS uptime, tickets, upgrades, integrations.',
    sections: [
      {
        title: 'Mandatory',
        fields: [
          { name: 'HIS uptime / downtime status', type: 'text', required: true },
          { name: '# of Pending IT tickets', type: 'number', required: true },
          { name: 'Upgrades / patches in progress', type: 'text', required: true },
        ],
      },
      {
        title: 'Optional',
        fields: [
          { name: 'Integration issues', type: 'text', required: false },
          { name: 'Other notes', type: 'text', required: false },
        ],
      },
    ],
    kpiFields: [
      'HIS uptime / downtime status',
      '# of Pending IT tickets',
      'Upgrades / patches in progress',
    ],
    trendFields: [
      '# of Pending IT tickets',
    ],
  },
];

export function getFormDef(slug: string): DepartmentFormDef | undefined {
  return FORM_DEFINITIONS.find(d => d.slug === slug);
}

export function getAllFields(def: DepartmentFormDef): FormField[] {
  return def.sections.flatMap(s => s.fields);
}
