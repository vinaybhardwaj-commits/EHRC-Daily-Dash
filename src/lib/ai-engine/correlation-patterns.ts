/* ──────────────────────────────────────────────────────────────────
   Cross-Department Correlation Patterns
   Detects system-wide issues from multiple department anomalies
   ────────────────────────────────────────────────────────────────── */

import type { RuleSeverity } from './types';

export interface CorrelationSignal {
  department: string;
  rule_ids: string[];   // Any of these rule IDs firing counts as a match
  label: string;        // Human-readable signal description
}

export interface CorrelationPattern {
  id: string;
  name: string;
  description: string;
  severity: RuleSeverity;
  category: 'staffing' | 'equipment' | 'revenue' | 'safety' | 'operations';
  /** At least `min_signals` of these departments must have triggered anomalies */
  signals: CorrelationSignal[];
  min_signals: number;
  insight_template: string;   // Template with {matched_depts} and {signal_details}
  recommendation: string;
}

/* ── Pattern Definitions ─────────────────────────────────────────── */

export const CORRELATION_PATTERNS: CorrelationPattern[] = [

  // ─── STAFFING CASCADE ───
  {
    id: 'corr-staffing-crisis',
    name: 'Hospital-Wide Staffing Crisis',
    description: 'Multiple departments reporting staffing gaps, delays, or understaffing simultaneously',
    severity: 'critical',
    category: 'staffing',
    signals: [
      { department: 'nursing', rule_ids: ['nurs-understaffed'], label: 'Nursing understaffed' },
      { department: 'ot', rule_ids: ['ot-first-case-severe-delay', 'ot-team-left-early'], label: 'OT delays or team gaps' },
      { department: 'emergency', rule_ids: ['er-lwbs-high', 'er-high-tat'], label: 'ED overcrowded or slow' },
      { department: 'hr-manpower', rule_ids: ['hr-exits-no-replacement', 'hr-high-exits'], label: 'HR exits without replacement' },
      { department: 'customer-care', rule_ids: ['cc-lwbs-high'], label: 'Patients leaving without being seen' },
    ],
    min_signals: 3,
    insight_template: 'Staffing crisis detected across {matched_count} departments: {signal_details}. This pattern suggests a systemic staffing shortfall affecting patient flow and care delivery.',
    recommendation: 'Convene an emergency staffing huddle. Check agency nurse availability. Consider diverting non-critical cases. Review HR pipeline for immediate replacements.',
  },

  // ─── EQUIPMENT / INFRASTRUCTURE FAILURE ───
  {
    id: 'corr-equipment-cascade',
    name: 'Equipment & Infrastructure Failure',
    description: 'Multiple departments reporting equipment issues, breakdowns, or facility problems',
    severity: 'critical',
    category: 'equipment',
    signals: [
      { department: 'biomedical', rule_ids: ['bme-readiness-issue', 'bme-breakdown-active'], label: 'Biomedical equipment down' },
      { department: 'radiology', rule_ids: ['rad-equipment-down'], label: 'Imaging equipment down' },
      { department: 'clinical-lab', rule_ids: ['lab-equipment-down'], label: 'Lab equipment down' },
      { department: 'facility', rule_ids: ['fms-readiness-issue'], label: 'Facility readiness issue' },
      { department: 'it', rule_ids: ['it-his-downtime'], label: 'HIS system down' },
      { department: 'ot', rule_ids: ['ot-surgeon-escalations'], label: 'OT surgeon escalation (possible equipment)' },
    ],
    min_signals: 2,
    insight_template: 'Equipment/infrastructure failure across {matched_count} departments: {signal_details}. Multiple systems down simultaneously suggests power, maintenance, or vendor issues.',
    recommendation: 'Check for common infrastructure cause (power fluctuation, UPS failure, water supply). Escalate to facility head and biomedical lead. Activate manual backup protocols for affected departments.',
  },

  // ─── REVENUE IMPACT CHAIN ───
  {
    id: 'corr-revenue-impact',
    name: 'Revenue Impact Chain',
    description: 'Revenue drops, billing backlogs, and operational slowdowns cascading across departments',
    severity: 'high',
    category: 'revenue',
    signals: [
      { department: 'finance', rule_ids: ['fin-revenue-crash', 'fin-arpob-drop'], label: 'Revenue or ARPOB drop' },
      { department: 'billing', rule_ids: ['bill-ot-clearance-backlog', 'bill-pipeline-spike'], label: 'Billing backlog' },
      { department: 'pharmacy', rule_ids: ['pharm-revenue-ip-drop'], label: 'Pharmacy IP revenue drop' },
      { department: 'ot', rule_ids: ['ot-low-case-volume'], label: 'Low OT case volume' },
      { department: 'emergency', rule_ids: ['er-revenue-drop'], label: 'ED revenue drop' },
      { department: 'radiology', rule_ids: ['rad-ct-volume-drop'], label: 'CT volume drop' },
    ],
    min_signals: 3,
    insight_template: 'Revenue pressure detected across {matched_count} departments: {signal_details}. This combination indicates a broader census or billing flow issue, not isolated department problems.',
    recommendation: 'Review midnight census trend for the week. Check if billing bottleneck is causing discharge delays. Investigate if low admissions or referral drops are driving the revenue dip. Schedule finance + billing + ops huddle.',
  },

  // ─── PATIENT SAFETY CLUSTER ───
  {
    id: 'corr-safety-cluster',
    name: 'Patient Safety Cluster',
    description: 'Multiple safety signals across departments indicating elevated risk',
    severity: 'critical',
    category: 'safety',
    signals: [
      { department: 'patient-safety', rule_ids: ['ps-sentinel-no-rca', 'ps-bundle-non-compliance', 'ps-under-reporting-flag'], label: 'Patient safety flag' },
      { department: 'nursing', rule_ids: ['nurs-hai-ipc-incident', 'nurs-biomedical-waste-incident'], label: 'Nursing HAI/IPC or BMW incident' },
      { department: 'emergency', rule_ids: ['er-deaths-no-details'], label: 'ED deaths without documentation' },
      { department: 'ot', rule_ids: ['ot-team-left-early'], label: 'OT team left prematurely' },
      { department: 'clinical-lab', rule_ids: ['lab-recollection-errors'], label: 'Lab sample errors' },
    ],
    min_signals: 2,
    insight_template: 'Patient safety cluster detected across {matched_count} departments: {signal_details}. Multiple safety signals on the same day require immediate senior leadership attention.',
    recommendation: 'Activate patient safety huddle with QI head, nursing head, and medical director. Review all incident reports for the day. Check if there is a common contributing factor (staffing, equipment, process).',
  },

  // ─── SUPPLY CHAIN DISRUPTION ───
  {
    id: 'corr-supply-disruption',
    name: 'Supply Chain Disruption',
    description: 'Stock issues cascading from procurement to clinical departments',
    severity: 'high',
    category: 'operations',
    signals: [
      { department: 'supply-chain', rule_ids: ['sc-critical-stock-issue', 'sc-emergency-procurement-spike'], label: 'Supply chain critical stock or emergency procurement' },
      { department: 'pharmacy', rule_ids: ['pharm-stockout'], label: 'Pharmacy stockout' },
      { department: 'clinical-lab', rule_ids: ['lab-reagent-shortage'], label: 'Lab reagent shortage' },
      { department: 'radiology', rule_ids: ['rad-film-contrast-stock-issue'], label: 'Radiology film/contrast shortage' },
    ],
    min_signals: 2,
    insight_template: 'Supply chain disruption across {matched_count} departments: {signal_details}. Multiple stock issues suggest a procurement bottleneck, vendor failure, or budget hold.',
    recommendation: 'Check with supply chain head for vendor delivery status. Verify if there is a PO or budget freeze. Prioritize critical clinical consumables (reagents, blood products, contrast media) for emergency procurement.',
  },

  // ─── ADMISSION-DISCHARGE BOTTLENECK ───
  {
    id: 'corr-admission-bottleneck',
    name: 'Admission-Discharge Bottleneck',
    description: 'Census, billing, and department indicators suggesting patient flow is blocked',
    severity: 'high',
    category: 'operations',
    signals: [
      { department: 'finance', rule_ids: ['fin-census-revenue-mismatch'], label: 'Census-revenue mismatch' },
      { department: 'billing', rule_ids: ['bill-ot-clearance-backlog', 'bill-dama-lama'], label: 'Billing clearance backlog or DAMA/LAMA' },
      { department: 'emergency', rule_ids: ['er-lama-dama-spike', 'er-lwbs-high'], label: 'ED LAMA/DAMA or LWBS' },
      { department: 'nursing', rule_ids: ['nurs-understaffed'], label: 'Nursing understaffed (blocking discharges)' },
      { department: 'customer-care', rule_ids: ['cc-complaint-backlog-growing'], label: 'Growing patient complaints' },
    ],
    min_signals: 3,
    insight_template: 'Patient flow bottleneck detected across {matched_count} departments: {signal_details}. Patients may be stuck at admission, discharge, or billing stages, causing cascade delays.',
    recommendation: 'Review discharge list with bed management. Check if billing clearance is the bottleneck. Verify if LAMA/DAMA cases are related to long wait times or financial counselling delays.',
  },

  // ─── IT + OPERATIONS PARALYSIS ───
  {
    id: 'corr-it-operations-paralysis',
    name: 'IT-Driven Operations Paralysis',
    description: 'HIS/IT issues causing cascading failures across clinical and billing departments',
    severity: 'critical',
    category: 'equipment',
    signals: [
      { department: 'it', rule_ids: ['it-his-downtime', 'it-integration-issues'], label: 'HIS downtime or integration failure' },
      { department: 'billing', rule_ids: ['bill-ot-clearance-backlog'], label: 'Billing backlog (HIS dependent)' },
      { department: 'clinical-lab', rule_ids: ['lab-tat-issue'], label: 'Lab TAT issues (possible HIS impact)' },
      { department: 'pharmacy', rule_ids: ['pharm-stockout'], label: 'Pharmacy issues' },
      { department: 'radiology', rule_ids: ['rad-pending-reports-backlog'], label: 'Radiology report backlog' },
    ],
    min_signals: 2,
    insight_template: 'IT-driven paralysis detected across {matched_count} departments: {signal_details}. HIS or integration failures are likely blocking clinical workflows, billing, and reporting.',
    recommendation: 'Confirm HIS restoration ETA with IT head. Activate manual workarounds (paper forms, offline billing). Prioritize lab and pharmacy system restoration for patient safety.',
  },
];
