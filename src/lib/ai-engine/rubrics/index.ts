import type { DepartmentRubric } from '../types';
import { customerCareRubric } from './customer-care';

/* ── Rubric Registry ─────────────────────────────────────────────── */

const RUBRICS: Record<string, DepartmentRubric> = {
  'customer-care': customerCareRubric,
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
