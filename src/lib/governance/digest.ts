// src/lib/governance/digest.ts
// GV.6 — nightly per-physician digest. Compiles the day's governance
// observations about each physician into ONE dated line appended to their
// EPI notes (kind:'note' on the service endpoint). Incidents already filed
// individually; the digest gives the quiet days visibility too.

import { sql } from '@vercel/postgres';

const ELO_BASE = process.env.EVEN_ELO_BASE_URL || 'https://governance.evenos.app';

function fmt(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}-${['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m)]}-${y}`;
}

export async function sendDailyDigests(forDate: string): Promise<{ physicians: number; sent: number }> {
  const rows = await sql`
    SELECT physician_id, slug, metric, value
    FROM governance_responses
    WHERE for_date = ${forDate} AND physician_id IS NOT NULL
    ORDER BY physician_id
  `;
  const byPhysician = new Map<string, Array<{ slug: string; metric: string; value: string }>>();
  for (const r of rows.rows) {
    const pid = r.physician_id as string;
    if (!byPhysician.has(pid)) byPhysician.set(pid, []);
    byPhysician.get(pid)!.push({ slug: r.slug as string, metric: r.metric as string, value: String(r.value) });
  }

  const secret = process.env.SERVICE_OBSERVATIONS_SECRET;
  if (!secret) return { physicians: byPhysician.size, sent: 0 };

  let sent = 0;
  for (const [pid, resp] of byPhysician) {
    const parts: string[] = [];
    const ot = resp.filter(r => r.slug === 'ot');
    if (ot.length) {
      const cases = new Set(resp.filter(r => r.slug === 'ot').map(() => 1)).size;
      const issues = ot.filter(r => ['lateStart', 'conductConcern', 'anaesthesiaIssue', 'equipmentProcessIssue'].includes(r.metric) && r.value === 'Yes').length;
      const commended = ot.some(r => r.metric === 'commendation');
      parts.push(`OT observed${issues ? ` (${issues} issue${issues > 1 ? 's' : ''} filed)` : ': no issues'}${commended ? ', commended' : ''}`);
      void cases;
    }
    const rounding = resp.find(r => r.metric === 'rounding');
    if (rounding) parts.push(`rounding: ${rounding.value}`);
    const ipc = resp.filter(r => r.metric === 'woundStatus');
    if (ipc.length) {
      const infected = ipc.filter(r => r.value === 'Infected').length;
      parts.push(`post-op checks: ${ipc.length}${infected ? ` (${infected} INFECTED)` : ' clean'}`);
    }
    const ratings = resp.filter(r => r.metric.startsWith('rating')).map(r => Number(r.value)).filter(n => n > 0);
    if (ratings.length) parts.push(`OPPE avg ${(ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)}/5`);
    const cc = resp.filter(r => r.metric === 'reportType');
    if (cc.length) parts.push(`CC reports: ${cc.map(r => r.value.toLowerCase()).join(', ')}`);
    const ed = resp.filter(r => r.metric === 'contactDifficulty');
    if (ed.length) parts.push(`ED contact difficulty ×${ed.length}`);
    if (parts.length === 0) continue;

    try {
      const res = await fetch(`${ELO_BASE}/api/service/observations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          kind: 'note',
          physician_id: pid,
          narrative: `[Daily Dash ${fmt(forDate)}] ${parts.join(' · ')}`,
        }),
        cache: 'no-store',
      });
      if (res.ok) sent++;
    } catch { /* best-effort; next digest covers the gap */ }
  }
  return { physicians: byPhysician.size, sent };
}
