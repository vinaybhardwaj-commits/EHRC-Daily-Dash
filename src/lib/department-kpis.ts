/**
 * Signature KPI configuration for each of the 17 departments.
 *
 * `fieldPatterns` are partial key matches (case-insensitive) used by `findField()`
 * to locate the value in the department's submitted `fields` object.
 * Patterns are checked in order; first match wins.
 */

export interface DepartmentKPI {
  slug: string;
  label: string;
  unit?: string;
  type: 'number' | 'text-status' | 'ratio';
  fieldPatterns: string[];
  secondaryFieldPatterns?: string[];
  invertTrend?: boolean;
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
    // Actual DB: "# of ER cases" or "# of genuine walk-in/ambulance emergencies"
    fieldPatterns: ['er cases', 'walk-in', 'genuine walk-in', '# of genuine'],
  },
  {
    slug: 'customer-care',
    label: 'Pending Complaints',
    unit: 'open',
    type: 'number',
    fieldPatterns: ['pending resolution', 'complaints currently pending', 'pending complaint'],
    invertTrend: true,
  },
  {
    slug: 'patient-safety',
    label: 'Adverse Events',
    unit: 'events',
    type: 'number',
    fieldPatterns: ['adverse event', '# of adverse'],
    invertTrend: true,
  },
  {
    slug: 'finance',
    label: 'Revenue MTD',
    unit: '\u20b9',
    type: 'number',
    // Actual DB: "Total revenue MTD (Rs.)"
    fieldPatterns: ['total revenue mtd', 'revenue mtd'],
  },
  {
    slug: 'billing',
    label: 'Pipeline Cases',
    unit: 'pending',
    type: 'number',
    // Actual DB: "# of Pipeline cases (active, pending billing)"
    fieldPatterns: ['pipeline', 'pipeline cases'],
    invertTrend: true,
  },
  {
    slug: 'supply-chain',
    label: 'GRN Prepared',
    unit: 'today',
    type: 'number',
    // Actual DB: "# of GRN prepared" or "No of GRN prepared"
    fieldPatterns: ['grn prepared', 'grn'],
  },
  {
    slug: 'facility',
    label: 'Readiness',
    type: 'text-status',
    // Actual DB: "Facility readiness ÃÂ¢ÃÂÃÂ power / water / gases"
    fieldPatterns: ['facility readiness', 'readiness', 'power'],
    statusKeywords: {
      good: ['all ok', 'ok', 'ready', 'normal', 'all systems', 'no issue', 'functional', 'running', 'all running', 'available'],
      warning: ['partial', 'one', 'minor', 'backup', 'intermittent'],
      bad: ['down', 'failure', 'critical', 'not ready', 'outage', 'issue', 'breakdown'],
    },
  },
  {
    slug: 'pharmacy',
    label: 'Pharmacy Rev MTD',
    unit: '\u20b9',
    type: 'number',
    // Actual DB: "Pharmacy revenue MTD (Rs.)"
    fieldPatterns: ['pharmacy revenue mtd', 'revenue mtd'],
  },
  {
    slug: 'training',
    label: 'Training MTD',
    type: 'text-status',
    // Actual DB: "MTD trainings completed vs planned"
    fieldPatterns: ['mtd training', 'completed vs planned', 'training conducted'],
    statusKeywords: {
      good: ['on track', 'ahead', 'completed', 'all done', '100%', 'done'],
      warning: ['behind', 'partial', 'in progress', 'pending'],
      bad: ['not started', 'nil', 'none', 'cancelled', '0'],
    },
  },
  {
    slug: 'clinical-lab',
    label: 'Critical Reports',
    unit: 'issued',
    type: 'number',
    // Actual DB: "# of Critical reports issued"
    fieldPatterns: ['critical report', 'critical reports issued'],
  },
  {
    slug: 'radiology',
    label: 'Imaging Cases',
    unit: 'total',
    type: 'number',
    // Sum of: "# of X-Ray cases", "# of USG cases", "# of CT cases"
    fieldPatterns: ['x-ray', 'usg', 'ct cases'],
  },
  {
    slug: 'ot',
    label: 'OT Cases',
    unit: 'done',
    type: 'number',
    // Actual DB: "# of OT cases done (yesterday)"
    fieldPatterns: ['ot cases done', 'ot cases'],
  },
  {
    slug: 'hr-manpower',
    label: 'Staffing Status',
    type: 'text-status',
    // Actual DB: "Replacement status"
    fieldPatterns: ['replacement status', 'replacement'],
    statusKeywords: {
      good: ['filled', 'on track', 'adequate', 'no gap', 'nil', 'none', 'no resignations', 'na', 'n/a'],
      warning: ['in process', 'pending', 'interview', 'partial', 'searching'],
      bad: ['critical', 'unfilled', 'delayed', 'shortage', 'multiple exits', 'urgent'],
    },
  },
  {
    slug: 'diet',
    label: 'BCA MTD',
    unit: 'done',
    type: 'number',
    // Actual DB: "BCA MTD total"
    fieldPatterns: ['bca mtd'],
  },
  {
    slug: 'biomedical',
    label: 'Equipment Status',
    type: 'text-status',
    // Actual DB: "Equipment readiness ÃÂ¢ÃÂÃÂ OT, ICU, etc."
    fieldPatterns: ['equipment readiness', 'equipment'],
    statusKeywords: {
      good: ['all ok', 'functional', 'ready', 'operational', 'no issue', 'running', 'all equipment', 'working fine'],
      warning: ['partial', 'one', 'minor', 'under repair', 'maintenance'],
      bad: ['down', 'breakdown', 'critical', 'not working', 'failure', 'multiple'],
    },
  },
  {
    slug: 'nursing',
    label: 'Nurses on Duty',
    unit: 'staff',
    type: 'number',
    // Actual DB: "Staffing matrix" (just a number like "7")
    fieldPatterns: ['staffing matrix', 'nurses on duty'],
  },
  {
    slug: 'it',
    label: 'Pending Tickets',
    unit: 'open',
    type: 'number',
    // Actual DB: "# of Pending IT tickets"
    fieldPatterns: ['pending it', 'pending it tickets'],
    invertTrend: true,
  },
  // 2-new-depts launch (5 May 2026)
  {
    slug: 'quality-accreditation',
    label: 'Open NCs',
    unit: 'open',
    type: 'number',
    // Form label: "Open non-compliances — running total"
    fieldPatterns: ['open non-compliance', 'open non-compliances', 'non-compliances running total'],
    invertTrend: true,
  },
  {
    slug: 'infection-control',
    label: 'Active HAI',
    unit: 'cases',
    type: 'number',
    // Form label: "Active HAI cases — total census"
    fieldPatterns: ['active hai', 'hai cases', 'hai census'],
    invertTrend: true,
  },
];

