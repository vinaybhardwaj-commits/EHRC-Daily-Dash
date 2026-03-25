import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

/**
 * Department Overview API — returns all historical data for a single department.
 * GET /api/department-overview?slug=finance&from=2025-01&to=2026-03
 * If no from/to, returns all data from the beginning of time.
 */

function firstPipeSegment(value: string | number | undefined | null): string | number | undefined | null {
  if (value === undefined || value === null) return value;
  if (typeof value === 'number') return value;
  const s = String(value);
  const pipeIdx = s.indexOf('|');
  return pipeIdx >= 0 ? s.substring(0, pipeIdx).trim() : s;
}

function extractNumber(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return value;
  const raw = firstPipeSegment(value);
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (!s || /^(nil|none|na|nill|no|0)$/i.test(s)) return null;

  // Handle "X Lakhs" / "X Lakh" / "X L" patterns (multiply by 100,000)
  const lakhMatch = s.match(/([\d,]+\.?\d*)\s*(?:lakhs?|lacs?)\b/i);
  if (lakhMatch) {
    const num = parseFloat(lakhMatch[1].replace(/,/g, ''));
    if (!isNaN(num)) return num * 100000;
  }

  // Handle "X Cr" / "X Crore" patterns (multiply by 10,000,000)
  const crMatch = s.match(/([\d,]+\.?\d*)\s*(?:cr(?:ore)?s?)\b/i);
  if (crMatch) {
    const num = parseFloat(crMatch[1].replace(/,/g, ''));
    if (!isNaN(num)) return num * 10000000;
  }

  // Handle "X K" patterns (multiply by 1,000)
  const kMatch = s.match(/([\d,]+\.?\d*)\s*K\b/i);
  if (kMatch) {
    const num = parseFloat(kMatch[1].replace(/,/g, ''));
    if (!isNaN(num)) return num * 1000;
  }

  // Standard number extraction (handles Indian comma formatting)
  // Find ALL number-like tokens, then pick the best one (largest formatted number)
  const matches = s.match(/[\d,]+\.?\d*/g);
  if (!matches) return null;
  let bestFormatted: number | null = null;
  let bestFormattedVal = 0;
  let firstPlain: number | null = null;
  for (const m of matches) {
    const cleaned = m.replace(/,/g, '');
    const num = parseFloat(cleaned);
    if (isNaN(num)) continue;
    if (m.includes(',')) {
      // For Indian formatting, pick the LARGEST comma-formatted number
      if (bestFormatted === null || num > bestFormattedVal) {
        bestFormatted = num;
        bestFormattedVal = num;
      }
    } else if (m.includes('.') && cleaned.length > 5) {
      // Long decimal numbers like 751294.22
      if (bestFormatted === null || num > bestFormattedVal) {
        bestFormatted = num;
        bestFormattedVal = num;
      }
    } else {
      if (firstPlain === null) firstPlain = num;
    }
  }
  return bestFormatted !== null ? bestFormatted : firstPlain;
}

function extractNumberInRange(value: string | number | undefined | null, min: number, max: number): number | null {
  const num = extractNumber(value);
  if (num === null) return null;
  if (num < min || num > max) return null;
  return num;
}

function findField(fields: Record<string, string | number>, ...patterns: string[]): string | number | null {
  for (const pattern of patterns) {
    const lower = pattern.toLowerCase();
    for (const [key, val] of Object.entries(fields)) {
      if (key.toLowerCase().includes(lower)) return val;
    }
  }
  return null;
}

// ── Finance field extractors ────────────────────────────────────────

interface FinanceDayData {
  date: string;
  revenue: number | null;
  revenueMTD: number | null;
  arpob: number | null;
  ipCensus: number | null;
  surgeriesMTD: number | null;
  opdRevenueMTD: number | null;
  revenueLeakage: string | null;
}

// ── Billing field extractors ─────────────────────────────────────────

interface BillingDayData {
  date: string;
  pipelineCases: number | null;
  otClearancePending: number | null;
  damaLama: number | null;
  financialCounselling: number | null;
  interimCounselling: number | null;
  otScheduleAdherence: number | null;
  conversionRate: number | null;
}

function extractFinanceDay(date: string, fields: Record<string, string | number>): FinanceDayData {
  // All 3 eras of field names:
  // Era 1 (Sep-Oct 2025): Daily revenue, Total Revenue till date, ARPOB, Surgeries done MTD, OPD Revenue
  // Era 2 (Nov 2025-Feb 2026): Revnue For The Day, Total Revenue till date, ARPOB, Mid Night Census, Surgeries done MTD
  // Era 3 (Mar 2026+): Revenue for the day (Rs.), Total revenue MTD (Rs.), ARPOB — Avg Revenue..., Midnight census..., Surgeries MTD
  const revenueRaw = findField(fields, 'revenue for the day', 'revnue for the day', 'daily revenue');
  const revenueMTDRaw = findField(fields, 'total revenue', 'revenue till date');
  const arpobRaw = findField(fields, 'arpob');
  const censusRaw = findField(fields, 'midnight census', 'mid night census', 'census');
  const surgeriesRaw = findField(fields, 'surgeries');
  const opdRaw = findField(fields, 'opd revenue');
  const leakageRaw = findField(fields, 'revenue leakage', 'leakage alert');

  // For surgeries, extract count from text like "24 Sugeries Has Been Completed" or "87 Surgeries In November"
  let surgeriesMTD = extractNumber(surgeriesRaw);
  // Validate surgeries range
  if (surgeriesMTD !== null && (surgeriesMTD < 0 || surgeriesMTD > 500)) surgeriesMTD = null;

  return {
    date,
    revenue: extractNumber(revenueRaw),
    revenueMTD: extractNumber(revenueMTDRaw),
    arpob: extractNumberInRange(arpobRaw, 10000, 1000000),
    ipCensus: extractNumberInRange(censusRaw, 0, 200),
    surgeriesMTD,
    opdRevenueMTD: extractNumber(opdRaw),
    revenueLeakage: leakageRaw ? String(leakageRaw).trim() : null,
  };
}

function extractBillingDay(date: string, fields: Record<string, string | number>): BillingDayData {
  // Handle all era variants of field names
  const pipelineRaw = findField(fields, 'pipeline cases', '# of pipeline cases');
  const otClearanceRaw = findField(fields, 'ot cases billing clearance', '# of ot cases with billing clearance pending');
  const damaLamaRaw = findField(fields, 'dama / lama', '# of dama / lama', 'dama/lama');
  const counsellingRaw = findField(fields, 'financial counseling sessions', '# of financial counselling sessions done today', '# of financial counseling sessions');
  const interimCounsellingRaw = findField(fields, '# of interim financial counselling done', '# of interim financial counseling done');
  const otScheduleRaw = findField(fields, 'ot schedule adherence');
  const conversionRaw = findField(fields, 'conversion rate');

  return {
    date,
    pipelineCases: extractNumberInRange(pipelineRaw, 0, 500),
    otClearancePending: extractNumberInRange(otClearanceRaw, 0, 500),
    damaLama: extractNumberInRange(damaLamaRaw, 0, 500),
    financialCounselling: extractNumberInRange(counsellingRaw, 0, 500),
    interimCounselling: extractNumberInRange(interimCounsellingRaw, 0, 500),
    otScheduleAdherence: extractNumberInRange(otScheduleRaw, 0, 100),
    conversionRate: extractNumberInRange(conversionRaw, 0, 100),
  };
}

// ── Biomedical field extractors ──────────────────────────────────────

// Equipment categories to detect in narrative text
const EQUIPMENT_CATEGORIES: { key: string; label: string; patterns: RegExp }[] = [
  { key: 'ct', label: 'CT Scanner', patterns: /\b(ct\b|ct machine|ct gantry|ct console|ct tech)/i },
  { key: 'eto', label: 'ETO / Sterilizer', patterns: /\b(eto|steriliz|autoclave)/i },
  { key: 'ecg', label: 'ECG', patterns: /\b(ecg|electrocard)/i },
  { key: 'ot_equip', label: 'OT Equipment', patterns: /\b(ot table|ot light|laparosc|trocar|sagittal|stryker|drill|cautery)/i },
  { key: 'monitors', label: 'Patient Monitors', patterns: /\b(monitor|vital|spo2|patient warmer|warmer)/i },
  { key: 'ventilator', label: 'Ventilators', patterns: /\b(ventilat|bipap|cpap|oxygen)/i },
  { key: 'imaging', label: 'Imaging (X-ray/USG)', patterns: /\b(xray|x-ray|usg|ultrasound|echo|echo machine|radiology|agfa|printer|sony printer)/i },
  { key: 'cssd', label: 'CSSD Equipment', patterns: /\b(cssd|sealing machine|packing)/i },
  { key: 'other', label: 'Other', patterns: /\b(tmt|bp apparatus|suction|dvt pump|medicine cart|uroflow|cot|bed|alpha bed|defibrillat)/i },
];

function classifyText(text: string): { hasIssue: boolean; isResolved: boolean; equipmentCategories: string[] } {
  const tl = text.toLowerCase().trim();
  const noIssuePatterns = /^(no\s+(breakdown|pending|issue|repair|call|equipment)|nil|none|na|no$|all equip|ready to use|functioning|daily rounds|updated|documents up|schedule up|have been scheduled|pm done)/i;

  if (noIssuePatterns.test(tl) || tl === '' || tl === '0') {
    return { hasIssue: false, isResolved: false, equipmentCategories: [] };
  }

  const isResolved = /\b(resolved|rectified|fixed|sorted|replaced|returned|working properly|issue resolved|no issues found)\b/i.test(tl);
  const categories: string[] = [];
  for (const cat of EQUIPMENT_CATEGORIES) {
    if (cat.patterns.test(tl)) categories.push(cat.key);
  }

  return { hasIssue: true, isResolved, equipmentCategories: categories.length > 0 ? categories : ['other'] };
}

interface BiomedicalDayData {
  date: string;
  hasBreakdown: boolean;
  breakdownResolved: boolean;
  breakdownCategories: string[];
  breakdownText: string | null;
  hasPendingRepair: boolean;
  pendingText: string | null;
  equipmentReady: boolean;
  equipmentText: string | null;
  pmCompliant: boolean;
  pmText: string | null;
  otherNotes: string | null;
}

function extractBiomedicalDay(date: string, fields: Record<string, string | number>): BiomedicalDayData {
  const breakdownRaw = findField(fields, 'breakdown');
  const pendingRaw = findField(fields, 'pending repair', 'pending');
  const equipReadyRaw = findField(fields, 'equipment readiness', 'equipment ready');
  const pmRaw = findField(fields, 'preventive maintenance', 'maintenance compliance');
  const otherRaw = findField(fields, 'other', 'notes');

  const breakdownText = breakdownRaw ? String(breakdownRaw).trim() : null;
  const pendingText = pendingRaw ? String(pendingRaw).trim() : null;
  const equipText = equipReadyRaw ? String(equipReadyRaw).trim() : null;
  const pmText = pmRaw ? String(pmRaw).trim() : null;
  const otherText = otherRaw ? String(otherRaw).trim() : null;

  const breakdownClass = breakdownText ? classifyText(breakdownText) : { hasIssue: false, isResolved: false, equipmentCategories: [] };
  const pendingClass = pendingText ? classifyText(pendingText) : { hasIssue: false, isResolved: false, equipmentCategories: [] };
  const equipClass = equipText ? classifyText(equipText) : { hasIssue: false, isResolved: false, equipmentCategories: [] };
  const pmClass = pmText ? classifyText(pmText) : { hasIssue: false, isResolved: false, equipmentCategories: [] };

  return {
    date,
    hasBreakdown: breakdownClass.hasIssue,
    breakdownResolved: breakdownClass.isResolved,
    breakdownCategories: breakdownClass.equipmentCategories,
    breakdownText,
    hasPendingRepair: pendingClass.hasIssue,
    pendingText,
    equipmentReady: !equipClass.hasIssue,
    equipmentText: equipText,
    pmCompliant: pmText !== null && pmText !== '',
    pmText,
    otherNotes: otherText && otherText.toLowerCase() !== 'nil' && otherText.toLowerCase() !== 'none' ? otherText : null,
  };
}

interface BiomedicalMonthSummary {
  month: string;
  label: string;
  daysReported: number;
  breakdownDays: number;
  breakdownResolvedDays: number;
  pendingRepairDays: number;
  equipmentReadyDays: number;
  pmReportedDays: number;
  equipmentReadinessRate: number;
  breakdownRate: number;
  resolutionRate: number;
  pmComplianceRate: number;
  topEquipmentIssues: { category: string; count: number }[];
}

function aggregateBiomedicalMonth(month: string, days: BiomedicalDayData[]): BiomedicalMonthSummary {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m] = month.split('-');
  const label = `${monthNames[parseInt(m) - 1]} ${y}`;

  const breakdownDays = days.filter(d => d.hasBreakdown).length;
  const breakdownResolvedDays = days.filter(d => d.hasBreakdown && d.breakdownResolved).length;
  const pendingRepairDays = days.filter(d => d.hasPendingRepair).length;
  const equipmentReadyDays = days.filter(d => d.equipmentReady).length;
  const pmReportedDays = days.filter(d => d.pmCompliant).length;

  // Count equipment categories across all breakdown days
  const catCounts = new Map<string, number>();
  for (const d of days) {
    for (const cat of d.breakdownCategories) {
      catCounts.set(cat, (catCounts.get(cat) || 0) + 1);
    }
  }
  const topEquipmentIssues = [...catCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  return {
    month,
    label,
    daysReported: days.length,
    breakdownDays,
    breakdownResolvedDays,
    pendingRepairDays,
    equipmentReadyDays,
    pmReportedDays,
    equipmentReadinessRate: days.length > 0 ? (equipmentReadyDays / days.length) * 100 : 0,
    breakdownRate: days.length > 0 ? (breakdownDays / days.length) * 100 : 0,
    resolutionRate: breakdownDays > 0 ? (breakdownResolvedDays / breakdownDays) * 100 : 100,
    pmComplianceRate: days.length > 0 ? (pmReportedDays / days.length) * 100 : 0,
    topEquipmentIssues,
  };
}

// ── Diet & Nutrition field extractors ────────────────────────────────

interface DietDayData {
  date: string;
  census: number | null;
  teleConsults: number | null;
  opConsults: number | null;
  totalConsults: number | null;
  bcaDone: number | null;
  bcaMTD: number | null;
  dischargesWithDiet: number | null;
  hasFoodIssue: boolean;
  foodFeedbackText: string | null;
  hasKitchenIssue: boolean;
  kitchenText: string | null;
  hasDelay: boolean;
  delayText: string | null;
  clinicalAuditText: string | null;
  hasClinicalAudit: boolean;
}

function extractDietConsultation(raw: string | number | null): { tele: number | null; op: number | null } {
  if (raw === null || raw === undefined) return { tele: null, op: null };
  if (typeof raw === 'number') return { tele: raw, op: null };
  const s = String(raw).trim();
  if (!s || /^(nil|none|na|no|0)$/i.test(s) || /on leave/i.test(s)) return { tele: null, op: null };

  let tele: number | null = null;
  let op: number | null = null;

  const teleM = s.match(/(\d+)\s*tele/i);
  if (teleM) tele = parseInt(teleM[1], 10);

  const opM = s.match(/(\d+)\s*(?:op|in[\s-]*person|physical|bca)/i);
  if (opM) op = parseInt(opM[1], 10);

  // If just a number with no qualifier
  if (tele === null && op === null) {
    const num = s.match(/(\d+)/);
    if (num) tele = parseInt(num[1], 10);
  }

  return { tele, op };
}

function extractDietDay(date: string, fields: Record<string, string | number>): DietDayData {
  const censusRaw = findField(fields, 'census', 'sensus');
  const consultRaw = findField(fields, 'revenue', 'consultation');
  const bcaDoneRaw = findField(fields, 'bca done', 'bca today');
  const bcaMTDRaw = findField(fields, 'bca till', 'bca mtd');
  const dcRaw = findField(fields, 'discharg', 'dischage');
  const foodRaw = findField(fields, 'food feedback', 'food summary');
  const kitchenRaw = findField(fields, 'kitchen');
  const delayRaw = findField(fields, 'delay', 'incident');
  const auditRaw = findField(fields, 'audit');

  // Census: extract first number from text like "11 Diet" or "5 Diet"
  let census: number | null = null;
  if (censusRaw) {
    const s = String(censusRaw).trim();
    if (s && !/^(nil|none|na|no|0)$/i.test(s)) {
      // Sum all numbers for multi-part entries like "1 SD 2 LD 2 NPO" or "Saturday 10 Diet Sunday 5"
      const nums = s.match(/(\d+)/g);
      if (nums) {
        // Take the first significant number (usually the diet count)
        census = nums.reduce((sum, n) => sum + parseInt(n, 10), 0);
        // But if it's clearly a date reference like "Saturday 10 Diet Sunday 5", sum both
        if (nums.length === 1) census = parseInt(nums[0], 10);
        else {
          // Multi-number: sum all
          census = nums.reduce((sum, n) => sum + parseInt(n, 10), 0);
        }
      }
    }
  }

  const consult = extractDietConsultation(consultRaw);

  let bcaDone: number | null = null;
  if (bcaDoneRaw) {
    const s = String(bcaDoneRaw).trim();
    if (s && !/^(nil|none|na|no)$/i.test(s)) {
      const m = s.match(/(\d+)/);
      if (m) bcaDone = parseInt(m[1], 10);
    }
  }

  let bcaMTD: number | null = null;
  if (bcaMTDRaw) {
    const s = String(bcaMTDRaw).trim();
    if (s && !/^(nil|none|na|no)$/i.test(s)) {
      const m = s.match(/(\d+)/);
      if (m) bcaMTD = parseInt(m[1], 10);
    }
  }

  let dischargesWithDiet: number | null = null;
  if (dcRaw) {
    const s = String(dcRaw).trim();
    if (s && !/^(nil|none|na|no|0)$/i.test(s)) {
      const m = s.match(/(\d+)/);
      if (m) dischargesWithDiet = parseInt(m[1], 10);
    }
  }

  const foodStr = foodRaw ? String(foodRaw).trim() : null;
  const hasFoodIssue = foodStr !== null && !isNilText(foodStr) &&
    !/no negative|no issue|good|satisf|positive|not collected|na/i.test(foodStr);

  const kitchenStr = kitchenRaw ? String(kitchenRaw).trim() : null;
  const hasKitchenIssue = kitchenStr !== null && !isNilText(kitchenStr);

  const delayStr = delayRaw ? String(delayRaw).trim() : null;
  const hasDelay = delayStr !== null && !isNilText(delayStr);

  const auditStr = auditRaw ? String(auditRaw).trim() : null;
  const hasClinicalAudit = auditStr !== null && !isNilText(auditStr);

  return {
    date,
    census,
    teleConsults: consult.tele,
    opConsults: consult.op,
    totalConsults: (consult.tele || 0) + (consult.op || 0) > 0
      ? (consult.tele || 0) + (consult.op || 0) : null,
    bcaDone,
    bcaMTD,
    dischargesWithDiet,
    hasFoodIssue,
    foodFeedbackText: hasFoodIssue ? foodStr : null,
    hasKitchenIssue,
    kitchenText: hasKitchenIssue ? kitchenStr : null,
    hasDelay,
    delayText: hasDelay ? delayStr : null,
    clinicalAuditText: hasClinicalAudit ? auditStr : null,
    hasClinicalAudit,
  };
}

interface DietMonthSummary {
  month: string;
  daysReported: number;
  avgCensus: number;
  totalCensus: number;
  totalTeleConsults: number;
  totalOPConsults: number;
  totalConsults: number;
  avgConsultsPerDay: number;
  telePercentage: number;
  bcaDoneSum: number;
  bcaMTDLatest: number | null;
  dischargesWithDietSum: number;
  dischargeDietRate: number;
  foodIssueDays: number;
  kitchenIssueDays: number;
  delayDays: number;
  clinicalAuditDays: number;
  incidentFreeDays: number;
  incidentFreeRate: number;
}

