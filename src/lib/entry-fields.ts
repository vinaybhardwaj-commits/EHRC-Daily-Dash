import type { DepartmentData } from './types';

/**
 * A department's stored entries arrive in TWO different shapes:
 *
 *   1. sheets-sync / CSV upload / WhatsApp analysis:
 *        { date, timestamp, fields: { "<label>": value, ... } }
 *
 *   2. web-form submissions (/api/form-submit, the smart-form engine):
 *        { key: "<label>", value }            // one object PER field
 *
 * The Overview surface and ExecutiveSummary already tolerate both (they read
 * `entry?.fields?.[...]`), but the Daily Dashboard detail components were
 * written only for shape #1. Feeding them a shape #2 entry throws
 * `Cannot read properties of undefined (reading '_source')` and takes down the
 * whole Daily Dashboard view.
 *
 * These helpers collapse both shapes into the uniform fields-shape the
 * dashboard renders from. Malformed / null entries are dropped rather than
 * crashing the render.
 */

export interface NormalizedEntry {
  fields: Record<string, string | number>;
}

/** Normalize a mixed entries array into fields-shape entries. */
export function normalizeEntries(
  rawEntries: DepartmentData['entries'] | undefined | null,
): NormalizedEntry[] {
  const out: NormalizedEntry[] = [];
  // Runtime shape is looser than the compile-time DepartmentEntry type, so we
  // inspect each raw element defensively.
  for (const raw of (rawEntries ?? []) as unknown as Array<Record<string, unknown>>) {
    if (!raw || typeof raw !== 'object') continue;

    const fields = (raw as { fields?: unknown }).fields;
    if (fields && typeof fields === 'object') {
      // Shape #1 — already fields-keyed.
      out.push({ fields: fields as Record<string, string | number> });
      continue;
    }

    const key = (raw as { key?: unknown }).key;
    if (typeof key === 'string') {
      // Shape #2 — one {key,value} object per field. Each becomes a
      // single-field normalized entry; the merge passes downstream fold them
      // together. WhatsApp data never uses this shape, so no `_source` here.
      const value = (raw as { value?: unknown }).value;
      out.push({ fields: { [key]: (value as string | number) ?? '' } });
    }
  }
  return out;
}

/**
 * Merge a department's entries into a single flat fields map.
 * Non-WhatsApp data (web-form / sheets / CSV) takes precedence; WhatsApp
 * entries only fill gaps — matching the dashboard's existing two-pass merge.
 */
export function mergeEntryFields(
  rawEntries: DepartmentData['entries'] | undefined | null,
): Record<string, string | number> {
  const entries = normalizeEntries(rawEntries);
  const merged: Record<string, string | number> = {};
  for (const e of entries) {
    if (e.fields['_source'] === 'whatsapp') continue;
    for (const [k, v] of Object.entries(e.fields)) {
      if (v !== undefined && v !== '') merged[k] = v;
    }
  }
  for (const e of entries) {
    if (e.fields['_source'] !== 'whatsapp') continue;
    for (const [k, v] of Object.entries(e.fields)) {
      if (v !== undefined && v !== '' && merged[k] === undefined) merged[k] = v;
    }
  }
  return merged;
}
