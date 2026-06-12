import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { splitSurgeons, normName } from '@/lib/governance/name-match';
import { autoFileGroup, type GroupCtx, type GroupValues } from '@/lib/governance/autofile';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GV.3 — map a raw sheet name to a roster physician (gv_name_aliases),
 * then backfill: re-match case-log rows, upgrade held responses to
 * 'matched', and auto-file any negative findings that were waiting.
 * Bearer-gated (this changes doctor attribution).
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const secret = process.env.SERVICE_OBSERVATIONS_SECRET;
  if (!(secret && auth === `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: { raw?: string; physician_id?: string; physician_name?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const raw = (body.raw || '').trim();
  const pid = (body.physician_id || '').trim();
  if (!raw || !pid) return NextResponse.json({ error: 'raw and physician_id required' }, { status: 400 });

  const norm = normName(splitSurgeons(raw)[0] || raw);
  if (!norm) return NextResponse.json({ error: 'name normalises to nothing' }, { status: 400 });

  try {
    await sql`
      INSERT INTO gv_name_aliases (alias_norm, physician_id, created_by)
      VALUES (${norm}, ${pid}, ${'admin'})
      ON CONFLICT (alias_norm) DO UPDATE SET physician_id = EXCLUDED.physician_id
    `;

    // backfill the case log (any raw whose primary segment normalises the same)
    const caseRows = await sql`
      SELECT DISTINCT surgeon_raw FROM ot_case_log
      WHERE surgeon_physician_id IS NULL AND surgeon_raw IS NOT NULL
    `;
    let casesUpdated = 0;
    for (const r of caseRows.rows) {
      const rRaw = String(r.surgeon_raw);
      if (normName(splitSurgeons(rRaw)[0] || rRaw) === norm) {
        const u = await sql`UPDATE ot_case_log SET surgeon_physician_id = ${pid} WHERE surgeon_raw = ${rRaw} AND surgeon_physician_id IS NULL`;
        casesUpdated += u.rowCount ?? 0;
      }
    }

    // upgrade held responses + auto-file what was waiting
    const respRows = await sql`
      SELECT DISTINCT physician_name_raw FROM governance_responses
      WHERE match_status IN ('unmatched','ambiguous') AND physician_name_raw IS NOT NULL
    `;
    let responsesUpdated = 0, filed = 0;
    for (const r of respRows.rows) {
      const rRaw = String(r.physician_name_raw);
      if (normName(splitSurgeons(rRaw)[0] || rRaw) !== norm) continue;
      const u = await sql`
        UPDATE governance_responses SET physician_id = ${pid}, match_status = 'matched'
        WHERE physician_name_raw = ${rRaw} AND match_status IN ('unmatched','ambiguous')
      `;
      responsesUpdated += u.rowCount ?? 0;
      // regroup this raw name's answers and run the auto-file rules
      const groups = await sql`
        SELECT for_date::text AS for_date, slug, case_ref,
               jsonb_object_agg(metric, value) AS values,
               max(filler_name) AS filler_name
        FROM governance_responses
        WHERE physician_name_raw = ${rRaw} AND physician_id = ${pid}
        GROUP BY for_date, slug, case_ref
      `;
      for (const g of groups.rows) {
        const ctx: GroupCtx = {
          physician_id: pid, physician_name: body.physician_name || null,
          surgeon_raw: rRaw, match_status: 'matched', case_ref: (g.case_ref as string) || null,
        };
        const templateGroup = g.slug === 'customer-care' ? 'cc' : 'ot';
        filed += await autoFileGroup(g.for_date as string, g.slug as string, templateGroup,
          (g.case_ref as string) || 'backfill', ctx, g.values as GroupValues, { name: (g.filler_name as string) || null, deviceId: null });
      }
    }

    return NextResponse.json({ ok: true, alias: norm, cases_updated: casesUpdated, responses_updated: responsesUpdated, observations_filed: filed });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
