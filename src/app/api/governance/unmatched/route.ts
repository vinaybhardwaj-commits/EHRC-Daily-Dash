import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { fetchRoster } from '@/lib/governance/elo';
import { splitSurgeons, normName } from '@/lib/governance/name-match';

export const dynamic = 'force-dynamic';

/**
 * GV.3 — the unmatched-surgeon queue: distinct raw names (last 30 days)
 * from the case log and captured responses that have no roster identity,
 * plus the roster list for the mapping picker.
 */
export async function GET(_req: NextRequest) {
  try {
    const caseRows = await sql`
      SELECT surgeon_raw AS raw, count(*)::int AS n, max(case_date)::text AS last_seen
      FROM ot_case_log
      WHERE surgeon_physician_id IS NULL AND surgeon_raw IS NOT NULL
        AND case_date > now() - interval '30 days'
      GROUP BY surgeon_raw
    `;
    const respRows = await sql`
      SELECT physician_name_raw AS raw, count(*)::int AS n, max(for_date)::text AS last_seen
      FROM governance_responses
      WHERE match_status IN ('unmatched', 'ambiguous') AND physician_name_raw IS NOT NULL
        AND for_date > now() - interval '30 days'
      GROUP BY physician_name_raw
    `;
    // merge by normalised primary name
    const byNorm = new Map<string, { raw: string; norm: string; count: number; last_seen: string }>();
    for (const r of [...caseRows.rows, ...respRows.rows]) {
      const primary = splitSurgeons(String(r.raw))[0] || String(r.raw);
      const norm = normName(primary);
      if (!norm) continue;
      const cur = byNorm.get(norm);
      if (cur) {
        cur.count += Number(r.n);
        if (String(r.last_seen) > cur.last_seen) cur.last_seen = String(r.last_seen);
      } else {
        byNorm.set(norm, { raw: String(r.raw), norm, count: Number(r.n), last_seen: String(r.last_seen) });
      }
    }
    const roster = await fetchRoster();
    const outbox = await sql`
      SELECT status, count(*)::int AS n FROM governance_outbox GROUP BY status
    `;
    return NextResponse.json({
      unmatched: [...byNorm.values()].sort((a, b) => b.count - a.count),
      roster: roster.map(r => ({ id: r.id, name: r.full_name })),
      outbox: Object.fromEntries(outbox.rows.map(r => [r.status, r.n])),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
