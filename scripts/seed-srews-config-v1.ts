/**
 * SPAS.0 — idempotent seed of srews_configs v1.0.
 *
 * Reads the live values from rubric.ts + prompt.ts (single source of truth)
 * and inserts them as version='1.0', status='active' if no active config exists.
 *
 * If an active config is already present, exits 0 with status='already_present'.
 *
 * Usage:
 *   POSTGRES_URL=postgres://... npx tsx scripts/seed-srews-config-v1.ts
 *
 * Safe to re-run.
 */

import { createClient } from '@vercel/postgres';
import {
  COMPOSITE_WEIGHTS,
  TIER_THRESHOLDS,
  AGE_POINTS,
  COMORBIDITY_POINTS,
  NON_STANDARD_COMORBIDITY_POINTS,
  COMORBIDITY_DETECT,
  HABIT_POINTS,
  HABIT_DETECT,
  TRANSFER_PATIENT_POINTS,
  COMPLEXITY_MULTIPLIER_THRESHOLD,
  COMPLEXITY_MULTIPLIER_POINTS,
  ANAESTHESIA_POINTS,
  ANAESTHESIA_DETECT,
  PROCEDURE_TIERS,
  PROCEDURE_COMPLEXITY_DETECT,
  NON_SURGICAL_DETECT,
  URGENCY_POINTS,
  URGENCY_DETECT,
  LATERALITY_BILATERAL_POINTS,
  SPECIAL_REQUIREMENT_POINTS,
  SPECIAL_REQUIREMENT_DETECT,
  INFECTION_POINTS,
  INFECTION_KEYWORDS,
  PAC_STATUS_POINTS,
  PAC_STATUS_DETECT,
  PAC_ADVICE_POINTS,
  PAC_ADVICE_DETECT,
  SCHEDULING_FLAG_DETECT,
  INFO_COMPLETENESS,
  TRANSFER_LOGISTICS_POINTS,
  SUB_SCORE_CAP,
  OVERRIDE_RULES,
  RUBRIC_VERSION,
} from '../src/lib/surgical-risk/rubric';
import { SREWS_SYSTEM_PROMPT } from '../src/lib/surgical-risk/prompt';

// Age bands — extracted as data since rubric.ts encodes them as an if-chain
const AGE_BANDS = [
  { min: null, max: 39, points: 0, label: '<40' },
  { min: 40, max: 64, points: 1, label: '40-64' },
  { min: 65, max: 74, points: 2, label: '65-74' },
  { min: 75, max: null, points: 3, label: '>=75' },
];

// Timing gap bands — same extraction
const TIMING_GAP_BANDS = [
  { min_hours: 12, max_hours: null, points: 0, label: '>=12h' },
  { min_hours: 4, max_hours: 12, points: 1, label: '4-12h' },
  { min_hours: 0.01, max_hours: 4, points: 2, label: '<4h' },
  { min_hours: null, max_hours: 0, points: 3, label: 'same-day or negative / unclear' },
];

