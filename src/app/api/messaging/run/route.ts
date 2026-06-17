import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { notify } from '@/lib/messaging/notify';
import { getActiveHods, getRecipientsByRole } from '@/lib/messaging/recipients';
import { drainOutbox } from '@/lib/messaging/outbox';
import { CONTACTS_BY_SLUG } from '@/lib/department-contacts';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const FORM_BASE = process.env.MSG_FORM_BASE || 'https://ehrc.evenos.app/form';

function istNow(): Date { return new Date(Date.now() + 5.5 * 3600_000); }
function todayIST(): string { return istNow().toISOString().slice(0, 10); }
function isSundayIST(): boolean { return istNow().getUTCDay() === 0; }
function isHolidayIST(date: string): boolean {
  return (process.env.MSG_HOLIDAYS || '').split(',').map((s) => s.trim()).filter(Boolean).includes(date);
}
const deptName = (slug: string | null) =>
  (slug && CONTACTS_BY_SLUG[slug]?.department) || slug || '';

async function submittedSlugs(date: string): Promise<Set<string>> {
  const r = await sql`SELECT DISTINCT slug FROM department_data WHERE date = ${date}`;
  return new Set(r.rows.map((x) => String(x.slug)));
}

/**
 * Schedule runner. Vercel crons (Mon-Sat) hit:
 *   ?step=morning_link  07:30 IST  -> form link to every HOD
 *   ?step=nudge         09:00 IST  -> reminder to HODs whose dept hasn't submitted
 *   ?step=escalation    09:45 IST  -> still-missing list to admins (V)
 * Skips Sundays + the MSG_HOLIDAYS list. No-op unless MESSAGING_ENABLED.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const step = new URL(req.url).searchParams.get('step') || '';
  const date = todayIST();
  if (isSundayIST() || isHolidayIST(date)) {
    return NextResponse.json({ ok: true, step, date, skipped: 'non-working-day' });
  }
  try {
    let result;
    if (step === 'morning_link' || step === 'nudge') {
      let hods = await getActiveHods();
      if (step === 'nudge') {
        const done = await submittedSlugs(date);
        hods = hods.filter((h) => h.dept_slug && !done.has(h.dept_slug));
      }
      result = await notify(step === 'morning_link' ? 'morning_link' : 'form_nudge', {
        recipients: hods,
        dedupSuffix: date,
        perRecipientVars: (r) => ({
          name: r.name,
          department: deptName(r.dept_slug),
          date,
          link: `${FORM_BASE}/${r.dept_slug}`,
        }),
      });
    } else if (step === 'escalation') {
      const done = await submittedSlugs(date);
      const hods = await getActiveHods();
      const missing = hods.filter((h) => h.dept_slug && !done.has(h.dept_slug));
      const admins = await getRecipientsByRole('admin');
      result = await notify('escalation_missing', {
        recipients: admins,
        dedupSuffix: date,
        vars: {
          date,
          n: missing.length,
          total: hods.length,
          missing_list: missing.map((h) => `- ${deptName(h.dept_slug)}`).join('\n') || 'None — all submitted',
        },
      });
    } else {
      return NextResponse.json({ error: 'invalid step' }, { status: 400 });
    }
    const drain = await drainOutbox(30);
    return NextResponse.json({ ok: true, step, date, ...result, drain });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
