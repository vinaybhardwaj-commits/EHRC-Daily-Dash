// src/lib/governance/ed-contact.ts
// GV.6 — the Emergency form already captures specialist-contact difficulties
// (named doctor + specialty + time + outcome). Wire those rows into the
// governance pipeline: matched specialists auto-file, unmatched ones land in
// the queue and backfile when aliased.

import { sql } from '@vercel/postgres';
import { fetchRoster } from './elo';
import { matchSurgeon, splitSurgeons } from './name-match';
import { enqueue, drainOutbox } from './outbox';

interface ContactRow { specialistName?: string; specialty?: string; attemptTime?: string; outcome?: string }

export async function captureEdContactIncidents(
  forDate: string,
  fields: Record<string, unknown>,
  fillerName: string | null,
  fillerDeviceId: string | null,
): Promise<number> {
  if (fields.contactDifficultyToday !== true && fields.contactDifficultyToday !== 'Yes') return 0;
  const rows = Array.isArray(fields.contactDifficultyIncidents)
    ? (fields.contactDifficultyIncidents as ContactRow[])
    : [];
  const valid = rows.filter(r => r && (r.specialistName || '').trim());
  if (valid.length === 0) return 0;

  const roster = await fetchRoster();
  const aliasRows = await sql`SELECT alias_norm, physician_id FROM gv_name_aliases`;
  const aliases = new Map<string, string>(aliasRows.rows.map(r => [r.alias_norm as string, r.physician_id as string]));

  let processed = 0;
  for (let i = 0; i < valid.length; i++) {
    const row = valid[i];
    const raw = String(row.specialistName).trim();
    const m = roster.length ? matchSurgeon(splitSurgeons(raw)[0] || raw, roster, aliases) : { status: 'unmatched' as const };
    const detail = [row.specialty, row.attemptTime && `attempted ${row.attemptTime}`, row.outcome]
      .filter(Boolean).join(' · ');

    // structured record (queue + timeline + alias backfill all key off this)
    await sql`
      DELETE FROM governance_responses
      WHERE for_date = ${forDate} AND slug = 'emergency' AND template_id = 'ed_contactDifficulty'
        AND physician_name_raw = ${raw} AND case_ref IS NOT DISTINCT FROM ${`ed-${i}`}
    `;
    await sql`
      INSERT INTO governance_responses
        (for_date, slug, template_id, physician_id, physician_name_raw, case_ref, metric, value,
         filler_name, filler_device_id, match_status)
      VALUES
        (${forDate}, 'emergency', 'ed_contactDifficulty',
         ${m.status === 'matched' ? m.physicianId : null}, ${raw}, ${`ed-${i}`},
         'contactDifficulty', ${detail || 'contact difficulty reported'},
         ${fillerName}, ${fillerDeviceId}, ${m.status})
    `;

    if (m.status === 'matched' && m.physicianId) {
      await enqueue({
        physician_id: m.physicianId,
        polarity: 'negative',
        category: 'professionalism',
        severity: 'medium',
        narrative: `[Daily Dash ${forDate}] ED on-call contact difficulty\n• ${raw}${detail ? ': ' + detail : ''}${fillerName ? ` Reported by ${fillerName} (emergency form).` : ' Reported via emergency form.'}`,
        hospital_code: 'EHRC',
        context: { for_date: forDate, slug: 'emergency', row: i, filler: fillerName },
        dedup_key: `gv|${forDate}|emergency|ed-${i}-${m.physicianId}|negative`,
      });
    }
    processed++;
  }
  try { await drainOutbox(processed + 2); } catch { /* hourly retry */ }
  return processed;
}
