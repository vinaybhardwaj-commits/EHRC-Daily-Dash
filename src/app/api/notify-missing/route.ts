import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { SHEET_TAB_MAP, getSheetCsvUrl } from '@/lib/sheets-config';
import { DEPARTMENT_CONTACTS, CONTACTS_BY_SLUG } from '@/lib/department-contacts';
import Papa from 'papaparse';

// Lazy-init: Resend client must NOT be created at module scope because
// process.env.RESEND_API_KEY is unavailable during the Next.js build step.
// Creating it at top level crashes the build and prevents ALL pages from generating.
function getResendClient() {
  return new Resend(process.env.RESEND_API_KEY);
}

// Sender email â must be verified in Resend (use onboarding@resend.dev for testing)
const FROM_EMAIL = process.env.NOTIFICATION_FROM_EMAIL || 'EHRC Dashboard <onboarding@resend.dev>';

/**
 * Get today's date in IST (YYYY-MM-DD)
 */
function getTodayIST(): string {
  const now = new Date();
  // IST is UTC+5:30
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  return istDate.toISOString().split('T')[0];
}

/**
 * Normalize date strings from Google Sheets to YYYY-MM-DD
 * Handles DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, YYYY/MM/DD formats
 */
function normalizeDate(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const ddmmMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (ddmmMatch) {
    let [, d, m, y] = ddmmMatch;
    // Fix known year errors (2036 â 2026)
    if (y === '2036') y = '2026';
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return null;
}

/**
 * Check a single Google Sheet tab for today's submission.
 * Returns true if at least one row has today's date.
 */
async function hasSubmittedToday(tabName: string, today: string): Promise<boolean> {
  try {
    const url = getSheetCsvUrl(tabName);
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return false;

    const csvText = await response.text();
    if (!csvText.trim()) return false;

    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const rows = parsed.data as Record<string, string>[];

    // Check if any row has today's date in the Timestamp or Date column
    for (const row of rows) {
      // Try common date column names
      const dateValue = row['Timestamp'] || row['Date'] || row['date'] || row['timestamp'] || '';
      const normalized = normalizeDate(dateValue);
      if (normalized === today) return true;
    }

    return false;
  } catch (error) {
    console.error(`Error checking tab "${tabName}":`, error);
    return false; // Treat errors as "not submitted" to be safe
  }
}

/**
 * Send a reminder email to a department head who hasn't submitted
 */
async function sendReminderEmail(
  contact: { headName: string; email: string; department: string },
  today: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await getResendClient().emails.send({
      from: FROM_EMAIL,
      to: contact.email,
      subject: `â° EHRC Daily Form â Pending Submission for ${today}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 20px 24px; border-radius: 12px 12px 0 0;">
            <h2 style="color: white; margin: 0; font-size: 18px;">EHRC Daily Dashboard</h2>
            <p style="color: #bfdbfe; margin: 4px 0 0; font-size: 13px;">Even Hospital, Race Course Road</p>
          </div>
          <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="font-size: 15px; color: #1f2937; margin: 0 0 16px;">Hi ${contact.headName},</p>
            <p style="font-size: 15px; color: #374151; margin: 0 0 16px;">
              Your <strong>${contact.department}</strong> daily update form for <strong>${today}</strong> has not been submitted yet. The morning standup is starting now.
            </p>
            <p style="font-size: 15px; color: #374151; margin: 0 0 20px;">
              Please submit your form at your earliest convenience so the dashboard stays up to date.
            </p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="https://ehrc-daily-dash.vercel.app"
                 style="display: inline-block; background: #2563eb; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                View Dashboard
              </a>
            </div>
            <p style="font-size: 12px; color: #9ca3af; margin: 16px 0 0; text-align: center;">
              This is an automated reminder from the EHRC Daily Dashboard.
            </p>
          </div>
        </div>
      `,
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * GET /api/notify-missing
 *
 * Called by Vercel cron at 9:00 AM IST.
 * Checks all 17 department Google Sheet tabs for today's submissions.
 * Sends reminder emails to department heads who haven't submitted.
 *
 * Also supports ?date=YYYY-MM-DD query param for manual testing.
 */
export async function GET(request: Request) {
  // Verify cron secret if set (optional security layer)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const today = url.searchParams.get('date') || getTodayIST();

  console.log(`[notify-missing] Checking submissions for ${today}`);

  // Check each department's Google Sheet tab
  const slugs = Object.keys(SHEET_TAB_MAP);
  const results: {
    slug: string;
    department: string;
    submitted: boolean;
    notified: boolean;
    error?: string;
  }[] = [];

  // Check submissions in batches of 5 to avoid rate limiting
  for (let i = 0; i < slugs.length; i += 5) {
    const batch = slugs.slice(i, i + 5);
    const checks = await Promise.all(
      batch.map(async (slug) => {
        const tabName = SHEET_TAB_MAP[slug];
        const submitted = await hasSubmittedToday(tabName, today);
        return { slug, submitted };
      })
    );

    for (const { slug, submitted } of checks) {
      const contact = CONTACTS_BY_SLUG[slug];
      // Handle the 'facilities' vs 'facility' slug mismatch
      const resolvedContact = contact || CONTACTS_BY_SLUG[slug === 'facilities' ? 'facility' : slug];

      if (submitted) {
        results.push({
          slug,
          department: resolvedContact?.department || slug,
          submitted: true,
          notified: false,
        });
      } else if (resolvedContact) {
        // Send reminder email
        const emailResult = await sendReminderEmail(resolvedContact, today);
        results.push({
          slug,
          department: resolvedContact.department,
          submitted: false,
          notified: emailResult.success,
          error: emailResult.error,
        });
      } else {
        results.push({
          slug,
          department: slug,
          submitted: false,
          notified: false,
          error: `No contact found for slug "${slug}"`,
        });
      }
    }
  }

  const submitted = results.filter(r => r.submitted);
  const missing = results.filter(r => !r.submitted);
  const notified = results.filter(r => r.notified);

  const summary = {
    date: today,
    checkedAt: new Date().toISOString(),
    totalDepartments: results.length,
    submitted: submitted.length,
    missing: missing.length,
    emailsSent: notified.length,
    details: results,
  };

  console.log(`[notify-missing] ${submitted.length} submitted, ${missing.length} missing, ${notified.length} emails sent`);

  return NextResponse.json(summary);
}
