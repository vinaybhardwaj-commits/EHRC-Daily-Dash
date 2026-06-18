/* F.2 — serve today's adaptive question section for a form slug.
   Mirrors /api/governance/question-set: returns { sections: [] } whenever the
   engine is off or there are no open questions, so the form is unchanged in
   every other case. Each injected field is keyed `aiq_<id>` so the submit
   handler can map the answer back to its question. */

import { NextRequest, NextResponse } from 'next/server';
import { adaptiveFormsEnabled, listOpenForDept } from '@/lib/adaptive-forms/store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug') || '';
  if (!adaptiveFormsEnabled() || !slug) {
    return NextResponse.json({ sections: [] });
  }
  try {
    const questions = await listOpenForDept(slug);
    if (!questions.length) return NextResponse.json({ sections: [] });

    const fields = questions.map(q => ({
      ...q.field_spec,
      id: `aiq_${q.id}`,      // stable, parseable key for answer capture
      required: false,         // never block a daily submit
    }));

    return NextResponse.json({
      sections: [{
        id: 'even-ai-intelligence',
        title: 'Even AI — help us predict better',
        description: 'A few high-value questions Even AI flagged to sharpen predictions. Quick to answer; optional.',
        fields,
      }],
    });
  } catch {
    return NextResponse.json({ sections: [] });
  }
}
