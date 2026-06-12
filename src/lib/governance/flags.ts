// src/lib/governance/flags.ts
// GV module feature flag. Default OFF — with the flag unset, every GV surface
// is inert and the app is byte-identical to pre-GV behaviour.

export function govEnabled(): boolean {
  return process.env.GOV_QUESTIONS_ENABLED === '1';
}
