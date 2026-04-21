import { sql } from '@vercel/postgres';
import { createHash } from 'crypto';
import type { NextRequest } from 'next/server';

// POST /api/form-filler
// Body: { device_id: string, name: string }
// Upserts form_fillers; if name changed, writes form_filler_audit row.
// Returns: { device_id, name, first_seen_at, last_seen_at, submission_count, changed: boolean }

interface Body {
  device_id?: string;
  name?: string;
}

function sanitizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 80);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const deviceId = (body.device_id || '').trim();
    const rawName = (body.name || '').trim();

    if (!deviceId || deviceId.length < 8 || deviceId.length > 64) {
      return Response.json({ error: 'Invalid device_id' }, { status: 400 });
    }
    const name = sanitizeName(rawName);
    if (!name || name.length < 2) {
      return Response.json({ error: 'Name must be at least 2 characters' }, { status: 400 });
    }

    // Read existing row (if any) to detect rename
    const existing = await sql`SELECT device_id, name FROM form_fillers WHERE device_id = ${deviceId} LIMIT 1`;
    const previous = existing.rows[0] as { device_id: string; name: string } | undefined;
    const changed = !!previous && previous.name !== name;

    // Upsert — on conflict bump last_seen_at and update name
    await sql`
      INSERT INTO form_fillers (device_id, name, first_seen_at, last_seen_at, submission_count)
      VALUES (${deviceId}, ${name}, NOW(), NOW(), 0)
      ON CONFLICT (device_id) DO UPDATE SET
        name = EXCLUDED.name,
        last_seen_at = NOW()
    `;

    // If rename, write audit row (also log creation as audit for traceability)
    const isNew = !previous;
    if (isNew || changed) {
      const ua = request.headers.get('user-agent') || null;
      const xff = request.headers.get('x-forwarded-for') || '';
      const ip = xff.split(',')[0].trim() || request.headers.get('x-real-ip') || '';
      const ipHash = ip ? createHash('sha256').update(ip).digest('hex').slice(0, 32) : null;
      await sql`
        INSERT INTO form_filler_audit (device_id, old_name, new_name, user_agent, ip_hash)
        VALUES (${deviceId}, ${previous?.name ?? null}, ${name}, ${ua}, ${ipHash})
      `;
    }

    const row = await sql`
      SELECT device_id, name, first_seen_at, last_seen_at, submission_count
      FROM form_fillers WHERE device_id = ${deviceId} LIMIT 1
    `;

    return Response.json({
      ...row.rows[0],
      changed,
      created: isNew,
    });
  } catch (error) {
    console.error('form-filler POST error:', error);
    return Response.json(
      { error: 'Failed to upsert form filler', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}

// GET /api/form-filler?key=<ADMIN_KEY>&limit=100
// Admin-only (validates against ADMIN_KEY env). Returns fillers sorted by last_seen_at DESC.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  const expected = process.env.ADMIN_KEY || '';
  if (!expected || key !== expected) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 500);
  try {
    const result = await sql`
      SELECT device_id, name, first_seen_at, last_seen_at, submission_count
      FROM form_fillers
      ORDER BY last_seen_at DESC
      LIMIT ${limit}
    `;
    // Count submissions stamped on department_data with this filler_device_id in the last 30 days
    // (cross-check to spot mismatches between form_fillers.submission_count and actual rows)
    const recent = await sql`
      SELECT filler_device_id, COUNT(*)::int AS stamped_30d
      FROM department_data
      WHERE filler_device_id IS NOT NULL
        AND filler_claimed_at > NOW() - INTERVAL '30 days'
      GROUP BY filler_device_id
    `;
    const stampedByDevice = new Map<string, number>();
    for (const r of recent.rows as { filler_device_id: string; stamped_30d: number }[]) {
      stampedByDevice.set(r.filler_device_id, r.stamped_30d);
    }
    const enriched = result.rows.map(r => ({
      ...r,
      stamped_30d: stampedByDevice.get(r.device_id as string) ?? 0,
    }));
    return Response.json({ fillers: enriched, total: result.rows.length });
  } catch (error) {
    console.error('form-filler GET (list) error:', error);
    return Response.json(
      { error: 'Failed to load fillers', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}