export const DEPARTMENT_KPI_MAP = new Map(
  DEPARTMENT_KPIS.map(kpi => [kpi.slug, kpi])
);

/**
 * Secondary KPI definitions - up to 2 extra metrics per department
 * shown alongside the primary KPI in the redesigned Department Progress cards.
 */
export interface SecondaryKPI {
  label: string;
  unit?: string;
  type: 'number' | 'text-status';
  fieldPatterns: string[];
  /**
   * If set, the KPI value is the sum of multiple form fields (each found via its own
   * pattern group). Used for derived totals (e.g., total oxygen cylinders consumed today
   * = left manifold + right manifold). Takes precedence over `fieldPatterns` for value
   * extraction; `fieldPatterns` is still required (used as fallback + SourceBadge label).
   */
  sumOfPatterns?: string[][];
  invertTrend?: boolean;
  statusKeywords?: { good: string[]; warning: string[]; bad: string[] };
}

export const DEPARTMENT_SECONDARY_KPIS: Record<string, SecondaryKPI[]> = {
  'emergency': [
    { label: 'Deaths', unit: 'cases', type: 'number', fieldPatterns: ['death', '# of Deaths'], invertTrend: true },
    { label: 'LAMA/DAMA', unit: 'cases', type: 'number', fieldPatterns: ['lama', 'dama', '# of LAMA'], invertTrend: true },
  ],
  'customer-care': [
    { label: 'Delay Impact', unit: 'patients', type: 'number', fieldPatterns: ['affected by doctor delays', 'patients affected'] },
    { label: 'Escalations', unit: 'cases', type: 'number', fieldPatterns: ['escalation'] },
  ],
  'patient-safety': [
    { label: 'Sentinel Events', unit: 'events', type: 'number', fieldPatterns: ['sentinel', '# of Sentinel'], invertTrend: true },
    { label: 'Med Errors', unit: 'errors', type: 'number', fieldPatterns: ['medication error', '# of Medication'], invertTrend: true },
  ],
  'finance': [
    { label: 'ARPOB', unit: '\u20b9', type: 'number', fieldPatterns: ['arpob', 'ARPOB'] },
    { label: 'IP Census', unit: 'patients', type: 'number', fieldPatterns: ['midnight census', 'mid night census', 'census \u2014 total IP'] },
  ],
  'billing': [
    { label: 'DAMA/LAMA', unit: 'cases', type: 'number', fieldPatterns: ['dama', 'lama', '# of DAMA'], invertTrend: true },
  ],
  'supply-chain': [
    { label: 'Shortages', type: 'text-status', fieldPatterns: ['shortage', 'stockout', 'shortages'], statusKeywords: { good: ['nil', 'none', 'no', 'adequate', 'no stock'], warning: ['low', 'partial'], bad: ['shortage', 'stockout', 'critical', 'out of stock', 'unavailable', 'backorder'] } },
  ],
  'facility': [
    { label: 'O\u2082 today', unit: 'cyl', type: 'number', fieldPatterns: ['oxygen cylinders changed', 'cylinders changed today'], sumOfPatterns: [['left manifold', 'cylinders changed'], ['right manifold', 'cylinders changed']], invertTrend: true },
    { label: 'Backup O\u2082', unit: 'cyl', type: 'number', fieldPatterns: ['backup oxygen', 'backup oxygen cylinders'] },
  ],
  'pharmacy': [
    { label: 'Stockouts', type: 'text-status', fieldPatterns: ['stockout', 'shortage'], statusKeywords: { good: ['nil', 'none', 'no', 'na'], warning: ['low', 'partial'], bad: ['out', 'stock', 'shortage', 'unavailable', 'yes'] } },
  ],
  'training': [],
  // 2-new-depts launch (5 May 2026)
  'quality-accreditation': [
    { label: 'Audits today', unit: 'done', type: 'number', fieldPatterns: ['quality audits', 'rounds completed'] },
    { label: 'Adverse events', unit: 'events', type: 'number', fieldPatterns: ['adverse event'], invertTrend: true },
  ],
  'infection-control': [
    { label: 'New HAI today', unit: 'cases', type: 'number', fieldPatterns: ['new hai cases', 'new hai'], invertTrend: true },
    { label: 'In isolation', unit: 'pts', type: 'number', fieldPatterns: ['patients in isolation', 'isolation total'] },
  ],
  'clinical-lab': [
    { label: 'Sample Errors', type: 'text-status', fieldPatterns: ['recollection', 'reporting error'], statusKeywords: { good: ['nil', 'none', 'no', 'na', 'nill'], warning: ['minor'], bad: ['error', 'recollection', 'rejected', 'contaminated'] } },
  ],
  'radiology': [
    { label: 'Equipment', type: 'text-status', fieldPatterns: ['equipment status', 'ct / mri', 'uptime'], statusKeywords: { good: ['ok', 'up', 'running', 'operational', 'functional', 'normal'], warning: ['maintenance', 'scheduled'], bad: ['down', 'repair', 'not working', 'issue'] } },
  ],
  'ot': [
    { label: '1st Case Delay', unit: 'min', type: 'number', fieldPatterns: ['first case delay', 'time in minutes'], invertTrend: true },
  ],
  'hr-manpower': [
    { label: 'Resignations', type: 'text-status', fieldPatterns: ['resignation', 'exit'], statusKeywords: { good: ['nil', 'none', 'no', 'na', 'nill', 'n/a', 'no resignations'], warning: ['in process', 'pending'], bad: ['resign', 'exit', 'left', 'quit', 'multiple'] } },
  ],
  'diet': [],
  'biomedical': [
    { label: 'Breakdowns', type: 'text-status', fieldPatterns: ['breakdown'], statusKeywords: { good: ['nil', 'none', 'no', 'na', 'nill', 'no breakdown'], warning: ['minor', 'under repair'], bad: ['down', 'breakdown', 'failure', 'critical', 'not working', 'multiple'] } },
  ],
  'nursing': [
    { label: 'HAI/IPC', type: 'text-status', fieldPatterns: ['hai', 'ipc', 'clabsi', 'vap', 'cauti'], statusKeywords: { good: ['nil', 'none', 'no', 'na', 'nill', 'zero', '0'], warning: ['suspected', 'monitoring'], bad: ['positive', 'case', 'infection', 'yes'] } },
  ],
  'it': [
    { label: 'HIS Uptime', type: 'text-status', fieldPatterns: ['his uptime', 'downtime'], statusKeywords: { good: ['up', 'ok', 'running', 'operational', 'normal', 'nil', 'none'], warning: ['intermittent', 'slow'], bad: ['down', 'outage', 'issue'] } },
  ],
};


