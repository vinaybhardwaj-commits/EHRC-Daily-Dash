import type { DepartmentRubric } from '../types';
import { customerCareRubric } from './customer-care';
import { emergencyRubric } from './emergency';
import { financeRubric } from './finance';
import { clinicalLabRubric } from './clinical-lab';
import { patientSafetyRubric } from './patient-safety';
import { facilityRubric } from './facility';

/* ── Rubric Registry ─────────────────────────────────────────────── */

const RUBRICS: Record<string, DepartmentRubric> = {
  'customer-care': customerCareRubric,
  'emergency': emergencyRubric,
  'finance': financeRubric,
  'clinical-lab': clinicalLabRubric,
  'patient-safety': patientSafetyRubric,
  'facility': facilityRubric,
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
