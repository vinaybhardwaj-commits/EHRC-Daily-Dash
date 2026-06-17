import { sql } from '@vercel/postgres';

export type RecipientRole = 'hod' | 'admin' | 'gm' | 'dept_head' | 'other';

export interface Recipient {
  id: number;
  hospital_code: string;
  ext_key: string | null;
  dept_slug: string | null;
  role: RecipientRole;
  name: string;
  whatsapp_e164: string;
  email: string;
  verified: boolean;
  opt_in: boolean;
  active: boolean;
  channel_pref: string;
}

const COLS = `id, hospital_code, ext_key, dept_slug, role, name, whatsapp_e164, email,
              verified, opt_in, active, channel_pref`;

/** Normalize any phone input to plain E.164 ('+<digits>'). */
export function normalizeE164(raw: string): string {
  const s = (raw || '').trim().replace(/^whatsapp:/i, '').replace(/[\s\-()]/g, '');
  if (!s) return '';
  return s.startsWith('+') ? s : `+${s}`;
}

export async function listRecipients(): Promise<Recipient[]> {
  const r = await sql.query(
    `SELECT ${COLS} FROM notification_recipients
     ORDER BY role, dept_slug NULLS FIRST, name`
  );
  return r.rows as unknown as Recipient[];
}

export async function getActiveHods(): Promise<Recipient[]> {
  const r = await sql.query(
    `SELECT ${COLS} FROM notification_recipients
     WHERE role = 'hod' AND active = true ORDER BY dept_slug`
  );
  return r.rows as unknown as Recipient[];
}

export async function getRecipientsByRole(role: RecipientRole): Promise<Recipient[]> {
  const r = await sql.query(
    `SELECT ${COLS} FROM notification_recipients WHERE role = $1 AND active = true`,
    [role]
  );
  return r.rows as unknown as Recipient[];
}

/** Admin-entered contact update; returns the updated row. */
export async function updateRecipient(
  id: number,
  patch: { whatsapp_e164?: string; email?: string; name?: string; active?: boolean; channel_pref?: string }
): Promise<Recipient | null> {
  const wa = patch.whatsapp_e164 !== undefined ? normalizeE164(patch.whatsapp_e164) : null;
  const r = await sql`
    UPDATE notification_recipients SET
      whatsapp_e164 = COALESCE(${wa}, whatsapp_e164),
      email         = COALESCE(${patch.email ?? null}, email),
      name          = COALESCE(${patch.name ?? null}, name),
      active        = COALESCE(${patch.active ?? null}, active),
      channel_pref  = COALESCE(${patch.channel_pref ?? null}, channel_pref),
      updated_at    = NOW()
    WHERE id = ${id}
    RETURNING id, hospital_code, ext_key, dept_slug, role, name, whatsapp_e164, email,
              verified, opt_in, active, channel_pref
  `;
  return (r.rows[0] as unknown as Recipient) || null;
}

export async function setRecipientVerified(id: number, verified: boolean): Promise<void> {
  await sql`
    UPDATE notification_recipients
    SET verified = ${verified},
        verified_at = ${verified ? new Date().toISOString() : null},
        opt_in = CASE WHEN ${verified} THEN true ELSE opt_in END,
        updated_at = NOW()
    WHERE id = ${id}
  `;
}