/**
 * Global issue definitions ÃÂ¢ÃÂÃÂ things that get surfaced in the hospital-wide
 * issues panel. Each issue pulls from a specific department + field.
 */
export interface GlobalIssue {
  id: string;
  label: string;
  severity: 'red' | 'amber';
  deptSlug: string;
  fieldPatterns: string[];
  type: 'count' | 'boolean-text';
  threshold?: number;
  issueKeywords?: string[];
  clearKeywords?: string[];
}

export const GLOBAL_ISSUES: GlobalIssue[] = [
  // Red flags
  { id: 'deaths', label: 'Deaths', severity: 'red', deptSlug: 'emergency', fieldPatterns: ['death', '# of Deaths'], type: 'count', threshold: 0 },
  { id: 'sentinel', label: 'Sentinel Events', severity: 'red', deptSlug: 'patient-safety', fieldPatterns: ['sentinel', '# of Sentinel'], type: 'count', threshold: 0 },
  { id: 'adverse', label: 'Adverse Events', severity: 'red', deptSlug: 'patient-safety', fieldPatterns: ['adverse', '# of Adverse'], type: 'count', threshold: 0 },
  { id: 'falls', label: 'Patient Falls', severity: 'red', deptSlug: 'patient-safety', fieldPatterns: ['fall', '# of Patient falls'], type: 'count', threshold: 0 },
  { id: 'med-errors', label: 'Medication Errors', severity: 'red', deptSlug: 'patient-safety', fieldPatterns: ['medication error', '# of Medication'], type: 'count', threshold: 0 },
  { id: 'equipment-down', label: 'Equipment Breakdown', severity: 'red', deptSlug: 'biomedical', fieldPatterns: ['breakdown', 'pending repair'], type: 'boolean-text', issueKeywords: ['down', 'breakdown', 'failure', 'pending', 'repair', 'issue', 'flooring', 'maintenance'], clearKeywords: ['nil', 'none', 'no', 'na', 'nill', 'no breakdown', 'no pending'] },
  { id: 'stockout', label: 'Critical Stockouts', severity: 'red', deptSlug: 'supply-chain', fieldPatterns: ['shortage', 'stockout', 'shortages'], type: 'boolean-text', issueKeywords: ['shortage', 'stockout', 'critical', 'out of stock', 'unavailable', 'backorder'], clearKeywords: ['nil', 'none', 'no', 'na', 'nill', 'adequate', 'no stock', 'available'] },
  { id: 'dama-lama', label: 'DAMA/LAMA', severity: 'red', deptSlug: 'billing', fieldPatterns: ['dama', 'lama', '# of DAMA'], type: 'count', threshold: 0 },

  // Amber warnings
  { id: 'pending-complaints', label: 'Pending Patient Complaints', severity: 'amber', deptSlug: 'customer-care', fieldPatterns: ['pending resolution', 'complaints currently pending'], type: 'count', threshold: 0 },
  { id: 'overdue-rca', label: 'Overdue RCAs', severity: 'amber', deptSlug: 'patient-safety', fieldPatterns: ['past their due', 'overdue', 'open RCAs past'], type: 'count', threshold: 0 },
  { id: 'open-nabh', label: 'Open NABH Issues', severity: 'amber', deptSlug: 'patient-safety', fieldPatterns: ['total open nabh', 'open NABH non-compliances'], type: 'count', threshold: 0 },
  { id: 'lwbs', label: 'Patients LWBS', severity: 'amber', deptSlug: 'emergency', fieldPatterns: ['lwbs', '# of patients LWBS'], type: 'count', threshold: 0 },
  { id: 'doctor-delays', label: 'Doctor Delay Impact', severity: 'amber', deptSlug: 'customer-care', fieldPatterns: ['affected by doctor delays', 'patients affected'], type: 'count', threshold: 0 },
  { id: 'pending-tickets', label: 'Pending IT Tickets', severity: 'amber', deptSlug: 'it', fieldPatterns: ['pending it', 'pending it tickets'], type: 'count', threshold: 3 },
  { id: 'pending-repairs', label: 'Pending Equipment Repairs', severity: 'amber', deptSlug: 'biomedical', fieldPatterns: ['pending repair'], type: 'boolean-text', issueKeywords: ['pending', 'waiting', 'repair', 'parts ordered', 'flooring', 'work'], clearKeywords: ['nil', 'none', 'no', 'na', 'nill', 'no pending', 'all done'] },
];

