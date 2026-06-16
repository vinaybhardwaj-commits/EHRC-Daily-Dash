// ═══════════════════════════════════════════════════════════════════
// WhatsApp Notification Utility via WaSenderAPI
// Unofficial WhatsApp API (own linked number, Bearer-token REST send).
// Env is read lazily inside sendWhatsApp to avoid build-time crashes.
// ═══════════════════════════════════════════════════════════════════

const WASENDER_SEND_URL =
  process.env.WASENDER_API_URL || 'https://www.wasenderapi.com/api/send-message';

// WaSenderAPI wants the recipient in plain E.164 (no Twilio 'whatsapp:' prefix).
function normalizeRecipient(to: string): string {
  return to.trim().replace(/^whatsapp:/i, '').replace(/\s+/g, '');
}

// ── Notification recipients ──────────────────────────────────────
// Admin recipient(s) in plain E.164. (Same number is linked as the WaSender sender.)
const ADMIN_PHONES = ['+916362191675'];

// Department head WhatsApp numbers in plain E.164.
const DEPT_HEAD_PHONES: Record<string, string> = {
  // 'emergency': '+91XXXXXXXXXX',
};

export interface WhatsAppResult {
  success: boolean;
  sid?: string;
  error?: string;
}

// ── Core send function ───────────────────────────────────────────

export async function sendWhatsApp(
  to: string,
  body: string
): Promise<WhatsAppResult> {
  const apiKey = process.env.WASENDER_API_KEY;
  if (!apiKey) {
    const error = 'Missing WASENDER_API_KEY';
    console.error(`[WhatsApp] ${error}`);
    return { success: false, error };
  }
  try {
    const res = await fetch(WASENDER_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: normalizeRecipient(to), text: body }),
    });
    const data = (await res.json().catch(() => null)) as
      | { success?: boolean; data?: { msgId?: number | string; status?: string }; message?: string }
      | null;
    if (!res.ok || !data?.success) {
      const error = data?.message || `WaSenderAPI HTTP ${res.status}`;
      console.error(`[WhatsApp] Failed to send to ${to}:`, error);
      return { success: false, error };
    }
    return { success: true, sid: data.data?.msgId != null ? String(data.data.msgId) : undefined };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[WhatsApp] Failed to send to ${to}:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

// ── Broadcast to all admins ──────────────────────────────────────

export async function notifyAdmins(body: string): Promise<WhatsAppResult[]> {
  return Promise.all(ADMIN_PHONES.map(phone => sendWhatsApp(phone, body)));
}

// ── Notify a department head (falls back to admin) ───────────────

export async function notifyDeptHead(
  deptSlug: string,
  body: string
): Promise<WhatsAppResult[]> {
  const deptPhone = DEPT_HEAD_PHONES[deptSlug];
  if (deptPhone) {
    // Send to both dept head and admin
    return Promise.all([
      sendWhatsApp(deptPhone, body),
      ...ADMIN_PHONES.map(phone => sendWhatsApp(phone, body)),
    ]);
  }
  // No dept head phone — just notify admins
  return notifyAdmins(body);
}

// ═══════════════════════════════════════════════════════════════════
// Pre-built message templates
// ═══════════════════════════════════════════════════════════════════

export function buildMissingDeptMessage(
  department: string,
  headName: string,
  date: string,
  formUrl: string
): string {
  return [
    `*EHRC Daily Dashboard*`,
    `Missing Submission Alert`,
    ``,
    `Department: *${department}*`,
    `Head: ${headName}`,
    `Date: ${date}`,
    ``,
    `The daily standup form has NOT been submitted yet.`,
    ``,
    `Submit now: ${formUrl}`,
  ].join('\n');
}

export function buildNewComplaintMessage(
  complaintType: string,
  targetDept: string,
  description: string,
  requesterName: string,
  requesterDept: string,
  urgency: string,
  requestId: string
): string {
  return [
    `*SEWA - New Complaint*`,
    ``,
    `Type: *${complaintType}*`,
    `To: *${targetDept}*`,
    `From: ${requesterName} (${requesterDept})`,
    `Urgency: ${urgency}`,
    ``,
    `"${description.slice(0, 200)}${description.length > 200 ? '...' : ''}"`,
    ``,
    `ID: ${requestId}`,
    `Respond: https://ehrc-daily-dash.vercel.app/sewa/queue`,
  ].join('\n');
}

export function buildBlockedComplaintMessage(
  complaintType: string,
  targetDept: string,
  blockingDept: string,
  blockedReason: string,
  requestId: string
): string {
  return [
    `*SEWA - BLOCKED Complaint*`,
    ``,
    `A complaint has been marked BLOCKED and needs escalation.`,
    ``,
    `Type: *${complaintType}*`,
    `Dept: *${targetDept}*`,
    `Blocked by: *${blockingDept || 'Not specified'}*`,
    `Reason: "${blockedReason.slice(0, 200)}${blockedReason.length > 200 ? '...' : ''}"`,
    ``,
    `ID: ${requestId}`,
    `Dashboard: https://ehrc-daily-dash.vercel.app/sewa/dashboard`,
  ].join('\n');
}

export function buildSlaBreachMessage(
  complaintType: string,
  targetDept: string,
  status: string,
  elapsedMin: number,
  slaMin: number,
  requestId: string
): string {
  const overBy = Math.round(elapsedMin - slaMin);
  return [
    `*SEWA - SLA BREACH*`,
    ``,
    `A complaint has breached its SLA target.`,
    ``,
    `Type: *${complaintType}*`,
    `Dept: *${targetDept}*`,
    `Status: ${status}`,
    `Elapsed: ${Math.round(elapsedMin)} min (SLA: ${slaMin} min)`,
    `Over by: *${overBy} min*`,
    ``,
    `ID: ${requestId}`,
    `Dashboard: https://ehrc-daily-dash.vercel.app/sewa/dashboard`,
  ].join('\n');
}

export function buildResolutionMessage(
  complaintType: string,
  targetDept: string,
  resolvedBy: string,
  resolutionNote: string,
  requestId: string
): string {
  return [
    `*SEWA - Complaint Resolved*`,
    ``,
    `Type: *${complaintType}*`,
    `Dept: *${targetDept}*`,
    `Resolved by: ${resolvedBy}`,
    `Note: "${resolutionNote.slice(0, 200)}${resolutionNote.length > 200 ? '...' : ''}"`,
    ``,
    `ID: ${requestId}`,
  ].join('\n');
}

export function buildDailySummaryMessage(
  date: string,
  totalOpen: number,
  totalBlocked: number,
  totalBreached: number,
  totalNewToday: number,
  totalResolved: number,
  hotspots: { dept: string; open: number; blocked: number; breached: number }[]
): string {
  const lines = [
    `*SEWA Daily Summary*`,
    `Date: ${date}`,
    ``,
    `Open: *${totalOpen}* | New today: *${totalNewToday}*`,
    `Blocked: *${totalBlocked}* | SLA Breach: *${totalBreached}*`,
    `Resolved today: *${totalResolved}*`,
  ];

  if (hotspots.length > 0) {
    lines.push('', `*Hotspots:*`);
    for (const h of hotspots.slice(0, 5)) {
      const tags = [];
      if (h.blocked > 0) tags.push(`${h.blocked} blocked`);
      if (h.breached > 0) tags.push(`${h.breached} breach`);
      lines.push(`  ${h.dept}: ${h.open} open${tags.length ? ' | ' + tags.join(', ') : ''}`);
    }
  }

  lines.push('', `Dashboard: https://ehrc-daily-dash.vercel.app/sewa/dashboard`);
  return lines.join('\n');
}
