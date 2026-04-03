/* ──────────────────────────────────────────────────────────────────
   One-time migration for AI Question Engine tables
   GET /api/run-ai-migration?secret=ehrc-migrate-2026-secret
   ────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (secret !== 'ehrc-migrate-2026-secret') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Create form_conversations table
    await sql`
      CREATE TABLE IF NOT EXISTS form_conversations (
        id SERIAL PRIMARY KEY,
        form_slug TEXT NOT NULL,
        date TEXT NOT NULL,
        session_id TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        anomalies_detected JSONB NOT NULL DEFAULT '[]'::jsonb,
        questions JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        UNIQUE(form_slug, date)
      )
    `;

    // Create form_conversation_messages table
    await sql`
      CREATE TABLE IF NOT EXISTS form_conversation_messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES form_conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_fc_slug_date ON form_conversations(form_slug, date)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_fc_status ON form_conversations(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_fcm_conversation ON form_conversation_messages(conversation_id)`;

    // Verify
    const check = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('form_conversations', 'form_conversation_messages')
      ORDER BY table_name
    `;

    return NextResponse.json({
      success: true,
      tables: check.rows.map(r => r.table_name),
      message: 'AI Question Engine tables created successfully',
    });
  } catch (err) {
    console.error('Migration error:', err);
    return NextResponse.json({
      error: 'Migration failed',
      details: String(err),
    }, { status: 500 });
  }
}
