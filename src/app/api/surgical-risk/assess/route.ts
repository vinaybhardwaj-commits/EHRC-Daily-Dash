/**
 * POST /api/surgical-risk/assess
 *
 * SREWS assessment endpoint. Apps Script onFormSubmit handler + hourly
 * time-trigger handler both POST surgery booking payloads here.
 *
 * Flow per PRD v2 §2.1:
 *   1. Validate X-Webhook-Secret header
 *   2. Validate body shape (required: form_submission_uid, submission_timestamp,
 *      patient_name, uhid)
 *   3. Dedupe — if form_submission_uid already in DB, return early
 *   4. Build user prompt, call Qwen via existing llm()
 *   5. Parse LLM JSON response
 *   6. Run through recalculateFromLLMOutput per PRD §13.3
 *   7. INSERT row
 *
 * Fallback path: if LLM call fails (tunnel down, parse error, timeout),
 * fall back to computeDeterministicRisk and INSERT with llm_model='fallback'.
 *
 * Always returns 2xx with { ok, status, id?, tier?, divergence? } so Apps
 * Script's UrlFetchApp.fetch can use muteHttpExceptions:true and treat any
 * 2xx as success.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { llm, LLM_MODELS } from '@/lib/llm';
import { checkWebhookSecret } from '@/lib/surgical-risk/webhook-auth';
import { SREWS_SYSTEM_PROMPT, buildUserPrompt } from '@/lib/surgical-risk/prompt';
import { getActiveConfig } from '@/lib/surgical-risk/config-store';
import { recalculateFromLLMOutput } from '@/lib/surgical-risk/recalculate';
import { computeDeterministicRisk, combineDateTime } from '@/lib/surgical-risk/fallback';
import { RUBRIC_VERSION } from '@/lib/surgical-risk/rubric';
import type { RiskAssessment, SurgeryBookingPayload } from '@/lib/surgical-risk/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const REQUIRED_FIELDS: Array<keyof SurgeryBookingPayload> = [
  'form_submission_uid',
  'submission_timestamp',
  'patient_name',
  'uhid',
];

function jsonOk(data: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}
function jsonErr(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

/**
 * Parse LLM completion text into RiskAssessment JSON. Tolerant of
 * leading/trailing whitespace + accidental markdown fences (Qwen sometimes
 * wraps JSON in ```json ... ``` despite the prompt asking otherwise).
 */
