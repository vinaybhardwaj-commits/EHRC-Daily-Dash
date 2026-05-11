/**
 * SPAS.2 — Per-case re-assess.
 *
 * POST /api/surgical-risk/[id]/reassess?key=...&force=true|false
 *   Body (optional): { actor?: string, notes?: string }
 *
 * Re-runs the /assess pipeline on an existing booking using the CURRENT
 * active config (prompt + version per SPAS.1; scoring still hardcoded per
 * SPAS.5 backlog). Updates the same row in-place — no new row is created.
 *
 * Rate limit (PRD decision #7): 1 reassess per case per hour. Bypass with
 * `?force=true` + admin key (which we always require anyway).
 *
 * Audit row written with action='reassessed_case' and a diff blob:
 *   { assessment_id, from_tier, to_tier, from_composite, to_composite,
 *     from_rubric_version, to_rubric_version, llm_model }
 *
 * Why UPDATE in-place: V's workflow is "fix the prompt → re-run this one
 * case to see the new tier." Creating a parallel row would split the dashboard
 * view and make it hard to know which row is authoritative. The original
 * raw_form_data is preserved (immutable column for the source-of-truth).
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { llm, LLM_MODELS } from '@/lib/llm';
import { checkAdminKey } from '@/lib/surgical-risk/admin-auth';
import { SREWS_SYSTEM_PROMPT, buildUserPrompt } from '@/lib/surgical-risk/prompt';
import { getActiveConfig } from '@/lib/surgical-risk/config-store';
import { recalculateFromLLMOutput } from '@/lib/surgical-risk/recalculate';
import { computeDeterministicRisk } from '@/lib/surgical-risk/fallback';
import { RUBRIC_VERSION } from '@/lib/surgical-risk/rubric';
import type {
  RiskAssessment,
  SurgeryBookingPayload,
} from '@/lib/surgical-risk/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RATE_LIMIT_MS = 60 * 60 * 1000; // 1 hour

function jsonErr(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function parseLLMResponse(text: string): RiskAssessment | null {
  let stripped = text.trim();
  const fence = stripped.match(/^```(?:json)?\s*([\s\S]+?)\s*```$/);
  if (fence) stripped = fence[1].trim();
  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;
  try {
    return JSON.parse(stripped.slice(firstBrace, lastBrace + 1)) as RiskAssessment;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = checkAdminKey(req);
  if (!auth.ok) return jsonErr(auth.error || 'Unauthorized', 401);

  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) return jsonErr('Invalid id', 400);

  const force = req.nextUrl.searchParams.get('force') === 'true';

  let body: { actor?: string; notes?: string } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  try {
    // 1. Load existing row
    const existing = await sql`
      SELECT id, raw_form_data, risk_tier, composite_risk_score,
             rubric_version, llm_model
      FROM surgical_risk_assessments
      WHERE id = ${id}
    `;
    if (existing.rows.length === 0) return jsonErr('Assessment not found', 404);
    const original = existing.rows[0];
    const formData = original.raw_form_data as SurgeryBookingPayload;

    // 2. Rate-limit check (unless force=true)
    if (!force) {
      const lastReassess = await sql`
        SELECT created_at FROM srews_config_audit
        WHERE action = 'reassessed_case'
          AND diff->>'assessment_id' = ${String(id)}
        ORDER BY id DESC LIMIT 1
      `;
      if (lastReassess.rows.length > 0) {
        const lastTime = new Date(lastReassess.rows[0].created_at as string).getTime();
        const elapsed = Date.now() - lastTime;
        if (elapsed < RATE_LIMIT_MS) {
          const waitSec = Math.ceil((RATE_LIMIT_MS - elapsed) / 1000);
          return jsonErr(
            `Rate limited: this case was re-assessed less than 1 hour ago. Wait ${waitSec}s or pass ?force=true`,
            429,
            { last_reassess_at: lastReassess.rows[0].created_at, retry_after_s: waitSec }
          );
        }
      }
    }

    // 3. Resolve active config (prompt + version)
    const activeConfig = await getActiveConfig();
    const systemPrompt = activeConfig?.system_prompt ?? SREWS_SYSTEM_PROMPT;
    const rubricVersion = activeConfig?.version ?? RUBRIC_VERSION;

    // 4. Re-run scoring (mirrors /assess flow)
    let assessment: RiskAssessment;
    let llmModel = LLM_MODELS.PRIMARY as string;
    let llmLatencyMs: number | null = null;
    let divergenceFlagged = false;

    const client = llm();
    if (!client) {
      assessment = computeDeterministicRisk(formData);
      llmModel = 'fallback-no-tunnel';
    } else {
      try {
        const t0 = Date.now();
        const completion = await client.chat.completions.create({
          model: LLM_MODELS.PRIMARY,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: buildUserPrompt(formData) },
          ],
          temperature: 0.2,
          max_tokens: 1500,
        });
        llmLatencyMs = Date.now() - t0;
        const text = completion.choices[0]?.message?.content || '';
        const parsed = parseLLMResponse(text);
        if (!parsed) {
          assessment = computeDeterministicRisk(formData);
          llmModel = 'fallback-parse-error';
        } else {
          const recalc = recalculateFromLLMOutput(parsed, formData);
          assessment = recalc.assessment;
          divergenceFlagged = recalc.divergence.flagged;
        }
      } catch (llmErr) {
        console.warn('[srews/reassess] LLM call failed', { id, error: String(llmErr) });
        assessment = computeDeterministicRisk(formData);
        llmModel = 'fallback-llm-error';
      }
    }

    // 5. UPDATE the existing row (preserve raw_form_data + reviewed fields)
    const updated = await sql`
      UPDATE surgical_risk_assessments
      SET
        patient_risk_score = ${assessment.patient_risk.score},
        procedure_risk_score = ${assessment.procedure_risk.score},
        system_risk_score = ${assessment.system_risk.score},
        composite_risk_score = ${assessment.composite.score},
        risk_tier = ${assessment.composite.tier},
        assessment_json = ${JSON.stringify(assessment)}::jsonb,
        llm_model = ${llmModel},
        llm_latency_ms = ${llmLatencyMs},
        llm_divergence_logged = ${divergenceFlagged},
        rubric_version = ${rubricVersion}
      WHERE id = ${id}
      RETURNING id, risk_tier, composite_risk_score, rubric_version
    `;
    const u = updated.rows[0];

    // 6. Audit
    const diff = {
      assessment_id: id,
      from_tier: original.risk_tier,
      to_tier: u.risk_tier,
      from_composite: Number(original.composite_risk_score),
      to_composite: Number(u.composite_risk_score),
      from_rubric_version: original.rubric_version,
      to_rubric_version: u.rubric_version,
      llm_model: llmModel,
      llm_latency_ms: llmLatencyMs,
      divergence_flagged: divergenceFlagged,
      force: !!force,
    };
    await sql`
      INSERT INTO srews_config_audit (
        config_id, action, actor, from_version, to_version, diff, notes
      ) VALUES (
        ${activeConfig?.id ?? null}, 'reassessed_case',
        ${body.actor ?? 'admin'},
        ${original.rubric_version}, ${rubricVersion},
        ${JSON.stringify(diff)}::jsonb,
        ${body.notes ?? `Re-assessed via ${force ? 'forced ' : ''}admin reassess endpoint`}
      )
    `;

    return NextResponse.json({
      ok: true,
      reassessment: {
        id: u.id,
        from_tier: original.risk_tier,
        to_tier: u.risk_tier,
        from_composite: Number(original.composite_risk_score),
        to_composite: Number(u.composite_risk_score),
        tier_changed: original.risk_tier !== u.risk_tier,
        llm_model: llmModel,
        llm_latency_ms: llmLatencyMs,
        divergence_flagged: divergenceFlagged,
        rubric_version: u.rubric_version,
      },
    });
  } catch (err) {
    return jsonErr(`Re-assess failed: ${String(err)}`, 500);
  }
}
