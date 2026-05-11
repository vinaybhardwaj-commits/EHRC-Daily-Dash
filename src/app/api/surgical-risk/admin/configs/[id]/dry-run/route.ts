/**
 * SPAS.2 — Dry-run for a draft config (structural diff classifier).
 *
 * POST /api/surgical-risk/admin/configs/[id]/dry-run?key=...
 *
 * IMPORTANT — partial-functionality endpoint in SPAS.2:
 *
 * Per SPAS.1 deferred-work, scoring (fallback.ts + recalculate.ts) still
 * reads weights/thresholds/factor-points/keywords/override-rules from
 * hardcoded `rubric.ts`. Only `system_prompt` and `version` are wired into
 * the live /assess request via getActiveConfig().
 *
 * So for SPAS.2 the dry-run endpoint:
 *   1. Computes a STRUCTURAL DIFF between the target draft and the active config
 *   2. Classifies each diff section into one of:
 *      - 'wired_in_spas_1' (system_prompt, version)  — diff affects live scoring
 *      - 'wired_in_spas_5' (everything else)         — diff has no live effect yet
 *   3. Returns `dry_run_supported: 'partial'` + a list of unsupported diffs
 *
 * SPAS.5 will replace this with a real dry-run that re-scores the 11 cases
 * through the proposed config (per PRD decision #5). Until then this gives
 * V honest visibility into what they're changing.
 *
 * Body (optional): { actor?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { checkAdminKey } from '@/lib/surgical-risk/admin-auth';

export const dynamic = 'force-dynamic';

function jsonErr(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

interface DryRunBody { actor?: string }

interface DiffEntry {
  field: string;
  classification: 'wired_in_spas_1' | 'wired_in_spas_5';
  description: string;
  changed: boolean;
}

const WIRED_NOW = 'wired_in_spas_1' as const;
const WIRED_LATER = 'wired_in_spas_5' as const;

function structurallyDiffers(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = checkAdminKey(req);
  if (!auth.ok) return jsonErr(auth.error || 'Unauthorized', 401);

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return jsonErr('Invalid id', 400);

  let body: DryRunBody = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  try {
    const proposedResult = await sql`SELECT * FROM srews_configs WHERE id = ${id}`;
    if (proposedResult.rows.length === 0) return jsonErr('Config not found', 404);
    const proposed = proposedResult.rows[0];

    const activeResult = await sql`SELECT * FROM srews_configs WHERE status = 'active' LIMIT 1`;
    const active = activeResult.rows[0]; // may be undefined if first-ever activation

    const diffs: DiffEntry[] = [];

    // ---- Wired by SPAS.1 (affect live /assess immediately on activation) ----
    diffs.push({
      field: 'system_prompt',
      classification: WIRED_NOW,
      description: 'LLM system prompt — takes effect on next booking after activation',
      changed: !active || structurallyDiffers(proposed.system_prompt, active.system_prompt),
    });
    diffs.push({
      field: 'version',
      classification: WIRED_NOW,
      description: 'Version stamp on new assessments (rubric_version column)',
      changed: !active || proposed.version !== active.version,
    });

    // ---- Wired by SPAS.5 (saved to DB but no live scoring effect until then) ----
    const laterFields = [
      ['composite_weights', 'Composite score weights (patient/procedure/system)'],
      ['tier_thresholds', 'GREEN/AMBER/RED/CRITICAL composite thresholds'],
      ['sub_score_cap', 'Per sub-score cap (default 10)'],
      ['divergence_threshold', 'LLM-vs-server divergence flag threshold'],
      ['patient_config', 'Age bands, comorbidity/habit point maps, transfer + complexity modifiers'],
      ['procedure_config', 'Anaesthesia/procedure-tier/urgency point maps, laterality/special-req/infection'],
      ['system_config', 'PAC status/advice points, timing gap bands, scheduling flags, info-completeness'],
      ['override_rules', 'Override rule params + forceTier + enabled (kind enum stays code-defined)'],
      ['detect_lists', 'Keyword detection lists for comorbidities/habits/anaesthesia/procedure/PAC/etc'],
    ] as const;

    for (const [field, description] of laterFields) {
      diffs.push({
        field,
        classification: WIRED_LATER,
        description,
        changed: !active || structurallyDiffers(proposed[field], active[field]),
      });
    }

    const changedDiffs = diffs.filter((d) => d.changed);
    const changedNow = changedDiffs.filter((d) => d.classification === WIRED_NOW);
    const changedLater = changedDiffs.filter((d) => d.classification === WIRED_LATER);

    // Audit (so V can trace dry-run history)
    await sql`
      INSERT INTO srews_config_audit (config_id, action, actor, from_version, to_version, diff, notes)
      VALUES (
        ${id}, 'dry_run', ${body.actor ?? 'admin'},
        ${active?.version ?? null}, ${proposed.version},
        ${JSON.stringify({ changed_fields: changedDiffs.map((d) => d.field) })}::jsonb,
        ${'SPAS.2 dry-run (structural diff only; live re-scoring deferred to SPAS.5)'}
      )
    `;

    return NextResponse.json({
      ok: true,
      proposed: { id: proposed.id, version: proposed.version, status: proposed.status },
      active: active ? { id: active.id, version: active.version } : null,
      dry_run_supported: 'partial',
      dry_run_note:
        'SPAS.2 returns a structural diff classifier only. Live re-scoring of the 11 real cases through the proposed config (per PRD decision #5) is wired in SPAS.5 along with the scoring-config refactor.',
      summary: {
        total_diffs: changedDiffs.length,
        wired_now: changedNow.length,
        wired_later_spas_5: changedLater.length,
      },
      diffs,
    });
  } catch (err) {
    return jsonErr(`Dry-run failed: ${String(err)}`, 500);
  }
}
