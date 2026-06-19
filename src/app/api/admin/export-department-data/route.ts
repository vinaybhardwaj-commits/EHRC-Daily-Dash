/* ──────────────────────────────────────────────────────────────────
   Department-data export (INTERNAL — bearer-gated)

   Flattens `department_data` into tidy long rows so Daily Dash data is
   actually queryable outside the app (Metabase, a sheet, another AI thread)
   without guessing at table names. Normalizes BOTH entry shapes:
     - web-form submissions:  entries = [{ key, value }, ...]
     - sheet-sync rows:       entries = [{ date, fields: {label: val}, timestamp }]
   Each output row = { date, slug, department, tab, source, metric, value,
                       submitted_via, filler_name }.

   Gated by isAuthorizedCron → requires Authorization: Bearer
   <SERVICE_OBSERVATIONS_SECRET | CRON_SECRET>. There is NO public access
   (the app has no middleware; this route self-checks). Do not add to any
   public allowlist.

   GET /api/admin/export-department-data
     ?from=YYYY-MM-DD   (default: unbounded)
     ?to=YYYY-MM-DD     (default: unbounded)
     ?slug=emergency    (optional: single department)
     ?format=csv|json   (default: json)
   ────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface FlatRow {
  date: string;
  slug: string;
  department: string;
  tab: string;
  source: 'web-form' | 'sheet' | 'other';
  metric: string;
  value: string;
  submitted_via: string | null;
  filler_name: string | null;
}

interface DeptRow {
  date: string; slug: string; name: string | null; tab: string | null;
  entries: unknown; submitted_via: string | null; filler_name: string | null;
}

function toStringValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Expand one department_data row's `entries` JSONB into long metric rows. */
function flattenRow(row: DeptRow): FlatRow[] {
  const base = {
    date: row.date,
    slug: row.slug,
    department: row.name ?? row.slug,
    tab: row.tab ?? '',
    submitted_via: row.submitted_via ?? null,
    filler_name: row.filler_name ?? null,
  };
  const entries = typeof row.entries === 'string' ? safeParse(row.entries) : row.entries;
  if (!Array.isArray(entries)) return [];

  const out: FlatRow[] = [];
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const obj = e as Record<string, unknown>;

    // web-form shape: { key, value }
    if ('key' in obj && 'value' in obj) {
      out.push({ ...base, source: 'web-form', metric: String(obj.key), value: toStringValue(obj.value) });
      continue;
    }

    // sheet-sync shape: { date, fields: {label: val}, timestamp }
    if ('fields' in obj && obj.fields && typeof obj.fields === 'object') {
      for (const [label, val] of Object.entries(obj.fields as Record<string, unknown>)) {
        out.push({ ...base, source: 'sheet', metric: label, value: toStringValue(val) });
      }
      continue;
    }

    // anything else (whatsapp, legacy) — keep it visible rather than silently drop
    out.push({ ...base, source: 'other', metric: '(raw)', value: toStringValue(obj) });
  }
  return out;
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

function csvCell(s: string): string {
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const p = req.nextUrl.searchParams;
  const from = p.get('from') || '0000-01-01';
  const to = p.get('to') || '9999-12-31';
  const slug = p.get('slug');
  const format = (p.get('format') || 'json').toLowerCase();

  let result;
  try {
    if (slug) {
      result = await sql<DeptRow>`
        SELECT date, slug, name, tab, entries, submitted_via, filler_name
        FROM department_data
        WHERE date >= ${from} AND date <= ${to} AND slug = ${slug}
        ORDER BY date ASC, slug ASC`;
    } else {
      result = await sql<DeptRow>`
        SELECT date, slug, name, tab, entries, submitted_via, filler_name
        FROM department_data
        WHERE date >= ${from} AND date <= ${to}
        ORDER BY date ASC, slug ASC`;
    }
  } catch (e) {
    return NextResponse.json({ error: 'query_failed', detail: String((e as Error).message).slice(0, 200) }, { status: 500 });
  }

  const rows: FlatRow[] = [];
  for (const r of result.rows) rows.push(...flattenRow(r));

  if (format === 'csv') {
    const header = ['date', 'slug', 'department', 'tab', 'source', 'metric', 'value', 'submitted_via', 'filler_name'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        r.date, r.slug, r.department, r.tab, r.source, r.metric, r.value, r.submitted_via ?? '', r.filler_name ?? '',
      ].map(c => csvCell(String(c))).join(','));
    }
    return new NextResponse(lines.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="department-data-${from}_to_${to}.csv"`,
      },
    });
  }

  return NextResponse.json({ from, to, slug: slug || null, count: rows.length, rows });
}
