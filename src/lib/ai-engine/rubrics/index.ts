import type { DepartmentRubric } from '../types';
import { customerCareRubric } from './customer-care';
import { emergencyRubric } from './emergency';
import { financeRubric } from './finance';
import { clinicalLabRubric } from './clinical-lab';
import { patientSafetyRubric } from './patient-safety';
import { facilityRubric } from './facility';
import { billingRubric } from './billing';
import { supplyChainRubric } from './supply-chain';
import { pharmacyRubric } from './pharmacy';
import { trainingRubric } from './training';
import { radiologyRubric } from './radiology';
import { otRubric } from './ot';
import { hrManpowerRubric } from './hr-manpower';
import { dietRubric } from './diet';
import { biomedicalRubric } from './biomedical';
import { nursingRubric } from './nursing';
import { itRubric } from './it';

/* ── Rubric Registry ─────────────────────────────────────────────── */

const RUBRICS: Record<string, DepartmentRubric> = {
  'customer-care': customerCareRubric,
  'emergency': emergencyRubric,
  'finance': financeRubric,
  'clinical-lab': clinicalLabRubric,
  'patient-safety': patientSafetyRubric,
  'facility': facilityRubric,
  'billing': billingRubric,
  'supply-chain': supplyChainRubric,
  'pharmacy': pharmacyRubric,
  'training': trainingRubric,
  'radiology': radiologyRubric,
  'ot': otRubric,
  'hr-manpower': hrManpowerRubric,
  'diet': dietRubric,
  'biomedical': biomedicalRubric,
  'nursing': nursingRubric,
  'it': itRubric,
};

export function getRubric(slug: string): DepartmentRubric | null {
  return RUBRICS[slug] ?? null;
}

export function hasRubric(slug: string): boolean {
  return slug in RUBRICS;
}

export function allRubricSlugs(): string[] {
  return Object.keys(RUBRICS);
}
