/**
 * SPAS.2 — Admin configs list + save-draft endpoints.
 *
 * GET  /api/surgical-risk/admin/configs?key=...&status=...
 *   List configs (default order: active first, then drafts by created_at DESC,
 *   then archived by archived_at DESC, limited to 100).
 *   Optional ?status=active|draft|archived filter.
 *
 * POST /api/surgical-risk/admin/configs?key=...
 *   Body: { from_config_id?: number, version?: string, system_prompt?: string,
 *           composite_weights?, tier_thresholds?, sub_score_cap?,
 *           divergence_threshold?, patient_config?, procedure_config?,
 *           system_config?, override_rules?, detect_lists?, changelog?, created_by? }
 *   Creates a new srews_configs row with status='draft'.
 *   If from_config_id provided, clones that config's values and applies the
 *   request-body overrides. Otherwise clones the currently-active config.
 *   Auto-versions to next minor (e.g. 1.0 → 1.1) unless explicit `version` given.
 *   Inserts audit row action='created'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { checkAdminKey } from '@/lib/surgical-risk/admin-auth';
import type { SrewsConfig, ConfigStatus } from '@/lib/surgical-risk/config-types';

export const dynamic = 'force-dynamic';

function jsonErr(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

// ─────────────────────────────────────────────────────────────────────────
// GET — list configs
// ─────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = checkAdminKey(req);
  if (!auth.ok) return jsonErr(auth.error || 'Unauthorized', 401);

  const status = req.nextUrl.searchParams.get('status') as ConfigStatus | null;

  try {
    const result = status
      ? await sql`
          SELECT id, version, status, length(system_prompt) AS prompt_chars,
                 changelog, created_by, created_at, activated_at, activated_by, archived_at,
                 jsonb_array_length(override_rules) AS override_rule_count
          FROM srews_configs
          WHERE status = ${status}
          ORDER BY
            CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
            COALESCE(activated_at, created_at) DESC
          LIMIT 100
        `
      : await sql`
          SELECT id, version, status, length(system_prompt) AS prompt_chars,
                 changelog, created_by, created_at, activated_at, activated_by, archived_at,
                 jsonb_array_length(override_rules) AS override_rule_count
          FROM srews_configs
          ORDER BY
            CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
            COALESCE(activated_at, created_at) DESC
          LIMIT 100
        `;
    return NextResponse.json({ ok: true, configs: result.rows });
  } catch (err) {
    return jsonErr(`Query failed: ${String(err)}`, 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// POST — save draft (clone from active or from_config_id, apply overrides)
// ─────────────────────────────────────────────────────────────────────────

interface DraftBody {
  from_config_id?: number;
  version?: string;
  system_prompt?: string;
  composite_weights?: SrewsConfig['composite_weights'];
  tier_thresholds?: SrewsConfig['tier_thresholds'];
  sub_score_cap?: number;
  divergence_threshold?: number;
  patient_config?: SrewsConfig['patient_config'];
  procedure_config?: SrewsConfig['procedure_config'];
  system_config?: SrewsConfig['system_config'];
  override_rules?: SrewsConfig['override_rules'];
  detect_lists?: SrewsConfig['detect_lists'];
  changelog?: string;
  created_by?: string;
}

export async function POST(req: NextRequest) {
  const auth = checkAdminKey(req);
  if (!auth.ok) return jsonErr(auth.error || 'Unauthorized', 401);

  let body: DraftBody;
  try {
    body = await req.json();
  } catch {
    return jsonErr('Invalid JSON body', 400);
  }

  try {
    // 1. Resolve source config (from_config_id, or fallback to active)
    const sourceResult = body.from_config_id
      ? await sql`SELECT * FROM srews_configs WHERE id = ${body.from_config_id}`
      : await sql`SELECT * FROM srews_configs WHERE status = 'active' LIMIT 1`;

    if (sourceResult.rows.length === 0) {
      return jsonErr(
        body.from_config_id
          ? `Source config id=${body.from_config_id} not found`
          : 'No active config to clone — provide from_config_id explicitly',
        404
      );
    }
    const source = sourceResult.rows[0];

    // 2. Compute next version
    let nextVersion = body.version;
    if (!nextVersion) {
      // Increment the minor part of the source version: 1.0 → 1.1, 1.5 → 1.6, 2.0 → 2.1
      const parsed = String(source.version).match(/^(\d+)\.(\d+)/);
      if (parsed) {
        const major = parseInt(parsed[1], 10);
        const minor = parseInt(parsed[2], 10);
        nextVersion = `${major}.${minor + 1}`;
      } else {
        nextVersion = `${source.version}-draft-${Date.now()}`;
      }
      // Ensure uniqueness — if version already exists, append a suffix
      const collision = await sql`SELECT id FROM srews_configs WHERE version = ${nextVersion}`;
      if (collision.rows.length > 0) {
        nextVersion = `${nextVersion}-${Date.now()}`;
      }
    } else {
      const collision = await sql`SELECT id FROM srews_configs WHERE version = ${nextVersion}`;
      if (collision.rows.length > 0) {
        return jsonErr(`version '${nextVersion}' already exists`, 409);
      }
    }

    // 3. Merge: source values, request-body overrides
    const merged = {
      system_prompt: body.system_prompt ?? source.system_prompt,
      composite_weights: body.composite_weights ?? source.composite_weights,
      tier_thresholds: body.tier_thresholds ?? source.tier_thresholds,
      sub_score_cap:
        body.sub_score_cap ?? Number(source.sub_score_cap),
      divergence_threshold:
        body.divergence_threshold ?? Number(source.divergence_threshold),
      patient_config: body.patient_config ?? source.patient_config,
      procedure_config: body.procedure_config ?? source.procedure_config,
      system_config: body.system_config ?? source.system_config,
      override_rules: body.override_rules ?? source.override_rules,
      detect_lists: body.detect_lists ?? source.detect_lists,
    };

    // 4. INSERT draft
    const inserted = await sql`
      INSERT INTO srews_configs (
        version, status, system_prompt,
        composite_weights, tier_thresholds,
        sub_score_cap, divergence_threshold,
        patient_config, procedure_config, system_config,
        override_rules, detect_lists,
        changelog, created_by
      ) VALUES (
        ${nextVersion}, 'draft', ${merged.system_prompt},
        ${JSON.stringify(merged.composite_weights)}::jsonb,
        ${JSON.stringify(merged.tier_thresholds)}::jsonb,
        ${merged.sub_score_cap}, ${merged.divergence_threshold},
        ${JSON.stringify(merged.patient_config)}::jsonb,
        ${JSON.stringify(merged.procedure_config)}::jsonb,
        ${JSON.stringify(merged.system_config)}::jsonb,
        ${JSON.stringify(merged.override_rules)}::jsonb,
        ${JSON.stringify(merged.detect_lists)}::jsonb,
        ${body.changelog ?? null}, ${body.created_by ?? 'admin'}
      )
      RETURNING id, version, status, created_at
    `;
    const newRow = inserted.rows[0];

    // 5. Audit
    await sql`
      INSERT INTO srews_config_audit (config_id, action, actor, from_version, to_version, notes)
      VALUES (${newRow.id}, 'created', ${body.created_by ?? 'admin'},
              ${source.version}, ${nextVersion},
              ${`Draft cloned from config id=${source.id} (v${source.version}); changelog: ${body.changelog ?? '(none)'}`})
    `;

    return NextResponse.json(
      {
        ok: true,
        config: newRow,
        cloned_from: { id: source.id, version: source.version },
      },
      { status: 201 }
    );
  } catch (err) {
    return jsonErr(`Save draft failed: ${String(err)}`, 500);
  }
}
