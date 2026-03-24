/**
 * Signature KPI configuration for each of the 17 departments.
 *
 * Each department gets ONE primary metric shown on the main overview grid.
 * - `fieldPatterns`: partial key matches used by `findField()` to locate the value
 *   in the department's submitted `fields` object.
 * - `type`: how to interpret the value
 *   - 'number' → extract numeric value, show trend arrow
 *   - 'text-status' → parse free-text into green/amber/red badge
 *   - 'ratio' → compute from two numeric fields (e.g., nurse:patient)
 * - `label`: short display label for the KPI card
 * - `unit`: optional suffix (e.g., '₹', 'min', 'cases')
 * - `invertTrend`: if true, "going down" is good (e.g., pending complaints)
 * - `statusKeywords`: for text-status type, keywords that map to green/amber/red
 */

export interface DepartmentKPI {
  slug: string;
  label: string;
  unit?: string;
  type: 'number' | 'text-status' | 'ratio';
  fieldPatterns: string[];          // patterns to match in fields
  secondaryFieldPatterns?: string[]; // for 'ratio' type (denominator)
  invertTrend?: boolean;            // true = lower is better
  statusKeywords?: {
    good: string[];
    warning: string[];
    bad: string[];
  };
}

export const DEPARTMENT_KPIS: DepartmentKPI[] = [
  {
    slug: 'emergency',
    label: 'ER Cases',
    unit: 'cases',
    type: 'number',
    fieldPatterns: ['walk-in', 'genuine walk-in', 'er cases', '# of genuine'],
  },
  {
    slug: 'customer-care',
    label: 'Pending Complaints',
    unit: 'open',
    type: 'number',
    fieldPatterns: ['pending resolution', 'complaints currently pending'],
    invertTrend: true,
  },
  {
    slug: 'patient-safety',
    label: 'Adverse Events',
    unit: 'events',
    type: 'number',
    fieldPatterns: ['adverse event', '# of Adverse'],
    invertTrend: true,
  },
  {
    slug: 'finance',
    label: 'Revenue MTD',
    unit: '₹',
    type: 'number',
    fieldPatterns: ['total revenue', 'Total revenue MTD'],
  },
  {
    slug: 'billing',
    label: 'Pipeline Cases',
    unit: 'pending',
    type: 'number',
    fieldPatterns: ['pipeline', 'Pipeline cases'],
    invertTrend: true,
  },
  {
    slug: 'supply-chain',
    label: 'GRN Prepared',
    unit: 'today',
    type: 'number',
    fieldPatterns: ['grn', 'GRN prepared'],
  },
  {
    slug: 'facility',
    label: 'Readiness',
    type: 'text-status',
    fieldPatterns: ['readiness', 'power', 'facility readiness'],
    statusKeywords: {
      good: ['all ok', 'ok', 'ready', 'normal', 'all systems', 'no issue', 'functional', 'running', 'all running'],
      warning: ['partial', 'one', 'minor', 'backup', 'intermittent'],
      bad: ['down', 'failure', 'critical', 'not ready', 'outage', 'issue', 'breakdown'],
    },
  },
  {
    slug: 'pharmacy',
    label: 'Pharmacy Rev MTD',
    unit: '₹',
    type: 'number',
    fieldPatterns: ['pharmacy revenue mtd', 'revenue MTD'],
  },
  {
    slug: 'training',
    label: 'Training MTD',
    type: 'text-status',
    fieldPatterns: ['mtd trainings', 'completed vs planned'],
    statusKeywords: {
      good: ['on track', 'ahead', 'completed', 'all done', '100%'],
      warning: ['behind', 'partial', 'in progress', 'pending'],
      bad: ['not started', 'nil', 'none', 'cancelled', '0'],
    },
  },
  {
    slug: 'clinical-lab',
    label: 'Critical Reports',
    unit: 'issued',
    type: 'number',
    fieldPatterns: ['critical report', '# of Critical reports'],
  },
  {
    slug: 'radiology',
    label: 'Imaging Cases',
    unit: 'total',
    type: 'number',
    // We'll sum X-Ray + USG + CT in the API
    fieldPatterns: ['x-ray', 'usg', 'ct'],
  },
  {
    slug: 'ot',
    label: 'OT Cases',
    unit: 'done',
    type: 'number',
    fieldPatterns: ['ot cases', '# of OT cases done'],
  },
  {
    slug: 'hr-manpower',
    label: 'Staffing Status',
    type: 'text-status',
    fieldPatterns: ['replacement status', 'replacement'],
    statusKeywords: {
      good: ['filled', 'on track', 'adequate', 'no gap', 'nil', 'none', 'no resignations'],
      warning: ['in process', 'pending', 'interview', 'partial', 'searching'],
      bad: ['critical', 'unfilled', 'delayed', 'shortage', 'multiple exits', 'urgent'],
    },
  },
  {
    slug: 'diet',
    label: 'BCA MTD',
    unit: 'done',
    type: 'number',
    fieldPatterns: ['bca mtd', 'BCA MTD total'],
  },
  {
    slug: 'biomedical',
    label: 'Equipment Status',
    type: 'text-status',
    fieldPatterns: ['equipment readiness', 'equipment', 'readiness'],
    statusKeywords: {
      good: ['all ok', 'functional', 'ready', 'operational', 'no issue', 'running', 'all equipment'],
      warning: ['partial', 'one', 'minor', 'under repair', 'maintenance'],
      bad: ['down', 'breakdown', 'critical', 'not working', 'failure', 'multiple'],
    },
  },
  {
    slug: 'nursing',
    label: 'Nurses on Duty',
    unit: 'staff',
    type: 'number',
    fieldPatterns: ['staffing matrix', 'nurses on duty'],
  },
  {
    slug: 'it',
    label: 'Pending Tickets',
    unit: 'open',
    type: 'number',
    fieldPatterns: ['pending it', '# of Pending IT tickets'],
    invertTrend: true,
  },
];

