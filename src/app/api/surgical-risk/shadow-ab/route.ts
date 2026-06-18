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

  // Genuine qwen-scored rows only (skip deterministic fallbacks), most recent first.
  const rows = (await sql`
    SELECT id, risk_tier, llm_model, raw_form_data
    FROM surgical_risk_assessments
    WHERE raw_form_data IS NOT NULL
      AND removed_at IS NULL
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

  return NextResponse.json({ offset, model: GEMINI_MODEL, summary, results });
}
