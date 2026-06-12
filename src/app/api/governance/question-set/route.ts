import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { govEnabled } from '@/lib/governance/flags';

export const dynamic = 'force-dynamic';

/**
 * GV.2 — serve today's governance sections for a form slug.
 * Returns { sections: [] } whenever the flag is off or nothing was
 * generated, so the form renders exactly as before.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug') || '';
  const todayIST = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const date = req.nextUrl.searchParams.get('date') || todayIST;
  if (!govEnabled() || !slug || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ sections: [] });
  }
  try {
    const r = await sql`
      SELECT sections FROM governance_question_sets
      WHERE for_date = ${date} AND slug = ${slug} LIMIT 1
    `;
    return NextResponse.json({ sections: r.rows[0]?.sections ?? [], date });
  } catch {
    return NextResponse.json({ sections: [] });
  }
}
