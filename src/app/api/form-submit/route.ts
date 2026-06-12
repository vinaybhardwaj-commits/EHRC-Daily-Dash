import { sql } from '@vercel/postgres';
import { getFormConfig } from '@/lib/form-engine/registry';
import { isFieldVisible, isFieldRequired } from '@/lib/form-engine/condition-evaluator';

interface FormSubmissionBody {
  slug: string;
  date: string;
  fields: Record<string, string | number | boolean | unknown[]>;
  submitted_by?: string;
  filler_name?: string;
  filler_device_id?: string;
}

interface DepartmentEntry {
  key: string;
  value: string;
}

// Normalize date to YYYY-MM-DD format
function normalizeDate(dateStr: string): string {
  const s = dateStr.trim().replace(/_/g, '-');

  // Try YYYY-MM-DD format
  const yyyymmdd = /^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})$/.exec(s);
  if (yyyymmdd) {
    return `${yyyymmdd[1]}-${yyyymmdd[2].padStart(2, '0')}-${yyyymmdd[3].padStart(2, '0')}`;
  }

  // Try DD-MM-YYYY format (4-digit year)
  const ddmmyyyy = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(s);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}`;
  }

  // Try DD-MM-YY format (2-digit year — assume 20xx)
  const ddmmyy = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2})$/.exec(s);
  if (ddmmyy) {
    return `20${ddmmyy[3]}-${ddmmyy[2].padStart(2, '0')}-${ddmmyy[1].padStart(2, '0')}`;
  }

  throw new Error(`Invalid date format: ${dateStr}. Expected DD-MM-YYYY, DD/MM/YYYY, or YYYY-MM-DD`);
}

// Serialize a field value for storage as a department_data entry value.
// Repeater rows / arrays / objects become JSON; toggles become Yes/No; rest become strings.
function serializeValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Nursing fields that dual-write into the OT department row (DD.4)
const NURSING_OT_FIELD_IDS = [
  'otTotalCasesDoneToday',
  'otFirstCaseOnTimeStart',
  'otDelayReason',
  'otCancellationsToday',
  'otCancellationReasons',
] as const;

// Map nursing OT field IDs to OT form's field labels (ID-based, not label-based)
const NURSING_OT_ID_TO_LABEL: Record<string, string> = {
  otTotalCasesDoneToday: 'Total cases done today',
  otFirstCaseOnTimeStart: 'First case on-time start?',
  otDelayReason: 'If No: delay reason',
  otCancellationsToday: 'Cancellations today',
  otCancellationReasons: 'If any: cancellation reasons',
};

// Merge a new web-form submission's entries with what's already stored for
// (date, slug). Existing keys keep their position; new values overwrite;
// labels in `hiddenLabels` are removed (stale values of now-hidden conditional
// fields). If the stored row isn't in the web-form {key,value}[] shape
// (e.g. sheets-sync), the new entries replace it wholesale, as before.
async function mergeWithExisting(
  date: string,
  slug: string,
  newEntries: DepartmentEntry[],
  hiddenLabels: string[],
): Promise<DepartmentEntry[]> {
  try {
    const existing = await sql`
      SELECT entries FROM department_data WHERE date = ${date} AND slug = ${slug} LIMIT 1
    `;
    const stored = existing.rows[0]?.entries;
    if (!Array.isArray(stored) || stored.length === 0) return newEntries;
    const isKeyValueShape = stored.every(
      (e: unknown) => !!e && typeof (e as DepartmentEntry).key === 'string' && 'value' in (e as DepartmentEntry),
    );
    if (!isKeyValueShape) return newEntries;

    const merged = new Map<string, string>();
    for (const e of stored as DepartmentEntry[]) merged.set(e.key, e.value);
    for (const label of hiddenLabels) merged.delete(label);
    for (const e of newEntries) merged.set(e.key, e.value);
    return Array.from(merged, ([key, value]) => ({ key, value }));
  } catch {
    // Merge is best-effort — fall back to replace-on-conflict (prior behaviour)
    return newEntries;
  }
}

export async function POST(request: Request) {
  try {
    const body: FormSubmissionBody = await request.json();
    const { slug, date, fields, submitted_by, filler_name, filler_device_id } = body;

    // Validate slug exists — the smart-form registry is the single source of truth.
    // (Previously this checked legacy FORMS_BY_SLUG, which silently lacked
    // quality-accreditation + infection-control and dropped smart-form-only fields.)
    const form = getFormConfig(slug);
    if (!form) {
      return Response.json(
        { error: `Form with slug "${slug}" not found` },
        { status: 400 }
      );
    }

    // Validate date format
    let normalizedDate: string;
    try {
      normalizedDate = normalizeDate(date);
      // Validate the date is a real calendar date (reject Feb 31, etc.)
      const dateCheck = new Date(normalizedDate + 'T00:00:00Z');
      if (isNaN(dateCheck.getTime())) throw new Error('Invalid calendar date: ' + normalizedDate);
      // Reject future dates — compared against the current IST calendar date,
      // not UTC midnight (night-shift fills between 00:00–05:30 IST used to 400 here).
      const istToday = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (normalizedDate > istToday) throw new Error('Date cannot be in the future: ' + normalizedDate);
    } catch (e) {
      return Response.json(
        { error: (e as Error).message },
        { status: 400 }
      );
    }

    // Validate required fields using the smart-form config's native
    // showWhen / requireWhen conditions (same rules the client renders with).
    const state = fields as Record<string, string | number | boolean | string[] | undefined>;
    const missingRequired: string[] = [];

    for (const section of form.sections) {
      if (!isFieldVisible(section.showWhen, state)) continue;

      for (const field of section.fields) {
        if (field.type === 'computed') continue;
        if (!isFieldVisible(field.showWhen, state)) continue;

        const required = isFieldRequired(field.required, field.requireWhen, state);
        if (!required) continue;

        const value = state[field.id];
        const isEmpty =
          value === '' || value === undefined || value === null ||
          (Array.isArray(value) && value.length === 0);

        if (isEmpty) {
          missingRequired.push(field.label);
        } else if ((field.type === 'number' || field.type === 'currency') && isNaN(Number(value))) {
          missingRequired.push(field.label + ' (must be a number)');
        }
      }
    }

    if (missingRequired.length > 0) {
      return Response.json(
        { error: `Missing required fields: ${missingRequired.join(', ')}` },
        { status: 400 }
      );
    }

    // Convert fields to DepartmentEntry format.
    // Only visible fields are persisted (hidden conditional fields with stale
    // values are pruned), keyed by field label for dashboard compatibility.
    const entries: DepartmentEntry[] = [];
    const otEntries: DepartmentEntry[] = []; // For DD.4 dual-write
    // Labels of fields currently hidden by conditions — pruned from any
    // previously-stored entries during the merge below (stale conditional data).
    const hiddenLabels: string[] = [];
    const isNursingReportingOt = slug === 'nursing' && fields['alsoReportingOtData'] === 'Yes';

    for (const section of form.sections) {
      const sectionVisible = isFieldVisible(section.showWhen, state);

      for (const field of section.fields) {
        if (field.type === 'computed') continue;
        if (!sectionVisible || !isFieldVisible(field.showWhen, state)) {
          hiddenLabels.push(field.label);
          continue;
        }
        if (!(field.id in fields)) continue;

        const value = serializeValue(fields[field.id]);

        // Separate OT fields from nursing fields for dual-write
        if (slug === 'nursing' && (NURSING_OT_FIELD_IDS as readonly string[]).includes(field.id)) {
          otEntries.push({ key: NURSING_OT_ID_TO_LABEL[field.id] || field.label, value });
        } else {
          entries.push({ key: field.label, value });
        }
      }
    }

    // Real UTC timestamp. (Previously shifted +5:30 then .toISOString(), which
    // produced IST wall-time stamped with a Z — off by 5.5h to any UTC parser.
    // Display layers convert to IST via toLocaleString('en-IN').)
    const isoNow = new Date().toISOString();

    const submittedBy = submitted_by || null;
    const submittedVia = slug;

    // Normalize filler identity (S2 R3)
    const fillerName = (filler_name || '').trim().slice(0, 80) || null;
    const fillerDeviceId = (filler_device_id || '').trim().slice(0, 64) || null;
    const fillerClaimedAt = fillerName && fillerDeviceId ? isoNow : null;

    // Merge with any existing web-form submission for this (date, slug):
    // values submitted now win; previously-submitted fields absent from this
    // submission are preserved (a quick second submit no longer wipes the
    // first one's optional fields); fields currently hidden by conditions
    // are dropped. Rows in the sheets-sync shape are replaced, not merged.
    const mergedEntries = await mergeWithExisting(normalizedDate, slug, entries, hiddenLabels);

    // Insert/upsert department_data for the primary form
    await sql`
      INSERT INTO department_data (date, date_d, slug, name, tab, entries, submitted_by, submitted_via, filler_name, filler_device_id, filler_claimed_at)
      VALUES (${normalizedDate}, ${normalizedDate}::date, ${slug}, ${form.department}, 'web-form', ${JSON.stringify(mergedEntries)}::jsonb, ${submittedBy}, ${submittedVia}, ${fillerName}, ${fillerDeviceId}, ${fillerClaimedAt})
      ON CONFLICT (date, slug) DO UPDATE SET
        entries = EXCLUDED.entries,
        submitted_by = EXCLUDED.submitted_by,
        submitted_via = EXCLUDED.submitted_via,
        filler_name = COALESCE(EXCLUDED.filler_name, department_data.filler_name),
        filler_device_id = COALESCE(EXCLUDED.filler_device_id, department_data.filler_device_id),
        filler_claimed_at = COALESCE(EXCLUDED.filler_claimed_at, department_data.filler_claimed_at);
    `;

    // DD.4: If nursing is also reporting OT data, dual-write to OT department_data
    if (slug === 'nursing' && isNursingReportingOt && otEntries.length > 0) {
      const otForm = getFormConfig('ot');
      const mergedOtEntries = await mergeWithExisting(normalizedDate, 'ot', otEntries, []);
      await sql`
        INSERT INTO department_data (date, date_d, slug, name, tab, entries, submitted_by, submitted_via, filler_name, filler_device_id, filler_claimed_at)
        VALUES (${normalizedDate}, ${normalizedDate}::date, ${'ot'}, ${otForm?.department || 'OT'}, 'web-form', ${JSON.stringify(mergedOtEntries)}::jsonb, ${submittedBy ? submittedBy + ' (via nursing form)' : 'Nursing HOD (via nursing form)'}, ${'nursing'}, ${fillerName}, ${fillerDeviceId}, ${fillerClaimedAt})
        ON CONFLICT (date, slug) DO UPDATE SET
          entries = EXCLUDED.entries,
          submitted_by = EXCLUDED.submitted_by,
          submitted_via = EXCLUDED.submitted_via,
          filler_name = COALESCE(EXCLUDED.filler_name, department_data.filler_name),
          filler_device_id = COALESCE(EXCLUDED.filler_device_id, department_data.filler_device_id),
          filler_claimed_at = COALESCE(EXCLUDED.filler_claimed_at, department_data.filler_claimed_at);
      `;
    }

    // Upsert day_snapshots
    await sql`
      INSERT INTO day_snapshots (date, updated_at)
      VALUES (${normalizedDate}, ${isoNow})
      ON CONFLICT (date) DO UPDATE SET updated_at = ${isoNow};
    `;

    // S2 R3: bump form_fillers.submission_count + last_seen_at if identity provided
    if (fillerDeviceId && fillerName) {
      await sql`
        INSERT INTO form_fillers (device_id, name, first_seen_at, last_seen_at, submission_count)
        VALUES (${fillerDeviceId}, ${fillerName}, NOW(), NOW(), 1)
        ON CONFLICT (device_id) DO UPDATE SET
          last_seen_at = NOW(),
          submission_count = form_fillers.submission_count + 1,
          name = COALESCE(form_fillers.name, EXCLUDED.name);
      `;
    }

    return Response.json({
      success: true,
      message: `Form submitted successfully for ${form.department}`,
      date: normalizedDate,
      dual_write: slug === 'nursing' && isNursingReportingOt ? 'OT data also saved' : undefined,
    });
  } catch (error) {
    console.error('Form submission error:', error);
    return Response.json(
      {
        error: 'Failed to submit form',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
