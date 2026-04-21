import { sql } from '@vercel/postgres';
import { FORMS_BY_SLUG } from '@/lib/form-definitions';

interface FormSubmissionBody {
  slug: string;
  date: string;
  fields: Record<string, string | number>;
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

  // Try DD-MM-YY format (2-digit year \u2014 assume 20xx)
  const ddmmyy = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2})$/.exec(s);
  if (ddmmyy) {
    return `20${ddmmyy[3]}-${ddmmyy[2].padStart(2, '0')}-${ddmmyy[1].padStart(2, '0')}`;
  }

  throw new Error(`Invalid date format: ${dateStr}. Expected DD-MM-YYYY, DD/MM/YYYY, or YYYY-MM-DD`);
}

export async function POST(request: Request) {
  try {
    const body: FormSubmissionBody = await request.json();
    const { slug, date, fields, submitted_by, filler_name, filler_device_id } = body;

    // Validate slug exists
    const form = FORMS_BY_SLUG[slug];
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
      // Reject future dates
      if (dateCheck > new Date()) throw new Error('Date cannot be in the future: ' + normalizedDate);
    } catch (e) {
      return Response.json(
        { error: (e as Error).message },
        { status: 400 }
      );
    }

    // Validate required fields with conditional logic
    const isNursingReportingOt = slug === 'nursing' && fields['alsoReportingOtData'] === 'Yes';
    const isHrFillingPipeline = slug === 'hr-manpower' && fields['hiringPipelineApplicable'] === 'Yes';

    // Fields that become required when their toggle is "Yes"
    const conditionalRequired: Record<string, Record<string, boolean>> = {
      'nursing': {
        'otTotalCasesDoneToday': isNursingReportingOt,
        'otFirstCaseOnTimeStart': isNursingReportingOt,
        'otCancellationsToday': isNursingReportingOt,
        // otDelayReason + otCancellationReasons stay optional (free-text follow-ups)
      },
      'hr-manpower': {
        'openPositionsCount': isHrFillingPipeline,
      },
      'clinical-lab': {
        'criticalValueDetails': fields['criticalValuesReportedToday'] === 'Yes',
        'positiveCultureDetails': Number(fields['positiveCulturesToday']) > 0,
      },
    };

    const missingRequired: string[] = [];
    form.sections.forEach(section => {
      section.fields.forEach(field => {
        if (field.type === 'section') return;

        // Determine if this field is required
        const isOtField = ['otTotalCasesDoneToday', 'otFirstCaseOnTimeStart', 'otDelayReason', 'otCancellationsToday', 'otCancellationReasons'].includes(field.id);
        const isHrPipelineField = ['openPositionsCount', 'openPositionsList', 'interviewsScheduledThisWeek', 'offersExtendedThisWeek', 'expectedJoinersThisWeek', 'criticalVacancies'].includes(field.id);

        // Skip OT fields if not reporting OT, skip HR pipeline fields if not Monday
        if (slug === 'nursing' && isOtField && !isNursingReportingOt) return;
        if (slug === 'hr-manpower' && isHrPipelineField && !isHrFillingPipeline) return;

        // Check if field is statically required OR conditionally required
        const isConditionallyRequired = conditionalRequired[slug]?.[field.id] ?? false;
        const isFieldRequired = field.required || isConditionallyRequired;

        if (isFieldRequired) {
          const value = fields[field.id];
          if (value === '' || value === undefined || value === null) {
            missingRequired.push(field.label);
          } else if (field.type === 'number' && isNaN(Number(value))) {
            missingRequired.push(field.label + ' (must be a number)');
          }
        }
      });
    });

    if (missingRequired.length > 0) {
      return Response.json(
        { error: `Missing required fields: ${missingRequired.join(', ')}` },
        { status: 400 }
      );
    }

    // Convert fields to DepartmentEntry format
    const entries: DepartmentEntry[] = [];
    const otEntries: DepartmentEntry[] = []; // For DD.4 dual-write

    form.sections.forEach(section => {
      section.fields.forEach(field => {
        if (field.type !== 'section' && field.id in fields) {
          const entry = { key: field.label, value: String(fields[field.id]) };

          // Separate OT fields from nursing fields for dual-write
          if (slug === 'nursing' && ['otTotalCasesDoneToday', 'otFirstCaseOnTimeStart', 'otDelayReason', 'otCancellationsToday', 'otCancellationReasons'].includes(field.id)) {
            // Map nursing OT field IDs to OT form's field labels (ID-based, not label-based)
            const otIdToLabel: Record<string, string> = {
              'otTotalCasesDoneToday': 'Total cases done today',
              'otFirstCaseOnTimeStart': 'First case on-time start?',
              'otDelayReason': 'If No: delay reason',
              'otCancellationsToday': 'Cancellations today',
              'otCancellationReasons': 'If any: cancellation reasons',
            };
            otEntries.push({ key: otIdToLabel[field.id] || field.label, value: String(fields[field.id]) });
          } else {
            entries.push(entry);
          }
        }
      });
    });

    // Get current timestamp in IST
    const now = new Date();
    const istOffset = 5.5 * 60; // IST is UTC+5:30
    const istDate = new Date(now.getTime() + (istOffset * 60 * 1000) - (now.getTimezoneOffset() * 60 * 1000));
    const isoNow = istDate.toISOString();

    const submittedBy = submitted_by || null;
    const submittedVia = slug;

    // Normalize filler identity (S2 R3)
    const fillerName = (filler_name || '').trim().slice(0, 80) || null;
    const fillerDeviceId = (filler_device_id || '').trim().slice(0, 64) || null;
    const fillerClaimedAt = fillerName && fillerDeviceId ? isoNow : null;

    // Insert/upsert department_data for the primary form
    await sql`
      INSERT INTO department_data (date, slug, name, tab, entries, submitted_by, submitted_via, filler_name, filler_device_id, filler_claimed_at)
      VALUES (${normalizedDate}, ${slug}, ${form.department}, 'web-form', ${JSON.stringify(entries)}::jsonb, ${submittedBy}, ${submittedVia}, ${fillerName}, ${fillerDeviceId}, ${fillerClaimedAt})
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
      const otForm = FORMS_BY_SLUG['ot'];
      await sql`
        INSERT INTO department_data (date, slug, name, tab, entries, submitted_by, submitted_via, filler_name, filler_device_id, filler_claimed_at)
        VALUES (${normalizedDate}, ${'ot'}, ${otForm?.department || 'OT'}, 'web-form', ${JSON.stringify(otEntries)}::jsonb, ${submittedBy ? submittedBy + ' (via nursing form)' : 'Nursing HOD (via nursing form)'}, ${'nursing'}, ${fillerName}, ${fillerDeviceId}, ${fillerClaimedAt})
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