function aggregateDietMonth(month: string, days: DietDayData[]): DietMonthSummary {
  const n = days.length;
  const censusDays = days.filter(d => d.census !== null);
  const totalCensus = censusDays.reduce((s, d) => s + (d.census || 0), 0);
  const avgCensus = censusDays.length > 0 ? totalCensus / censusDays.length : 0;

  const totalTele = days.reduce((s, d) => s + (d.teleConsults || 0), 0);
  const totalOP = days.reduce((s, d) => s + (d.opConsults || 0), 0);
  const totalConsults = totalTele + totalOP;
  const consultDays = days.filter(d => d.totalConsults !== null);
  const avgConsultsPerDay = consultDays.length > 0 ? totalConsults / consultDays.length : 0;
  const telePercentage = totalConsults > 0 ? (totalTele / totalConsults) * 100 : 0;

  const bcaDoneSum = days.reduce((s, d) => s + (d.bcaDone || 0), 0);
  // Get the latest non-null BCA MTD value
  let bcaMTDLatest: number | null = null;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].bcaMTD !== null) { bcaMTDLatest = days[i].bcaMTD; break; }
  }

  const dcDays = days.filter(d => d.dischargesWithDiet !== null);
  const dischargesWithDietSum = dcDays.reduce((s, d) => s + (d.dischargesWithDiet || 0), 0);
  const dischargeDietRate = n > 0 ? (dcDays.length / n) * 100 : 0;

  const foodIssueDays = days.filter(d => d.hasFoodIssue).length;
  const kitchenIssueDays = days.filter(d => d.hasKitchenIssue).length;
  const delayDays = days.filter(d => d.hasDelay).length;
  const clinicalAuditDays = days.filter(d => d.hasClinicalAudit).length;

  const incidentFreeDays = days.filter(d => !d.hasFoodIssue && !d.hasKitchenIssue && !d.hasDelay).length;
  const incidentFreeRate = n > 0 ? (incidentFreeDays / n) * 100 : 0;

  return {
    month,
    daysReported: n,
    avgCensus,
    totalCensus,
    totalTeleConsults: totalTele,
    totalOPConsults: totalOP,
    totalConsults,
    avgConsultsPerDay,
    telePercentage,
    bcaDoneSum,
    bcaMTDLatest,
    dischargesWithDietSum,
    dischargeDietRate,
    foodIssueDays,
    kitchenIssueDays,
    delayDays,
    clinicalAuditDays,
    incidentFreeDays,
    incidentFreeRate,
  };
}

// ── Customer Care field extractors ───────────────────────────────────

interface CustomerCareDayData {
  date: string;
  opdTotal: number | null;
  opdInPerson: number | null;
  opdTele: number | null;
  googleReviews: number | null;
  customerFeedback: number | null;
  videoTestimonials: number | null;
  healthChecks: number | null;
  hasComplaint: boolean;
  complaintText: string | null;
  hasEscalation: boolean;
  escalationText: string | null;
  hasVIP: boolean;
  doctorsOnLeave: string[];
  doctorsLate: string[];
  patientWaitIncidents: number;
  patientWaitText: string | null;
  dischargeTATHours: number | null;
  dischargeTATText: string | null;
  callCentreIssue: boolean;
  newDoctorScheduling: string | null;
}

function extractOPDBreakdown(raw: string | number | null): { total: number | null; inPerson: number | null; tele: number | null } {
  if (raw === null || raw === undefined) return { total: null, inPerson: null, tele: null };
  if (typeof raw === 'number') return { total: raw, inPerson: raw, tele: 0 };
  const s = String(raw).trim();
  if (!s || /^(nil|none|na|error|0)$/i.test(s)) return { total: null, inPerson: null, tele: null };

  let inPerson: number | null = null;
  let tele: number | null = null;
  let total: number | null = null;

  // Pattern: "24 (17 tele & 7physical)" or "42 (10physical - 32tele)"
  const parenMatch = s.match(/(\d+)\s*\(([^)]+)\)/);
  if (parenMatch) {
    total = parseInt(parenMatch[1], 10);
    const inner = parenMatch[2];
    const teleMatch = inner.match(/(\d+)\s*tele/i);
    const physMatch = inner.match(/(\d+)\s*(?:physical|direct|walk\s*in|in[\s-]*person)/i);
    if (teleMatch) tele = parseInt(teleMatch[1], 10);
    if (physMatch) inPerson = parseInt(physMatch[1], 10);
    if (tele !== null && inPerson === null && total !== null) inPerson = total - tele;
    if (inPerson !== null && tele === null && total !== null) tele = total - inPerson;
    return { total, inPerson, tele };
  }

  // Pattern: "22 in-person & 37 tele" or "14 IN-PERSON & 30 TELE" or "22 inperson & 37 tele"
  const splitMatch = s.match(/(\d+)\s*(?:in[\s-]*person|physical|direct)\s*[&,]\s*(\d+)\s*tele/i);
  if (splitMatch) {
    inPerson = parseInt(splitMatch[1], 10);
    tele = parseInt(splitMatch[2], 10);
    total = inPerson + tele;
    return { total, inPerson, tele };
  }

  // Pattern: "22 tele & 7 physical"
  const revSplitMatch = s.match(/(\d+)\s*tele\s*[&,]\s*(\d+)\s*(?:in[\s-]*person|physical|direct)/i);
  if (revSplitMatch) {
    tele = parseInt(revSplitMatch[1], 10);
    inPerson = parseInt(revSplitMatch[2], 10);
    total = inPerson + tele;
    return { total, inPerson, tele };
  }

  // Pattern: "31 Appointments ( 07 Direct 24 Tele Consultation)"
  const apptMatch = s.match(/(\d+)\s*(?:appointment|consultation|appt)/i);
  if (apptMatch) {
    total = parseInt(apptMatch[1], 10);
    const teleM = s.match(/(\d+)\s*tele/i);
    const directM = s.match(/(\d+)\s*(?:direct|physical|walk)/i);
    if (teleM) tele = parseInt(teleM[1], 10);
    if (directM) inPerson = parseInt(directM[1], 10);
    if (tele !== null && inPerson === null && total !== null) inPerson = total - tele;
    if (inPerson !== null && tele === null && total !== null) tele = total - inPerson;
    return { total, inPerson, tele };
  }

  // Fallback: just extract first number
  const numMatch = s.match(/(\d+)/);
  if (numMatch) {
    total = parseInt(numMatch[1], 10);
    return { total, inPerson: null, tele: null };
  }

  return { total: null, inPerson: null, tele: null };
}

function extractCollectionCount(raw: string | number | null): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (!s || /^(nil|none|na|no|0)$/i.test(s)) return 0;
  // "5 collected" or "3 Collected" or just "5"
  const m = s.match(/(\d+)\s*(?:collected|fb collected)?/i);
  if (m) return parseInt(m[1], 10);
  // "Collected" without number — treat as 1 if no number but not nil
  if (/collect/i.test(s)) return 1;
  return 0;
}

function extractDoctorNames(raw: string | number | null): string[] {
  if (raw === null || raw === undefined) return [];
  const s = String(raw).trim();
  if (!s || /^(nil|none|na|no|0)$/i.test(s)) return [];
  // Extract "Dr. Something" patterns
  const names = s.match(/Dr\.?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/gi) || [];
  return [...new Set(names.map(n => n.trim()))];
}

function extractWaitIncidents(raw: string | number | null): { count: number; text: string | null } {
  if (raw === null || raw === undefined) return { count: 0, text: null };
  const s = String(raw).trim();
  if (!s || /^(nil|none|na|no|0)$/i.test(s)) return { count: 0, text: null };
  // Count "X patient(s)" mentions
  const patientMatch = s.match(/(\d+)\s*patient/gi);
  let count = 0;
  if (patientMatch) {
    for (const pm of patientMatch) {
      const n = pm.match(/(\d+)/);
      if (n) count += parseInt(n[1], 10);
    }
  }
  if (count === 0) count = 1; // If text exists but no count, at least 1 incident
  return { count, text: s };
}

function extractDischargeTAT(raw: string | number | null): { hours: number | null; text: string | null } {
  if (raw === null || raw === undefined) return { hours: null, text: null };
  const s = String(raw).trim();
  if (!s || /^(nil|none|na|no|0)$/i.test(s)) return { hours: null, text: null };
  if (/no discharg|no delay|not applicable/i.test(s)) return { hours: null, text: s };
  // "03 to 04 Hours" → take max, "05 Hours" → 5, "07 Hours" → 7
  const nums = s.match(/(\d+)\s*(?:hour|hr|hrs)/gi);
  if (nums) {
    const values = nums.map(n => parseInt(n.match(/(\d+)/)![1], 10));
    return { hours: Math.max(...values), text: s };
  }
  const plain = s.match(/(\d+)/);
  if (plain) return { hours: parseInt(plain[1], 10), text: s };
  return { hours: null, text: s };
}

function extractCustomerCareDay(date: string, fields: Record<string, string | number>): CustomerCareDayData {
  const opdRaw = findField(fields, 'opd appointment');
  const reviewRaw = findField(fields, 'google review');
  const feedbackRaw = findField(fields, 'customer feedback');
  const videoRaw = findField(fields, 'video testimonial');
  const healthRaw = findField(fields, 'health check');
  const complaintRaw = findField(fields, 'complaint');
  const escalationRaw = findField(fields, 'escalation');
  const vipRaw = findField(fields, 'vip', 'international');
  const leaveRaw = findField(fields, 'leave');
  const lateRaw = findField(fields, 'late');
  const waitRaw = findField(fields, 'waiting', 'wait');
  const tatRaw = findField(fields, 'tat', 'discharge');
  const callRaw = findField(fields, 'call centre', 'front office');
  const schedRaw = findField(fields, 'scheduling', 'new doctor');

  const opd = extractOPDBreakdown(opdRaw);
  const googleReviews = extractCollectionCount(reviewRaw);
  const customerFeedback = extractCollectionCount(feedbackRaw);
  const videoTestimonials = extractCollectionCount(videoRaw);
  const healthChecks = extractCollectionCount(healthRaw);

  const complaintStr = complaintRaw ? String(complaintRaw).trim() : null;
  const hasComplaint = complaintStr !== null && !isNilText(complaintStr);

  const escalationStr = escalationRaw ? String(escalationRaw).trim() : null;
  const hasEscalation = escalationStr !== null && !isNilText(escalationStr);

  const vipStr = vipRaw ? String(vipRaw).trim() : null;
  const hasVIP = vipStr !== null && !isNilText(vipStr);

  const doctorsOnLeave = extractDoctorNames(leaveRaw);
  const doctorsLate = extractDoctorNames(lateRaw);

  const wait = extractWaitIncidents(waitRaw);
  const tat = extractDischargeTAT(tatRaw);

  const callStr = callRaw ? String(callRaw).trim() : null;
  const callCentreIssue = callStr !== null && !isNilText(callStr) && !/no issue/i.test(callStr);

  const schedStr = schedRaw ? String(schedRaw).trim() : null;

  return {
    date,
    opdTotal: opd.total,
    opdInPerson: opd.inPerson,
    opdTele: opd.tele,
    googleReviews,
    customerFeedback,
    videoTestimonials,
    healthChecks,
    hasComplaint,
    complaintText: hasComplaint ? complaintStr : null,
    hasEscalation,
    escalationText: hasEscalation ? escalationStr : null,
    hasVIP,
    doctorsOnLeave,
    doctorsLate,
    patientWaitIncidents: wait.count,
    patientWaitText: wait.text,
    dischargeTATHours: tat.hours,
    dischargeTATText: tat.text,
    callCentreIssue,
    newDoctorScheduling: isNilText(schedStr) ? null : schedStr,
  };
}

interface CustomerCareMonthSummary {
  month: string;
  daysReported: number;
  opdTotalSum: number;
  opdInPersonSum: number;
  opdTeleSum: number;
  opdAvgPerDay: number;
  telePercentage: number;
  googleReviewsSum: number;
  customerFeedbackSum: number;
  videoTestimonialsSum: number;
  healthChecksSum: number;
  complaintDays: number;
  escalationDays: number;
  vipDays: number;
  doctorLateDays: number;
  patientWaitDays: number;
  patientWaitIncidentsSum: number;
  avgDischargeTAT: number | null;
  callCentreIssueDays: number;
  feedbackCollectionRate: number;
  doctorLateFrequency: Record<string, number>;
  doctorLeaveFrequency: Record<string, number>;
}

function aggregateCustomerCareMonth(month: string, days: CustomerCareDayData[]): CustomerCareMonthSummary {
  const n = days.length;
  const opdDays = days.filter(d => d.opdTotal !== null);
  const opdTotalSum = opdDays.reduce((s, d) => s + (d.opdTotal || 0), 0);
  const opdInPersonSum = opdDays.reduce((s, d) => s + (d.opdInPerson || 0), 0);
  const opdTeleSum = opdDays.reduce((s, d) => s + (d.opdTele || 0), 0);
  const opdAvgPerDay = opdDays.length > 0 ? opdTotalSum / opdDays.length : 0;
  const telePercentage = opdTotalSum > 0 ? (opdTeleSum / opdTotalSum) * 100 : 0;

  const googleReviewsSum = days.reduce((s, d) => s + (d.googleReviews || 0), 0);
  const customerFeedbackSum = days.reduce((s, d) => s + (d.customerFeedback || 0), 0);
  const videoTestimonialsSum = days.reduce((s, d) => s + (d.videoTestimonials || 0), 0);
  const healthChecksSum = days.reduce((s, d) => s + (d.healthChecks || 0), 0);

  const complaintDays = days.filter(d => d.hasComplaint).length;
  const escalationDays = days.filter(d => d.hasEscalation).length;
  const vipDays = days.filter(d => d.hasVIP).length;
  const doctorLateDays = days.filter(d => d.doctorsLate.length > 0).length;
  const patientWaitDays = days.filter(d => d.patientWaitIncidents > 0).length;
  const patientWaitIncidentsSum = days.reduce((s, d) => s + d.patientWaitIncidents, 0);

  const tatDays = days.filter(d => d.dischargeTATHours !== null);
  const avgDischargeTAT = tatDays.length > 0
    ? tatDays.reduce((s, d) => s + d.dischargeTATHours!, 0) / tatDays.length
    : null;

  const callCentreIssueDays = days.filter(d => d.callCentreIssue).length;

  // Feedback collection rate: days with feedback > 0 / days reported
  const feedbackDays = days.filter(d => (d.customerFeedback || 0) > 0).length;
  const feedbackCollectionRate = n > 0 ? (feedbackDays / n) * 100 : 0;

  // Aggregate doctor-level frequencies
  const doctorLateFrequency: Record<string, number> = {};
  const doctorLeaveFrequency: Record<string, number> = {};
  for (const d of days) {
    for (const dr of d.doctorsLate) {
      const name = dr.replace(/^Dr\.?\s*/i, 'Dr. ').trim();
      doctorLateFrequency[name] = (doctorLateFrequency[name] || 0) + 1;
    }
    for (const dr of d.doctorsOnLeave) {
      const name = dr.replace(/^Dr\.?\s*/i, 'Dr. ').trim();
      doctorLeaveFrequency[name] = (doctorLeaveFrequency[name] || 0) + 1;
    }
  }

  return {
    month,
    daysReported: n,
    opdTotalSum,
    opdInPersonSum,
    opdTeleSum,
    opdAvgPerDay,
    telePercentage,
    googleReviewsSum,
    customerFeedbackSum,
    videoTestimonialsSum,
    healthChecksSum,
    complaintDays,
    escalationDays,
    vipDays,
    doctorLateDays,
    patientWaitDays,
    patientWaitIncidentsSum,
    avgDischargeTAT,
    callCentreIssueDays,
    feedbackCollectionRate,
    doctorLateFrequency,
    doctorLeaveFrequency,
  };
}

// ── Clinical Lab field extractors ────────────────────────────────────

interface ClinicalLabDayData {
  date: string;
  outsourcedTestCount: number;
  outsourcedRaw: string | null;
  hasReagentShortage: boolean;
  reagentText: string | null;
  equipmentOk: boolean;
  tatOnTarget: boolean;
  hasSampleError: boolean;
  sampleErrorText: string | null;
  hasCriticalReport: boolean;
  criticalReportText: string | null;
  hasTransfusionActivity: boolean;
  transfusionText: string | null;
}

function countOutsourcedTests(raw: string | null): number {
  if (!raw) return 0;
  const s = raw.trim();
  if (/^(none|nil|na|no|0|not done)$/i.test(s) || s === '') return 0;
  // Recent entries are just numbers
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  // Parse delimited test lists: split on + , / and count entries, respecting (N) multipliers
  const parts = s.split(/[+,/]/);
  let count = 0;
  for (const p of parts) {
    const t = p.trim();
    if (!t || /^(none|nil|na)$/i.test(t)) continue;
    const mult = t.match(/\((\d+)\)/);
    count += mult ? parseInt(mult[1], 10) : 1;
  }
  return count;
}

function isNilText(text: string | null): boolean {
  if (!text) return true;
  const t = text.toLowerCase().trim();
  return t === '' || /^(none|nil|na|no|0|not done|not received\.?)$/i.test(t);
}

// ── Emergency field extractors ──────────────────────────────────────

interface EmergencyDayData {
  date: string;
  erCases: number | null;
  admissions: number;
  discharges: number;
  transfers: number;
  deaths: number | null;
  mlcCases: number | null;
  criticalAlerts: number | null;
  lamaCount: number;
  lamaText: string | null;
  incidentReports: number;
  incidentText: string | null;
  hasChallenges: boolean;
  challengeText: string | null;
  othersText: string | null;
  hasOthers: boolean;
}

function extractAdmissionsDischarges(raw: string | number | null): { admissions: number; discharges: number; transfers: number; lama: number } {
  if (raw === null || raw === undefined) return { admissions: 0, discharges: 0, transfers: 0, lama: 0 };
  if (typeof raw === 'number') return { admissions: raw, discharges: 0, transfers: 0, lama: 0 };
  const s = String(raw).trim();
  if (!s || /^(nil|none|na|no|0)$/i.test(s)) return { admissions: 0, discharges: 0, transfers: 0, lama: 0 };

  let admissions = 0, discharges = 0, transfers = 0, lama = 0;

  // Pattern: "2 admissions, 2 discharges" or "1 ICU admission" or "3 discharges, 1 admission"
  const admMatch = s.match(/(\d+)\s*(?:icu\s*)?admission/gi);
  if (admMatch) {
    for (const m of admMatch) {
      const n = m.match(/(\d+)/);
      if (n) admissions += parseInt(n[1], 10);
    }
  }

  const disMatch = s.match(/(\d+)\s*discharge/gi);
  if (disMatch) {
    for (const m of disMatch) {
      const n = m.match(/(\d+)/);
      if (n) discharges += parseInt(n[1], 10);
    }
  }

  const transMatch = s.match(/(\d+)\s*transfer/gi);
  if (transMatch) {
    for (const m of transMatch) {
      const n = m.match(/(\d+)/);
      if (n) transfers += parseInt(n[1], 10);
    }
  }

  const lamaMatch = s.match(/(\d+)\s*lama/gi);
  if (lamaMatch) {
    for (const m of lamaMatch) {
      const n = m.match(/(\d+)/);
      if (n) lama += parseInt(n[1], 10);
    }
  }

  // Historical format: "1,0" (admissions, discharges as CSV-like)
  if (admissions === 0 && discharges === 0 && /^\d+\s*,\s*\d+$/.test(s)) {
    const parts = s.split(',').map(p => parseInt(p.trim(), 10));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      admissions = parts[0];
      discharges = parts[1];
    }
  }

  // Narrative fallback: "Seen by OBG team and discharged" → 0 admissions, 1 discharge
  if (admissions === 0 && discharges === 0 && /discharg/i.test(s) && !/no/i.test(s.substring(0, 5))) {
    discharges = 1;
  }
  if (admissions === 0 && /transferred/i.test(s) && !/no/i.test(s.substring(0, 5))) {
    transfers = 1;
  }

  return { admissions, discharges, transfers, lama };
}

