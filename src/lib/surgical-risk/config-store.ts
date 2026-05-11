/**
 * SPAS — Active SREWS config loader.
 *
 * Reads the currently-active srews_configs row from Postgres on demand and
 * caches it in-memory for a short TTL. On cold start or after invalidation,
 * the next call refreshes from DB. On DB failure (table missing, network),
 * returns null so callers can fall back to the hardcoded rubric.ts + prompt.ts
 * values — the system never breaks because of an admin-DB outage.
 *
 * SPAS sprint coverage:
 *   SPAS.1 (this sprint) — exposes getActiveConfig(); assess/route.ts wires
 *     `config.system_prompt` + `config.version` (rubric_version stamping)
 *     into the LLM request + DB INSERT.
 *   SPAS.2 — admin save/activate endpoints will call invalidateConfigCache()
 *     after activating a new config so the next assess request picks it up
 *     immediately (instead of waiting for the 60s TTL).
 *   SPAS.5 — fallback.ts + recalculate.ts will be refactored to source
 *     weights/thresholds/factor-points/keywords/override-rules from the active
 *     config. Until then, those values come from rubric.ts as before.
 *
 * Cache strategy: per-instance (each serverless invocation has its own cache).
 * TTL is 60s, refreshed lazily on next call after expiry. This is fine for v1
 * because:
 *   - V edits are infrequent (handful per week, not per minute)
 *   - SPAS.2's activate endpoint will call invalidateConfigCache() directly,
 *     bypassing the TTL on the same instance
 *   - On other instances, worst-case staleness is 60s — acceptable for the
 *     hospital workflow (a new booking submitted within 60s of an activation
 *     might use the old prompt; subsequent ones use the new prompt)
 */

import { sql } from '@vercel/postgres';
import type { SrewsConfig } from './config-types';

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  config: SrewsConfig | null;
  fetched_at: number;
}

let cache: CacheEntry | null = null;

/**
 * Force-refresh on next call. Call this after admin save/activate so the next
 * /assess request picks up the new config without waiting for TTL expiry.
 */
export function invalidateConfigCache(): void {
  cache = null;
}

/**
 * Read the currently-active srews_configs row from DB.
 *
 * Returns:
 *   - SrewsConfig if a row with status='active' exists and parses cleanly
 *   - null if no active row exists OR a DB error occurred
 *
 * Callers MUST handle null by falling back to hardcoded rubric/prompt values.
 *
 * Cached for CACHE_TTL_MS per serverless instance. Set bypassCache=true to
 * skip the cache (used by admin endpoints that need a fresh read after writes).
 */
export async function getActiveConfig(
  options: { bypassCache?: boolean } = {}
): Promise<SrewsConfig | null> {
  const now = Date.now();
  if (
    !options.bypassCache &&
    cache &&
    now - cache.fetched_at < CACHE_TTL_MS
  ) {
    return cache.config;
  }

  let config: SrewsConfig | null = null;
  try {
    const result = await sql<RawRow>`
      SELECT
        id, version, status, system_prompt,
        composite_weights, tier_thresholds,
        sub_score_cap, divergence_threshold,
        patient_config, procedure_config, system_config,
        override_rules, detect_lists,
        changelog, created_by, created_at,
        activated_at, activated_by, archived_at
      FROM srews_configs
      WHERE status = 'active'
      LIMIT 1
    `;
    if (result.rows.length > 0) {
      config = rowToConfig(result.rows[0]);
    }
  } catch (err) {
    // Table-missing during SPAS.0 migration window, or transient DB error.
    // Log + return null so caller falls back to hardcoded values.
    console.warn('[config-store] getActiveConfig failed, falling back to null:', err);
    config = null;
  }

  cache = { config, fetched_at: now };
  return config;
}

// ─────────────────────────────────────────────────────────────────────────
// Internal: Row → typed SrewsConfig
// ─────────────────────────────────────────────────────────────────────────

/**
 * @vercel/postgres returns numeric columns as strings (postgres standard).
 * We coerce sub_score_cap + divergence_threshold to numbers here.
 * jsonb columns come back already-parsed as objects.
 */
interface RawRow {
  id: string | number;
  version: string;
  status: SrewsConfig['status'];
  system_prompt: string;
  composite_weights: SrewsConfig['composite_weights'];
  tier_thresholds: SrewsConfig['tier_thresholds'];
  sub_score_cap: string | number;
  divergence_threshold: string | number;
  patient_config: SrewsConfig['patient_config'];
  procedure_config: SrewsConfig['procedure_config'];
  system_config: SrewsConfig['system_config'];
  override_rules: SrewsConfig['override_rules'];
  detect_lists: SrewsConfig['detect_lists'];
  changelog: string | null;
  created_by: string | null;
  created_at: string;
  activated_at: string | null;
  activated_by: string | null;
  archived_at: string | null;
}

function rowToConfig(r: RawRow): SrewsConfig {
  return {
    id: typeof r.id === 'string' ? parseInt(r.id, 10) : r.id,
    version: r.version,
    status: r.status,
    system_prompt: r.system_prompt,
    composite_weights: r.composite_weights,
    tier_thresholds: r.tier_thresholds,
    sub_score_cap: typeof r.sub_score_cap === 'string' ? parseFloat(r.sub_score_cap) : r.sub_score_cap,
    divergence_threshold:
      typeof r.divergence_threshold === 'string'
        ? parseFloat(r.divergence_threshold)
        : r.divergence_threshold,
    patient_config: r.patient_config,
    procedure_config: r.procedure_config,
    system_config: r.system_config,
    override_rules: r.override_rules,
    detect_lists: r.detect_lists,
    changelog: r.changelog,
    created_by: r.created_by,
    created_at: r.created_at,
    activated_at: r.activated_at,
    activated_by: r.activated_by,
    archived_at: r.archived_at,
  };
}
