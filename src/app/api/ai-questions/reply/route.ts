/* ──────────────────────────────────────────────────────────────────
   AI Questions — Reply API
   POST: Submit a response to a question
   ────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { conversationId, content, questionId } = body;

    if (!conversationId || !content) {
      return NextResponse.json({ error: 'Missing conversationId or content' }, { status: 400 });
    }

    // Verify conversation exists and is open
    const convCheck = await sql`
      SELECT id, status FROM form_conversations WHERE id = ${conversationId}
    `;

    if (convCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Insert user message
    const msgResult = await sql`
      INSERT INTO form_conversation_messages (conversation_id, role, content, metadata)
      VALUES (
        ${conversationId},
        'user',
        ${content},
        ${questionId ? JSON.stringify({ in_reply_to: questionId }) : null}
      )
      RETURNING id, conversation_id, role, content, metadata, created_at
    `;

    // Update conversation status to 'answered'
    await sql`
      UPDATE form_conversations
      SET status = 'answered'
      WHERE id = ${conversationId} AND status = 'open'
    `;

    return NextResponse.json({
      message: msgResult.rows[0],
      status: 'answered',
    });
  } catch (err) {
    console.error('AI reply error:', err);
    return NextResponse.json({ error: 'Failed to save reply' }, { status: 500 });
  }
}
