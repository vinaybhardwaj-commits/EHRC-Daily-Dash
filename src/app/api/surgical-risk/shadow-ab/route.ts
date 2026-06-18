/* ──────────────────────────────────────────────────────────────────
   G.2 — SREWS shadow A/B (READ-ONLY, never writes).
   Re-scores already-assessed past bookings with Gemini 2.5-PRO (forced,
   regardless of the GEMINI_REASONING flag) and compares Pro's risk tier to
   the stored tier (from qwen). Lets V judge scoring parity before any cutover.

   GET /api/surgical-risk/shadow-ab?n=5&offset=0   (bearer-gated)
   Small n per call (Pro is slow); page with offset and accumulate.
   ────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { SREWS_SYSTEM_PROMPT, buildUserPrompt } from '@/lib/surgical-risk/prompt';
import { getActiveConfig } from '@/lib/surgical-risk/config-store';
import { buildRuntimeRubric } from '@/lib/surgical-risk/runtime-rubric';
import { recalculateFromLLMOutput } from '@/lib/surgical-risk/recalculate';
import type { RiskAssessment, SurgeryBookingPayload } from '@/lib/surgical-risk/types';
import { getGeminiChatClient, vertexModelName, GEMINI_MODEL, geminiConfigured } from '@/lib/llm';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TIER_RANK: Record<string, number> = { GREEN: 0, AMBER: 1, RED: 2, CRITICAL: 3 };

// Replicated from the assess route (its parseLLMResponse is module-local).
function parseLLMResponse(text: string): RiskAssessment | null {
  let stripped = text.trim();
  const fence = stripped.match(/^```(?:json)?\s*([\s\S]+?)\s*```$/);
  if (fence) stripped = fence[1].trim();
  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) stripped = stripped.slice(firstBrace, lastBrace + 1);
  try {
    const parsed = JSON.parse(stripped);
    if (parsed && typeof parsed === 'object' && parsed.patient_risk && parsed.procedure_risk && parsed.system_risk && parsed.composite) {
      return parsed as RiskAssessment;
    }
    return null;
  } catch {
    return null;
  }
}

interface RowResult {
  id: number;
  stored_tier: string;
  pro_tier: string | null;
  agree: boolean;
  direction: 'same' | 'safer' | 'less_safe' | 'na';
  note?: string;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!geminiConfigured()) return NextResponse.json({ error: 'gemini not configured' }, { status: 503 });

  const url = new URL(req.url);
  const n = Math.min(Math.max(Number(url.searchParams.get('n')) || 5, 1), 8);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  // ── Detail mode: ?ids=186,159 → side-by-side qwen (stored) vs Pro sub-scores
  //    + booking context, so a clinician can see WHAT Pro discounted. ──────────
  const idsParam = (url.searchParams.get('ids') || '').trim();
  if (idsParam) {
    const ids = idsParam.split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s)).slice(0, 8);
    if (!ids.length) return NextResponse.json({ error: 'no valid ids' }, { status: 400 });

    const stored = (await sql.query(
      `SELECT id, risk_tier, composite_risk_score, assessment_json, raw_form_data
       FROM surgical_risk_assessments WHERE id = ANY(string_to_array($1, ',')::int[])`,
      [ids.join(',')],
    )).rows;

    const dConfig = await getActiveConfig();
    const dSystemPrompt = dConfig?.system_prompt ?? SREWS_SYSTEM_PROMPT;
    const dRubric = buildRuntimeRubric(dConfig);

    const proAssess = async (body: SurgeryBookingPayload): Promise<RiskAssessment | null> => {
      const client = await getGeminiChatClient();
      const completion = await client.chat.completions.create({
        model: vertexModelName(GEMINI_MODEL),
        messages: [{ role: 'system', content: dSystemPrompt }, { role: 'user', content: buildUserPrompt(body) }],
        temperature: 0.2,
        max_tokens: 1500 + 8192,
      });
      const parsed = parseLLMResponse(completion.choices[0]?.message?.content || '');
      return parsed ? recalculateFromLLMOutput(parsed, body, dRubric).assessment : null;
    };

    const view = (a: RiskAssessment | null) => a ? {
      tier: a.composite.tier,
      composite: a.composite.score,
      override_applied: a.composite.override_applied,
      override_reason: a.composite.override_reason,
      patient_risk: a.patient_risk,
      procedure_risk: a.procedure_risk,
      system_risk: a.system_risk,
      summary: a.summary,
      recommended_actions: a.recommended_actions,
    } : null;

    const cases = await Promise.all(stored.map(async row => {
      const body = row.raw_form_data as SurgeryBookingPayload;
      let pro: RiskAssessment | null = null;
      try { pro = await proAssess(body); } catch { pro = null; }
      return {
        id: Number(row.id),
        booking: {
          age: body.age ?? null, sex: body.sex ?? null,
          procedure: body.proposed_procedure ?? null, specialty: body.surgical_specialty ?? null,
          urgency: body.urgency ?? null, anaesthesia: body.anaesthesia ?? null,
          comorbidities: body.comorbidities ?? null, habits: body.habits ?? null,
          pac_status: body.pac_status ?? null, clinical_justification: body.clinical_justification ?? null,
        },
        qwen: view(row.assessment_json as RiskAssessment),
        pro: view(pro),
      };
    }));

    return NextResponse.json({ mode: 'detail', model: GEMINI_MODEL, cases });
  }

  // Population by stored tier (so we know how many RED/CRITICAL exist to test).
  const population = (await sql`
    SELECT risk_tier, COUNT(*)::int AS n
    FROM surgical_risk_assessments
    WHERE raw_form_data IS NOT NULL AND removed_at IS NULL
      AND (llm_model IS NULL OR llm_model NOT LIKE 'fallback%')
    GROUP BY risk_tier
  `).rows;

  // Genuine qwen-scored rows, most recent first. Optional ?tier=RED,CRITICAL
  // targets specific stored tiers (string_to_array keeps params Primitive-typed).
  const tierParam = (url.searchParams.get('tier') || '').trim().toUpperCase();
  const rows = tierParam
    ? (await sql.query(
        `SELECT id, risk_tier, llm_model, raw_form_data
         FROM surgical_risk_assessments
         WHERE raw_form_data IS NOT NULL AND removed_at IS NULL
           AND (llm_model IS NULL OR llm_model NOT LIKE 'fallback%')
           AND risk_tier = ANY(string_to_array($1, ','))
         ORDER BY submission_timestamp DESC LIMIT $2 OFFSET $3`,
        [tierParam, n, offset],
      )).rows
    : (await sql`
        SELECT id, risk_tier, llm_model, raw_form_data
        FROM surgical_risk_assessments
        WHERE raw_form_data IS NOT NULL AND removed_at IS NULL
          AND (llm_model IS NULL OR llm_model NOT LIKE 'fallback%')
        ORDER BY submission_timestamp DESC
        LIMIT ${n} OFFSET ${offset}
      `).rows;

  const config = await getActiveConfig();
  const systemPrompt = config?.system_prompt ?? SREWS_SYSTEM_PROMPT;
  const runtimeRubric = buildRuntimeRubric(config);

  async function scoreRow(row: Record<string, unknown>): Promise<RowResult> {
    const id = Number(row.id);
    const stored_tier = String(row.risk_tier ?? '');
    try {
      const body = row.raw_form_data as SurgeryBookingPayload;
      const client = await getGeminiChatClient();
      const completion = await client.chat.completions.create({
        model: vertexModelName(GEMINI_MODEL),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: buildUserPrompt(body) },
        ],
        temperature: 0.2,
        max_tokens: 1500 + 8192, // pad for 2.5-pro thinking tokens
      });
      const parsed = parseLLMResponse(completion.choices[0]?.message?.content || '');
      if (!parsed) return { id, stored_tier, pro_tier: null, agree: false, direction: 'na', note: 'pro_parse_fail' };
      const pro_tier = recalculateFromLLMOutput(parsed, body, runtimeRubric).assessment.composite.tier;
      const agree = pro_tier === stored_tier;
      const ps = TIER_RANK[pro_tier] ?? -1;
      const ss = TIER_RANK[stored_tier] ?? -1;
      const direction: RowResult['direction'] = agree ? 'same' : ps > ss ? 'safer' : 'less_safe';
      return { id, stored_tier, pro_tier, agree, direction };
    } catch (e) {
      return { id, stored_tier, pro_tier: null, agree: false, direction: 'na', note: 'error: ' + String((e as Error).message).slice(0, 120) };
    }
  }

  // All n in one bounded batch (n<=8). Pro is the slow part.
  const results = await Promise.all(rows.map(scoreRow));

  const scored = results.filter(r => r.pro_tier !== null);
  const agree = scored.filter(r => r.agree).length;
  const summary = {
    requested: n,
    returned: rows.length,
    scored: scored.length,
    parse_or_error: results.length - scored.length,
    agreement: agree,
    agreement_pct: scored.length ? Math.round((agree / scored.length) * 1000) / 10 : null,
    safer_disagreements: results.filter(r => r.direction === 'safer').length,
    less_safe_disagreements: results.filter(r => r.direction === 'less_safe').length,
  };

  return NextResponse.json({ offset, model: GEMINI_MODEL, population, summary, results });
}