function extractEmergencyCount(raw: string | number | null): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (!s || /^(nil|none|na|n\/a|no|0|no cases)$/i.test(s)) return 0;
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function extractEmergencyDay(date: string, fields: Record<string, string | number>): EmergencyDayData {
  const erRaw = findField(fields, 'er cases', 'number of er', '# of er cases');
  const admRaw = findField(fields, 'admission', 'transfer');
  const deathsRaw = findField(fields, 'death');
  const mlcRaw = findField(fields, 'mlc');
  const alertsRaw = findField(fields, 'critical alert', 'code blue', 'code red');
  const lamaRaw = findField(fields, 'lama');
  const incidentRaw = findField(fields, 'incident report', 'er incident');
  const challengeRaw = findField(fields, 'challenge', 'anticipated');
  const othersRaw = findField(fields, 'other');

  const erCases = extractEmergencyCount(erRaw);
  const adm = extractAdmissionsDischarges(admRaw);
  const deaths = extractEmergencyCount(deathsRaw);
  const mlcCases = extractEmergencyCount(mlcRaw);
  const criticalAlerts = extractEmergencyCount(alertsRaw);

  let lamaCount = 0;
  let lamaText: string | null = null;
  if (lamaRaw) {
    const ls = String(lamaRaw).trim();
    if (!isNilText(ls)) {
      const lm = ls.match(/(\d+)/);
      lamaCount = lm ? parseInt(lm[1], 10) : 1;
      lamaText = ls;
    }
  }
  // Also count LAMA from admissions field
  lamaCount += adm.lama;

  let incidentReports = 0;
  let incidentText: string | null = null;
  if (incidentRaw) {
    const is = String(incidentRaw).trim();
    if (!isNilText(is)) {
      const im = is.match(/(\d+)/);
      incidentReports = im ? parseInt(im[1], 10) : 1;
      incidentText = is;
    }
  }

  const challengeStr = challengeRaw ? String(challengeRaw).trim() : null;
  const hasChallenges = challengeStr !== null && !isNilText(challengeStr);

  const othersStr = othersRaw ? String(othersRaw).trim() : null;
  const hasOthers = othersStr !== null && !isNilText(othersStr);

  return {
    date,
    erCases,
    admissions: adm.admissions,
    discharges: adm.discharges,
    transfers: adm.transfers,
    deaths,
    mlcCases,
    criticalAlerts,
    lamaCount,
    lamaText,
    incidentReports,
    incidentText,
    hasChallenges,
    challengeText: hasChallenges ? challengeStr : null,
    othersText: hasOthers ? othersStr : null,
    hasOthers,
  };
}

interface EmergencyMonthSummary {
  month: string;
  label: string;
  daysReported: number;
  totalERCases: number;
  avgERCasesPerDay: number;
  totalAdmissions: number;
  totalDischarges: number;
  totalTransfers: number;
  totalDeaths: number;
  totalMLC: number;
  totalCriticalAlerts: number;
  totalLAMA: number;
  totalIncidents: number;
  challengeDays: number;
  zeroERDays: number;
  deathDays: number;
  mlcDays: number;
  alertDays: number;
  incidentFreeDays: number;
  incidentFreeRate: number;
}

function aggregateEmergencyMonth(month: string, days: EmergencyDayData[]): EmergencyMonthSummary {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m] = month.split('-');
  const label = `${monthNames[parseInt(m) - 1]} ${y}`;
  const n = days.length;

  const erDays = days.filter(d => d.erCases !== null);
  const totalER = erDays.reduce((s, d) => s + (d.erCases || 0), 0);
  const avgER = erDays.length > 0 ? totalER / erDays.length : 0;
  const totalAdm = days.reduce((s, d) => s + d.admissions, 0);
  const totalDis = days.reduce((s, d) => s + d.discharges, 0);
  const totalTrans = days.reduce((s, d) => s + d.transfers, 0);
  const totalDeaths = days.reduce((s, d) => s + (d.deaths || 0), 0);
  const totalMLC = days.reduce((s, d) => s + (d.mlcCases || 0), 0);
  const totalAlerts = days.reduce((s, d) => s + (d.criticalAlerts || 0), 0);
  const totalLAMA = days.reduce((s, d) => s + d.lamaCount, 0);
  const totalIncidents = days.reduce((s, d) => s + d.incidentReports, 0);
  const challengeDays = days.filter(d => d.hasChallenges).length;
  const zeroERDays = days.filter(d => d.erCases === 0).length;
  const deathDays = days.filter(d => (d.deaths || 0) > 0).length;
  const mlcDays = days.filter(d => (d.mlcCases || 0) > 0).length;
  const alertDays = days.filter(d => (d.criticalAlerts || 0) > 0).length;

  // Incident-free = no deaths, no critical alerts, no incidents, no LAMA
  const incidentFreeDays = days.filter(d =>
    (d.deaths || 0) === 0 && (d.criticalAlerts || 0) === 0 &&
    d.incidentReports === 0 && d.lamaCount === 0
  ).length;
  const incidentFreeRate = n > 0 ? (incidentFreeDays / n) * 100 : 100;

  return {
    month, label, daysReported: n,
    totalERCases: totalER, avgERCasesPerDay: avgER,
    totalAdmissions: totalAdm, totalDischarges: totalDis, totalTransfers: totalTrans,
    totalDeaths, totalMLC, totalCriticalAlerts: totalAlerts, totalLAMA,
    totalIncidents, challengeDays, zeroERDays,
    deathDays, mlcDays, alertDays,
    incidentFreeDays, incidentFreeRate,
  };
}

// ── Pharmacy field extractors ────────────────────────────────────────

interface PharmacyDayData {
  date: string;
  ipRevenueToday: number | null;
  opRevenueToday: number | null;
  totalRevenueToday: number | null;
  revenueMTD: number | null;
  ipStockValue: number | null;
  opStockValue: number | null;
  totalStockValue: number | null;
  hasStockout: boolean;
  stockoutText: string | null;
  hasExpiry: boolean;
  expiryText: string | null;
}

function extractPharmacyRevenue(raw: string | number | null): { ip: number | null; op: number | null; total: number | null } {
  if (raw === null || raw === undefined) return { ip: null, op: null, total: null };
  if (typeof raw === 'number') return { ip: raw, op: null, total: raw };

  const s = String(raw).trim();
  if (!s || /^(nil|none|na|no|0)$/i.test(s)) return { ip: null, op: null, total: null };

  let ip: number | null = null;
  let op: number | null = null;
  let total: number | null = null;

  // Pattern: "IP ; Rs.118861  Op ;Rs.4874" or "Ip:Rs.247357     Op ;Rs.15270"
  const ipMatch = s.match(/(?:IP|Ip|ip)[:\s;]*Rs\.?\s*([0-9,]+)/i);
  if (ipMatch) ip = extractNumber(ipMatch[1]);

  const opMatch = s.match(/(?:OP|Op|op)[:\s;]*Rs\.?\s*([0-9,]+)/i);
  if (opMatch) op = extractNumber(opMatch[1]);

  // If both IP and OP found, sum them
  if (ip !== null && op !== null) {
    total = ip + op;
  } else {
    // Try to extract single value as total
    total = extractNumber(s);
    if (ip === null && op === null) {
      ip = null;
      op = null;
    }
  }

  return { ip, op, total };
}

function extractPharmacyDay(date: string, fields: Record<string, string | number>): PharmacyDayData {
  // Era 2+ field names (Google Forms):
  // "Pharmacy revenue — IP today (Rs.)", "Pharmacy revenue — OP today (Rs.)",
  // "Pharmacy revenue MTD (Rs.)", "Medicine stock value — IP (Rs.)", etc.
  // Historical (Era 1): "Pharmacy revenue of the day", "Pharmacy revenue month till date"

  const ipTodayRaw = findField(fields, 'pharmacy revenue', 'ip today') ||
                      findField(fields, 'pharmacy revenue of the day');
  const opTodayRaw = findField(fields, 'pharmacy revenue', 'op today');
  const revenueMTDRaw = findField(fields, 'pharmacy revenue mtd', 'revenue month till date', 'total revenue till date');

  const ipStockRaw = findField(fields, 'medicine stock value', 'ip', 'stock value ip');
  const opStockRaw = findField(fields, 'medicine stock value', 'op', 'stock value op');
  const totalStockRaw = findField(fields, 'medicine stock', 'stock status');

  const stockoutRaw = findField(fields, 'stockout', 'shortage');
  const expiryRaw = findField(fields, 'expiry', 'near expiry', 'expiry management');

  // Parse revenues
  let ipRevenueToday: number | null = null;
  let opRevenueToday: number | null = null;
  let totalRevenueToday: number | null = null;

  // If Era 2 with separate IP/OP fields
  if (ipTodayRaw && opTodayRaw) {
    ipRevenueToday = extractNumber(ipTodayRaw);
    opRevenueToday = extractNumber(opTodayRaw);
    if (ipRevenueToday !== null && opRevenueToday !== null) {
      totalRevenueToday = ipRevenueToday + opRevenueToday;
    }
  } else if (ipTodayRaw) {
    // Era 1: mixed format like "IP ; Rs.118861  Op ;Rs.4874"
    const parsed = extractPharmacyRevenue(ipTodayRaw);
    ipRevenueToday = parsed.ip;
    opRevenueToday = parsed.op;
    totalRevenueToday = parsed.total;
  }

  // Parse stock value
  let ipStockValue: number | null = null;
  let opStockValue: number | null = null;
  let totalStockValue: number | null = null;

  if (ipStockRaw && opStockRaw) {
    ipStockValue = extractNumber(ipStockRaw);
    opStockValue = extractNumber(opStockRaw);
    if (ipStockValue !== null && opStockValue !== null) {
      totalStockValue = ipStockValue + opStockValue;
    }
  } else if (totalStockRaw) {
    // Try to parse combined format like "IP: Rs.4799480   OP:Rs.866034  TOTAL: Rs.5665514"
    const parsed = extractPharmacyRevenue(totalStockRaw);
    ipStockValue = parsed.ip;
    opStockValue = parsed.op;
    totalStockValue = parsed.total;
  }

  // Parse stockout/shortage
  const stockoutStr = stockoutRaw ? String(stockoutRaw).trim() : null;
  const hasStockout = stockoutStr !== null && !isNilText(stockoutStr) &&
    !/^(no|none|nil|na|no stock out|no stock outs)$/i.test(stockoutStr);

  // Parse expiry
  const expiryStr = expiryRaw ? String(expiryRaw).trim() : null;
  const hasExpiry = expiryStr !== null && !isNilText(expiryStr) &&
    !/^(no|none|nil|na|no near expiry|no near expiry items)$/i.test(expiryStr);

  return {
    date,
    ipRevenueToday,
    opRevenueToday,
    totalRevenueToday,
    revenueMTD: extractNumber(revenueMTDRaw),
    ipStockValue,
    opStockValue,
    totalStockValue,
    hasStockout,
    stockoutText: hasStockout ? stockoutStr : null,
    hasExpiry,
    expiryText: hasExpiry ? expiryStr : null,
  };
}

interface PharmacyMonthSummary {
  month: string;
  label: string;
  daysReported: number;
  totalIPRevenue: number;
  totalOPRevenue: number;
  totalRevenue: number;
  avgRevenuePerDay: number;
  latestMTD: number | null;
  avgStockValue: number;
  stockoutDays: number;
  expiryAlertDays: number;
  stockoutFreeRate: number;
}

function aggregatePharmacyMonth(month: string, days: PharmacyDayData[]): PharmacyMonthSummary {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m] = month.split('-');
  const label = `${monthNames[parseInt(m) - 1]} ${y}`;

  const n = days.length;

  // Revenue aggregation
  const totalIPRevenue = days.reduce((s, d) => s + (d.ipRevenueToday || 0), 0);
  const totalOPRevenue = days.reduce((s, d) => s + (d.opRevenueToday || 0), 0);
  const totalRevenue = totalIPRevenue + totalOPRevenue;
  const avgRevenuePerDay = n > 0 ? totalRevenue / n : 0;

  // Latest MTD
  let latestMTD: number | null = null;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].revenueMTD !== null) {
      latestMTD = days[i].revenueMTD;
      break;
    }
  }

  // Stock value aggregation
  const stockValues = days.filter(d => d.totalStockValue !== null).map(d => d.totalStockValue || 0);
  const avgStockValue = stockValues.length > 0 ? stockValues.reduce((a, b) => a + b, 0) / stockValues.length : 0;

  // Issues tracking
  const stockoutDays = days.filter(d => d.hasStockout).length;
  const expiryAlertDays = days.filter(d => d.hasExpiry).length;
  const stockoutFreeRate = n > 0 ? ((n - stockoutDays) / n) * 100 : 100;

  return {
    month, label, daysReported: n,
    totalIPRevenue, totalOPRevenue, totalRevenue, avgRevenuePerDay,
    latestMTD, avgStockValue, stockoutDays, expiryAlertDays, stockoutFreeRate,
  };
}

// ── Nursing field extractors ─────────────────────────────────────────

interface NursingDayData {
  date: string;
  patientCensus: number | null;
  staffCount: number | null;
  staffToPatientRatio: number | null;
  hasInfectionControl: boolean;
  infectionText: string | null;
  hasEscalation: boolean;
  escalationText: string | null;
  hasBioWaste: boolean;
  bioWasteText: string | null;
  hasComplaint: boolean;
  complaintText: string | null;
  hasHAI: boolean;
  haiText: string | null;
  hasDialysis: boolean;
  dialysisText: string | null;
}

function extractNursingDay(date: string, fields: Record<string, string | number>): NursingDayData {
  // Era 1 & 2 field names:
  // "Patient census" → "7", "6"
  // "Staffing matrix" → "7", "10"
  // "infection control" → "nil", "Nil"
  // "Escalations/concerns" → "nil", "Nil"
  // "Biomedical waste incidents" → "nil" (newer data only)
  // "Patient complaints & satisfaction" → "nil" or complaint text
  // "Daily HAI/IPC dashboard (CLABSI, VAP, CAUTI, SSI)" → "nil", "Nil"
  // "dialysis" → "nil", "NIl"
  // "cafeteria" → "nil" (newer data only)
  // "cssd/ETO" → "Nil" (older data only)

  const censusRaw = findField(fields, 'patient census');
  const staffRaw = findField(fields, 'staffing matrix', 'staffing');
  const infectionRaw = findField(fields, 'infection control', 'ipc');
  const escalationRaw = findField(fields, 'escalations', 'concerns');
  const bioWasteRaw = findField(fields, 'biomedical waste', 'bio waste');
  const complaintRaw = findField(fields, 'patient complaints', 'satisfaction');
  const haiRaw = findField(fields, 'daily hai', 'hai/ipc', 'clabsi', 'vap');
  const dialysisRaw = findField(fields, 'dialysis');

  // Parse patient census
  const patientCensus = extractNumberInRange(censusRaw, 0, 300);

  // Parse staffing count
  const staffCount = extractNumberInRange(staffRaw, 0, 200);

  // Calculate staff-to-patient ratio
  let staffToPatientRatio: number | null = null;
  if (patientCensus !== null && patientCensus > 0 && staffCount !== null) {
    staffToPatientRatio = parseFloat((patientCensus / staffCount).toFixed(2));
  }

  // Parse infection control
  const infectionStr = infectionRaw ? String(infectionRaw).trim() : null;
  const hasInfectionControl = infectionStr !== null && !isNilText(infectionStr) &&
    !/^(no|none|nil|na)$/i.test(infectionStr);

  // Parse escalations
  const escalationStr = escalationRaw ? String(escalationRaw).trim() : null;
  const hasEscalation = escalationStr !== null && !isNilText(escalationStr) &&
    !/^(no|none|nil|na)$/i.test(escalationStr);

  // Parse biomedical waste
  const bioWasteStr = bioWasteRaw ? String(bioWasteRaw).trim() : null;
  const hasBioWaste = bioWasteStr !== null && !isNilText(bioWasteStr) &&
    !/^(no|none|nil|na)$/i.test(bioWasteStr);

  // Parse patient complaints
  const complaintStr = complaintRaw ? String(complaintRaw).trim() : null;
  const hasComplaint = complaintStr !== null && !isNilText(complaintStr) &&
    !/^(no|none|nil|na)$/i.test(complaintStr);

  // Parse HAI/IPC dashboard
  const haiStr = haiRaw ? String(haiRaw).trim() : null;
  const hasHAI = haiStr !== null && !isNilText(haiStr) &&
    !/^(no|none|nil|na)$/i.test(haiStr);

  // Parse dialysis
  const dialysisStr = dialysisRaw ? String(dialysisRaw).trim() : null;
  const hasDialysis = dialysisStr !== null && !isNilText(dialysisStr) &&
    !/^(no|none|nil|na)$/i.test(dialysisStr);

  return {
    date,
    patientCensus,
    staffCount,
    staffToPatientRatio,
    hasInfectionControl,
    infectionText: hasInfectionControl ? infectionStr : null,
    hasEscalation,
    escalationText: hasEscalation ? escalationStr : null,
    hasBioWaste,
    bioWasteText: hasBioWaste ? bioWasteStr : null,
    hasComplaint,
    complaintText: hasComplaint ? complaintStr : null,
    hasHAI,
    haiText: hasHAI ? haiStr : null,
    hasDialysis,
    dialysisText: hasDialysis ? dialysisStr : null,
  };
}

interface NursingMonthSummary {
  month: string;
  label: string;
  daysReported: number;
  avgCensus: number;
  avgStaffing: number;
  avgRatio: number;
  complaintDays: number;
  escalationDays: number;
  infectionDays: number;
  haiDays: number;
  bioWasteDays: number;
  incidentFreeDays: number;
  incidentFreeRate: number;
}

function aggregateNursingMonth(month: string, days: NursingDayData[]): NursingMonthSummary {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m] = month.split('-');
  const label = `${monthNames[parseInt(m) - 1]} ${y}`;

  const n = days.length;

  // Census and staffing aggregation
  const censusDays = days.filter(d => d.patientCensus !== null);
  const avgCensus = censusDays.length > 0
    ? censusDays.reduce((s, d) => s + (d.patientCensus || 0), 0) / censusDays.length
    : 0;

  const staffDays = days.filter(d => d.staffCount !== null);
  const avgStaffing = staffDays.length > 0
    ? staffDays.reduce((s, d) => s + (d.staffCount || 0), 0) / staffDays.length
    : 0;

  const ratioDays = days.filter(d => d.staffToPatientRatio !== null);
  const avgRatio = ratioDays.length > 0
    ? ratioDays.reduce((s, d) => s + (d.staffToPatientRatio || 0), 0) / ratioDays.length
    : 0;

  // Incident tracking
  const complaintDays = days.filter(d => d.hasComplaint).length;
  const escalationDays = days.filter(d => d.hasEscalation).length;
  const infectionDays = days.filter(d => d.hasInfectionControl).length;
  const haiDays = days.filter(d => d.hasHAI).length;
  const bioWasteDays = days.filter(d => d.hasBioWaste).length;

  const incidentDays = complaintDays + escalationDays + infectionDays + haiDays + bioWasteDays;
  const incidentFreeDays = n - incidentDays;
  const incidentFreeRate = n > 0 ? (incidentFreeDays / n) * 100 : 100;

  return {
    month, label, daysReported: n,
    avgCensus: parseFloat(avgCensus.toFixed(1)),
    avgStaffing: parseFloat(avgStaffing.toFixed(1)),
    avgRatio: parseFloat(avgRatio.toFixed(2)),
    complaintDays, escalationDays, infectionDays, haiDays, bioWasteDays,
    incidentFreeDays, incidentFreeRate,
  };
}

function extractClinicalLabDay(date: string, fields: Record<string, string | number>): ClinicalLabDayData {
  const outsourcedRaw = findField(fields, 'outsourced test', 'outsourced');
  const reagentRaw = findField(fields, 'reagent');
  const equipRaw = findField(fields, 'machine', 'equipment');
  const tatRaw = findField(fields, 'tat', 'turnaround');
  const errorRaw = findField(fields, 'recollection', 'reporting error', 'sample recollection');
  const criticalRaw = findField(fields, 'critical report', 'critical');
  const transRaw = findField(fields, 'transfusion', 'blood request');

  const outsourcedStr = outsourcedRaw ? String(outsourcedRaw).trim() : null;
  const reagentStr = reagentRaw ? String(reagentRaw).trim() : null;
  const equipStr = equipRaw ? String(equipRaw).trim() : null;
  const tatStr = tatRaw ? String(tatRaw).trim() : null;
  const errorStr = errorRaw ? String(errorRaw).trim() : null;
  const criticalStr = criticalRaw ? String(criticalRaw).trim() : null;
  const transStr = transRaw ? String(transRaw).trim() : null;

  // Reagent shortage: adequate/none = false, anything else = true
  const hasReagentShortage = reagentStr !== null && !isNilText(reagentStr) &&
    !/adequate|all reagent|available|sufficient/i.test(reagentStr);

  // Equipment OK
  const equipmentOk = !equipStr || /all equip|all machine|all the machine|functioning|working/i.test(equipStr);

  // TAT on target
  const tatOnTarget = !tatStr || /within|target|timely|qc done|following|fillowing/i.test(tatStr);

  return {
    date,
    outsourcedTestCount: countOutsourcedTests(outsourcedStr),
    outsourcedRaw: outsourcedStr,
    hasReagentShortage,
    reagentText: reagentStr,
    equipmentOk,
    tatOnTarget,
    hasSampleError: !isNilText(errorStr),
    sampleErrorText: isNilText(errorStr) ? null : errorStr,
    hasCriticalReport: !isNilText(criticalStr) && !/^[01]$/.test(criticalStr?.trim() || ''),
    criticalReportText: isNilText(criticalStr) ? null : criticalStr,
    hasTransfusionActivity: !isNilText(transStr),
    transfusionText: isNilText(transStr) ? null : transStr,
  };
}