function parseLLMResponse(text: string): RiskAssessment | null {
  let stripped = text.trim();
  // Strip ```json ... ``` if present
  const fence = stripped.match(/^```(?:json)?\s*([\s\S]+?)\s*```$/);
  if (fence) stripped = fence[1].trim();
  // Take from first { to last } if there's chatter outside the JSON
  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    stripped = stripped.slice(firstBrace, lastBrace + 1);
  }
  try {
    const parsed = JSON.parse(stripped);
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.patient_risk &&
      parsed.procedure_risk &&
      parsed.system_risk &&
      parsed.composite
    ) {
      return parsed as RiskAssessment;
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  // 1. Webhook auth
  const auth = checkWebhookSecret(req);
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  // 2. Body validation
  let body: SurgeryBookingPayload;
  try {
    body = await req.json();
  } catch {
    return jsonErr('Invalid JSON body', 400);
  }
  for (const field of REQUIRED_FIELDS) {
    if (!body[field]) {
      return jsonErr(`Missing required field: ${field}`, 400);
    }
  }

  // 3. Dedupe on form_submission_uid
  try {
    const existing = await sql`
      SELECT id, risk_tier, composite_risk_score
      FROM surgical_risk_assessments
      WHERE form_submission_uid = ${body.form_submission_uid}
      LIMIT 1
    `;
    if (existing.rows.length > 0) {
      const r = existing.rows[0];
      return jsonOk({
        status: 'already_exists',
        id: r.id,
        tier: r.risk_tier,
        composite_score: Number(r.composite_risk_score),
      });
    }
  } catch (dbErr) {
    return jsonErr(`Dedupe query failed: ${String(dbErr)}`, 500);
  }

  // 3a. SPAS.1 — fetch active config (prompt + version). Falls back to
  //     hardcoded SREWS_SYSTEM_PROMPT + RUBRIC_VERSION if DB is unreachable
  //     or no active config exists. SPAS.5 will wire scoring through DB too;
  //     for now fallback.ts + recalculate.ts keep reading rubric.ts constants.
  const activeConfig = await getActiveConfig();
  const systemPrompt = activeConfig?.system_prompt ?? SREWS_SYSTEM_PROMPT;
  const rubricVersion = activeConfig?.version ?? RUBRIC_VERSION;

  // 4. + 5. + 6. Call LLM, parse, recalc — with deterministic fallback
  let assessment: RiskAssessment;
  let llmModel = LLM_MODELS.PRIMARY as string;
  let llmLatencyMs: number | null = null;
  let divergenceFlagged = false;

  const client = llm();
  if (!client) {
    // No LLM client configured — go straight to fallback
    assessment = computeDeterministicRisk(body);
    llmModel = 'fallback-no-tunnel';
  } else {
    try {
      const t0 = Date.now();
      const completion = await client.chat.completions.create({
        model: LLM_MODELS.PRIMARY,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: buildUserPrompt(body) },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      });
      llmLatencyMs = Date.now() - t0;
      const text = completion.choices[0]?.message?.content || '';
      const parsed = parseLLMResponse(text);
      if (!parsed) {
        // LLM returned malformed JSON — fall back
        console.warn('[srews/assess] LLM response unparseable, using fallback', {
          uid: body.form_submission_uid,
          preview: text.slice(0, 200),
        });
        assessment = computeDeterministicRisk(body);
        llmModel = 'fallback-parse-error';
      } else {
        // 6. Server-side recalc per PRD §13.3
        const recalc = recalculateFromLLMOutput(parsed, body);
        assessment = recalc.assessment;
        divergenceFlagged = recalc.divergence.flagged;
      }
    } catch (llmErr) {
      console.warn('[srews/assess] LLM call failed, using fallback', {
        uid: body.form_submission_uid,
        error: String(llmErr),
      });
      assessment = computeDeterministicRisk(body);
      llmModel = 'fallback-llm-error';
    }
  }

  // 7. INSERT row
  const surDt = combineDateTime(body.surgery_date, body.surgery_time);
  const admDt = combineDateTime(body.admission_date, body.admission_time);

  try {
    const inserted = await sql`
      INSERT INTO surgical_risk_assessments (
        form_submission_uid, submission_timestamp,
        patient_name, uhid, age, sex,
        surgeon_name, surgical_specialty, proposed_procedure,
        surgery_date, surgery_datetime, admission_date, admission_datetime,
        patient_risk_score, procedure_risk_score, system_risk_score, composite_risk_score, risk_tier,
        assessment_json, llm_model, llm_latency_ms, llm_divergence_logged, rubric_version,
        raw_form_data
      ) VALUES (
        ${body.form_submission_uid}, ${body.submission_timestamp},
        ${body.patient_name}, ${body.uhid}, ${body.age ?? null}, ${body.sex ?? null},
        ${body.surgeon_name ?? null}, ${body.surgical_specialty ?? null}, ${body.proposed_procedure ?? null},
        ${body.surgery_date ?? null}, ${surDt ? surDt.toISOString() : null},
        ${body.admission_date ?? null}, ${admDt ? admDt.toISOString() : null},
        ${assessment.patient_risk.score}, ${assessment.procedure_risk.score},
        ${assessment.system_risk.score}, ${assessment.composite.score}, ${assessment.composite.tier},
        ${JSON.stringify(assessment)}::jsonb, ${llmModel}, ${llmLatencyMs}, ${divergenceFlagged}, ${rubricVersion},
        ${JSON.stringify(body)}::jsonb
      )
      RETURNING id
    `;
    const id = inserted.rows[0].id;
    return jsonOk({
      status: 'created',
      id,
      tier: assessment.composite.tier,
      composite_score: assessment.composite.score,
      llm_model: llmModel,
      divergence_flagged: divergenceFlagged,
    }, 201);
  } catch (insertErr) {
    return jsonErr(`Insert failed: ${String(insertErr)}`, 500);
  }
}
