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
