import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { notify } from '@/lib/messaging/notify';
import { getActiveHods, getRecipientsByRole, type Recipient } from '@/lib/messaging/recipients';
import { drainOutbox } from '@/lib/messaging/outbox';
import { CONTACTS_BY_SLUG } from '@/lib/department-contacts';
import { adaptiveFormsEnabled, recentlyExpiredUnanswered } from '@/lib/adaptive-forms/store';
import { eodRhythmSlugs, reportingDay } from '@/lib/reporting-day';
import { renderTemplate } from '@/lib/messaging/templates';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const FORM_BASE = process.env.MSG_FORM_BASE || 'https://ehrc.evenos.app/form';
const STALE_THRESHOLD = 2;    // >=2 consecutive missing days (incl today) -> "behind" wording
const CHRONIC_THRESHOLD = 3;  // >=3 -> surfaced to admin in the 09:45 digest

function istNow(): Date { return new Date(Date.now() + 5.5 * 3600_000); }
function istDateStr(d: Date): string { return d.toISOString().slice(0, 10); }
function todayIST(): string { return istDateStr(istNow()); }
function isSundayIST(): boolean { return istNow().getUTCDay() === 0; }
function isHolidayIST(date: string): boolean {
  return (process.env.MSG_HOLIDAYS || '').split(',').map((s) => s.trim()).filter(Boolean).includes(date);
}
const deptName = (slug: string | null) => (slug && CONTACTS_BY_SLUG[slug]?.department) || slug || '';

