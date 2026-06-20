/* ──────────────────────────────────────────────────────────────────
   Daily-form reporting-day engine — Once-a-Day Rhythm, Phase 1
   ------------------------------------------------------------------
   Pilot departments (listed in EOD_RHYTHM_SLUGS) report the COMPLETED
   day rather than "today": evening-onward (>= EOD_EVENING_HOUR, default
   19:00 IST) the active reporting day is "today" (the day that is
   ending); before that it is "yesterday". Non-pilot departments keep
   reporting "today" exactly as before.

   Server-only (reads process.env). The client form must NOT import the
   rhythm helpers — it asks GET /api/reporting-day so EOD_RHYTHM_SLUGS
   stays a single server-side source of truth.
   ────────────────────────────────────────────────────────────────── */

export type Rhythm = 'eod' | 'today';

/** Current instant shifted into IST (UTC+5:30); read it with getUTC* methods. */
export function istNow(at: number = Date.now()): Date {
  return new Date(at + 5.5 * 3600_000);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'DD-MM-YYYY' for an IST-shifted date (matches the form's stored format). */
export function ddmmyyyy(d: Date): string {
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

/** 'YYYY-MM-DD' for an IST-shifted date. */
export function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 'Fri, 19 Jun 2026' for an IST-shifted date. */
export function dayLabel(d: Date): string {
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `${wd}, ${pad(d.getUTCDate())} ${mo} ${d.getUTCFullYear()}`;
}

/** Departments switched to the once-a-day (end-of-day) rhythm. */
export function eodRhythmSlugs(): Set<string> {
  return new Set(
    (process.env.EOD_RHYTHM_SLUGS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isEodRhythm(slug: string | null | undefined): boolean {
  return !!slug && eodRhythmSlugs().has(slug);
}

/** Hour (IST, 0–23) at/after which a pilot dept reports "today" (the day ending). */
export function eveningHour(): number {
  const n = Number(process.env.EOD_EVENING_HOUR);
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : 19;
}

export interface ReportingDay {
  slug: string;
  rhythm: Rhythm;
  /** Reporting day, 'DD-MM-YYYY' (what the form stores + submits). */
  date: string;
  /** Reporting day, 'YYYY-MM-DD'. */
  iso: string;
  /** Friendly label, e.g. 'Fri, 19 Jun 2026'. */
  label: string;
  /** IST 'today', 'YYYY-MM-DD' — the max selectable reporting day (no future). */
  todayIso: string;
}

/**
 * The active reporting day for a department at instant `at`.
 *  - EOD pilot dept: evening-onward (>= eveningHour) → today; else yesterday.
 *  - Otherwise: today (unchanged legacy behaviour).
 */
export function reportingDay(slug: string, at: number = Date.now()): ReportingDay {
  const nowIst = istNow(at);
  const todayIso = isoDate(nowIst);
  const eod = isEodRhythm(slug);
  let d = nowIst;
  if (eod) {
    const minutesOfDay = nowIst.getUTCHours() * 60 + nowIst.getUTCMinutes();
    if (minutesOfDay < eveningHour() * 60) {
      d = new Date(nowIst.getTime() - 86400_000); // before the evening → yesterday
    }
  }
  return {
    slug,
    rhythm: eod ? 'eod' : 'today',
    date: ddmmyyyy(d),
    iso: isoDate(d),
    label: dayLabel(d),
    todayIso,
  };
}