interface ClinicalLabMonthSummary {
  month: string;
  label: string;
  daysReported: number;
  totalOutsourcedTests: number;
  avgOutsourcedPerDay: number;
  reagentShortageDays: number;
  equipmentOkDays: number;
  tatOnTargetDays: number;
  sampleErrorCount: number;
  criticalReportCount: number;
  transfusionDays: number;
  qualityScore: number;       // composite: (errorFreeDays + tatOnTarget + equipOk) / (3 * daysReported) * 100
  reagentReliability: number; // % days without shortage
}

function aggregateClinicalLabMonth(month: string, days: ClinicalLabDayData[]): ClinicalLabMonthSummary {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m] = month.split('-');
  const label = `${monthNames[parseInt(m) - 1]} ${y}`;

  const n = days.length;
  const totalOutsourced = days.reduce((s, d) => s + d.outsourcedTestCount, 0);
  const reagentShortageDays = days.filter(d => d.hasReagentShortage).length;
  const equipmentOkDays = days.filter(d => d.equipmentOk).length;
  const tatOnTargetDays = days.filter(d => d.tatOnTarget).length;
  const sampleErrorCount = days.filter(d => d.hasSampleError).length;
  const criticalReportCount = days.filter(d => d.hasCriticalReport).length;
  const transfusionDays = days.filter(d => d.hasTransfusionActivity).length;

  const errorFreeDays = n - sampleErrorCount;
  const qualityScore = n > 0 ? ((errorFreeDays + tatOnTargetDays + equipmentOkDays) / (3 * n)) * 100 : 0;
  const reagentReliability = n > 0 ? ((n - reagentShortageDays) / n) * 100 : 0;

  return {
    month, label, daysReported: n,
    totalOutsourcedTests: totalOutsourced,
    avgOutsourcedPerDay: n > 0 ? totalOutsourced / n : 0,
    reagentShortageDays,
    equipmentOkDays,
    tatOnTargetDays,
    sampleErrorCount,
    criticalReportCount,
    transfusionDays,
    qualityScore,
    reagentReliability,
  };
}

// ── Monthly aggregation ─────────────────────────────────────────────

interface MonthSummary {
  month: string;
  label: string;
  daysReported: number;
  // Latest MTD values (last reported day of the month)
  revenueMTD: number | null;
  surgeriesMTD: number | null;
  opdRevenueMTD: number | null;
  // Averages
  avgDailyRevenue: number | null;
  avgArpob: number | null;
  avgCensus: number | null;
  // Daily series
  dailyRevenue: { date: string; value: number }[];
  dailyArpob: { date: string; value: number }[];
  dailyCensus: { date: string; value: number }[];
  dailySurgeries: { date: string; value: number }[];
  // Leakage
  leakageAlerts: { date: string; text: string }[];
}

// ── Billing Monthly Summary ──────────────────────────────────────────

interface BillingMonthSummary {
  month: string;
  label: string;
  daysReported: number;
  avgPipelineCases: number | null;
  avgOtClearancePending: number | null;
  avgCounsellingSessions: number | null;
  totalDamaLama: number | null;
  avgInterimCounselling: number | null;
  dailyPipeline: { date: string; value: number }[];
  dailyOtClearance: { date: string; value: number }[];
  dailyCounselling: { date: string; value: number }[];
  dailyDamaLama: { date: string; value: number }[];
  dailyInterimCounselling: { date: string; value: number }[];
  dataQuality: 'legacy' | 'mixed' | 'standardized';
}

function aggregateMonth(month: string, days: FinanceDayData[]): MonthSummary {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m] = month.split('-');
  const label = `${monthNames[parseInt(m) - 1]} ${y}`;

  const dailyRevenue: { date: string; value: number }[] = [];
  const dailyArpob: { date: string; value: number }[] = [];
  const dailyCensus: { date: string; value: number }[] = [];
  const dailySurgeries: { date: string; value: number }[] = [];
  const leakageAlerts: { date: string; text: string }[] = [];

  let latestRevenueMTD: number | null = null;
  let latestSurgeriesMTD: number | null = null;
  let latestOpdRevenueMTD: number | null = null;

  for (const d of days) {
    if (d.revenue !== null) dailyRevenue.push({ date: d.date, value: d.revenue });
    if (d.arpob !== null) dailyArpob.push({ date: d.date, value: d.arpob });
    if (d.ipCensus !== null) dailyCensus.push({ date: d.date, value: d.ipCensus });
    if (d.surgeriesMTD !== null) dailySurgeries.push({ date: d.date, value: d.surgeriesMTD });
    if (d.revenueMTD !== null) latestRevenueMTD = d.revenueMTD;
    if (d.surgeriesMTD !== null) latestSurgeriesMTD = d.surgeriesMTD;
    if (d.opdRevenueMTD !== null) latestOpdRevenueMTD = d.opdRevenueMTD;
    if (d.revenueLeakage) {
      const text = d.revenueLeakage.toLowerCase();
      if (text !== 'nil' && text !== 'none' && text !== 'na' && text !== 'nill' && text !== 'no' && text !== '0' && text !== '') {
        leakageAlerts.push({ date: d.date, text: d.revenueLeakage });
      }
    }
  }

  const avgRevenue = dailyRevenue.length > 0 ? dailyRevenue.reduce((s, d) => s + d.value, 0) / dailyRevenue.length : null;
  const avgArpob = dailyArpob.length > 0 ? dailyArpob.reduce((s, d) => s + d.value, 0) / dailyArpob.length : null;
  const avgCensus = dailyCensus.length > 0 ? dailyCensus.reduce((s, d) => s + d.value, 0) / dailyCensus.length : null;

  return {
    month,
    label,
    daysReported: days.length,
    revenueMTD: latestRevenueMTD,
    surgeriesMTD: latestSurgeriesMTD,
    opdRevenueMTD: latestOpdRevenueMTD,
    avgDailyRevenue: avgRevenue,
    avgArpob,
    avgCensus,
    dailyRevenue,
    dailyArpob,
    dailyCensus,
    dailySurgeries,
    leakageAlerts,
  };
}

function aggregateBillingMonth(month: string, days: BillingDayData[]): BillingMonthSummary {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m] = month.split('-');
  const label = `${monthNames[parseInt(m) - 1]} ${y}`;

  const dailyPipeline: { date: string; value: number }[] = [];
  const dailyOtClearance: { date: string; value: number }[] = [];
  const dailyCounselling: { date: string; value: number }[] = [];
  const dailyDamaLama: { date: string; value: number }[] = [];
  const dailyInterimCounselling: { date: string; value: number }[] = [];

  let hasLegacyFields = false;

  for (const d of days) {
    if (d.pipelineCases !== null) dailyPipeline.push({ date: d.date, value: d.pipelineCases });
    if (d.otClearancePending !== null) dailyOtClearance.push({ date: d.date, value: d.otClearancePending });
    if (d.financialCounselling !== null) {
      dailyCounselling.push({ date: d.date, value: d.financialCounselling });
      hasLegacyFields = true; // Track if we have any data
    }
    if (d.damaLama !== null) dailyDamaLama.push({ date: d.date, value: d.damaLama });
    if (d.interimCounselling !== null) dailyInterimCounselling.push({ date: d.date, value: d.interimCounselling });
  }

  const avgPipeline = dailyPipeline.length > 0 ? dailyPipeline.reduce((s, d) => s + d.value, 0) / dailyPipeline.length : null;
  const avgOtClearance = dailyOtClearance.length > 0 ? dailyOtClearance.reduce((s, d) => s + d.value, 0) / dailyOtClearance.length : null;
  const avgCounselling = dailyCounselling.length > 0 ? dailyCounselling.reduce((s, d) => s + d.value, 0) / dailyCounselling.length : null;
  const totalDamaLama = dailyDamaLama.length > 0 ? dailyDamaLama.reduce((s, d) => s + d.value, 0) : null;
  const avgInterimCounselling = dailyInterimCounselling.length > 0 ? dailyInterimCounselling.reduce((s, d) => s + d.value, 0) / dailyInterimCounselling.length : null;

  return {
    month,
    label,
    daysReported: days.length,
    avgPipelineCases: avgPipeline,
    avgOtClearancePending: avgOtClearance,
    avgCounsellingSessions: avgCounselling,
    totalDamaLama,
    avgInterimCounselling,
    dailyPipeline,
    dailyOtClearance,
    dailyCounselling,
    dailyDamaLama,
    dailyInterimCounselling,
    dataQuality: hasLegacyFields ? 'legacy' : (dailyPipeline.length > 0 ? 'standardized' : 'mixed'),
  };
}

// ── Radiology field extractors ──────────────────────────────────────

interface RadiologyDayData {
  date: string;
  xrayCases: number | null;
  usgCases: number | null;
  ctCases: number | null;
  totalCases: number | null;
  reportsInHouse: number | null;
  hasEquipmentIssue: boolean;
  equipmentText: string | null;
  hasPendingReports: boolean;
  pendingText: string | null;
  hasCriticalEscalation: boolean;
  criticalText: string | null;
  hasStockIssue: boolean;
  stockText: string | null;
  radiationSafetyOk: boolean;
}

function extractRadiologyModalities(raw: string | number | null): { xray: number | null; usg: number | null; ct: number | null } {
  if (raw === null || raw === undefined) return { xray: null, usg: null, ct: null };
  if (typeof raw === 'number') return { xray: raw, usg: null, ct: null };

  const s = String(raw).trim();
  if (!s || /^(nil|none|na|no|0)$/i.test(s)) return { xray: null, usg: null, ct: null };

  let xray: number | null = null;
  let usg: number | null = null;
  let ct: number | null = null;

  // Pattern: "X Ray  07   CT  00   USG  07" or "X-ray: 10, USG: 5, CT: 0"
  const xrayMatch = s.match(/(?:X[\s-]?Ray|Xray|x[\s-]?ray)[:\s]*(\d+)/i);
  if (xrayMatch) xray = parseInt(xrayMatch[1], 10);

  const usgMatch = s.match(/(?:USG|Ultrasound)[:\s]*(\d+)/i);
  if (usgMatch) usg = parseInt(usgMatch[1], 10);

  const ctMatch = s.match(/(?:CT|CTScan)[:\s]*(\d+)/i);
  if (ctMatch) ct = parseInt(ctMatch[1], 10);

  return { xray, usg, ct };
}

function extractRadiologyDay(date: string, fields: Record<string, string | number>): RadiologyDayData {
  // Era 1 (historical text): "Number of Radiology cases done yesterday (modality-wise: X-ray / USG / CT / MRI)"
  // Era 2 (Google Forms, Mar 2026+): "# of X-Ray cases (yesterday)", "# of USG cases (yesterday)", "# of CT cases (yesterday)"

  // Try Era 2 fields first (individual modality counts)
  const xrayRaw = findField(fields, '# of x-ray', 'x-ray cases', 'x ray cases') || findField(fields, 'number of radiology cases');
  const usgRaw = findField(fields, '# of usg', 'usg cases', 'ultrasound');
  const ctRaw = findField(fields, '# of ct', 'ct cases');
  const reportsRaw = findField(fields, '# of reports', 'reports done', 'reports in-house');

  let xrayCases: number | null = null;
  let usgCases: number | null = null;
  let ctCases: number | null = null;
  let reportsInHouse: number | null = null;

  // If xrayRaw contains modality mix pattern (Era 1), parse all three
  if (xrayRaw && typeof xrayRaw === 'string' && /X\s*Ray|CT|USG/i.test(xrayRaw)) {
    const parsed = extractRadiologyModalities(xrayRaw);
    xrayCases = parsed.xray;
    usgCases = parsed.usg;
    ctCases = parsed.ct;
  } else {
    // Era 2: individual fields
    xrayCases = extractNumberInRange(xrayRaw, 0, 100);
    usgCases = extractNumberInRange(usgRaw, 0, 100);
    ctCases = extractNumberInRange(ctRaw, 0, 100);
  }

  reportsInHouse = extractNumberInRange(reportsRaw, 0, 100);

  // Calculate total cases
  let totalCases: number | null = null;
  if (xrayCases !== null || usgCases !== null || ctCases !== null) {
    totalCases = (xrayCases || 0) + (usgCases || 0) + (ctCases || 0);
  }

  // Equipment status
  const equipmentRaw = findField(fields, 'equipment status');
  const equipmentText = equipmentRaw ? String(equipmentRaw).trim() : null;
  const equipClass = equipmentText ? classifyText(equipmentText) : { hasIssue: false, isResolved: false, equipmentCategories: [] };

  // Pending reports
  const pendingRaw = findField(fields, 'pending reports');
  const pendingText = pendingRaw ? String(pendingRaw).trim() : null;
  const hasPendingReports = pendingText !== null && !isNilText(pendingText);

  // Critical results escalation
  const criticalRaw = findField(fields, 'critical results', 'escalated');
  const criticalText = criticalRaw ? String(criticalRaw).trim() : null;
  const hasCriticalEscalation = criticalText !== null && !isNilText(criticalText) && !/^(no|none|nil|na)$/i.test(criticalText);

  // Film/contrast stock
  const stockRaw = findField(fields, 'film', 'contrast stock', 'stock status');
  const stockText = stockRaw ? String(stockRaw).trim() : null;
  const hasStockIssue = stockText !== null && !isNilText(stockText) &&
    !/^(adequate|available|good|sufficient|ok|all ok)$/i.test(stockText);

  // Radiation safety
  const radiationRaw = findField(fields, 'radiation safety', 'tld badges', 'safety log');
  const radiationText = radiationRaw ? String(radiationRaw).trim() : null;
  const radiationSafetyOk = radiationText === null || isNilText(radiationText) ||
    /^(updated|done|ok|compliant|good|maintained)$/i.test(radiationText);

  return {
    date,
    xrayCases,
    usgCases,
    ctCases,
    totalCases,
    reportsInHouse,
    hasEquipmentIssue: equipClass.hasIssue,
    equipmentText: equipClass.hasIssue ? equipmentText : null,
    hasPendingReports,
    pendingText: hasPendingReports ? pendingText : null,
    hasCriticalEscalation,
    criticalText: hasCriticalEscalation ? criticalText : null,
    hasStockIssue,
    stockText: hasStockIssue ? stockText : null,
    radiationSafetyOk,
  };
}

interface RadiologyMonthSummary {
  month: string;
  label: string;
  daysReported: number;
  totalXray: number;
  totalUSG: number;
  totalCT: number;
  totalCases: number;
  avgCasesPerDay: number;
  modalityMix: { xray: number; usg: number; ct: number };
  equipmentIssueDays: number;
  pendingReportDays: number;
  equipmentUptimeRate: number;
}

function aggregateRadiologyMonth(month: string, days: RadiologyDayData[]): RadiologyMonthSummary {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m] = month.split('-');
  const label = `${monthNames[parseInt(m) - 1]} ${y}`;

  const totalXray = days.filter(d => d.xrayCases !== null).reduce((s, d) => s + (d.xrayCases || 0), 0);
  const totalUSG = days.filter(d => d.usgCases !== null).reduce((s, d) => s + (d.usgCases || 0), 0);
  const totalCT = days.filter(d => d.ctCases !== null).reduce((s, d) => s + (d.ctCases || 0), 0);
  const totalCases = totalXray + totalUSG + totalCT;
  const avgCasesPerDay = days.length > 0 ? totalCases / days.length : 0;

  const totalWithModalities = days.filter(d => d.totalCases !== null).length;
  const xrayPct = totalCases > 0 ? (totalXray / totalCases) * 100 : 0;
  const usgPct = totalCases > 0 ? (totalUSG / totalCases) * 100 : 0;
  const ctPct = totalCases > 0 ? (totalCT / totalCases) * 100 : 0;

  const equipmentIssueDays = days.filter(d => d.hasEquipmentIssue).length;
  const pendingReportDays = days.filter(d => d.hasPendingReports).length;
  const equipmentUptimeRate = days.length > 0 ? ((days.length - equipmentIssueDays) / days.length) * 100 : 100;

  return {
    month,
    label,
    daysReported: days.length,
    totalXray,
    totalUSG,
    totalCT,
    totalCases,
    avgCasesPerDay,
    modalityMix: { xray: xrayPct, usg: usgPct, ct: ctPct },
    equipmentIssueDays,
    pendingReportDays,
    equipmentUptimeRate,
  };
}

// ── OT field extractors ──────────────────────────────────────────────

interface OTDayData {
  date: string;
  otCases: number | null;
  casePostponed: boolean;
  firstCaseDelayMinutes: number | null;
  firstCaseDelayReason: string | null;
  escalationsBySurgeon: number | null;
  timesLeftForConsumables: number | null;
  surgeriesPlannedNextDay: number | null;
}

function extractOTDay(date: string, fields: Record<string, string | number>): OTDayData {
  const casesRaw = findField(fields, '# of ot cases', 'ot cases done');
  let otCases: number | null = null;
  let casePostponed = false;
  if (casesRaw !== null) {
    const s = String(casesRaw).toLowerCase().trim();
    if (s.includes('postpone') || s.includes('cancel')) {
      casePostponed = true;
      otCases = 0;
    } else {
      otCases = extractNumberInRange(casesRaw, 0, 50);
    }
  }

  const delayMinRaw = findField(fields, 'delay — time in minutes', 'delay — time', 'time in min');
  let firstCaseDelayMinutes: number | null = null;
  if (delayMinRaw !== null) {
    firstCaseDelayMinutes = extractNumberInRange(delayMinRaw, 0, 600);
  }

  const delayReasonRaw = findField(fields, 'delay — reason', 'delayed by (time', 'delay reason');
  let firstCaseDelayReason: string | null = null;
  if (delayReasonRaw !== null) {
    const s = String(delayReasonRaw).trim();
    if (!isNilText(s)) firstCaseDelayReason = s;
  }
  // Historical combined field: "First case delayed by (Time in min) with reason"
  if (firstCaseDelayMinutes === null && firstCaseDelayReason === null) {
    const combinedRaw = findField(fields, 'first case delayed');
    if (combinedRaw !== null) {
      const s = String(combinedRaw).trim();
      if (!isNilText(s)) {
        firstCaseDelayMinutes = extractNumber(s);
        firstCaseDelayReason = s;
      }
    }
  }

  const escalationsRaw = findField(fields, 'escalations by surgeon', 'escalation');
  const escalationsBySurgeon = extractNumberInRange(escalationsRaw, 0, 50);

  const consumablesRaw = findField(fields, 'times team left', 'time team left', 'left ot for consumables', 'left the ot');
  let timesLeftForConsumables: number | null = null;
  if (consumablesRaw !== null) {
    const s = String(consumablesRaw).toLowerCase().trim();
    if (s.includes('pending') || s.includes('flag')) {
      timesLeftForConsumables = null; // text status, not a count
    } else {
      timesLeftForConsumables = extractNumberInRange(consumablesRaw, 0, 50);
    }
  }

  const plannedRaw = findField(fields, 'surgeries planned', 'planned for next');
  const surgeriesPlannedNextDay = extractNumberInRange(plannedRaw, 0, 50);

  return {
    date,
    otCases,
    casePostponed,
    firstCaseDelayMinutes,
    firstCaseDelayReason,
    escalationsBySurgeon,
    timesLeftForConsumables,
    surgeriesPlannedNextDay,
  };
}

interface OTMonthSummary {
  month: string;
  label: string;
  daysReported: number;
  totalCases: number;
  avgCasesPerDay: number;
  postponedDays: number;
  avgDelayMinutes: number;
  totalEscalations: number;
  totalConsumableTrips: number;
  avgPlannedSurgeries: number;
  delayDays: number;
}

