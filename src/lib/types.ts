export interface DepartmentEntry {
  timestamp: string;
  date: string;
  fields: Record<string, string | number>;
}

export interface DepartmentData {
  name: string;
  slug: string;
  tab: string;
  entries: DepartmentEntry[];
}

export interface HuddleSummary {
  filename: string;
  content: string;
  uploadedAt: string;
  type: 'pdf' | 'docx' | 'md';
}

export interface DaySnapshot {
  date: string; // YYYY-MM-DD
  departments: DepartmentData[];
  huddleSummaries: HuddleSummary[];
  updatedAt: string;
}

export const DEPARTMENTS = [
  { name: 'Emergency', slug: 'emergency', tab: 'ED' },
  { name: 'Finance', slug: 'finance', tab: 'Finance' },
  { name: 'Billing', slug: 'billing', tab: 'Billing' },
  { name: 'Pharmacy', slug: 'pharmacy', tab: 'Pharmacy' },
  { name: 'Clinical Lab', slug: 'clinical-lab', tab: 'Clinical Lab' },
  { name: 'Radiology', slug: 'radiology', tab: 'Radiology' },
  { name: 'OT', slug: 'ot', tab: 'OT' },
  { name: 'HR & Manpower', slug: 'hr-manpower', tab: 'Human Resources' },
  { name: 'Supply Chain & Procurement', slug: 'supply-chain', tab: 'Supply Chain' },
  { name: 'Training', slug: 'training', tab: 'Training' },
  { name: 'Diet', slug: 'diet', tab: 'Clinical Nutrition, F&B' },
  { name: 'Biomedical', slug: 'biomedical', tab: 'Biomedical' },
  { name: 'Nursing', slug: 'nursing', tab: 'Nursing' },
  { name: 'Facility', slug: 'facility', tab: 'FMS' },
  { name: 'IT', slug: 'it', tab: 'IT' },
  { name: 'Customer Care', slug: 'customer-care', tab: 'Customer Care' },
  { name: 'Patient Safety & Quality', slug: 'patient-safety', tab: 'Patient Safety' },
] as const;

// Key metrics to highlight per department
export const DEPARTMENT_KPI_FIELDS: Record<string, string[]> = {
  emergency: [
    '# of genuine walk-in / ambulance emergencies (last 24h)',
    'Triage L1 + L2 count (critical / emergent cases only)',
    '# of Deaths',
    '# of LAMA / DAMA',
    '# of Critical alerts (Code Blue / Red / Yellow)',
  ],
  finance: [
    'Revenue for the day (Rs.)',
    'Total revenue MTD (Rs.)',
    'Midnight census — total IP patients',
    'Surgeries MTD',
    'ARPOB — Avg Revenue Per Occupied Bed (Rs.)',
    'OPD revenue MTD (Rs.)',
  ],
  billing: [
    '# of Pipeline cases (active, pending billing)',
    '# of OT cases with billing clearance pending',
    '# of DAMA / LAMA',
    '# of Financial counselling sessions done today',
  ],
  pharmacy: [
    'Pharmacy revenue — IP today (Rs.)',
    'Pharmacy revenue — OP today (Rs.)',
    'Pharmacy revenue MTD (Rs.)',
    'Stockouts / shortages',
  ],
  'clinical-lab': [
    '# of Critical reports issued',
    'TAT performance',
    '# of Outsourced tests MTD',
    'Sample recollection / reporting errors',
  ],
  radiology: [
    '# of X-Ray cases (yesterday)',
    '# of USG cases (yesterday)',
    '# of CT cases (yesterday)',
    '# of Reports done in-house',
  ],
  ot: [
    '# of OT cases done (yesterday)',
    'First case delay — time in minutes',
    'First case delay — reason',
    '# of Escalations by surgeon',
  ],
  'hr-manpower': [
    'New joiners today (names / nil)',
    'Resignations / exits today (names / nil)',
    'Replacement status',
  ],
  'supply-chain': [
    'Critical stock availability (status)',
    '# of GRN prepared',
    '# of PO issued',
    '# of items procured in emergency / after 5pm',
  ],
  training: [
    'Training conducted today (topic)',
    '# of participants',
    'MTD trainings completed vs planned',
  ],
  diet: [
    'Daily census — diet patients',
    'BCA done today',
    'Food feedback summary',
  ],
  biomedical: [
    'Equipment readiness — OT, ICU, etc.',
    'Breakdown updates',
    'Pending repairs',
    'Preventive maintenance compliance',
  ],
};
