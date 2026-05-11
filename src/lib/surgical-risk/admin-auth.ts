/**
 * SPAS — Admin authentication helper for SREWS config endpoints.
 *
 * Matches the existing EHRC admin pattern (see /api/admin/validate):
 *   - Accepts ADMIN_KEY, BACKUP_SECRET, or MIGRATION_SECRET as valid keys
 *   - Read via `?key=` query param OR `X-Admin-Key` header
 *
 * Per SPAS PRD decision #6, the admin UI is restricted to V (the only person
 * with the admin key). The Rounds-style `super_admin` JWT cookie isn't used
 * in EHRC-Daily-Dash — it lives in the sister Even-OS/Rounds repos.
 */

import { NextRequest } from 'next/server';

export interface AdminAuthResult {
  ok: boolean;
  /** First key from env that the user matched against. Useful for audit. */
  matched_key?: 'ADMIN_KEY' | 'BACKUP_SECRET' | 'MIGRATION_SECRET';
  error?: string;
}

export function checkAdminKey(req: NextRequest): AdminAuthResult {
  const fromQuery = req.nextUrl.searchParams.get('key') || '';
  const fromHeader = req.headers.get('x-admin-key') || '';
  const provided = fromHeader || fromQuery;

  if (!provided) {
    return { ok: false, error: 'Missing key (provide ?key= or X-Admin-Key header)' };
  }

  const adminKey = process.env.ADMIN_KEY || '';
  const backupSecret = process.env.BACKUP_SECRET || '';
  const migrationSecret = process.env.MIGRATION_SECRET || '';

  if (adminKey && provided === adminKey) return { ok: true, matched_key: 'ADMIN_KEY' };
  if (backupSecret && provided === backupSecret) return { ok: true, matched_key: 'BACKUP_SECRET' };
  if (migrationSecret && provided === migrationSecret) return { ok: true, matched_key: 'MIGRATION_SECRET' };

  return { ok: false, error: 'Invalid key' };
}