/** Compute a dept's missing streak from the submitted-set. */
function streakFor(slug: string, submitted: Set<string>, dates: string[]): number {
  let n = 0;
  for (const d of dates) { if (submitted.has(`${slug}|${d}`)) break; n++; }
  return n;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const step = url.searchParams.get('step') || '';
  const dry = url.searchParams.get('dry') === '1';   // preview recipients + body, no enqueue/send
  const date = todayIST();
  if (isSundayIST() || isHolidayIST(date)) {
    return NextResponse.json({ ok: true, step, date, skipped: 'non-working-day' });
  }
  try {
    // shared: 14-day submission window for streaks
    const dates: string[] = [];
    const base = istNow();
    for (let i = 0; i < 14; i++) dates.push(istDateStr(new Date(base.getTime() - i * 86400_000)));
    const rs = await sql.query('SELECT DISTINCT slug, date FROM department_data WHERE date = ANY($1::text[])', [dates]);
    const submitted = new Set<string>(rs.rows.map((x) => `${x.slug}|${x.date}`));
    const submittedToday = (slug: string | null) => !!slug && submitted.has(`${slug}|${date}`);
    const streak = (slug: string | null) => (slug ? streakFor(slug, submitted, dates) : 0);

    const hods = await getActiveHods();
    const eod = eodRhythmSlugs();   // pilot depts run on the once-a-day rhythm (eod_prompt/eod_lastcall) — exclude them from the legacy "today" steps

    if (step === 'morning_link' || step === 'nudge') {
      const pending = hods.filter((h) => h.dept_slug && !eod.has(h.dept_slug) && !submittedToday(h.dept_slug)); // skip already-filled + pilot depts
      const normalTpl = step === 'morning_link' ? 'form_link' : 'form_nudge';
      const eventType = step === 'morning_link' ? 'morning_link' : 'form_nudge';
      const normal = pending.filter((h) => streak(h.dept_slug) < STALE_THRESHOLD);
      const stale = pending.filter((h) => streak(h.dept_slug) >= STALE_THRESHOLD);
      const baseVars = (r: Recipient) => ({
        name: r.name, department: deptName(r.dept_slug), date, link: `${FORM_BASE}/${r.dept_slug}`,
      });
      const rNormal = await notify(eventType, { recipients: normal, templateKey: normalTpl, dedupSuffix: date, perRecipientVars: baseVars });
      const rStale = await notify(eventType, {
        recipients: stale, templateKey: 'form_stale', dedupSuffix: date,
        perRecipientVars: (r) => ({ ...baseVars(r), days: streak(r.dept_slug) }),
      });
      const drain = await drainOutbox(40);
      return NextResponse.json({ ok: true, step, date, pending: pending.length, normal: rNormal, stale: rStale, drain });
    }

    if (step === 'escalation') {
      const chased = hods.filter((h) => h.dept_slug && !eod.has(h.dept_slug)); // pilot depts escalate on the eod cutoff (P3), not here
      const missing = chased.filter((h) => !submittedToday(h.dept_slug));
      const withDays = missing
        .map((h) => ({ name: deptName(h.dept_slug), days: streak(h.dept_slug) }))
        .sort((a, b) => b.days - a.days);
      const chronic = withDays.filter((d) => d.days >= CHRONIC_THRESHOLD);
      const lines = withDays.map((d) => `• ${d.name} — ${d.days <= 1 ? 'today' : d.days + ' days'}`);
      const chronicLine = chronic.length
        ? `⚠️ Chronic (3+ days): ${chronic.map((c) => `${c.name} (${c.days}d)`).join(', ')}\n\n`
        : '';
      const admins = await getRecipientsByRole('admin');
      // F.2b — append any Even AI gaps that expired unanswered (5 working days).
      let gapsLine = '';
      if (adaptiveFormsEnabled()) {
        const gaps = await recentlyExpiredUnanswered(26);
        if (gaps.length) {
          gapsLine = `\n\nEven AI — gaps unfilled ${process.env.ADAPTIVE_RECUR_DAYS || 5}d:\n` +
            gaps.map((g) => `• ${deptName(g.dept_slug)} — ${g.label}`).join('\n');
        }
      }
      const result = await notify('escalation_missing', {
        recipients: admins, dedupSuffix: date,
        vars: { date, n: missing.length, total: chased.length, missing_list: chronicLine + (lines.join('\n') || 'None — all submitted ✅') + gapsLine },
      });
      const drain = await drainOutbox(10);
      return NextResponse.json({ ok: true, step, date, missing: missing.length, chronic: chronic.length, result, drain });
    }

    if (step === 'eod_prompt' || step === 'eod_lastcall') {
      // Pilot ('eod') departments report the COMPLETED day. eod_prompt fires in
      // the evening (reporting day = today, the day ending); eod_lastcall fires
      // pre-huddle (reporting day = yesterday). All eod depts share one reporting
      // day at a given instant, so compute it once.
      const pilots = hods.filter((h) => h.dept_slug && eod.has(h.dept_slug));
      if (!pilots.length) {
        return NextResponse.json({ ok: true, step, date, prompted: 0, note: 'no pilot departments configured' });
      }
      const rd = reportingDay(pilots[0].dept_slug as string);
      const pending = pilots.filter((h) => !submitted.has(`${h.dept_slug}|${rd.iso}`)); // skip depts that already filed this reporting day
      const templateKey = step === 'eod_prompt' ? 'form_eod_prompt' : 'form_eod_lastcall';
      const varsFor = (r: Recipient) => ({
        name: r.name, department: deptName(r.dept_slug), date: rd.label, link: `${FORM_BASE}/${r.dept_slug}`,
      });

      if (dry) {
        const sample = pending[0];
        const preview = sample ? (await renderTemplate(templateKey, varsFor(sample)))?.body ?? null : null;
        return NextResponse.json({
          ok: true, step, dry: true, reportingDay: rd.iso, reportingLabel: rd.label,
          pilots: pilots.map((h) => h.dept_slug),
          pending: pending.map((h) => h.dept_slug),
          preview,
        });
      }

      const res = await notify(step, {
        recipients: pending, templateKey, dedupSuffix: `${step}-${rd.iso}`, perRecipientVars: varsFor,
      });
      const drain = await drainOutbox(40);
      return NextResponse.json({ ok: true, step, reportingDay: rd.iso, pilots: pilots.length, pending: pending.length, res, drain });
    }

    if (step === 'eod_escalation') {
      // Pilot-only escalation at the 08:30 cutoff (reporting day = yesterday):
      // digest to V of pilot depts whose completed-day report is still missing
      // before the 9 AM huddle. Non-pilot depts escalate via the legacy 09:45 step.
      const pilots = hods.filter((h) => h.dept_slug && eod.has(h.dept_slug));
      if (!pilots.length) {
        return NextResponse.json({ ok: true, step, date, missing: 0, note: 'no pilot departments configured' });
      }
      const rd = reportingDay(pilots[0].dept_slug as string);
      const missing = pilots.filter((h) => !submitted.has(`${h.dept_slug}|${rd.iso}`));
      const lines = missing.map((h) => `• ${deptName(h.dept_slug)}`);
      const admins = await getRecipientsByRole('admin');
      if (dry) {
        return NextResponse.json({
          ok: true, step, dry: true, reportingDay: rd.iso, reportingLabel: rd.label,
          pilots: pilots.map((h) => h.dept_slug), missing: missing.map((h) => h.dept_slug),
        });
      }
      const result = await notify('eod_escalation', {
        recipients: admins, dedupSuffix: `eod_escalation-${rd.iso}`,
        vars: { date: rd.label, n: missing.length, total: pilots.length, missing_list: lines.join('\n') || 'None — all pilot reports in ✅' },
      });
      const drain = await drainOutbox(10);
      return NextResponse.json({ ok: true, step, reportingDay: rd.iso, missing: missing.length, result, drain });
    }

    return NextResponse.json({ error: 'invalid step' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