export const DEPARTMENT_KPI_MAP = new Map(
  DEPARTMENT_KPIS.map(kpi => [kpi.slug, kpi])
);

/**
 * Global issue definitions — things that get surfaced in the hospital-wide
 * issues panel. Each issue pulls from a specific department + field.
 */
export interface GlobalIssue {
  id: string;
  label: string;
  severity: 'red' | 'amber';
  deptSlug: string;
  fieldPatterns: string[];
  type: 'count' | 'boolean-text';
  /** For count type: threshold above which it becomes active */
  threshold?: number;
  /** For boolean-text: keywords that indicate an issue IS present */
  issueKeywords?: string[];
  /** For boolean-text: keywords that indicate NO issue */
  clearKeywords?: string[];
}

export const GLOBAL_ISSUES: GlobalIssue[] = [
  // Red flags
  { id: 'deaths', label: 'Deaths', severity: 'red', deptSlug: 'emergency', fieldPatterns: ['death', '# of Deaths'], type: 'count', threshold: 0 },
  { id: 'sentinel', label: 'Sentinel Events', severity: 'red', deptSlug: 'patient-safety', fieldPatterns: ['sentinel', '# of Sentinel'], type: 'count', threshold: 0 },
  { id: 'adverse', label: 'Adverse Events', severity: 'red', deptSlug: 'patient-safety', fieldPatterns: ['adverse', '# of Adverse'], type: 'count', threshold: 0 },
  { id: 'falls', label: 'Patient Falls', severity: 'red', deptSlug: 'patient-safety', fieldPatterns: ['fall', '# of Patient falls'], type: 'count', threshold: 0 },
  { id: 'med-errors', label: 'Medication Errors', severity: 'red', deptSlug: 'patient-safety', fieldPatterns: ['medication error', '# of Medication'], type: 'count', threshold: 0 },
  { id: 'equipment-down', label: 'Equipment Breakdown', severity: 'red', deptSlug: 'biomedical', fieldPatterns: ['breakdown', 'pending repair'], type: 'boolean-text', issueKeywords: ['down', 'breakdown', 'failure', 'pending', 'repair', 'issue'], clearKeywords: ['nil', 'none', 'no', 'na', 'nill', 'no breakdown', 'no pending'] },
  { id: 'stockout', label: 'Critical Stockouts', severity: 'red', deptSlug: 'supply-chain', fieldPatterns: ['shortage', 'stockout', 'critical stock'], type: 'boolean-text', issueKeywords: ['shortage', 'stockout', 'critical', 'out of stock', 'unavailable'], clearKeywords: ['nil', 'none', 'no', 'na', 'nill', 'adequate', 'no stock', 'available'] },
  { id: 'dama-lama', label: 'DAMA/LAMA', severity: 'red', deptSlug: 'billing', fieldPatterns: ['dama', 'lama', '# of DAMA'], type: 'count', threshold: 0 },

  // Amber warnings
  { id: 'pending-complaints', label: 'Pending Complaints', severity: 'amber', deptSlug: 'customer-care', fieldPatterns: ['pending resolution', 'complaints currently pending'], type: 'count', threshold: 0 },
  { id: 'overdue-rca', label: 'Overdue RCAs', severity: 'amber', deptSlug: 'patient-safety', fieldPatterns: ['past their due', 'overdue', 'open RCAs past'], type: 'count', threshold: 0 },
  { id: 'open-nabh', label: 'Open NABH Issues', severity: 'amber', deptSlug: 'patient-safety', fieldPatterns: ['total open nabh', 'open NABH non-compliances'], type: 'count', threshold: 0 },
  { id: 'lwbs', label: 'Patients LWBS', severity: 'amber', deptSlug: 'emergency', fieldPatterns: ['lwbs', '# of patients LWBS'], type: 'count', threshold: 0 },
  { id: 'doctor-delays', label: 'Doctor Delay Impact', severity: 'amber', deptSlug: 'customer-care', fieldPatterns: ['affected by doctor delays', 'patients affected'], type: 'count', threshold: 0 },
  { id: 'pending-tickets', label: 'Pending IT Tickets', severity: 'amber', deptSlug: 'it', fieldPatterns: ['pending it', '# of Pending IT tickets'], type: 'count', threshold: 3 },
  { id: 'pending-repairs', label: 'Pending Repairs', severity: 'amber', deptSlug: 'biomedical', fieldPatterns: ['pending repair'], type: 'boolean-text', issueKeywords: ['pending', 'waiting', 'repair', 'parts ordered'], clearKeywords: ['nil', 'none', 'no', 'na', 'nill', 'no pending', 'all done'] },
];
