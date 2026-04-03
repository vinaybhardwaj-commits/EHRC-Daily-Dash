/* ──────────────────────────────────────────────────────────────────
   Historical Data Loader
   Fetches recent department_data for anomaly detection context
   ────────────────────────────────────────────────────────────────── */

import { sql } from '@vercel/postgres';

/**
 * Load the last N days of form data for a department.
 * Returns an array of field maps (one per day), most recent first.
 * Normalizes both JSONB formats (key-value and fields).
 */
export async function loadHistoricalData(
  slug: string,
  currentDate: string,
  lookbackDays: number = 7
): Promise<Record<string, unknown>[]> {
  try {
    const result = await sql`
      SELECT date, entries
      FROM department_data
      WHERE slug = ${slug}
        AND date < ${currentDate}
      ORDER BY date DESC
      LIMIT ${lookbackDays}
    `;

    return result.rows.map(row => {
      const entries = row.entries;
      return normalizeEntries(entries);
    });
  } catch {
    // Table might not exist or other DB error — graceful fallback
    return [];
  }
}

/**
 * Normalize JSONB entries to a flat field map.
 * Handles both formats:
 *   [{key: "Revenue", value: "450000"}, ...]
 *   [{fields: {"Revenue": "450000", ...}}]
 */
function normalizeEntries(entries: unknown): Record<string, unknown> {
  if (!Array.isArray(entries)) return {};

  const fields: Record<string, unknown> = {};

  for (const entry of entries) {
    if (entry && typeof entry === 'object') {
      // Format 1: {key, value}
      if ('key' in entry && 'value' in entry) {
        fields[entry.key as string] = entry.value;
      }
      // Format 2: {fields: {...}}
      if ('fields' in entry && typeof entry.fields === 'object' && entry.fields !== null) {
        Object.assign(fields, entry.fields);
      }
    }
  }

  return fields;
}

/**
 * Map field labels from historical data to field IDs used in the rubric.
 * This handles the mismatch between form-definitions labels and rubric field IDs.
 */
export function mapFieldLabelsToIds(
  historicalFields: Record<string, unknown>,
  fieldMapping: Record<string, string[]>  // rubricFieldId → [possible label patterns]
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};

  for (const [fieldId, patterns] of Object.entries(fieldMapping)) {
    for (const pattern of patterns) {
      const lowerPattern = pattern.toLowerCase();
      for (const [key, value] of Object.entries(historicalFields)) {
        if (key.toLowerCase().includes(lowerPattern)) {
          mapped[fieldId] = value;
          break;
        }
      }
      if (fieldId in mapped) break;
    }
  }

  return mapped;
}

/**
 * Customer Care field mapping: rubric field IDs → form label patterns.
 * These patterns match the labels in form-definitions.ts.
 */
export const CUSTOMER_CARE_FIELD_MAP: Record<string, string[]> = {
  opdAppointmentsInPerson: ['opd appointments today', 'in-person'],
  opdAppointmentsTele: ['tele', 'teleconsult'],
  opdNoShows: ['no-show', 'no show'],
  patientsLeftWithoutSeen: ['left without being seen', 'lwbs'],
  patientsWaitingOver10Min: ['waiting over 10', 'wait time'],
  healthCheckAppointments: ['health check'],
  newComplaintsReceived: ['new complaints received'],
  complaintsClosed: ['complaints closed'],
  totalComplaintsPending: ['total complaints pending', 'pending complaints'],
  oldestComplaintAge: ['oldest complaint'],
  customerEscalations: ['escalation'],
  doctorsOnLeave: ['doctors on leave'],
  doctorsLate: ['doctors late', 'doctors running late'],
  patientsAffectedByDelays: ['patients affected by delay'],
  googleReviewsReceived: ['google reviews received'],
  averageStarRating: ['average star rating', 'star rating'],
  videoTestimonialsCollected: ['video testimonial'],
  vipInternationalAlerts: ['vip', 'international'],
  callCentrePerformance: ['call centre', 'call center'],
  otherNotes: ['other notes', 'notes'],
};
