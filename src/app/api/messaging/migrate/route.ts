import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { DEPARTMENT_CONTACTS } from '@/lib/department-contacts';
import { isAuthorizedCron } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

const ADMIN_E164 = '+916362191675';

const FORM_LINK_BODY = 'Good morning {{name}}.\nPlease submit the *{{department}}* daily form for {{date}}:\n{{link}}';
const NUDGE_BODY = 'Reminder: the *{{department}}* daily form for {{date}} has not been submitted yet.\nSubmit now: {{link}}';
const ESCALATION_BODY = '*EHRC — Missing submissions ({{date}})*\n{{n}}/{{total}} departments still pending:\n{{missing_list}}';

async function createTables() {
  await sql`CREATE TABLE IF NOT EXISTS notification_recipients (
    id SERIAL PRIMARY KEY,
    hospital_code TEXT NOT NULL DEFAULT 'EHRC',
    ext_key TEXT UNIQUE,
    dept_slug TEXT,
    role TEXT NOT NULL DEFAULT 'hod',
    name TEXT NOT NULL DEFAULT '',
    whatsapp_e164 TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    verified BOOLEAN NOT NULL DEFAULT false,
    verify_token TEXT,
    verified_at TIMESTAMPTZ,
    opt_in BOOLEAN NOT NULL DEFAULT false,
    active BOOLEAN NOT NULL DEFAULT true,
    channel_pref TEXT NOT NULL DEFAULT 'whatsapp',
    quiet_hours_start INTEGER,
    quiet_hours_end INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS notification_templates (
    key TEXT PRIMARY KEY,
    channel TEXT NOT NULL DEFAULT 'whatsapp',
    subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS notification_events (
    event_type TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT false,
    audience TEXT NOT NULL DEFAULT 'hod',
    template_key TEXT,
    channel_policy TEXT NOT NULL DEFAULT 'whatsapp',
    schedule_label TEXT,
    escalation_json JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS notification_outbox (
    id SERIAL PRIMARY KEY,
    hospital_code TEXT NOT NULL DEFAULT 'EHRC',
    event_type TEXT NOT NULL,
    recipient_id INTEGER,
    dept_slug TEXT,
    channel TEXT NOT NULL DEFAULT 'whatsapp',
    to_address TEXT NOT NULL,
    rendered_body TEXT NOT NULL,
    dedup_key TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_error TEXT,
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    provider_msg_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_notif_outbox_due
            ON notification_outbox (status, scheduled_for)`;
  await sql`CREATE TABLE IF NOT EXISTS notification_log (
    id SERIAL PRIMARY KEY,
    outbox_id INTEGER,
    recipient_id INTEGER,
    event_type TEXT,
    channel TEXT,
    status TEXT,
    provider_msg_id TEXT,
    detail TEXT,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
}

async function seed() {
  // 17 HOD rows from the existing directory (name + email; numbers entered later)
  for (const c of DEPARTMENT_CONTACTS) {
    await sql`
      INSERT INTO notification_recipients (ext_key, dept_slug, role, name, email, channel_pref)
      VALUES (${'hod:' + c.slug}, ${c.slug}, 'hod', ${c.headName}, ${c.email}, 'whatsapp')
      ON CONFLICT (ext_key) DO NOTHING
    `;
  }
  // Admin / escalation recipient (V) — pre-verified
  await sql`
    INSERT INTO notification_recipients
      (ext_key, dept_slug, role, name, whatsapp_e164, verified, verified_at, opt_in, channel_pref)
    VALUES ('admin:v', NULL, 'admin', 'V (Admin)', ${ADMIN_E164}, true, NOW(), true, 'whatsapp')
    ON CONFLICT (ext_key) DO NOTHING
  `;
  // Templates
  for (const [key, body] of [
    ['form_link', FORM_LINK_BODY],
    ['form_nudge', NUDGE_BODY],
    ['escalation_missing', ESCALATION_BODY],
  ] as const) {
    await sql`
      INSERT INTO notification_templates (key, channel, body)
      VALUES (${key}, 'whatsapp', ${body})
      ON CONFLICT (key) DO NOTHING
    `;
  }
  // Event rules — all disabled until go-live
  for (const [event_type, audience, template_key, schedule_label] of [
    ['morning_link', 'hod', 'form_link', '07:30 IST'],
    ['form_nudge', 'hod', 'form_nudge', '09:00 IST'],
    ['escalation_missing', 'admin', 'escalation_missing', '09:45 IST'],
  ] as const) {
    await sql`
      INSERT INTO notification_events (event_type, enabled, audience, template_key, channel_policy, schedule_label)
      VALUES (${event_type}, false, ${audience}, ${template_key}, 'whatsapp', ${schedule_label})
      ON CONFLICT (event_type) DO NOTHING
    `;
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await createTables();
    await seed();
    const c = await sql`SELECT
      (SELECT count(*)::int FROM notification_recipients) AS recipients,
      (SELECT count(*)::int FROM notification_recipients WHERE role='hod') AS hods,
      (SELECT count(*)::int FROM notification_templates) AS templates,
      (SELECT count(*)::int FROM notification_events) AS events`;
    return NextResponse.json({ ok: true, ...c.rows[0] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const r = await sql`SELECT
      (SELECT count(*)::int FROM notification_recipients) AS recipients,
      (SELECT count(*)::int FROM notification_recipients WHERE role='hod') AS hods,
      (SELECT count(*)::int FROM notification_recipients WHERE role='hod' AND whatsapp_e164 <> '') AS hods_with_numbers,
      (SELECT count(*)::int FROM notification_events WHERE enabled) AS events_enabled`;
    return NextResponse.json({ ok: true, migrated: true, ...r.rows[0] });
  } catch {
    return NextResponse.json({ ok: true, migrated: false });
  }
}
