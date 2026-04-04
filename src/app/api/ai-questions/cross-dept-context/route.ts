/* ──────────────────────────────────────────────────────────────────
   AI Questions — Cross-Department Context API
   GET: Fetch cross-dept correlation notes for a specific department
   ────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { getCrossDeptContext } from '@/lib/ai-engine/correlation-engine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');
    const date = searchParams.get('date');

    if (!slug || !date) {
      return NextResponse.json({ error: 'Missing slug or date parameter' }, { status: 400 });
    }

    const context = await getCrossDeptContext(slug, date);

    return NextResponse.json({
      slug,
      date,
      crossDeptAlerts: context,
      hasAlerts: context.length > 0,
    });
  } catch (err) {
    console.error('Cross-dept context error:', err);
    return NextResponse.json({ crossDeptAlerts: [], hasAlerts: false });
  }
}
