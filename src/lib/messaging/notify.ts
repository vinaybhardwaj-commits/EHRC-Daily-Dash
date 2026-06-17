import { sql } from '@vercel/postgres';
import { enqueue } from './outbox';
import { renderTemplate } from './templates';
import { getRecipientsByRole, type Recipient, type RecipientRole } from './recipients';

/** Master kill-switch. Engine sends nothing unless this is on. */
export function messagingEnabled(): boolean {
  const v = (process.env.MESSAGING_ENABLED || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

interface EventRule {
  event_type: string; enabled: boolean; audience: string;
  template_key: string | null; channel_policy: string;
}

export interface NotifyOpts {
  recipients?: Recipient[];                              // explicit override (else by event.audience)
  vars?: Record<string, string | number>;               // shared template vars
  perRecipientVars?: (r: Recipient) => Record<string, string | number>;
  dedupSuffix?: string;                                  // appended to dedup key (e.g. the date)
  templateKey?: string;                                 // override the event's template
  force?: boolean;                                       // bypass enabled/flag (controlled test paths)
}

export interface NotifyResult { skipped?: string; enqueued: number; recipients: number; }

/**
 * Single entry point for every notification. Resolves the event rule + audience,
 * renders the template per recipient, and enqueues (idempotent on dedup_key).
 * No-ops unless MESSAGING_ENABLED and the event is enabled (or opts.force).
 * WhatsApp-only policy: recipients without a verified number are skipped.
 */
export async function notify(eventType: string, opts: NotifyOpts = {}): Promise<NotifyResult> {
  const ev = (await sql`
    SELECT event_type, enabled, audience, template_key, channel_policy
    FROM notification_events WHERE event_type=${eventType} LIMIT 1
  `).rows[0] as unknown as EventRule | undefined;
  if (!ev) return { skipped: 'no_event_rule', enqueued: 0, recipients: 0 };
  // Single go-live switch = MESSAGING_ENABLED. (ev.enabled is reserved as a
  // future per-event mute surfaced in the MSG.5 console; not enforced yet.)
  if (!opts.force && !messagingEnabled()) {
    return { skipped: 'disabled', enqueued: 0, recipients: 0 };
  }

  const templateKey = opts.templateKey || ev.template_key || eventType;
  const recips = opts.recipients ?? await getRecipientsByRole(ev.audience as RecipientRole);

  let enqueued = 0;
  for (const r of recips) {
    if (!r.active || !r.verified || !r.whatsapp_e164) continue; // WhatsApp-only: no number => skip
    const vars = {
      name: r.name,
      department: r.dept_slug || '',
      ...(opts.vars || {}),
      ...(opts.perRecipientVars ? opts.perRecipientVars(r) : {}),
    };
    const rendered = await renderTemplate(templateKey, vars);
    if (!rendered) continue;
    const ok = await enqueue({
      event_type: eventType, recipient_id: r.id, dept_slug: r.dept_slug,
      channel: 'whatsapp', to_address: r.whatsapp_e164,
      rendered_body: rendered.body,
      dedup_key: `${eventType}|${r.id}|${opts.dedupSuffix || ''}`,
    });
    if (ok) enqueued++;
  }
  return { enqueued, recipients: recips.length };
}
