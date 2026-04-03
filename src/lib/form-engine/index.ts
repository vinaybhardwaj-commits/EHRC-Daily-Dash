// src/lib/form-engine/index.ts — Barrel export

export * from './types';
export { evaluateRule, isFieldVisible, isFieldRequired } from './condition-evaluator';
export { resolvePipes, resolvePipesInField, hasPipeTokens, parsePipeTokens } from './pipe-resolver';
export { adaptLegacyForm, adaptAllLegacyForms } from './legacy-adapter';
export { getFormConfig, getAllFormConfigs, getAllFormSlugs, registerSmartForm, isLegacyForm } from './registry';
