/* ──────────────────────────────────────────────────────────────────
   AI Slash Command API
   POST: Execute a slash command within a FormChat thread
   ────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { parseSlashCommand, executeSlashCommand } from '@/lib/ai-engine/slash-commands';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // Qwen calls can take a while

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, slug, date } = body;

    if (!text || !slug || !date) {
      return NextResponse.json(
        { error: 'Missing required parameters: text, slug, date' },
        { status: 400 }
      );
    }

    const parsed = parseSlashCommand(text);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Not a valid slash command. Try /help for available commands.' },
        { status: 400 }
      );
    }

    const result = await executeSlashCommand(parsed, { slug, date });

    return NextResponse.json(result);
  } catch (err) {
    console.error('Slash command error:', err);
    return NextResponse.json(
      { error: 'Failed to execute command' },
      { status: 500 }
    );
  }
}