// Override rules → kind+params shape (v1 limitation: 6 known kinds, see config-types.ts)
const OVERRIDE_RULES_CONFIG = [
  {
    id: 'sub_score_max_5',
    enabled: true,
    kind: 'sub_score_threshold' as const,
    params: { threshold: 5 },
    forceTier: 'AMBER' as const,
    description: 'Any single sub-score >= 5 forces minimum tier of AMBER',
  },
  {
    id: 'age_75_with_ga',
    enabled: true,
    kind: 'age_and_anaesthesia' as const,
    params: { min_age: 75, anaesthesia_pattern: '\\bg\\s*a\\b|general anaesth|general anesth' },
    forceTier: 'RED' as const,
    description: 'Patient age >= 75 with GA forces RED',
  },
  {
    id: 'infection_with_ga',
    enabled: true,
    kind: 'infection_and_anaesthesia' as const,
    params: { anaesthesia_pattern: '\\bg\\s*a\\b|general anaesth|general anesth' },
    forceTier: 'RED' as const,
    description: 'Active infection (per keyword scan) with GA forces RED',
  },
  {
    id: 'blood_thinners_with_major_complex',
    enabled: true,
    kind: 'comorbidity_and_procedure_tier' as const,
    params: {
      comorbidity_pattern: 'blood thinner|anti coag|anticoag|anti platelet|antiplatelet',
      min_procedure_score: 3,
    },
    forceTier: 'RED' as const,
    description: 'Blood thinners present with Major or Complex procedure forces RED',
  },
  {
    id: 'urgent_with_pac_pending',
    enabled: true,
    kind: 'urgency_and_pac_pending' as const,
    params: {
      urgency_pattern: 'urgent|immediate',
      pac_status_pending_pattern: 'will do',
    },
    forceTier: 'CRITICAL' as const,
    description: 'Urgent/Immediate urgency with PAC not yet done forces CRITICAL',
  },
  {
    id: 'sub_score_max_10',
    enabled: true,
    kind: 'sub_score_exact' as const,
    params: { value: 10 },
    forceTier: 'CRITICAL' as const,
    description: 'Any single sub-score at maximum (10) forces CRITICAL',
  },
];

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error('FATAL: POSTGRES_URL not set');
    process.exit(1);
  }
  const client = createClient({ connectionString: url });
  await client.connect();

  try {
    // Idempotency check
    const existing = await client.sql`
      SELECT id, version, status FROM srews_configs WHERE status = 'active'
    `;
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      console.log(JSON.stringify({
        ok: true,
        status: 'already_present',
        active_config: { id: row.id, version: row.version },
      }, null, 2));
      return;
    }

    // Compose JSONB blobs
    const compositeWeights = COMPOSITE_WEIGHTS;
    const tierThresholds = TIER_THRESHOLDS;

    const patientConfig = {
      age_bands: AGE_BANDS,
      comorbidity_points: COMORBIDITY_POINTS,
      non_standard_comorbidity_points: NON_STANDARD_COMORBIDITY_POINTS,
      habit_points: HABIT_POINTS,
      transfer_patient_points: TRANSFER_PATIENT_POINTS,
      complexity_multiplier_threshold: COMPLEXITY_MULTIPLIER_THRESHOLD,
      complexity_multiplier_points: COMPLEXITY_MULTIPLIER_POINTS,
    };

    const procedureConfig = {
      anaesthesia_points: ANAESTHESIA_POINTS,
      procedure_tier_points: PROCEDURE_TIERS,
      urgency_points: URGENCY_POINTS,
      laterality_bilateral_points: LATERALITY_BILATERAL_POINTS,
      special_requirement_points: SPECIAL_REQUIREMENT_POINTS,
      infection_points: INFECTION_POINTS,
    };

    const systemConfig = {
      pac_status_points: PAC_STATUS_POINTS,
      pac_advice_points: PAC_ADVICE_POINTS,
      timing_gap_bands: TIMING_GAP_BANDS,
      scheduling_flags: SCHEDULING_FLAG_DETECT,
      info_completeness: INFO_COMPLETENESS,
      transfer_logistics_points: TRANSFER_LOGISTICS_POINTS,
    };

    const detectLists = {
      comorbidity_detect: COMORBIDITY_DETECT,
      habit_detect: HABIT_DETECT,
      anaesthesia_detect: ANAESTHESIA_DETECT,
      procedure_complexity_detect: PROCEDURE_COMPLEXITY_DETECT,
      non_surgical_detect: NON_SURGICAL_DETECT,
      urgency_detect: URGENCY_DETECT,
      special_requirement_detect: SPECIAL_REQUIREMENT_DETECT,
      infection_keywords: INFECTION_KEYWORDS,
      pac_status_detect: PAC_STATUS_DETECT,
      pac_advice_detect: PAC_ADVICE_DETECT,
    };

    const insertResult = await client.sql`
      INSERT INTO srews_configs (
        version, status, system_prompt,
        composite_weights, tier_thresholds,
        sub_score_cap, divergence_threshold,
        patient_config, procedure_config, system_config,
        override_rules, detect_lists,
        changelog, created_by, activated_at, activated_by
      ) VALUES (
        ${RUBRIC_VERSION}, 'active', ${SREWS_SYSTEM_PROMPT},
        ${JSON.stringify(compositeWeights)}::jsonb,
        ${JSON.stringify(tierThresholds)}::jsonb,
        ${SUB_SCORE_CAP}, 2.0,
        ${JSON.stringify(patientConfig)}::jsonb,
        ${JSON.stringify(procedureConfig)}::jsonb,
        ${JSON.stringify(systemConfig)}::jsonb,
        ${JSON.stringify(OVERRIDE_RULES_CONFIG)}::jsonb,
        ${JSON.stringify(detectLists)}::jsonb,
        'Initial seed from hardcoded rubric.ts + prompt.ts (SPAS.0).',
        'system-seed', NOW(), 'system-seed'
      )
      RETURNING id, version
    `;
    const seeded = insertResult.rows[0];

    // Audit row
    await client.sql`
      INSERT INTO srews_config_audit (config_id, action, actor, to_version, notes)
      VALUES (${seeded.id}, 'created', 'system-seed', ${seeded.version}, 'SPAS.0 initial seed')
    `;
    await client.sql`
      INSERT INTO srews_config_audit (config_id, action, actor, to_version, notes)
      VALUES (${seeded.id}, 'activated', 'system-seed', ${seeded.version}, 'SPAS.0 initial seed — auto-activated')
    `;

    console.log(JSON.stringify({
      ok: true,
      status: 'seeded',
      config: { id: seeded.id, version: seeded.version },
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('SEED FAILED:', err);
  process.exit(1);
});
