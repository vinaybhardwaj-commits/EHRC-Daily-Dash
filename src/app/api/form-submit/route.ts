import { sql } from '@vercel/postgres';
import { FORMS_BY_SLUG } from '@/lib/form-definitions';

interface FormSubmissionBody {
  slug: string;
  date: string;
  fields: Record<string, string | number>;
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

export async function POST(request: Request) {
  try {
    const body: FormSubmissionBody = await request.json();
    const { slug, date, fields } = body;

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
    } catch (e) {
      return Response.json(
        { error: (e as Error).message },
        { status: 400 }
      );
    }

    // Validate required fields
    const missingRequired: string[] = [];
    form.sections.forEach(section => {
      section.fields.forEach(field => {
        if (field.type !== 'section' && field.required) {
          const value = fields[field.id];
          if (value === '' || value === undefined || value === null) {
            missingRequired.push(field.label);
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
    form.sections.forEach(section => {
      section.fields.forEach(field => {
        if (field.type !== 'section' && field.id in fields) {
          entries.push({
            key: field.label,
            value: String(fields[field.id]),
          });
        }
      });
    });

    // Get current timestamp in IST
    const now = new Date();
    const istOffset = 5.5 * 60; // IST is UTC+5:30
    const istDate = new Date(now.getTime() + (istOffset * 60 * 1000) - (now.getTimezoneOffset() * 60 * 1000));
    const isoNow = istDate.toISOString();

    // Insert/upsert department_data
    await sql`
      INSERT INTO department_data (date, slug, name, tab, entries)
      VALUES (${normalizedDate}, ${slug}, ${form.department}, 'web-form', ${JSON.stringify(entries)}::jsonb)
      ON CONFLICT (date, slug) DO UPDATE SET entries = EXCLUDED.entries;
    `;

    // Upsert day_snapshots
    await sql`
      INSERT INTO day_snapshots (date, updated_at)
      VALUES (${normalizedDate}, ${isoNow})
      ON CONFLICT (date) DO UPDATE SET updated_at = ${isoNow};
    `;

    return Response.json({
      success: true,
      message: `Form submitted successfully for ${form.department}`,
      date: normalizedDate,
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
