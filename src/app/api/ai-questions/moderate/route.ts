/* ──────────────────────────────────────────────────────────────────
   AI Questions — GM Moderator API
   POST: GM injects a question into an existing or new conversation
   ────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slug, date, content, severity, conversationId } = body;

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Missing question content' }, { status: 400 });
    }

    // Validate severity
    const validSeverities = ['critical', 'high', 'medium', 'low'];
    const msgSeverity = validSeverities.includes(severity) ? severity : 'high';

    let targetConversationId = conversationId;

    // If no conversationId, try to find or create one for the slug+date
    if (!targetConversationId) {
      if (!slug || !date) {
        return NextResponse.json(
          { error: 'Either conversationId or both slug and date are required' },
          { status: 400 }
        );
      }

      // Check for existing conversation
      const existing = await sql`
        SELECT id FROM form_conversations
        WHERE form_slug = ${slug} AND date = ${date}
      `;

      if (existing.rows.length > 0) {
        targetConversationId = existing.rows[0].id;
      } else {
        // Create a new conversation for the GM question
        const newConv = await sql`
          INSERT INTO form_conversations (form_slug, date, session_id, status, anomalies_detected, questions)
          VALUES (
            ${slug},
            ${date},
            NULL,
            'open',
            '[]'::jsonb,
            '[]'::jsonb
          )
          RETURNING id
        `;
        targetConversationId = newConv.rows[0].id;
      }
    } else {
      // Verify the conversation exists
      const convCheck = await sql`
        SELECT id FROM form_conversations WHERE id = ${targetConversationId}
      `;
      if (convCheck.rows.length === 0) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }
    }

    // Insert the GM message as 'assistant' role with gm metadata
    const msgResult = await sql`
      INSERT INTO form_conversation_messages (conversation_id, role, content, metadata)
      VALUES (
        ${targetConversationId},
        'assistant',
        ${content.trim()},
        ${JSON.stringify({
          severity: msgSeverity,
          source: 'gm',
          author: 'GM',
        })}
      )
      RETURNING id, conversation_id, role, content, metadata, created_at
    `;

    // Re-open the conversation so the dept head sees it as needing response
    await sql`
      UPDATE form_conversations
      SET status = 'open', resolved_at = NULL
      WHERE id = ${targetConversationId}
    `;

    return NextResponse.json({
      message: msgResult.rows[0],
      conversationId: targetConversationId,
    });
  } catch (err) {
    console.error('GM moderate error:', err);
    return NextResponse.json({ error: 'Failed to add GM question' }, { status: 500 });
  }
}
