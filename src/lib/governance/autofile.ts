// src/lib/governance/autofile.ts
// GV.3 — classification rules: which governance answers become EPI
// incidents/observations, and with what category/severity/narrative.
// Per V's decision (PRD §4): negatives auto-file IMMEDIATELY; commendations
// file as positive observations; ambiguous/unmatched physicians NEVER file
// (they sit in the unmatched queue until aliased, then backfile).

import { enqueue, drainOutbox } from './outbox';

export interface GroupValues { [metric: string]: string } // serialized values ('Yes'/'No'/text)
export interface GroupCtx {
  physician_id: string | null;
  physician_name: string | null;
  surgeon_raw?: string | null;
  match_status: string;
  case_ref?: string | null;
  procedure?: string | null;
  patient?: string | null;
}

const SEV_ORDER = ['low', 'medium', 'high', 'critical'];
const maxSev = (a: string, b: string) => (SEV_ORDER.indexOf(b) > SEV_ORDER.indexOf(a) ? b : a);

interface Flag { label: string; detail: string | null; category: string; severity: string }

function otFlags(v: GroupValues): Flag[] {
  const flags: Flag[] = [];
  if (v.lateStart === 'Yes') flags.push({
    label: 'Late start', category: 'other', severity: 'low',
    detail: [v.delayMinutes && `${v.delayMinutes} min`, v.delayReason].filter(Boolean).join(' — ') || null,
  });
  if (v.conductConcern === 'Yes') flags.push({ label: 'Conduct/behaviour concern', category: 'professionalism', severity: 'medium', detail: v.conductDetails || null });
  if (v.anaesthesiaIssue === 'Yes') flags.push({ label: 'Anaesthesia issue', category: 'patient_safety', severity: 'medium', detail: v.anaesthesiaDetails || null });
  if (v.equipmentProcessIssue === 'Yes') flags.push({ label: 'Equipment/process problem', category: 'other', severity: 'low', detail: v.equipmentProcessDetails || null });
  return flags;
}

function nurFlags(v: GroupValues, ctx: GroupCtx): Flag[] {
  if (v.rounding === 'No') return [{
    label: 'Not rounding on post-op patients', category: 'clinical', severity: 'medium',
    detail: [ctx.patient && `patients: ${ctx.patient}`, v.roundingNote].filter(Boolean).join(' — ') || null,
  }];
  // 'Partially' is recorded in governance_responses but not auto-filed
  return [];
}

function msFlags(v: GroupValues): Flag[] {
  const flags: Flag[] = [];
  if (v.concernToday === 'Yes') {
    flags.push({ label: 'Observation concern (MS)', category: 'clinical', severity: 'medium', detail: v.concernDetails || null });
  }
  const domains: Array<[string, string]> = [
    ['ratingClinical', 'Clinical judgement'], ['ratingDocumentation', 'Documentation'],
    ['ratingCommunication', 'Communication'], ['ratingProfessionalism', 'Professionalism'],
  ];
  const low = domains.filter(([m]) => v[m] && Number(v[m]) > 0 && Number(v[m]) <= 2)
    .map(([m, label]) => `${label}: ${v[m]}/5`);
  if (low.length > 0) {
    flags.push({ label: 'Low OPPE domain rating(s)', category: 'clinical', severity: 'medium', detail: low.join(', ') + (v.comment ? ` — ${v.comment}` : '') });
  }
  return flags;
}

function ipcFlags(v: GroupValues, ctx: GroupCtx): Flag[] {
  if (v.woundStatus === 'Infected') return [{
    label: 'Post-op infection', category: 'patient_safety', severity: 'high',
    detail: [ctx.patient && `patient ${ctx.patient}`, ctx.procedure, v.notes].filter(Boolean).join(' — ') || null,
  }];
  // 'Redness / discharge (concern)' is recorded on the watchlist but not auto-filed
  return [];
}

function ccFlags(v: GroupValues): Flag[] {
  if (v.reportType === 'Complaint') return [{ label: 'Customer-care complaint', category: 'professionalism', severity: 'medium', detail: v.details || null }];
  if (v.reportType === 'Concern') return [{ label: 'Customer-care concern', category: 'professionalism', severity: 'low', detail: v.details || null }];
  return [];
}

/** Build + enqueue observations for one answered case/slot group. */
export async function autoFileGroup(
  forDate: string,
  slug: string,
  templateGroup: string,
  groupKey: string,
  ctx: GroupCtx,
  values: GroupValues,
  filler: { name: string | null; deviceId: string | null },
): Promise<number> {
  if (ctx.match_status !== 'matched' || !ctx.physician_id) return 0;

  const caseLine = [ctx.procedure, ctx.patient && `patient ${ctx.patient}`, ctx.case_ref]
    .filter(Boolean).join(' · ');
  const reportedBy = filler.name ? ` Reported by ${filler.name} (${slug} form).` : ` Reported via ${slug} form.`;
  let queued = 0;

  const flags =
    templateGroup === 'ot' ? otFlags(values) :
    templateGroup === 'cc' ? ccFlags(values) :
    templateGroup === 'nur' ? nurFlags(values, ctx) :
    templateGroup === 'ipc' ? ipcFlags(values, ctx) :
    templateGroup === 'ms' ? msFlags(values) : [];
  if (flags.length > 0) {
    const severity = flags.reduce((s, f) => maxSev(s, f.severity), 'low');
    const category = flags.length === 1 ? flags[0].category : (flags.find(f => f.category === 'patient_safety') ? 'patient_safety' : flags[0].category);
    const body = flags.map(f => `• ${f.label}${f.detail ? ': ' + f.detail : ''}`).join('\n');
    await enqueue({
      physician_id: ctx.physician_id,
      polarity: 'negative',
      category, severity,
      narrative: `[Daily Dash ${forDate}] ${caseLine ? caseLine + '\n' : ''}${body}${reportedBy}`,
      hospital_code: 'EHRC',
      context: { for_date: forDate, slug, group: groupKey, case_ref: ctx.case_ref, filler: filler.name },
      dedup_key: `gv|${forDate}|${slug}|${ctx.case_ref || groupKey}|negative`,
    });
    queued++;
  }

  const commendation = templateGroup === 'ot' ? values.commendation : (values.reportType === 'Commendation' ? values.details : '');
  if (commendation && commendation.trim()) {
    await enqueue({
      physician_id: ctx.physician_id,
      polarity: 'positive',
      commendation_category: 'Going Above & Beyond',
      narrative: `[Daily Dash ${forDate}] ${caseLine ? caseLine + '\n' : ''}${commendation.trim()}${reportedBy}`,
      hospital_code: 'EHRC',
      context: { for_date: forDate, slug, group: groupKey, case_ref: ctx.case_ref, filler: filler.name },
      dedup_key: `gv|${forDate}|${slug}|${ctx.case_ref || groupKey}|positive`,
    });
    queued++;
  }

  if (queued > 0) {
    try { await drainOutbox(queued + 4); } catch { /* retry cron will pick it up */ }
  }
  return queued;
}
