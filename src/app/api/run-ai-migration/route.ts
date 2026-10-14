/* ──────────────────────────────────────────────────────────────────
   One-time migration for AI Question Engine tables — RETIRED.
   The tables (form_conversations and its companion) were created when
   AI Question Engine Phase 1 shipped. The route used a secret hard-coded
   in this public repo, so it is disabled. Schema changes belong in a
   migration run with a server-side secret, not a public GET endpoint.
   ────────────────────────────────────────────────────────────────── */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ error: 'gone: one-time migration retired' }, { status: 410 });
}
