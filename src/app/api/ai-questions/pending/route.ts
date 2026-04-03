/* ──────────────────────────────────────────────────────────────────
   AI Questions — Pending API
   GET: List all open/unanswered conversations (for dashboard badge)
   ────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date'); // Optional: filter by date
    const month = searchParams.get('month'); // Optional: filter by month (YYYY-MM)

    let result;

    if (date) {
      result = await sql`
        SELECT id, form_slug, date, status, questions, created_at
        FROM form_conversations
        WHERE status IN ('open', 'answered')
          AND date = ${date}
        ORDER BY created_at DESC
      `;
    } else if (month) {
      result = await sql`
        SELECT id, form_slug, date, status, questions, created_at
        FROM form_conversations
        WHERE status IN ('open', 'answered')
          AND date LIKE ${month + '%'}
        ORDER BY created_at DESC
      `;
    } else {
      // Default: last 7 days of open conversations
      result = await sql`
        SELECT id, form_slug, date, status, questions, created_at
        FROM form_conversations
        WHERE status IN ('open', 'answered')
        ORDER BY created_at DESC
        LIMIT 50
      `;
    }

    const conversations = result.rows;
    const openCount = conversations.filter(c => c.status === 'open').length;
    const answeredCount = conversations.filter(c => c.status === 'answered').length;

    return NextResponse.json({
      conversations,
      counts: {
        open: openCount,
        answered: answeredCount,
        total: conversations.length,
      },
    });
  } catch (err) {
    console.error('AI pending error:', err);
    // Graceful fallback if tables don't exist yet
    return NextResponse.json({
      conversations: [],
      counts: { open: 0, answered: 0, total: 0 },
    });
  }
}
