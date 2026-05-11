/**
 * Webhook authentication helper for SREWS API routes.
 * Apps Script handlers (webhook + time-trigger) send X-Webhook-Secret header
 * matching the Vercel SURGERY_WEBHOOK_SECRET env var.
 */

import type { NextRequest } from 'next/server';

export function checkWebhookSecret(req: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.SURGERY_WEBHOOK_SECRET;
  if (!expected) {
    return { ok: false, status: 500, error: 'SURGERY_WEBHOOK_SECRET not configured on server' };
  }
  const provided = req.headers.get('x-webhook-secret') || req.headers.get('X-Webhook-Secret');
  if (!provided) {
    return { ok: false, status: 401, error: 'Missing X-Webhook-Secret header' };
  }
  if (provided !== expected) {
    return { ok: false, status: 403, error: 'Invalid X-Webhook-Secret' };
  }
  return { ok: true };
}