function aggregateOTMonth(month: string, days: OTDayData[]): OTMonthSummary {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m] = month.split('-');
  const label = `${monthNames[parseInt(m) - 1]} ${y}`;

  const caseDays = days.filter(d => d.otCases !== null);
  const totalCases = caseDays.reduce((s, d) => s + (d.otCases || 0), 0);
  const avgCasesPerDay = caseDays.length > 0 ? totalCases / caseDays.length : 0;
  const postponedDays = days.filter(d => d.casePostponed).length;

  const delayDays = days.filter(d => d.firstCaseDelayMinutes !== null && d.firstCaseDelayMinutes > 0);
  const avgDelayMinutes = delayDays.length > 0 ? delayDays.reduce((s, d) => s + (d.firstCaseDelayMinutes || 0), 0) / delayDays.length : 0;

  const totalEscalations = days.filter(d => d.escalationsBySurgeon !== null).reduce((s, d) => s + (d.escalationsBySurgeon || 0), 0);
  const totalConsumableTrips = days.filter(d => d.timesLeftForConsumables !== null).reduce((s, d) => s + (d.timesLeftForConsumables || 0), 0);

  const plannedDays = days.filter(d => d.surgeriesPlannedNextDay !== null);
  const avgPlannedSurgeries = plannedDays.length > 0 ? plannedDays.reduce((s, d) => s + (d.surgeriesPlannedNextDay || 0), 0) / plannedDays.length : 0;

  return {
    month, label, daysReported: days.length,
    totalCases, avgCasesPerDay, postponedDays,
    avgDelayMinutes, totalEscalations, totalConsumableTrips,
    avgPlannedSurgeries, delayDays: delayDays.length,
  };
}

// ── HR & Manpower field extractors ──────────────────────────────────

interface HRDayData {
  date: string;
  newJoiners: string[];
  resignations: string[];
  joinerCount: number;
  exitCount: number;
  replacementStatus: string | null;
  trainingStatus: string | null;
  doctorProfileStatus: string | null;
  otherNotes: string | null;
}

function extractHRDay(date: string, fields: Record<string, string | number>): HRDayData {
  const joinersRaw = findField(fields, 'new joiners', 'joiner');
  let newJoiners: string[] = [];
  let joinerCount = 0;
  if (joinersRaw !== null) {
    const s = String(joinersRaw).trim();
    if (!isNilText(s)) {
      newJoiners = s.split(/[\/,\n]+/).map(n => n.trim()).filter(n => n.length > 1);
      joinerCount = newJoiners.length;
    }
  }

  const resignRaw = findField(fields, 'resignations', 'exits today');
  let resignations: string[] = [];
  let exitCount = 0;
  if (resignRaw !== null) {
    const s = String(resignRaw).trim();
    if (!isNilText(s)) {
      resignations = s.split(/[\/,\n]+/).map(n => n.trim()).filter(n => n.length > 1);
      exitCount = resignations.length;
    }
  }

  const replacementRaw = findField(fields, 'replacement status');
  const replacementStatus = replacementRaw && !isNilText(String(replacementRaw).trim()) ? String(replacementRaw).trim() : null;

  const trainingRaw = findField(fields, 'mandatory training', 'induction status');
  const trainingStatus = trainingRaw && !isNilText(String(trainingRaw).trim()) ? String(trainingRaw).trim() : null;

  const profileRaw = findField(fields, 'doctor profile', 'profile creation');
  const doctorProfileStatus = profileRaw && !isNilText(String(profileRaw).trim()) ? String(profileRaw).trim() : null;

  const notesRaw = findField(fields, 'other notes');
  const otherNotes = notesRaw && !isNilText(String(notesRaw).trim()) ? String(notesRaw).trim() : null;

  return { date, newJoiners, resignations, joinerCount, exitCount, replacementStatus, trainingStatus, doctorProfileStatus, otherNotes };
}

interface HRMonthSummary {
  month: string;
  label: string;
  daysReported: number;
  totalJoiners: number;
  totalExits: number;
  netChange: number;
  joinerDays: number;
  exitDays: number;
}

function aggregateHRMonth(month: string, days: HRDayData[]): HRMonthSummary {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m] = month.split('-');
  const label = `${monthNames[parseInt(m) - 1]} ${y}`;

  const totalJoiners = days.reduce((s, d) => s + d.joinerCount, 0);
  const totalExits = days.reduce((s, d) => s + d.exitCount, 0);

  return {
    month, label, daysReported: days.length,
    totalJoiners, totalExits, netChange: totalJoiners - totalExits,
    joinerDays: days.filter(d => d.joinerCount > 0).length,
    exitDays: days.filter(d => d.exitCount > 0).length,
  };
}

// ── Supply Chain field extractors ──────────────────────────────────

interface SupplyChainDayData {
  date: string;
  poIssued: number | null;
  grnPrepared: number | null;
  shortages: number | null;
  hasShortage: boolean;
  emergencyProcurements: number | null;
  hasProcurementEscalation: boolean;
  escalationText: string | null;
  hasHighValueAlert: boolean;
  highValueText: string | null;
  criticalStockStatus: number | null;
  pendingConsumptionText: string | null;
}

function extractSupplyChainDay(date: string, fields: Record<string, string | number>): SupplyChainDayData {
  const poRaw = findField(fields, '# of po issued', 'po issued');
  const poIssued = extractNumberInRange(poRaw, 0, 500);

  const grnRaw = findField(fields, '# of grn', 'grn prepared');
  const grnPrepared = extractNumberInRange(grnRaw, 0, 500);

  const shortagesRaw = findField(fields, 'shortages', 'backorders');
  let shortages: number | null = null;
  let hasShortage = false;
  if (shortagesRaw !== null) {
    const s = String(shortagesRaw).trim();
    if (isNilText(s)) {
      shortages = 0;
    } else {
      shortages = extractNumber(shortagesRaw);
      hasShortage = shortages !== null && shortages > 0;
    }
  }

  const emergencyRaw = findField(fields, 'items procured in emergency', 'after 5pm', 'emergency');
  const emergencyProcurements = extractNumberInRange(emergencyRaw, 0, 100);

  const escalationRaw = findField(fields, 'procurement escalation');
  const escalationText = escalationRaw ? String(escalationRaw).trim() : null;
  const hasProcurementEscalation = escalationText !== null && !isNilText(escalationText);

  const highValueRaw = findField(fields, 'high-value', 'high value');
  const highValueText = highValueRaw ? String(highValueRaw).trim() : null;
  const hasHighValueAlert = highValueText !== null && !isNilText(highValueText);

  const criticalRaw = findField(fields, 'critical stock');
  const criticalStockStatus = extractNumber(criticalRaw);

  const pendingRaw = findField(fields, 'pending consumption', 'consumption reporting');
  const pendingConsumptionText = pendingRaw && !isNilText(String(pendingRaw).trim()) ? String(pendingRaw).trim() : null;

  return {
    date, poIssued, grnPrepared, shortages, hasShortage,
    emergencyProcurements, hasProcurementEscalation, escalationText: hasProcurementEscalation ? escalationText : null,
    hasHighValueAlert, highValueText: hasHighValueAlert ? highValueText : null,
    criticalStockStatus, pendingConsumptionText,
  };
}

interface SupplyChainMonthSummary {
  month: string;
  label: string;
  daysReported: number;
  totalPO: number;
  totalGRN: number;
  avgPOPerDay: number;
  avgGRNPerDay: number;
  shortageDays: number;
  totalEmergencyProcurements: number;
  escalationDays: number;
  highValueAlertDays: number;
}

function aggregateSupplyChainMonth(month: string, days: SupplyChainDayData[]): SupplyChainMonthSummary {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m] = month.split('-');
  const label = `${monthNames[parseInt(m) - 1]} ${y}`;

  const poDays = days.filter(d => d.poIssued !== null);
  const grnDays = days.filter(d => d.grnPrepared !== null);
  const totalPO = poDays.reduce((s, d) => s + (d.poIssued || 0), 0);
  const totalGRN = grnDays.reduce((s, d) => s + (d.grnPrepared || 0), 0);

  return {
    month, label, daysReported: days.length,
    totalPO, totalGRN,
    avgPOPerDay: poDays.length > 0 ? totalPO / poDays.length : 0,
    avgGRNPerDay: grnDays.length > 0 ? totalGRN / grnDays.length : 0,
    shortageDays: days.filter(d => d.hasShortage).length,
    totalEmergencyProcurements: days.reduce((s, d) => s + (d.emergencyProcurements || 0), 0),
    escalationDays: days.filter(d => d.hasProcurementEscalation).length,
    highValueAlertDays: days.filter(d => d.hasHighValueAlert).length,
  };
}

// ── Facility field extractors ──────────────────────────────────────

interface FacilityDayData {
  date: string;
  hasSafetyIssue: boolean;
  safetyText: string | null;
  housekeepingText: string | null;
  facilityReadinessText: string | null;
  hasInfraIssue: boolean;
  otherNotes: string | null;
}

function extractFacilityDay(date: string, fields: Record<string, string | number>): FacilityDayData {
  const safetyRaw = findField(fields, 'safety issues', 'safety issue');
  const safetyText = safetyRaw ? String(safetyRaw).trim() : null;
  const hasSafetyIssue = safetyText !== null && !isNilText(safetyText);

  const hkRaw = findField(fields, 'housekeeping', 'room readiness');
  const housekeepingText = hkRaw ? String(hkRaw).trim() : null;

  const readinessRaw = findField(fields, 'facility readiness', 'power / water', 'power/water');
  const facilityReadinessText = readinessRaw ? String(readinessRaw).trim() : null;
  const hasInfraIssue = facilityReadinessText !== null && !isNilText(facilityReadinessText) &&
    !/^(every\s*thing\s*(is\s*)?(working\s*)?fine|all ok|ok|good|no issue|nil|normal)$/i.test(facilityReadinessText);

  const notesRaw = findField(fields, 'other notes');
  const otherNotes = notesRaw && !isNilText(String(notesRaw).trim()) ? String(notesRaw).trim() : null;

  return { date, hasSafetyIssue, safetyText: hasSafetyIssue ? safetyText : null, housekeepingText, facilityReadinessText, hasInfraIssue, otherNotes };
}

interface FacilityMonthSummary {
  month: string;
  label: string;
  daysReported: number;
  safetyIssueDays: number;
  infraIssueDays: number;
  issueFreeRate: number;
}

function aggregateFacilityMonth(month: string, days: FacilityDayData[]): FacilityMonthSummary {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m] = month.split('-');
  const label = `${monthNames[parseInt(m) - 1]} ${y}`;

  const safetyIssueDays = days.filter(d => d.hasSafetyIssue).length;
  const infraIssueDays = days.filter(d => d.hasInfraIssue).length;
  const issueFree = days.filter(d => !d.hasSafetyIssue && !d.hasInfraIssue).length;

  return {
    month, label, daysReported: days.length,
    safetyIssueDays, infraIssueDays,
    issueFreeRate: days.length > 0 ? (issueFree / days.length) * 100 : 100,
  };
}

// ── Training field extractors ──────────────────────────────────────

interface TrainingDayData {
  date: string;
  trainingTopic: string | null;
  participants: number | null;
  mtdCompletedVsPlanned: string | null;
  mtdCompleted: number | null;
  mtdPlanned: number | null;
  hasTraining: boolean;
}

function extractTrainingDay(date: string, fields: Record<string, string | number>): TrainingDayData {
  const topicRaw = findField(fields, 'training conducted', 'training topic', 'topic');
  const trainingTopic = topicRaw && !isNilText(String(topicRaw).trim()) ? String(topicRaw).trim() : null;
  const hasTraining = trainingTopic !== null && !/^no training/i.test(trainingTopic);

  const participantsRaw = findField(fields, '# of participants', 'participants');
  const participants = extractNumberInRange(participantsRaw, 0, 500);

  const mtdRaw = findField(fields, 'mtd trainings', 'completed vs planned');
  let mtdCompletedVsPlanned: string | null = null;
  let mtdCompleted: number | null = null;
  let mtdPlanned: number | null = null;
  if (mtdRaw !== null) {
    const s = String(mtdRaw).trim();
    mtdCompletedVsPlanned = s;
    // Parse "15 out of 17" or "15/17"
    const match = s.match(/(\d+)\s*(?:out of|of|\/)\s*(\d+)/i);
    if (match) {
      mtdCompleted = parseInt(match[1], 10);
      mtdPlanned = parseInt(match[2], 10);
    }
  }

  return { date, trainingTopic, participants, mtdCompletedVsPlanned, mtdCompleted, mtdPlanned, hasTraining };
}

interface TrainingMonthSummary {
  month: string;
  label: string;
  daysReported: number;
  trainingDays: number;
  totalParticipants: number;
  avgParticipants: number;
  latestCompleted: number | null;
  latestPlanned: number | null;
  completionRate: number;
}

function aggregateTrainingMonth(month: string, days: TrainingDayData[]): TrainingMonthSummary {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m] = month.split('-');
  const label = `${monthNames[parseInt(m) - 1]} ${y}`;

  const trainingDays = days.filter(d => d.hasTraining).length;
  const withParticipants = days.filter(d => d.participants !== null && d.participants > 0);
  const totalParticipants = withParticipants.reduce((s, d) => s + (d.participants || 0), 0);

  // Get latest MTD data
  const withMTD = days.filter(d => d.mtdCompleted !== null).sort((a, b) => a.date.localeCompare(b.date));
  const latest = withMTD.length > 0 ? withMTD[withMTD.length - 1] : null;

  return {
    month, label, daysReported: days.length,
    trainingDays, totalParticipants,
    avgParticipants: withParticipants.length > 0 ? totalParticipants / withParticipants.length : 0,
    latestCompleted: latest?.mtdCompleted || null,
    latestPlanned: latest?.mtdPlanned || null,
    completionRate: latest && latest.mtdPlanned && latest.mtdPlanned > 0 ? (latest.mtdCompleted || 0) / latest.mtdPlanned * 100 : 0,
  };
}

// ── IT field extractors ────────────────────────────────────────────

interface ITDayData {
  date: string;
  hasIntegrationIssue: boolean;
  integrationText: string | null;
}

function extractITDay(date: string, fields: Record<string, string | number>): ITDayData {
  const integrationRaw = findField(fields, 'integration issue', 'system issue');
  const integrationText = integrationRaw ? String(integrationRaw).trim() : null;
  const hasIntegrationIssue = integrationText !== null && !isNilText(integrationText);

  return { date, hasIntegrationIssue, integrationText: hasIntegrationIssue ? integrationText : null };
}

interface ITMonthSummary {
  month: string;
  label: string;
  daysReported: number;
  issueDays: number;
  issueFreeDays: number;
  issueFreeRate: number;
}

function aggregateITMonth(month: string, days: ITDayData[]): ITMonthSummary {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m] = month.split('-');
  const label = `${monthNames[parseInt(m) - 1]} ${y}`;

  const issueDays = days.filter(d => d.hasIntegrationIssue).length;

  return {
    month, label, daysReported: days.length,
    issueDays, issueFreeDays: days.length - issueDays,
    issueFreeRate: days.length > 0 ? ((days.length - issueDays) / days.length) * 100 : 100,
  };
}

// ── Patient Safety field extractors ─────────────────────────────────

interface PatientSafetyDayData {
  date: string;
  patientFalls: number | null;
  medicationErrors: number | null;
  adverseEvents: number | null;
  sentinelEvents: number | null;
  nearMissIncidents: number | null;
  correctiveActionsClosed: number | null;
  nabhNonCompliancesClosed: number | null;
  newNabhNonCompliances: number | null;
  openRCAs: number | null;
  totalOpenNabh: number | null;
  staffSafetyBriefed: number | null;
  clinicalAuditStatus: string | null;
  nonClinicalAuditStatus: string | null;
  vapCompliance: boolean;
  clabsiCompliance: boolean;
  ssiCompliance: boolean;
  cautiCompliance: boolean;
  safetyTopic: string | null;
  rcaSummary: string | null;
  underReportingFlag: string | null;
  otherNotes: string | null;
  hasIncident: boolean;
}

function extractPatientSafetyDay(date: string, fields: Record<string, string | number>): PatientSafetyDayData {
  const patientFalls = extractNumberInRange(findField(fields, 'patient falls'), 0, 100);
  const medicationErrors = extractNumberInRange(findField(fields, 'medication error'), 0, 100);
  const adverseEvents = extractNumberInRange(findField(fields, 'adverse event'), 0, 100);
  const sentinelEvents = extractNumberInRange(findField(fields, 'sentinel event'), 0, 100);
  const nearMissIncidents = extractNumberInRange(findField(fields, 'near-miss', 'near miss incident'), 0, 100);
  const correctiveActionsClosed = extractNumberInRange(findField(fields, 'corrective actions closed'), 0, 100);
  const nabhNonCompliancesClosed = extractNumberInRange(findField(fields, 'nabh non-compliances closed', 'non-compliances closed'), 0, 100);
  const newNabhNonCompliances = extractNumberInRange(findField(fields, 'new nabh non-compliance', 'new non-compliance'), 0, 100);
  const openRCAs = extractNumberInRange(findField(fields, 'open rcas', 'rcas currently in progress'), 0, 100);
  const totalOpenNabh = extractNumberInRange(findField(fields, 'total open nabh', 'running total'), 0, 500);
  const staffSafetyBriefed = extractNumberInRange(findField(fields, 'staff who received a safety', 'safety briefing'), 0, 1000);

  const clinicalAuditRaw = findField(fields, 'clinical audit status');
  const clinicalAuditStatus = clinicalAuditRaw && !isNilText(String(clinicalAuditRaw).trim()) ? String(clinicalAuditRaw).trim() : null;

  const nonClinicalAuditRaw = findField(fields, 'non-clinical audit', 'non clinical audit');
  const nonClinicalAuditStatus = nonClinicalAuditRaw && !isNilText(String(nonClinicalAuditRaw).trim()) ? String(nonClinicalAuditRaw).trim() : null;

  const vapRaw = findField(fields, 'ventilator bundle', 'vap prevention');
  const vapCompliance = vapRaw ? /yes|full compliance|compliant/i.test(String(vapRaw)) : false;

  const clabsiRaw = findField(fields, 'central line bundle', 'clabsi');
  const clabsiCompliance = clabsiRaw ? /yes|full compliance|compliant/i.test(String(clabsiRaw)) : false;

  const ssiRaw = findField(fields, 'surgical site', 'ssi prevention');
  const ssiCompliance = ssiRaw ? /yes|full compliance|compliant/i.test(String(ssiRaw)) : false;

  const cautiRaw = findField(fields, 'urinary catheter', 'cauti');
  const cautiCompliance = cautiRaw ? /yes|full compliance|compliant/i.test(String(cautiRaw)) : false;

  const topicRaw = findField(fields, 'topic of safety communication', 'safety communication');
  const safetyTopic = topicRaw && !isNilText(String(topicRaw).trim()) && String(topicRaw).trim() !== '0' ? String(topicRaw).trim() : null;

  const rcaRaw = findField(fields, 'rca summary', 'new rca initiated');
  const rcaSummary = rcaRaw && !isNilText(String(rcaRaw).trim()) ? String(rcaRaw).trim() : null;

  const underReportRaw = findField(fields, 'under-reporting', 'under reporting');
  const underReportingFlag = underReportRaw && !isNilText(String(underReportRaw).trim()) ? String(underReportRaw).trim() : null;

  const notesRaw = findField(fields, 'other quality', 'safety notes');
  const otherNotes = notesRaw && !isNilText(String(notesRaw).trim()) ? String(notesRaw).trim() : null;

  const hasIncident = (patientFalls || 0) > 0 || (medicationErrors || 0) > 0 || (adverseEvents || 0) > 0 ||
    (sentinelEvents || 0) > 0 || (nearMissIncidents || 0) > 0;

  return {
    date, patientFalls, medicationErrors, adverseEvents, sentinelEvents, nearMissIncidents,
    correctiveActionsClosed, nabhNonCompliancesClosed, newNabhNonCompliances, openRCAs, totalOpenNabh,
    staffSafetyBriefed, clinicalAuditStatus, nonClinicalAuditStatus,
    vapCompliance, clabsiCompliance, ssiCompliance, cautiCompliance,
    safetyTopic, rcaSummary, underReportingFlag, otherNotes, hasIncident,
  };
}

interface PatientSafetyMonthSummary {
  month: string;
  label: string;
  daysReported: number;
  totalFalls: number;
  totalMedErrors: number;
  totalAdverseEvents: number;
  totalSentinelEvents: number;
  totalNearMiss: number;
  totalCorrectivesClosed: number;
  incidentDays: number;
  incidentFreeRate: number;
  avgBundleCompliance: number;
  latestOpenRCAs: number | null;
  latestOpenNabh: number | null;
}

