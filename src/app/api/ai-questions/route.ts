/* ──────────────────────────────────────────────────────────────────
   AI Questions API
   POST: Trigger anomaly detection + question generation
   GET:  Fetch conversation thread for a submission
   ────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { detectAnomalies } from '@/lib/ai-engine/anomaly-detector';
import { getRubric } from '@/lib/ai-engine/rubrics';
import { getLLMAdapter } from '@/lib/ai-engine/adapters';
import {
  loadHistoricalData,
  mapFieldLabelsToIds,
  CUSTOMER_CARE_FIELD_MAP,
  EMERGENCY_FIELD_MAP,
  FINANCE_FIELD_MAP,
  CLINICAL_LAB_FIELD_MAP,
  PATIENT_SAFETY_FIELD_MAP,
  FACILITY_FIELD_MAP,
} from '@/lib/ai-engine/historical-loader';

export const dynamic = 'force-dynamic';

/* ── Field mapping registry (expand as rubrics are added) ────────── */
const FIELD_MAPS: Record<string, Record<string, string[]>> = {
  'customer-care': CUSTOMER_CARE_FIELD_MAP,
  'emergency': EMERGENCY_FIELD_MAP,
  'finance': FINANCE_FIELD_MAP,
  'clinical-lab': CLINICAL_LAB_FIELD_MAP,
  'patient-safety': PATIENT_SAFETY_FIELD_MAP,
  'facility': FACILITY_FIELD_MAP,
};

/* ── POST: Trigger anomaly detection ─────────────────────────────── */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slug, date, formData, sessionId } = body;

    if (!slug || !date || !formData) {
      return NextResponse.json({ error: 'Missing slug, date, or formData' }, { status: 400 });
    }

    // 1. Check if rubric exists for this department
    const rubric = getRubric(slug);
    if (!rubric) {
      return NextResponse.json({
        hasQuestions: false,
        message: 'No rubric configured for this department',
      });
    }

    // 2. Load historical data and map field labels
    const rawHistorical = await loadHistoricalData(slug, date, 7);
    const fieldMap = FIELD_MAPS[slug];
    const historicalData = fieldMap
      ? rawHistorical.map(h => mapFieldLabelsToIds(h, fieldMap))
      : rawHistorical;

    // 3. Detect anomalies
    const anomalies = await detectAnomalies(slug, formData, rubric, historicalData);

    if (anomalies.length === 0) {
      return NextResponse.json({
        hasQuestions: false,
        message: 'No anomalies detected. Submission looks complete.',
      });
    }

    // 4. Generate questions via LLM adapter (template mode in Phase 1)
    const adapter = getLLMAdapter();
    const questions = await adapter.generateQuestions(anomalies, rubric, formData);

    // 5. Store conversation in DB
    let conversationId: number | null = null;
    try {
      const insertResult = await sql`
        INSERT INTO form_conversations (form_slug, date, session_id, status, anomalies_detected, questions)
        VALUES (
          ${slug},
          ${date},
          ${sessionId || null},
          'open',
          ${JSON.stringify(anomalies)},
          ${JSON.stringify(questions)}
        )
        ON CONFLICT (form_slug, date) DO UPDATE SET
          anomalies_detected = ${JSON.stringify(anomalies)},
          questions = ${JSON.stringify(questions)},
          status = 'open',
          resolved_at = NULL,
          created_at = NOW()
        RETURNING id
      `;
      conversationId = insertResult.rows[0]?.id;

      // Insert assistant messages for each question
      if (conversationId) {
        for (const q of questions) {
          await sql`
            INSERT INTO form_conversation_messages (conversation_id, role, content, metadata)
            VALUES (
              ${conversationId},
              'assistant',
              ${q.text},
              ${JSON.stringify({ severity: q.severity, related_fields: q.related_fields, rule_id: q.source_rule_id })}
            )
          `;
        }
      }
    } catch (dbErr) {
      // DB might not have tables yet — still return questions
      console.error('Failed to store conversation:', dbErr);
    }

    return NextResponse.json({
      hasQuestions: true,
      conversationId,
      questions,
      anomalyCount: anomalies.length,
    });
  } catch (err) {
    console.error('AI questions error:', err);
    return NextResponse.json({ error: 'Failed to process anomaly detection' }, { status: 500 });
  }
}

/* ── GET: Fetch conversation thread ──────────────────────────────── */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');
    const date = searchParams.get('date');

    if (!slug || !date) {
      return NextResponse.json({ error: 'Missing slug or date parameter' }, { status: 400 });
    }

    // Fetch conversation
    const convResult = await sql`
      SELECT id, form_slug, date, session_id, status, anomalies_detected, questions, created_at, resolved_at
      FROM form_conversations
      WHERE form_slug = ${slug} AND date = ${date}
    `;

    if (convResult.rows.length === 0) {
      return NextResponse.json({ conversation: null });
    }

    const conv = convResult.rows[0];

    // Fetch messages
    const msgResult = await sql`
      SELECT id, conversation_id, role, content, metadata, created_at
      FROM form_conversation_messages
      WHERE conversation_id = ${conv.id}
      ORDER BY created_at ASC
    `;

    return NextResponse.json({
      conversation: {
        ...conv,
        messages: msgResult.rows,
      },
    });
  } catch (err) {
    console.error('AI questions fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 });
  }
}
