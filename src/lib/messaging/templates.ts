import { sql } from '@vercel/postgres';

/** Render a stored template by key, substituting {{vars}}. Unfilled tokens are stripped. */
export async function renderTemplate(
  key: string,
  vars: Record<string, string | number>
): Promise<{ body: string; channel: string } | null> {
  const r = await sql`SELECT body, channel FROM notification_templates WHERE key=${key} AND active=true LIMIT 1`;
  const row = r.rows[0];
  if (!row) return null;
  let body = String(row.body);
  for (const [k, v] of Object.entries(vars)) {
    body = body.split(`{{${k}}}`).join(String(v ?? ''));
  }
  body = body.replace(/\{\{[a-zA-Z_]+\}\}/g, '').replace(/[ \t]+\n/g, '\n').trim();
  return { body, channel: String(row.channel) };
}
