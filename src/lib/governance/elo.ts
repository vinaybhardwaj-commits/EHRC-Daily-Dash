// src/lib/governance/elo.ts
// GV — read-only access to the even-elo (EPI governance) database.
// Uses EVEN_ELO_READ_URL; reads only. All WRITES to even-elo go through the
// audited service endpoint (GV.3), never through this connection.

import { createPool, VercelPool } from '@vercel/postgres';
import type { RosterPhysician } from './name-match';

let _pool: VercelPool | null = null;

function eloPool(): VercelPool | null {
  const url = process.env.EVEN_ELO_READ_URL;
  if (!url) return null;
  if (!_pool) _pool = createPool({ connectionString: url });
  return _pool;
}

export async function fetchRoster(): Promise<RosterPhysician[]> {
  const pool = eloPool();
  if (!pool) return [];
  const r = await pool.query(
    `SELECT id::text AS id, full_name FROM physicians WHERE COALESCE(current_status, 'active') NOT IN ('inactive', 'resigned') ORDER BY full_name`,
  );
  return r.rows as RosterPhysician[];
}