/**
 * Per-department alert definitions ÃÂ¢ÃÂÃÂ what to check when building the
 * expandable detail view for each department card.
 */
export interface DeptAlertDef {
  slug: string;
  checks: {
    label: string;
    fieldPatterns: string[];
    type: 'count-above' | 'text-issue' | 'missing-submission';
    threshold?: number;
    issueKeywords?: string[];
    clearKeywords?: string[];
  }[];
}

export const DEPT_ALERT_DEFS: DeptAlertDef[] = [
  {
    slug: 'emergency',
    checks: [
      { label: 'Deaths', fieldPatterns: ['death'], type: 'count-above', threshold: 0 },
      { label: 'LAMA', fieldPatterns: ['lama'], type: 'count-above', threshold: 0 },
      { label: 'MLC cases', fieldPatterns: ['mlc'], type: 'count-above', threshold: 0 },
      { label: 'Critical alerts', fieldPatterns: ['critical alert', 'code blue', 'code red'], type: 'count-above', threshold: 0 },
      { label: 'Patients LWBS', fieldPatterns: ['lwbs'], type: 'count-above', threshold: 0 },
    ],
  },
  {
    slug: 'customer-care',
    checks: [
      { label: 'Pending Patient Complaints', fieldPatterns: ['pending resolution', 'complaints currently pending'], type: 'count-above', threshold: 0 },
      { label: 'Customer Care Escalations', fieldPatterns: ['escalation'], type: 'count-above', threshold: 0 },
      { label: 'Patients Affected by Doctor Delays', fieldPatterns: ['affected by doctor'], type: 'count-above', threshold: 0 },
      { label: 'Patient No-Shows (OPD)', fieldPatterns: ['no-show'], type: 'count-above', threshold: 5 },
    ],
  },
  {
    slug: 'patient-safety',
    checks: [
      { label: 'Sentinel events', fieldPatterns: ['sentinel'], type: 'count-above', threshold: 0 },
      { label: 'Adverse events', fieldPatterns: ['adverse'], type: 'count-above', threshold: 0 },
      { label: 'Patient falls', fieldPatterns: ['fall'], type: 'count-above', threshold: 0 },
      { label: 'Medication errors', fieldPatterns: ['medication error'], type: 'count-above', threshold: 0 },
      { label: 'Overdue RCAs', fieldPatterns: ['past their due', 'overdue'], type: 'count-above', threshold: 0 },
      { label: 'Open NABH issues', fieldPatterns: ['total open nabh'], type: 'count-above', threshold: 0 },
    ],
  },
  {
    slug: 'finance',
    checks: [
      { label: 'Revenue leakage', fieldPatterns: ['revenue leakage'], type: 'text-issue', issueKeywords: ['leak', 'loss', 'issue', 'alert'], clearKeywords: ['nil', 'none', 'no', 'na', ''] },
    ],
  },
  {
    slug: 'billing',
    checks: [
      { label: 'DAMA/LAMA', fieldPatterns: ['dama', 'lama'], type: 'count-above', threshold: 0 },
      { label: 'OT cases pending billing', fieldPatterns: ['billing clearance pending', 'ot cases with billing'], type: 'count-above', threshold: 0 },
    ],
  },
  {
    slug: 'supply-chain',
    checks: [
      { label: 'Drug/Supply Shortages', fieldPatterns: ['shortage', 'backorder'], type: 'text-issue', issueKeywords: ['shortage', 'backorder', 'out of stock', 'unavailable'], clearKeywords: ['nil', 'none', 'no', 'na', 'nill'] },
      { label: 'Emergency procurement', fieldPatterns: ['emergency', 'after 5pm'], type: 'count-above', threshold: 0 },
    ],
  },
  {
    slug: 'facility',
    checks: [
      { label: 'Safety issues', fieldPatterns: ['safety issue'], type: 'text-issue', issueKeywords: ['issue', 'hazard', 'risk', 'leak', 'broken'], clearKeywords: ['nil', 'none', 'no', 'na', 'nill', ''] },
    ],
  },
  {
    slug: 'pharmacy',
    checks: [
      { label: 'Stockouts', fieldPatterns: ['stockout', 'shortage'], type: 'text-issue', issueKeywords: ['out', 'stock', 'shortage', 'unavailable', 'yes'], clearKeywords: ['nil', 'none', 'no', 'na', 'nill'] },
    ],
  },
  {
    slug: 'clinical-lab',
    checks: [
      { label: 'Sample errors', fieldPatterns: ['recollection', 'reporting error'], type: 'text-issue', issueKeywords: ['error', 'recollection', 'rejected', 'contaminated'], clearKeywords: ['nil', 'none', 'no', 'na', 'nill'] },
      { label: 'Reagent shortages', fieldPatterns: ['reagent shortage'], type: 'text-issue', issueKeywords: ['shortage', 'out', 'low'], clearKeywords: ['nil', 'none', 'no', 'na', 'nill'] },
    ],
  },
  {
    slug: 'radiology',
    checks: [
      { label: 'Equipment down', fieldPatterns: ['equipment status', 'ct / mri', 'uptime'], type: 'text-issue', issueKeywords: ['down', 'maintenance', 'repair', 'not working', 'issue'], clearKeywords: ['ok', 'up', 'running', 'operational', 'functional', 'normal'] },
    ],
  },
  {
    slug: 'ot',
    checks: [
      { label: 'First case delay', fieldPatterns: ['first case delay', 'time in minutes'], type: 'count-above', threshold: 15 },
      { label: 'Surgeon escalations', fieldPatterns: ['escalation'], type: 'count-above', threshold: 0 },
    ],
  },
  {
    slug: 'hr-manpower',
    checks: [
      { label: 'Resignations/exits', fieldPatterns: ['resignation', 'exit'], type: 'text-issue', issueKeywords: ['resign', 'exit', 'left', 'quit'], clearKeywords: ['nil', 'none', 'no', 'na', 'nill', 'n/a'] },
    ],
  },
  {
    slug: 'diet',
    checks: [
      { label: 'Diet Service Delays/Incidents', fieldPatterns: ['delay', 'incident'], type: 'text-issue', issueKeywords: ['delay', 'incident', 'complaint', 'late'], clearKeywords: ['nil', 'none', 'no', 'na', 'nill', ''] },
    ],
  },
  {
    slug: 'biomedical',
    checks: [
      { label: 'Equipment Breakdowns', fieldPatterns: ['breakdown'], type: 'text-issue', issueKeywords: ['down', 'breakdown', 'failure', 'repair', 'issue'], clearKeywords: ['nil', 'none', 'no', 'na', 'nill'] },
      { label: 'Pending Equipment Repairs', fieldPatterns: ['pending repair'], type: 'text-issue', issueKeywords: ['pending', 'waiting', 'repair', 'parts', 'flooring', 'work'], clearKeywords: ['nil', 'none', 'no', 'na', 'nill'] },
    ],
  },
  {
    slug: 'nursing',
    checks: [
      { label: 'Nursing Escalations', fieldPatterns: ['escalation', 'concern'], type: 'text-issue', issueKeywords: ['escalation', 'complaint', 'issue', 'concern', 'short', 'shortage'], clearKeywords: ['nil', 'none', 'no', 'na', 'nill'] },
      { label: 'HAI/IPC issues', fieldPatterns: ['hai', 'ipc', 'clabsi', 'vap', 'cauti'], type: 'text-issue', issueKeywords: ['positive', 'case', 'infection', 'suspected', 'yes'], clearKeywords: ['nil', 'none', 'no', 'na', 'nill', 'zero', '0'] },
    ],
  },
  {
    slug: 'it',
    checks: [
      { label: 'HIS downtime', fieldPatterns: ['his uptime', 'downtime'], type: 'text-issue', issueKeywords: ['down', 'outage', 'intermittent', 'slow', 'issue'], clearKeywords: ['up', 'ok', 'running', 'operational', 'normal', 'nil', 'none'] },
    ],
  },
  {
    slug: 'training',
    checks: [],
  },
];