function aggregatePatientSafetyMonth(month: string, days: PatientSafetyDayData[]): PatientSafetyMonthSummary {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m] = month.split('-');
  const label = `${monthNames[parseInt(m) - 1]} ${y}`;

  const totalFalls = days.reduce((s, d) => s + (d.patientFalls || 0), 0);
  const totalMedErrors = days.reduce((s, d) => s + (d.medicationErrors || 0), 0);
  const totalAdverseEvents = days.reduce((s, d) => s + (d.adverseEvents || 0), 0);
  const totalSentinelEvents = days.reduce((s, d) => s + (d.sentinelEvents || 0), 0);
  const totalNearMiss = days.reduce((s, d) => s + (d.nearMissIncidents || 0), 0);
  const totalCorrectivesClosed = days.reduce((s, d) => s + (d.correctiveActionsClosed || 0), 0);
  const incidentDays = days.filter(d => d.hasIncident).length;

  // Bundle compliance average across 4 bundles
  const bundleDays = days.length;
  const vapComp = bundleDays > 0 ? days.filter(d => d.vapCompliance).length / bundleDays * 100 : 0;
  const clabsiComp = bundleDays > 0 ? days.filter(d => d.clabsiCompliance).length / bundleDays * 100 : 0;
  const ssiComp = bundleDays > 0 ? days.filter(d => d.ssiCompliance).length / bundleDays * 100 : 0;
  const cautiComp = bundleDays > 0 ? days.filter(d => d.cautiCompliance).length / bundleDays * 100 : 0;
  const avgBundleCompliance = (vapComp + clabsiComp + ssiComp + cautiComp) / 4;

  // Latest open RCAs/NABH from last reported day
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const latestWithRCA = sorted.filter(d => d.openRCAs !== null);
  const latestWithNabh = sorted.filter(d => d.totalOpenNabh !== null);

  return {
    month, label, daysReported: days.length,
    totalFalls, totalMedErrors, totalAdverseEvents, totalSentinelEvents, totalNearMiss,
    totalCorrectivesClosed, incidentDays,
    incidentFreeRate: days.length > 0 ? ((days.length - incidentDays) / days.length) * 100 : 100,
    avgBundleCompliance,
    latestOpenRCAs: latestWithRCA.length > 0 ? latestWithRCA[latestWithRCA.length - 1].openRCAs : null,
    latestOpenNabh: latestWithNabh.length > 0 ? latestWithNabh[latestWithNabh.length - 1].totalOpenNabh : null,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!slug) {
    return NextResponse.json({ error: 'slug parameter is required' }, { status: 400 });
  }

  // Currently finance, billing, and biomedical are supported
  if (!['finance', 'billing', 'biomedical', 'clinical-lab', 'customer-care', 'diet', 'emergency', 'pharmacy', 'nursing', 'radiology', 'ot', 'hr-manpower', 'supply-chain', 'facility', 'training', 'it', 'patient-safety'].includes(slug)) {
    return NextResponse.json({ error: 'Department overview not yet available for this department' }, { status: 400 });
  }

  try {
    // Fetch all data for this department + BRM baselines
    let result;
    let brmResult;
    if (from && to) {
      result = await sql`
        SELECT d.date, d.entries
        FROM department_data d
        WHERE d.slug = ${slug}
          AND d.date >= ${from + '-01'}
          AND d.date <= ${to + '-31'}
        ORDER BY d.date ASC;
      `;
      brmResult = await sql`
        SELECT month, data FROM brm_monthly
        WHERE month >= ${from} AND month <= ${to}
        ORDER BY month ASC;
      `;
    } else {
      result = await sql`
        SELECT d.date, d.entries
        FROM department_data d
        WHERE d.slug = ${slug}
        ORDER BY d.date ASC;
      `;
      brmResult = await sql`
        SELECT month, data FROM brm_monthly
        ORDER BY month ASC;
      `;
    }

    // Extract day-level data based on department type
    const availableMonths = new Set<string>();

    let allDays: FinanceDayData[] | BillingDayData[] | BiomedicalDayData[] | ClinicalLabDayData[] | CustomerCareDayData[] | DietDayData[] | EmergencyDayData[] | PharmacyDayData[] | NursingDayData[] | RadiologyDayData[] | OTDayData[] | HRDayData[] | SupplyChainDayData[] | FacilityDayData[] | TrainingDayData[] | ITDayData[] | PatientSafetyDayData[] = [];
    let months: MonthSummary[] | BillingMonthSummary[] | BiomedicalMonthSummary[] | ClinicalLabMonthSummary[] | CustomerCareMonthSummary[] | DietMonthSummary[] | EmergencyMonthSummary[] | PharmacyMonthSummary[] | NursingMonthSummary[] | RadiologyMonthSummary[] | OTMonthSummary[] | HRMonthSummary[] | SupplyChainMonthSummary[] | FacilityMonthSummary[] | TrainingMonthSummary[] | ITMonthSummary[] | PatientSafetyMonthSummary[] = [];

    if (slug === 'finance') {
      const financeDays: FinanceDayData[] = [];
      for (const row of result.rows) {
        const date = row.date;
        const entries = row.entries as Array<{ fields: Record<string, string | number> }>;
        // Merge all entries' fields (form + whatsapp)
        const mergedFields: Record<string, string | number> = {};
        for (const entry of entries) {
          if (entry.fields) {
            for (const [k, v] of Object.entries(entry.fields)) {
              if (!k.startsWith('_') && !mergedFields[k]) {
                mergedFields[k] = v;
              }
            }
          }
        }

        const dayData = extractFinanceDay(date, mergedFields);
        financeDays.push(dayData);
        availableMonths.add(date.substring(0, 7));
      }

      // Group by month
      const byMonth = new Map<string, FinanceDayData[]>();
      for (const d of financeDays) {
        const m = d.date.substring(0, 7);
        if (!byMonth.has(m)) byMonth.set(m, []);
        byMonth.get(m)!.push(d);
      }

      // Aggregate each month
      const financeMonths: MonthSummary[] = [];
      const sortedMonths = [...availableMonths].sort();
      for (const m of sortedMonths) {
        financeMonths.push(aggregateMonth(m, byMonth.get(m) || []));
      }

      allDays = financeDays;
      months = financeMonths;
    } else if (slug === 'billing') {
      const billingDays: BillingDayData[] = [];
      for (const row of result.rows) {
        const date = row.date;
        const entries = row.entries as Array<{ fields: Record<string, string | number> }>;
        // Merge all entries' fields (form + whatsapp)
        const mergedFields: Record<string, string | number> = {};
        for (const entry of entries) {
          if (entry.fields) {
            for (const [k, v] of Object.entries(entry.fields)) {
              if (!k.startsWith('_') && !mergedFields[k]) {
                mergedFields[k] = v;
              }
            }
          }
        }

        const dayData = extractBillingDay(date, mergedFields);
        billingDays.push(dayData);
        availableMonths.add(date.substring(0, 7));
      }

      // Group by month
      const byMonth = new Map<string, BillingDayData[]>();
      for (const d of billingDays) {
        const m = d.date.substring(0, 7);
        if (!byMonth.has(m)) byMonth.set(m, []);
        byMonth.get(m)!.push(d);
      }

      // Aggregate each month
      const billingMonths: BillingMonthSummary[] = [];
      const sortedMonths = [...availableMonths].sort();
      for (const m of sortedMonths) {
        billingMonths.push(aggregateBillingMonth(m, byMonth.get(m) || []));
      }

      allDays = billingDays;
      months = billingMonths;
    } else if (slug === 'biomedical') {
      const biomedicalDays: BiomedicalDayData[] = [];
      for (const row of result.rows) {
        const date = row.date;
        const entries = row.entries as Array<{ fields: Record<string, string | number> }>;
        const mergedFields: Record<string, string | number> = {};
        for (const entry of entries) {
          if (entry.fields) {
            for (const [k, v] of Object.entries(entry.fields)) {
              if (!k.startsWith('_') && !mergedFields[k]) {
                mergedFields[k] = v;
              }
            }
          }
        }

        const dayData = extractBiomedicalDay(date, mergedFields);
        biomedicalDays.push(dayData);
        availableMonths.add(date.substring(0, 7));
      }

      // Group by month
      const byMonth = new Map<string, BiomedicalDayData[]>();
      for (const d of biomedicalDays) {
        const m = d.date.substring(0, 7);
        if (!byMonth.has(m)) byMonth.set(m, []);
        byMonth.get(m)!.push(d);
      }

      const biomedicalMonths: BiomedicalMonthSummary[] = [];
      const sortedMs = [...availableMonths].sort();
      for (const m of sortedMs) {
        biomedicalMonths.push(aggregateBiomedicalMonth(m, byMonth.get(m) || []));
      }

      allDays = biomedicalDays;
      months = biomedicalMonths;
    } else if (slug === 'clinical-lab') {
      const clinicalLabDays: ClinicalLabDayData[] = [];
      for (const row of result.rows) {
        const date = row.date;
        const entries = row.entries as Array<{ fields: Record<string, string | number> }>;
        const mergedFields: Record<string, string | number> = {};
        for (const entry of entries) {
          if (entry.fields) {
            for (const [k, v] of Object.entries(entry.fields)) {
              if (!k.startsWith('_') && !mergedFields[k]) {
                mergedFields[k] = v;
              }
            }
          }
        }
        const dayData = extractClinicalLabDay(date, mergedFields);
        clinicalLabDays.push(dayData);
        availableMonths.add(date.substring(0, 7));
      }

      const byMonth = new Map<string, ClinicalLabDayData[]>();
      for (const d of clinicalLabDays) {
        const m = d.date.substring(0, 7);
        if (!byMonth.has(m)) byMonth.set(m, []);
        byMonth.get(m)!.push(d);
      }

      const clinicalLabMonths: ClinicalLabMonthSummary[] = [];
      const sortedMs = [...availableMonths].sort();
      for (const m of sortedMs) {
        clinicalLabMonths.push(aggregateClinicalLabMonth(m, byMonth.get(m) || []));
      }

      allDays = clinicalLabDays;
      months = clinicalLabMonths;
    } else if (slug === 'customer-care') {
      const ccDays: CustomerCareDayData[] = [];
      for (const row of result.rows) {
        const date = row.date;
        const entries = row.entries as Array<{ fields: Record<string, string | number> }>;
        const mergedFields: Record<string, string | number> = {};
        for (const entry of entries) {
          if (entry.fields) {
            for (const [k, v] of Object.entries(entry.fields)) {
              if (!k.startsWith('_') && !mergedFields[k]) {
                mergedFields[k] = v;
              }
            }
          }
        }
        const dayData = extractCustomerCareDay(date, mergedFields);
        ccDays.push(dayData);
        availableMonths.add(date.substring(0, 7));
      }

      const byMonth = new Map<string, CustomerCareDayData[]>();
      for (const d of ccDays) {
        const m = d.date.substring(0, 7);
        if (!byMonth.has(m)) byMonth.set(m, []);
        byMonth.get(m)!.push(d);
      }

      const ccMonths: CustomerCareMonthSummary[] = [];
      const sortedMs = [...availableMonths].sort();
      for (const m of sortedMs) {
        ccMonths.push(aggregateCustomerCareMonth(m, byMonth.get(m) || []));
      }

      allDays = ccDays;
      months = ccMonths;
    } else if (slug === 'diet') {
      const dietDays: DietDayData[] = [];
      for (const row of result.rows) {
        const date = row.date;
        const entries = row.entries as Array<{ fields: Record<string, string | number> }>;
        const mergedFields: Record<string, string | number> = {};
        for (const entry of entries) {
          if (entry.fields) {
            for (const [k, v] of Object.entries(entry.fields)) {
              if (!k.startsWith('_') && !mergedFields[k]) {
                mergedFields[k] = v;
              }
            }
          }
        }
        const dayData = extractDietDay(date, mergedFields);
        dietDays.push(dayData);
        availableMonths.add(date.substring(0, 7));
      }

      const byMonth = new Map<string, DietDayData[]>();
      for (const d of dietDays) {
        const m = d.date.substring(0, 7);
        if (!byMonth.has(m)) byMonth.set(m, []);
        byMonth.get(m)!.push(d);
      }

      const dietMonths: DietMonthSummary[] = [];
      const sortedMs = [...availableMonths].sort();
      for (const m of sortedMs) {
        dietMonths.push(aggregateDietMonth(m, byMonth.get(m) || []));
      }

      allDays = dietDays;
      months = dietMonths;
    } else if (slug === 'emergency') {
      const emergencyDays: EmergencyDayData[] = [];
      for (const row of result.rows) {
        const date = row.date;
        const entries = row.entries as Array<{ fields: Record<string, string | number> }>;
        const mergedFields: Record<string, string | number> = {};
        for (const entry of entries) {
          if (entry.fields) {
            for (const [k, v] of Object.entries(entry.fields)) {
              if (!k.startsWith('_') && !mergedFields[k]) {
                mergedFields[k] = v;
              }
            }
          }
        }
        const dayData = extractEmergencyDay(date, mergedFields);
        emergencyDays.push(dayData);
        availableMonths.add(date.substring(0, 7));
      }

      const byMonth = new Map<string, EmergencyDayData[]>();
      for (const d of emergencyDays) {
        const m = d.date.substring(0, 7);
        if (!byMonth.has(m)) byMonth.set(m, []);
        byMonth.get(m)!.push(d);
      }

      const emergencyMonths: EmergencyMonthSummary[] = [];
      const sortedMs = [...availableMonths].sort();
      for (const m of sortedMs) {
        emergencyMonths.push(aggregateEmergencyMonth(m, byMonth.get(m) || []));
      }

      allDays = emergencyDays;
      months = emergencyMonths;
    } else if (slug === 'pharmacy') {
      const pharmacyDays: PharmacyDayData[] = [];
      for (const row of result.rows) {
        const date = row.date;
        const entries = row.entries as Array<{ fields: Record<string, string | number> }>;
        const mergedFields: Record<string, string | number> = {};
        for (const entry of entries) {
          if (entry.fields) {
            for (const [k, v] of Object.entries(entry.fields)) {
              if (!k.startsWith('_') && !mergedFields[k]) {
                mergedFields[k] = v;
              }
            }
          }
        }
        const dayData = extractPharmacyDay(date, mergedFields);
        pharmacyDays.push(dayData);
        availableMonths.add(date.substring(0, 7));
      }

      const byMonth = new Map<string, PharmacyDayData[]>();
      for (const d of pharmacyDays) {
        const m = d.date.substring(0, 7);
        if (!byMonth.has(m)) byMonth.set(m, []);
        byMonth.get(m)!.push(d);
      }

      const pharmacyMonths: PharmacyMonthSummary[] = [];
      const sortedMs = [...availableMonths].sort();
      for (const m of sortedMs) {
        pharmacyMonths.push(aggregatePharmacyMonth(m, byMonth.get(m) || []));
      }

      allDays = pharmacyDays;
      months = pharmacyMonths;
    } else if (slug === 'nursing') {
      const nursingDays: NursingDayData[] = [];
      for (const row of result.rows) {
        const date = row.date;
        const entries = row.entries as Array<{ fields: Record<string, string | number> }>;
        const mergedFields: Record<string, string | number> = {};
        for (const entry of entries) {
          if (entry.fields) {
            for (const [k, v] of Object.entries(entry.fields)) {
              if (!k.startsWith('_') && !mergedFields[k]) {
                mergedFields[k] = v;
              }
            }
          }
        }
        const dayData = extractNursingDay(date, mergedFields);
        nursingDays.push(dayData);
        availableMonths.add(date.substring(0, 7));
      }

      const byMonth = new Map<string, NursingDayData[]>();
      for (const d of nursingDays) {
        const m = d.date.substring(0, 7);
        if (!byMonth.has(m)) byMonth.set(m, []);
        byMonth.get(m)!.push(d);
      }

      const nursingMonths: NursingMonthSummary[] = [];
      const sortedMs = [...availableMonths].sort();
      for (const m of sortedMs) {
        nursingMonths.push(aggregateNursingMonth(m, byMonth.get(m) || []));
      }

      allDays = nursingDays;
      months = nursingMonths;
    } else if (slug === 'ot') {
      const otDays: OTDayData[] = [];
      for (const row of result.rows) {
        const date = row.date;
        const entries = row.entries as Array<{ key?: string; value?: string | number; fields?: Record<string, string | number> }>;
        const mergedFields: Record<string, string | number> = {};
        for (const entry of entries) {
          if (entry.fields) {
            for (const [k, v] of Object.entries(entry.fields)) {
              if (!k.startsWith('_') && !mergedFields[k]) mergedFields[k] = v;
            }
          } else if (entry.key && !entry.key.startsWith('_')) {
            if (!mergedFields[entry.key]) mergedFields[entry.key] = entry.value as string | number;
          }
        }
        const dayData = extractOTDay(date, mergedFields);
        otDays.push(dayData);
        availableMonths.add(date.substring(0, 7));
      }
      const byMonth = new Map<string, OTDayData[]>();
      for (const d of otDays) { const m = d.date.substring(0, 7); if (!byMonth.has(m)) byMonth.set(m, []); byMonth.get(m)!.push(d); }
      const otMonths: OTMonthSummary[] = [];
      const sortedMs = [...availableMonths].sort();
      for (const m of sortedMs) otMonths.push(aggregateOTMonth(m, byMonth.get(m) || []));
      allDays = otDays;
      months = otMonths;
    } else if (slug === 'hr-manpower') {
      const hrDays: HRDayData[] = [];
      for (const row of result.rows) {
        const date = row.date;
        const entries = row.entries as Array<{ key?: string; value?: string | number; fields?: Record<string, string | number> }>;
        const mergedFields: Record<string, string | number> = {};
        for (const entry of entries) {
          if (entry.fields) {
            for (const [k, v] of Object.entries(entry.fields)) {
              if (!k.startsWith('_') && !mergedFields[k]) mergedFields[k] = v;
            }
          } else if (entry.key && !entry.key.startsWith('_')) {
            if (!mergedFields[entry.key]) mergedFields[entry.key] = entry.value as string | number;
          }
        }
        const dayData = extractHRDay(date, mergedFields);
        hrDays.push(dayData);
        availableMonths.add(date.substring(0, 7));
      }
      const byMonth = new Map<string, HRDayData[]>();
      for (const d of hrDays) { const m = d.date.substring(0, 7); if (!byMonth.has(m)) byMonth.set(m, []); byMonth.get(m)!.push(d); }
      const hrMonths: HRMonthSummary[] = [];
      const sortedMs = [...availableMonths].sort();
      for (const m of sortedMs) hrMonths.push(aggregateHRMonth(m, byMonth.get(m) || []));
      allDays = hrDays;
      months = hrMonths;
    } else if (slug === 'supply-chain') {
      const scDays: SupplyChainDayData[] = [];
      for (const row of result.rows) {
        const date = row.date;
        const entries = row.entries as Array<{ key?: string; value?: string | number; fields?: Record<string, string | number> }>;
        const mergedFields: Record<string, string | number> = {};
        for (const entry of entries) {
          if (entry.fields) {
            for (const [k, v] of Object.entries(entry.fields)) {
              if (!k.startsWith('_') && !mergedFields[k]) mergedFields[k] = v;
            }
          } else if (entry.key && !entry.key.startsWith('_')) {
            if (!mergedFields[entry.key]) mergedFields[entry.key] = entry.value as string | number;
          }
        }
        const dayData = extractSupplyChainDay(date, mergedFields);
        scDays.push(dayData);
        availableMonths.add(date.substring(0, 7));
      }
      const byMonth = new Map<string, SupplyChainDayData[]>();
      for (const d of scDays) { const m = d.date.substring(0, 7); if (!byMonth.has(m)) byMonth.set(m, []); byMonth.get(m)!.push(d); }
      const scMonths: SupplyChainMonthSummary[] = [];
      const sortedMs = [...availableMonths].sort();
      for (const m of sortedMs) scMonths.push(aggregateSupplyChainMonth(m, byMonth.get(m) || []));
      allDays = scDays;
      months = scMonths;
    } else if (slug === 'facility') {
      const facDays: FacilityDayData[] = [];
      for (const row of result.rows) {
        const date = row.date;
        const entries = row.entries as Array<{ key?: string; value?: string | number; fields?: Record<string, string | number> }>;
        const mergedFields: Record<string, string | number> = {};
        for (const entry of entries) {
          if (entry.fields) {
            for (const [k, v] of Object.entries(entry.fields)) {
              if (!k.startsWith('_') && !mergedFields[k]) mergedFields[k] = v;
            }
          } else if (entry.key && !entry.key.startsWith('_')) {
            if (!mergedFields[entry.key]) mergedFields[entry.key] = entry.value as string | number;
          }
        }
        const dayData = extractFacilityDay(date, mergedFields);
        facDays.push(dayData);
        availableMonths.add(date.substring(0, 7));
      }
      const byMonth = new Map<string, FacilityDayData[]>();
      for (const d of facDays) { const m = d.date.substring(0, 7); if (!byMonth.has(m)) byMonth.set(m, []); byMonth.get(m)!.push(d); }
      const facMonths: FacilityMonthSummary[] = [];
      const sortedMs = [...availableMonths].sort();
      for (const m of sortedMs) facMonths.push(aggregateFacilityMonth(m, byMonth.get(m) || []));
      allDays = facDays;
      months = facMonths;
    } else if (slug === 'training') {
      const trainDays: TrainingDayData[] = [];
      for (const row of result.rows) {
        const date = row.date;
        const entries = row.entries as Array<{ key?: string; value?: string | number; fields?: Record<string, string | number> }>;
        const mergedFields: Record<string, string | number> = {};
        for (const entry of entries) {
          if (entry.fields) {
            for (const [k, v] of Object.entries(entry.fields)) {
              if (!k.startsWith('_') && !mergedFields[k]) mergedFields[k] = v;
            }
          } else if (entry.key && !entry.key.startsWith('_')) {
            if (!mergedFields[entry.key]) mergedFields[entry.key] = entry.value as string | number;
          }
        }
        const dayData = extractTrainingDay(date, mergedFields);
        trainDays.push(dayData);
        availableMonths.add(date.substring(0, 7));
      }
      const byMonth = new Map<string, TrainingDayData[]>();
      for (const d of trainDays) { const m = d.date.substring(0, 7); if (!byMonth.has(m)) byMonth.set(m, []); byMonth.get(m)!.push(d); }
      const trainMonths: TrainingMonthSummary[] = [];
      const sortedMs = [...availableMonths].sort();
      for (const m of sortedMs) trainMonths.push(aggregateTrainingMonth(m, byMonth.get(m) || []));
      allDays = trainDays;
      months = trainMonths;
    } else if (slug === 'it') {
      const itDays: ITDayData[] = [];
      for (const row of result.rows) {
        const date = row.date;
        const entries = row.entries as Array<{ key?: string; value?: string | number; fields?: Record<string, string | number> }>;
        const mergedFields: Record<string, string | number> = {};
        for (const entry of entries) {
          if (entry.fields) {
            for (const [k, v] of Object.entries(entry.fields)) {
              if (!k.startsWith('_') && !mergedFields[k]) mergedFields[k] = v;
            }
          } else if (entry.key && !entry.key.startsWith('_')) {
            if (!mergedFields[entry.key]) mergedFields[entry.key] = entry.value as string | number;
          }
        }
        const dayData = extractITDay(date, mergedFields);
        itDays.push(dayData);
        availableMonths.add(date.substring(0, 7));
      }
      const byMonth = new Map<string, ITDayData[]>();
      for (const d of itDays) { const m = d.date.substring(0, 7); if (!byMonth.has(m)) byMonth.set(m, []); byMonth.get(m)!.push(d); }
      const itMonths: ITMonthSummary[] = [];
      const sortedMs = [...availableMonths].sort();
      for (const m of sortedMs) itMonths.push(aggregateITMonth(m, byMonth.get(m) || []));
      allDays = itDays;
      months = itMonths;
    } else if (slug === 'patient-safety') {
      const psDays: PatientSafetyDayData[] = [];
      for (const row of result.rows) {
        const date = row.date;
        const entries = row.entries as Array<{ key?: string; value?: string | number; fields?: Record<string, string | number> }>;
        const mergedFields: Record<string, string | number> = {};
        for (const entry of entries) {
          if (entry.fields) {
            for (const [k, v] of Object.entries(entry.fields)) {
              if (!k.startsWith('_') && !mergedFields[k]) mergedFields[k] = v;
            }
          } else if (entry.key && !entry.key.startsWith('_')) {
            if (!mergedFields[entry.key]) mergedFields[entry.key] = entry.value as string | number;
          }
        }
        const dayData = extractPatientSafetyDay(date, mergedFields);
        psDays.push(dayData);
        availableMonths.add(date.substring(0, 7));
      }
      const byMonth = new Map<string, PatientSafetyDayData[]>();
      for (const d of psDays) { const m = d.date.substring(0, 7); if (!byMonth.has(m)) byMonth.set(m, []); byMonth.get(m)!.push(d); }
      const psMonths: PatientSafetyMonthSummary[] = [];
      const sortedMs = [...availableMonths].sort();
      for (const m of sortedMs) psMonths.push(aggregatePatientSafetyMonth(m, byMonth.get(m) || []));
      allDays = psDays;
      months = psMonths;
    }

    // Get sorted months list
    const sortedMonths = [...availableMonths].sort();

    // Build response based on department type
    if (slug === 'finance') {
      // ── Finance-specific summary ────────────────────────────────────
      const financeMonths = months as MonthSummary[];
      const financeDays = allDays as FinanceDayData[];

      const allRevenues = financeDays.filter(d => d.revenue !== null).map(d => d.revenue!);
      const allArpobs = financeDays.filter(d => d.arpob !== null).map(d => d.arpob!);
      const allCensus = financeDays.filter(d => d.ipCensus !== null).map(d => d.ipCensus!);
      const allLeakages = financeDays.filter(d => {
        if (!d.revenueLeakage) return false;
        const t = d.revenueLeakage.toLowerCase();
        return t !== 'nil' && t !== 'none' && t !== 'na' && t !== 'nill' && t !== 'no' && t !== '0' && t !== '';
      });

      const monthlyRevenueMTD = financeMonths.map(m => ({
        month: m.month,
        label: m.label,
        value: m.revenueMTD,
      }));

      const monthlySurgeries = financeMonths.map(m => ({
        month: m.month,
        label: m.label,
        value: m.surgeriesMTD,
      }));

      const monthlyAvgCensus = financeMonths.map(m => ({
        month: m.month,
        label: m.label,
        value: m.avgCensus !== null ? Math.round(m.avgCensus) : null,
      }));

      const monthlyAvgArpob = financeMonths.map(m => ({
        month: m.month,
        label: m.label,
        value: m.avgArpob !== null ? Math.round(m.avgArpob) : null,
      }));

      const summary = {
        totalDaysReported: financeDays.length,
        dateRange: financeDays.length > 0 ? { from: financeDays[0].date, to: financeDays[financeDays.length - 1].date } : null,
        latestRevenueMTD: financeMonths.length > 0 ? financeMonths[financeMonths.length - 1].revenueMTD : null,
        latestSurgeriesMTD: financeMonths.length > 0 ? financeMonths[financeMonths.length - 1].surgeriesMTD : null,
        latestArpob: financeMonths.length > 0 ? financeMonths[financeMonths.length - 1].avgArpob : null,
        latestCensus: financeMonths.length > 0 ? financeMonths[financeMonths.length - 1].avgCensus : null,
        latestOpdRevenueMTD: financeMonths.length > 0 ? financeMonths[financeMonths.length - 1].opdRevenueMTD : null,
        avgDailyRevenue: allRevenues.length > 0 ? allRevenues.reduce((a, b) => a + b, 0) / allRevenues.length : null,
        avgArpob: allArpobs.length > 0 ? allArpobs.reduce((a, b) => a + b, 0) / allArpobs.length : null,
        avgCensus: allCensus.length > 0 ? allCensus.reduce((a, b) => a + b, 0) / allCensus.length : null,
        totalLeakageAlerts: allLeakages.length,
        revenueSparkline: financeDays.filter(d => d.revenue !== null).map(d => ({ date: d.date, value: d.revenue! })),
        arpobSparkline: financeDays.filter(d => d.arpob !== null).map(d => ({ date: d.date, value: d.arpob! })),
        censusSparkline: financeDays.filter(d => d.ipCensus !== null).map(d => ({ date: d.date, value: d.ipCensus! })),
        surgeriesSparkline: financeDays.filter(d => d.surgeriesMTD !== null).map(d => ({ date: d.date, value: d.surgeriesMTD! })),
      };

      // BRM baseline data
      interface BrmMonth {
        month: string;
        label: string;
        revenue_lakhs: number | null;
        ebitdar_lakhs: number | null;
        ebitdar_pct: number | null;
        ebitda_before_lakhs: number | null;
        ebitda_before_pct: number | null;
        contribution_margin_pct: number | null;
        operating_days: number | null;
        opd_footfall_total: number | null;
        ip_admissions: number | null;
        ip_discharges: number | null;
        avg_occupied_beds: number | null;
        occupancy_pct: number | null;
        arpob_daily: number | null;
        arpob_annualized_lakhs: number | null;
        alos_days: number | null;
        ipd_revenue_lakhs: number | null;
        opd_revenue_lakhs: number | null;
        operating_revenue_lakhs: number | null;
        census_beds: number | null;
      }

      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const brmMonths: BrmMonth[] = brmResult.rows.map((row: any) => {
        const d = row.data as Record<string, unknown>;
        const [y, m] = row.month.split('-');
        return {
          month: row.month,
          label: `${monthNames[parseInt(m) - 1]} ${y}`,
          revenue_lakhs: d.revenue_lakhs as number | null,
          ebitdar_lakhs: d.ebitdar_lakhs as number | null,
          ebitdar_pct: d.ebitdar_pct as number | null,
          ebitda_before_lakhs: d.ebitda_before_lakhs as number | null,
          ebitda_before_pct: d.ebitda_before_pct as number | null,
          contribution_margin_pct: d.contribution_margin_pct as number | null,
          operating_days: d.operating_days as number | null,
          opd_footfall_total: d.opd_footfall_total as number | null,
          ip_admissions: d.ip_admissions as number | null,
          ip_discharges: d.ip_discharges as number | null,
          avg_occupied_beds: d.avg_occupied_beds as number | null,
          occupancy_pct: d.occupancy_pct as number | null,
          arpob_daily: d.arpob_daily as number | null,
          arpob_annualized_lakhs: d.arpob_annualized_lakhs as number | null,
          alos_days: d.alos_days as number | null,
          ipd_revenue_lakhs: d.ipd_revenue_lakhs as number | null,
          opd_revenue_lakhs: d.opd_revenue_lakhs as number | null,
          operating_revenue_lakhs: d.operating_revenue_lakhs as number | null,
          census_beds: d.census_beds as number | null,
        };
      });

      const allMonthsSet = new Set(sortedMonths);
      for (const b of brmMonths) allMonthsSet.add(b.month);
      const allAvailableMonths = [...allMonthsSet].sort();

      return NextResponse.json({
        slug,
        department: 'Finance',
        summary,
        months: financeMonths,
        monthlyRevenueMTD,
        monthlySurgeries,
        monthlyAvgCensus,
        monthlyAvgArpob,
        availableMonths: allAvailableMonths,
        allDays: financeDays,
        brmMonths,
      });
    } else if (slug === 'billing') {
      // ── Billing-specific summary ────────────────────────────────────
      const billingMonths = months as BillingMonthSummary[];
      const billingDays = allDays as BillingDayData[];

      const allPipeline = billingDays.filter(d => d.pipelineCases !== null).map(d => d.pipelineCases!);
      const allCounselling = billingDays.filter(d => d.financialCounselling !== null).map(d => d.financialCounselling!);
      const allOtClearance = billingDays.filter(d => d.otClearancePending !== null).map(d => d.otClearancePending!);
      const allDamaLama = billingDays.filter(d => d.damaLama !== null).map(d => d.damaLama!);

      const summary = {
        totalDaysReported: billingDays.length,
        dateRange: billingDays.length > 0 ? { from: billingDays[0].date, to: billingDays[billingDays.length - 1].date } : null,
        latestPipelineCases: billingMonths.length > 0 ? billingMonths[billingMonths.length - 1].avgPipelineCases : null,
        latestOtClearance: billingMonths.length > 0 ? billingMonths[billingMonths.length - 1].avgOtClearancePending : null,
        latestCounselling: billingMonths.length > 0 ? billingMonths[billingMonths.length - 1].avgCounsellingSessions : null,
        latestDamaLama: billingMonths.length > 0 ? billingMonths[billingMonths.length - 1].totalDamaLama : null,
        avgPipeline: allPipeline.length > 0 ? allPipeline.reduce((a, b) => a + b, 0) / allPipeline.length : null,
        avgCounselling: allCounselling.length > 0 ? allCounselling.reduce((a, b) => a + b, 0) / allCounselling.length : null,
        avgOtClearance: allOtClearance.length > 0 ? allOtClearance.reduce((a, b) => a + b, 0) / allOtClearance.length : null,
        totalDamaLama: allDamaLama.length > 0 ? allDamaLama.reduce((a, b) => a + b, 0) : null,
        pipelineSparkline: billingDays.filter(d => d.pipelineCases !== null).map(d => ({ date: d.date, value: d.pipelineCases! })),
        counsellingSparkline: billingDays.filter(d => d.financialCounselling !== null).map(d => ({ date: d.date, value: d.financialCounselling! })),
        otClearanceSparkline: billingDays.filter(d => d.otClearancePending !== null).map(d => ({ date: d.date, value: d.otClearancePending! })),
        damaLamaSparkline: billingDays.filter(d => d.damaLama !== null).map(d => ({ date: d.date, value: d.damaLama! })),
      };

      return NextResponse.json({
        slug,
        department: 'Billing',
        summary,
        months: billingMonths,
        availableMonths: sortedMonths,
        allDays: billingDays,
      });
    } else if (slug === 'biomedical') {
      // ── Biomedical-specific summary ───────────────────────────────
      const biomedicalMonths = months as BiomedicalMonthSummary[];
      const biomedicalDays = allDays as BiomedicalDayData[];

      // Aggregate equipment category counts across all time
      const globalCatCounts = new Map<string, number>();
      for (const d of biomedicalDays) {
        for (const cat of d.breakdownCategories) {
          globalCatCounts.set(cat, (globalCatCounts.get(cat) || 0) + 1);
        }
      }
      const topEquipmentIssues = [...globalCatCounts.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);

      // Equipment category labels lookup
      const catLabels: Record<string, string> = {};
      for (const c of EQUIPMENT_CATEGORIES) catLabels[c.key] = c.label;

      const summary = {
        totalDaysReported: biomedicalDays.length,
        dateRange: biomedicalDays.length > 0 ? { from: biomedicalDays[0].date, to: biomedicalDays[biomedicalDays.length - 1].date } : null,
        totalBreakdownDays: biomedicalDays.filter(d => d.hasBreakdown).length,
        totalPendingDays: biomedicalDays.filter(d => d.hasPendingRepair).length,
        equipmentReadinessRate: biomedicalDays.length > 0 ? (biomedicalDays.filter(d => d.equipmentReady).length / biomedicalDays.length) * 100 : 0,
        overallBreakdownRate: biomedicalDays.length > 0 ? (biomedicalDays.filter(d => d.hasBreakdown).length / biomedicalDays.length) * 100 : 0,
        overallResolutionRate: (() => {
          const bd = biomedicalDays.filter(d => d.hasBreakdown);
          return bd.length > 0 ? (bd.filter(d => d.breakdownResolved).length / bd.length) * 100 : 100;
        })(),
        topEquipmentIssues,
        categoryLabels: catLabels,
      };

      return NextResponse.json({
        slug,
        department: 'Biomedical',
        summary,
        months: biomedicalMonths,
        availableMonths: sortedMonths,
        allDays: biomedicalDays,
      });
    } else if (slug === 'clinical-lab') {
      // ── Clinical Lab summary ──────────────────────────────────────
      const clMonths = months as ClinicalLabMonthSummary[];
      const clDays = allDays as ClinicalLabDayData[];

      const summary = {
        totalDaysReported: clDays.length,
        dateRange: clDays.length > 0 ? { from: clDays[0].date, to: clDays[clDays.length - 1].date } : null,
        totalOutsourcedTests: clDays.reduce((s, d) => s + d.outsourcedTestCount, 0),
        totalSampleErrors: clDays.filter(d => d.hasSampleError).length,
        totalCriticalReports: clDays.filter(d => d.hasCriticalReport).length,
        totalTransfusionDays: clDays.filter(d => d.hasTransfusionActivity).length,
        overallQualityScore: clMonths.length > 0 ? clMonths.reduce((s, m) => s + m.qualityScore, 0) / clMonths.length : 0,
        overallReagentReliability: clMonths.length > 0 ? clMonths.reduce((s, m) => s + m.reagentReliability, 0) / clMonths.length : 0,
        tatComplianceRate: clDays.length > 0 ? (clDays.filter(d => d.tatOnTarget).length / clDays.length) * 100 : 0,
        equipmentUptimeRate: clDays.length > 0 ? (clDays.filter(d => d.equipmentOk).length / clDays.length) * 100 : 0,
        errorRate: clDays.length > 0 ? (clDays.filter(d => d.hasSampleError).length / clDays.length) * 100 : 0,
      };

      return NextResponse.json({
        slug,
        department: 'Clinical Lab',
        summary,
        months: clMonths,
        availableMonths: sortedMonths,
        allDays: clDays,
      });
    } else if (slug === 'customer-care') {
      // ── Customer Care summary ──────────────────────────────────────
      const ccMonths = months as CustomerCareMonthSummary[];
      const ccDays = allDays as CustomerCareDayData[];

      // Aggregate doctor-level frequencies across ALL time
      const allTimeDoctorLate: Record<string, number> = {};
      const allTimeDoctorLeave: Record<string, number> = {};
      for (const d of ccDays) {
        for (const dr of d.doctorsLate) {
          const name = dr.replace(/^Dr\.?\s*/i, 'Dr. ').trim();
          allTimeDoctorLate[name] = (allTimeDoctorLate[name] || 0) + 1;
        }
        for (const dr of d.doctorsOnLeave) {
          const name = dr.replace(/^Dr\.?\s*/i, 'Dr. ').trim();
          allTimeDoctorLeave[name] = (allTimeDoctorLeave[name] || 0) + 1;
        }
      }

      const opdDays = ccDays.filter(d => d.opdTotal !== null);
      const summary = {
        totalDaysReported: ccDays.length,
        dateRange: ccDays.length > 0 ? { from: ccDays[0].date, to: ccDays[ccDays.length - 1].date } : null,
        totalOPDAppointments: opdDays.reduce((s, d) => s + (d.opdTotal || 0), 0),
        avgOPDPerDay: opdDays.length > 0 ? opdDays.reduce((s, d) => s + (d.opdTotal || 0), 0) / opdDays.length : 0,
        overallTelePercentage: opdDays.length > 0
          ? (opdDays.reduce((s, d) => s + (d.opdTele || 0), 0) / opdDays.reduce((s, d) => s + (d.opdTotal || 0), 0)) * 100
          : 0,
        totalGoogleReviews: ccDays.reduce((s, d) => s + (d.googleReviews || 0), 0),
        totalFeedback: ccDays.reduce((s, d) => s + (d.customerFeedback || 0), 0),
        totalVideoTestimonials: ccDays.reduce((s, d) => s + (d.videoTestimonials || 0), 0),
        complaintDays: ccDays.filter(d => d.hasComplaint).length,
        escalationDays: ccDays.filter(d => d.hasEscalation).length,
        doctorLateDays: ccDays.filter(d => d.doctorsLate.length > 0).length,
        patientWaitDays: ccDays.filter(d => d.patientWaitIncidents > 0).length,
        totalPatientWaitIncidents: ccDays.reduce((s, d) => s + d.patientWaitIncidents, 0),
        doctorLateFrequency: allTimeDoctorLate,
        doctorLeaveFrequency: allTimeDoctorLeave,
      };

      return NextResponse.json({
        slug,
        department: 'Customer Care',
        summary,
        months: ccMonths,
        availableMonths: sortedMonths,
        allDays: ccDays,
      });
    } else if (slug === 'diet') {
      // ── Diet & Nutrition summary ───────────────────────────────────
      const dietMonths = months as DietMonthSummary[];
      const dietDays = allDays as DietDayData[];

      const censusDays = dietDays.filter(d => d.census !== null);
      const consultDays = dietDays.filter(d => d.totalConsults !== null);

      const summary = {
        totalDaysReported: dietDays.length,
        dateRange: dietDays.length > 0 ? { from: dietDays[0].date, to: dietDays[dietDays.length - 1].date } : null,
        totalCensus: censusDays.reduce((s, d) => s + (d.census || 0), 0),
        avgCensusPerDay: censusDays.length > 0 ? censusDays.reduce((s, d) => s + (d.census || 0), 0) / censusDays.length : 0,
        totalConsults: consultDays.reduce((s, d) => s + (d.totalConsults || 0), 0),
        totalTeleConsults: dietDays.reduce((s, d) => s + (d.teleConsults || 0), 0),
        totalOPConsults: dietDays.reduce((s, d) => s + (d.opConsults || 0), 0),
        overallTelePercentage: (() => {
          const total = dietDays.reduce((s, d) => s + (d.teleConsults || 0) + (d.opConsults || 0), 0);
          const tele = dietDays.reduce((s, d) => s + (d.teleConsults || 0), 0);
          return total > 0 ? (tele / total) * 100 : 0;
        })(),
        totalBCADone: dietDays.reduce((s, d) => s + (d.bcaDone || 0), 0),
        totalDischargesWithDiet: dietDays.reduce((s, d) => s + (d.dischargesWithDiet || 0), 0),
        foodIssueDays: dietDays.filter(d => d.hasFoodIssue).length,
        kitchenIssueDays: dietDays.filter(d => d.hasKitchenIssue).length,
        delayDays: dietDays.filter(d => d.hasDelay).length,
        clinicalAuditDays: dietDays.filter(d => d.hasClinicalAudit).length,
        incidentFreeDays: dietDays.filter(d => !d.hasFoodIssue && !d.hasKitchenIssue && !d.hasDelay).length,
      };

      return NextResponse.json({
        slug,
        department: 'Diet & Nutrition',
        summary,
        months: dietMonths,
        availableMonths: sortedMonths,
        allDays: dietDays,
      });
    } else if (slug === 'emergency') {
      const emMonths = months as EmergencyMonthSummary[];
      const emDays = allDays as EmergencyDayData[];

      const erDays = emDays.filter(d => d.erCases !== null);
      const summary = {
        totalDaysReported: emDays.length,
        dateRange: emDays.length > 0 ? { from: emDays[0].date, to: emDays[emDays.length - 1].date } : null,
        totalERCases: erDays.reduce((s, d) => s + (d.erCases || 0), 0),
        avgERPerDay: erDays.length > 0 ? erDays.reduce((s, d) => s + (d.erCases || 0), 0) / erDays.length : 0,
        totalAdmissions: emDays.reduce((s, d) => s + d.admissions, 0),
        totalDischarges: emDays.reduce((s, d) => s + d.discharges, 0),
        totalDeaths: emDays.reduce((s, d) => s + (d.deaths || 0), 0),
        totalMLC: emDays.reduce((s, d) => s + (d.mlcCases || 0), 0),
        totalCriticalAlerts: emDays.reduce((s, d) => s + (d.criticalAlerts || 0), 0),
        totalLAMA: emDays.reduce((s, d) => s + d.lamaCount, 0),
        totalIncidents: emDays.reduce((s, d) => s + d.incidentReports, 0),
        deathDays: emDays.filter(d => (d.deaths || 0) > 0).length,
        zeroERDays: emDays.filter(d => d.erCases === 0).length,
        incidentFreeDays: emDays.filter(d =>
          (d.deaths || 0) === 0 && (d.criticalAlerts || 0) === 0 &&
          d.incidentReports === 0 && d.lamaCount === 0
        ).length,
      };

      return NextResponse.json({
        slug,
        department: 'Emergency',
        summary,
        months: emMonths,
        availableMonths: sortedMonths,
        allDays: emDays,
      });
    } else if (slug === 'pharmacy') {
      const phMonths = months as PharmacyMonthSummary[];
      const phDays = allDays as PharmacyDayData[];

      const revenueDays = phDays.filter(d => d.totalRevenueToday !== null);
      const stockDays = phDays.filter(d => d.totalStockValue !== null);

      const summary = {
        totalDaysReported: phDays.length,
        dateRange: phDays.length > 0 ? { from: phDays[0].date, to: phDays[phDays.length - 1].date } : null,
        totalRevenue: revenueDays.reduce((s, d) => s + (d.totalRevenueToday || 0), 0),
        avgRevenuePerDay: revenueDays.length > 0 ? revenueDays.reduce((s, d) => s + (d.totalRevenueToday || 0), 0) / revenueDays.length : 0,
        latestMTD: phMonths.length > 0 ? phMonths[phMonths.length - 1].latestMTD : null,
        totalIPRevenue: revenueDays.reduce((s, d) => s + (d.ipRevenueToday || 0), 0),
        totalOPRevenue: revenueDays.reduce((s, d) => s + (d.opRevenueToday || 0), 0),
        avgStockValue: stockDays.length > 0 ? stockDays.reduce((s, d) => s + (d.totalStockValue || 0), 0) / stockDays.length : 0,
        stockoutDays: phDays.filter(d => d.hasStockout).length,
        expiryAlertDays: phDays.filter(d => d.hasExpiry).length,
        stockoutFreeRate: phDays.length > 0 ? ((phDays.length - phDays.filter(d => d.hasStockout).length) / phDays.length) * 100 : 100,
      };

      return NextResponse.json({
        slug,
        department: 'Pharmacy',
        summary,
        months: phMonths,
        availableMonths: sortedMonths,
        allDays: phDays,
      });
    } else if (slug === 'nursing') {
      const nursingMonths = months as NursingMonthSummary[];
      const nursingDays = allDays as NursingDayData[];

      const censusDays = nursingDays.filter(d => d.patientCensus !== null);
      const staffDays = nursingDays.filter(d => d.staffCount !== null);

      const summary = {
        totalDaysReported: nursingDays.length,
        dateRange: nursingDays.length > 0 ? { from: nursingDays[0].date, to: nursingDays[nursingDays.length - 1].date } : null,
        avgCensus: censusDays.length > 0 ? censusDays.reduce((s, d) => s + (d.patientCensus || 0), 0) / censusDays.length : 0,
        avgStaffing: staffDays.length > 0 ? staffDays.reduce((s, d) => s + (d.staffCount || 0), 0) / staffDays.length : 0,
        totalComplaintDays: nursingDays.filter(d => d.hasComplaint).length,
        totalEscalationDays: nursingDays.filter(d => d.hasEscalation).length,
        totalInfectionDays: nursingDays.filter(d => d.hasInfectionControl).length,
        totalHAIDays: nursingDays.filter(d => d.hasHAI).length,
        totalBioWasteDays: nursingDays.filter(d => d.hasBioWaste).length,
        incidentFreeDays: nursingDays.filter(d =>
          !d.hasComplaint && !d.hasEscalation && !d.hasInfectionControl && !d.hasHAI && !d.hasBioWaste
        ).length,
        incidentFreeRate: nursingDays.length > 0
          ? (nursingDays.filter(d =>
              !d.hasComplaint && !d.hasEscalation && !d.hasInfectionControl && !d.hasHAI && !d.hasBioWaste
            ).length / nursingDays.length) * 100
          : 100,
      };

      return NextResponse.json({
        slug,
        department: 'Nursing',
        summary,
        months: nursingMonths,
        availableMonths: sortedMonths,
        allDays: nursingDays,
      });
    } else if (slug === 'radiology') {
      const radiologyDays: RadiologyDayData[] = [];
      for (const row of result.rows) {
        const date = row.date;
        const entries = row.entries as Array<{ fields: Record<string, string | number> }>;
        // Merge all entries' fields (form + whatsapp)
        const mergedFields: Record<string, string | number> = {};
        for (const entry of entries) {
          if (entry.fields) {
            for (const [k, v] of Object.entries(entry.fields)) {
              if (!k.startsWith('_') && !mergedFields[k]) {
                mergedFields[k] = v;
              }
            }
          }
        }

        const dayData = extractRadiologyDay(date, mergedFields);
        radiologyDays.push(dayData);
        availableMonths.add(date.substring(0, 7));
      }

      // Group by month
      const byMonth = new Map<string, RadiologyDayData[]>();
      for (const d of radiologyDays) {
        const m = d.date.substring(0, 7);
        if (!byMonth.has(m)) byMonth.set(m, []);
        byMonth.get(m)!.push(d);
      }

      // Aggregate each month
      const radiologyMonths: RadiologyMonthSummary[] = [];
      const sortedMonths = [...availableMonths].sort();
      for (const m of sortedMonths) {
        radiologyMonths.push(aggregateRadiologyMonth(m, byMonth.get(m) || []));
      }

      const radiologyMonthsData = radiologyMonths as RadiologyMonthSummary[];
      const currentMonth = radiologyMonthsData.length > 0 ? radiologyMonthsData[radiologyMonthsData.length - 1] : null;

      const summary = {
        totalDaysReported: radiologyDays.length,
        dateRange: radiologyDays.length > 0 ? { from: radiologyDays[0].date, to: radiologyDays[radiologyDays.length - 1].date } : null,
        totalCases: radiologyDays.filter(d => d.totalCases !== null).reduce((s, d) => s + (d.totalCases || 0), 0),
        totalXrayCases: radiologyDays.filter(d => d.xrayCases !== null).reduce((s, d) => s + (d.xrayCases || 0), 0),
        totalUSGCases: radiologyDays.filter(d => d.usgCases !== null).reduce((s, d) => s + (d.usgCases || 0), 0),
        totalCTCases: radiologyDays.filter(d => d.ctCases !== null).reduce((s, d) => s + (d.ctCases || 0), 0),
        avgCasesPerDay: radiologyDays.length > 0 ? radiologyDays.filter(d => d.totalCases !== null).reduce((s, d) => s + (d.totalCases || 0), 0) / radiologyDays.filter(d => d.totalCases !== null).length : 0,
        equipmentUptimeDays: radiologyDays.filter(d => !d.hasEquipmentIssue).length,
        equipmentUptime: radiologyDays.length > 0 ? ((radiologyDays.filter(d => !d.hasEquipmentIssue).length / radiologyDays.length) * 100) : 100,
        daysWithPendingReports: radiologyDays.filter(d => d.hasPendingReports).length,
        daysWithCriticalEscalations: radiologyDays.filter(d => d.hasCriticalEscalation).length,
        incidentFreeDays: radiologyDays.filter(d => !d.hasEquipmentIssue && !d.hasPendingReports && !d.hasCriticalEscalation && d.radiationSafetyOk).length,
      };

      return NextResponse.json({
        slug,
        department: 'Radiology',
        summary,
        months: radiologyMonthsData,
        availableMonths: sortedMonths,
        allDays: radiologyDays,
      });
    } else if (slug === 'ot') {
      const otDays = allDays as OTDayData[];
      const otMonths = months as OTMonthSummary[];
      const caseDays = otDays.filter(d => d.otCases !== null);
      const summary = {
        totalDaysReported: otDays.length,
        dateRange: otDays.length > 0 ? { from: otDays[0].date, to: otDays[otDays.length - 1].date } : null,
        totalCases: caseDays.reduce((s, d) => s + (d.otCases || 0), 0),
        avgCasesPerDay: caseDays.length > 0 ? caseDays.reduce((s, d) => s + (d.otCases || 0), 0) / caseDays.length : 0,
        postponedDays: otDays.filter(d => d.casePostponed).length,
        totalEscalations: otDays.reduce((s, d) => s + (d.escalationsBySurgeon || 0), 0),
        delayDays: otDays.filter(d => d.firstCaseDelayMinutes !== null && d.firstCaseDelayMinutes > 0).length,
        avgDelayMinutes: (() => {
          const dd = otDays.filter(d => d.firstCaseDelayMinutes !== null && d.firstCaseDelayMinutes > 0);
          return dd.length > 0 ? dd.reduce((s, d) => s + (d.firstCaseDelayMinutes || 0), 0) / dd.length : 0;
        })(),
        totalConsumableTrips: otDays.reduce((s, d) => s + (d.timesLeftForConsumables || 0), 0),
        avgPlannedSurgeries: (() => {
          const pd = otDays.filter(d => d.surgeriesPlannedNextDay !== null);
          return pd.length > 0 ? pd.reduce((s, d) => s + (d.surgeriesPlannedNextDay || 0), 0) / pd.length : 0;
        })(),
      };
      return NextResponse.json({
        slug, department: 'OT', summary,
        months: otMonths, availableMonths: sortedMonths, allDays: otDays,
      });
    } else if (slug === 'hr-manpower') {
      const hrDays = allDays as HRDayData[];
      const hrMonths = months as HRMonthSummary[];
      const allJoiners: Record<string, number> = {};
      const allExits: Record<string, number> = {};
      for (const d of hrDays) {
        for (const j of d.newJoiners) { allJoiners[j] = (allJoiners[j] || 0) + 1; }
        for (const r of d.resignations) { allExits[r] = (allExits[r] || 0) + 1; }
      }
      const summary = {
        totalDaysReported: hrDays.length,
        dateRange: hrDays.length > 0 ? { from: hrDays[0].date, to: hrDays[hrDays.length - 1].date } : null,
        totalJoiners: hrDays.reduce((s, d) => s + d.joinerCount, 0),
        totalExits: hrDays.reduce((s, d) => s + d.exitCount, 0),
        netChange: hrDays.reduce((s, d) => s + d.joinerCount, 0) - hrDays.reduce((s, d) => s + d.exitCount, 0),
        joinerDays: hrDays.filter(d => d.joinerCount > 0).length,
        exitDays: hrDays.filter(d => d.exitCount > 0).length,
        joinerFrequency: allJoiners,
        exitFrequency: allExits,
      };
      return NextResponse.json({
        slug, department: 'HR & Manpower', summary,
        months: hrMonths, availableMonths: sortedMonths, allDays: hrDays,
      });
    } else if (slug === 'supply-chain') {
      const scDays = allDays as SupplyChainDayData[];
      const scMonths = months as SupplyChainMonthSummary[];
      const poDays = scDays.filter(d => d.poIssued !== null);
      const summary = {
        totalDaysReported: scDays.length,
        dateRange: scDays.length > 0 ? { from: scDays[0].date, to: scDays[scDays.length - 1].date } : null,
        totalPO: poDays.reduce((s, d) => s + (d.poIssued || 0), 0),
        totalGRN: scDays.filter(d => d.grnPrepared !== null).reduce((s, d) => s + (d.grnPrepared || 0), 0),
        avgPOPerDay: poDays.length > 0 ? poDays.reduce((s, d) => s + (d.poIssued || 0), 0) / poDays.length : 0,
        shortageDays: scDays.filter(d => d.hasShortage).length,
        escalationDays: scDays.filter(d => d.hasProcurementEscalation).length,
        highValueAlertDays: scDays.filter(d => d.hasHighValueAlert).length,
        totalEmergencyProcurements: scDays.reduce((s, d) => s + (d.emergencyProcurements || 0), 0),
        shortageFreeRate: scDays.length > 0 ? ((scDays.length - scDays.filter(d => d.hasShortage).length) / scDays.length) * 100 : 100,
      };
      return NextResponse.json({
        slug, department: 'Supply Chain', summary,
        months: scMonths, availableMonths: sortedMonths, allDays: scDays,
      });
    } else if (slug === 'facility') {
      const facDays = allDays as FacilityDayData[];
      const facMonths = months as FacilityMonthSummary[];
      const summary = {
        totalDaysReported: facDays.length,
        dateRange: facDays.length > 0 ? { from: facDays[0].date, to: facDays[facDays.length - 1].date } : null,
        safetyIssueDays: facDays.filter(d => d.hasSafetyIssue).length,
        infraIssueDays: facDays.filter(d => d.hasInfraIssue).length,
        issueFreeRate: facDays.length > 0
          ? (facDays.filter(d => !d.hasSafetyIssue && !d.hasInfraIssue).length / facDays.length) * 100 : 100,
        incidentFreeDays: facDays.filter(d => !d.hasSafetyIssue && !d.hasInfraIssue).length,
      };
      return NextResponse.json({
        slug, department: 'Facility', summary,
        months: facMonths, availableMonths: sortedMonths, allDays: facDays,
      });
    } else if (slug === 'training') {
      const trainDays = allDays as TrainingDayData[];
      const trainMonths = months as TrainingMonthSummary[];
      const withParticipants = trainDays.filter(d => d.participants !== null && d.participants > 0);
      const summary = {
        totalDaysReported: trainDays.length,
        dateRange: trainDays.length > 0 ? { from: trainDays[0].date, to: trainDays[trainDays.length - 1].date } : null,
        trainingDays: trainDays.filter(d => d.hasTraining).length,
        totalParticipants: withParticipants.reduce((s, d) => s + (d.participants || 0), 0),
        avgParticipantsPerSession: withParticipants.length > 0 ? withParticipants.reduce((s, d) => s + (d.participants || 0), 0) / withParticipants.length : 0,
        latestCompleted: (() => {
          const withMTD = trainDays.filter(d => d.mtdCompleted !== null).sort((a, b) => a.date.localeCompare(b.date));
          return withMTD.length > 0 ? withMTD[withMTD.length - 1].mtdCompleted : null;
        })(),
        latestPlanned: (() => {
          const withMTD = trainDays.filter(d => d.mtdPlanned !== null).sort((a, b) => a.date.localeCompare(b.date));
          return withMTD.length > 0 ? withMTD[withMTD.length - 1].mtdPlanned : null;
        })(),
        uniqueTopics: [...new Set(trainDays.filter(d => d.trainingTopic).map(d => d.trainingTopic!))],
      };
      return NextResponse.json({
        slug, department: 'Training', summary,
        months: trainMonths, availableMonths: sortedMonths, allDays: trainDays,
      });
    } else if (slug === 'it') {
      const itDays = allDays as ITDayData[];
      const itMonths = months as ITMonthSummary[];
      const summary = {
        totalDaysReported: itDays.length,
        dateRange: itDays.length > 0 ? { from: itDays[0].date, to: itDays[itDays.length - 1].date } : null,
        issueDays: itDays.filter(d => d.hasIntegrationIssue).length,
        issueFreeDays: itDays.filter(d => !d.hasIntegrationIssue).length,
        issueFreeRate: itDays.length > 0 ? ((itDays.filter(d => !d.hasIntegrationIssue).length) / itDays.length) * 100 : 100,
      };
      return NextResponse.json({
        slug, department: 'IT', summary,
        months: itMonths, availableMonths: sortedMonths, allDays: itDays,
      });
    } else if (slug === 'patient-safety') {
      const psDays = allDays as PatientSafetyDayData[];
      const psMonths = months as PatientSafetyMonthSummary[];
      const summary = {
        totalDaysReported: psDays.length,
        dateRange: psDays.length > 0 ? { from: psDays[0].date, to: psDays[psDays.length - 1].date } : null,
        totalFalls: psDays.reduce((s, d) => s + (d.patientFalls || 0), 0),
        totalMedErrors: psDays.reduce((s, d) => s + (d.medicationErrors || 0), 0),
        totalAdverseEvents: psDays.reduce((s, d) => s + (d.adverseEvents || 0), 0),
        totalSentinelEvents: psDays.reduce((s, d) => s + (d.sentinelEvents || 0), 0),
        totalNearMiss: psDays.reduce((s, d) => s + (d.nearMissIncidents || 0), 0),
        totalCorrectivesClosed: psDays.reduce((s, d) => s + (d.correctiveActionsClosed || 0), 0),
        incidentDays: psDays.filter(d => d.hasIncident).length,
        incidentFreeRate: psDays.length > 0 ? ((psDays.length - psDays.filter(d => d.hasIncident).length) / psDays.length) * 100 : 100,
        avgBundleCompliance: (() => {
          if (psDays.length === 0) return 100;
          const vap = psDays.filter(d => d.vapCompliance).length / psDays.length * 100;
          const clabsi = psDays.filter(d => d.clabsiCompliance).length / psDays.length * 100;
          const ssi = psDays.filter(d => d.ssiCompliance).length / psDays.length * 100;
          const cauti = psDays.filter(d => d.cautiCompliance).length / psDays.length * 100;
          return (vap + clabsi + ssi + cauti) / 4;
        })(),
        latestOpenRCAs: (() => {
          const sorted = psDays.filter(d => d.openRCAs !== null).sort((a, b) => a.date.localeCompare(b.date));
          return sorted.length > 0 ? sorted[sorted.length - 1].openRCAs : null;
        })(),
        latestOpenNabh: (() => {
          const sorted = psDays.filter(d => d.totalOpenNabh !== null).sort((a, b) => a.date.localeCompare(b.date));
          return sorted.length > 0 ? sorted[sorted.length - 1].totalOpenNabh : null;
        })(),
      };
      return NextResponse.json({
        slug, department: 'Patient Safety', summary,
        months: psMonths, availableMonths: sortedMonths, allDays: psDays,
      });
    }
  } catch (err) {
    console.error('Department overview error:', err);
    return NextResponse.json({ error: 'Failed to fetch department overview' }, { status: 500 });
  }
}
