// ═══════════════════════════════════════════════════════════════════
// WhatsApp Notification Utility via Twilio
// Lazy-init pattern (same as Resend) to avoid build-time env crashes
// ═══════════════════════════════════════════════════════════════════

import twilio from 'twilio';

// Lazy-init: must NOT create client at module scope
function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
  }
  return twilio(sid, token);
}

function getFromNumber(): string {
  return process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
}

// ── Notification recipients ──────────────────────────────────────
// V's number (sandbox-connected) — add more as they join sandbox
const ADMIN_PHONES = ['whatsapp:+916362191675'];

// Department head WhatsApp numbers (add as they join sandbox)
// For now, all notifications go to admin
const DEPT_HEAD_PHONES: Record<string, string> = {
  // 'emergency': 'whatsapp:+91XXXXXXXXXX',
  // Add department heads as they join the Twilio sandbox
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
  try {
    const client = getTwilioClient();
    const message = await client.messages.create({
      from: getFromNumber(),
      to,
      body,
    });
    return { success: true, sid: message.sid };
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
