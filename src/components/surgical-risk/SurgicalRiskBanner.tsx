'use client';

/**
 * SurgicalRiskBanner — prominent CTA at the top of Overview AND Daily Dashboard
 * tabs (per PRD v2 decisions #24-26 — maximum-discoverability placement).
 *
 * Three visual states based on highest tier present in upcoming surgeries:
 *   GREEN/AMBER (calm)   → muted slate banner: "5 surgeries upcoming · all clear"
 *   RED present          → rose banner:        "5 surgeries · 2 RED · review now"
 *   CRITICAL present     → red banner + glow:  "⚠ 5 surgeries · 2 RED · 1 CRITICAL → REVIEW"
 *
 * Self-quiets to a small "0 upcoming" pill when the table is empty.
 *
 * Click anywhere on the banner → navigates to /surgical-risk.
 *
 * Fetches from /api/surgical-risk?summary=true on mount (cheap counts-only
 * query, no row data).
 */

import { useEffect, useState } from 'react';

interface Summary {
  GREEN: number;
  AMBER: number;
  RED: number;
  CRITICAL: number;
  unreviewed: number;
  total: number;
}

interface ApiResponse {
  ok: boolean;
  summary?: Summary;
  error?: string;
}

export default function SurgicalRiskBanner() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch('/api/surgical-risk?summary=true');
        const data: ApiResponse = await r.json();
        if (cancelled) return;
        if (data.ok && data.summary) {
          setSummary(data.summary);
        } else {
          setError(data.error || 'Failed to load surgical risk summary');
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Loading state — render nothing to avoid layout shift before fetch resolves
  if (loading) return null;

  // Error state — render a small slate pill so admins can see something is up
  if (error || !summary) {
    return (
      <div
        className="mb-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500 cursor-pointer hover:bg-slate-100 transition-colors"
        onClick={() => { window.location.href = '/surgical-risk'; }}
      >
        Surgical Risk · summary unavailable · click to open dashboard →
      </div>
    );
  }

  const total = summary.total;
  const critical = summary.CRITICAL;
  const red = summary.RED;
  const amber = summary.AMBER;
  const reviewable = critical + red;     // RED-or-above

  // Empty state — small pill, low-key
  if (total === 0) {
    return (
      <div
        className="mb-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500 cursor-pointer hover:bg-slate-100 transition-colors flex items-center justify-between"
        onClick={() => { window.location.href = '/surgical-risk'; }}
      >
        <span><span className="font-semibold uppercase tracking-wider text-slate-400 mr-2">Surgical Risk</span>0 upcoming surgeries</span>
        <span className="text-slate-400">→</span>
      </div>
    );
  }

  // Three visual states based on highest tier present
  if (critical > 0) {
    // CRITICAL state — red glow + pulse
    return (
      <button
        type="button"
        onClick={() => { window.location.href = '/surgical-risk'; }}
        className="w-full mb-6 rounded-xl border-2 border-red-400 bg-red-50 px-4 sm:px-6 py-4 text-left shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse cursor-pointer hover:shadow-[0_0_25px_rgba(239,68,68,0.5)] hover:bg-red-100 transition-all"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl">⚠</span>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-red-700">Surgical Risk</div>
              <div className="text-base sm:text-lg font-bold text-red-900">
                {total} surger{total === 1 ? 'y' : 'ies'} · {red > 0 && `${red} RED · `}{critical} CRITICAL → REVIEW
              </div>
            </div>
          </div>
          <span className="text-red-700 font-bold text-lg">→</span>
        </div>
      </button>
    );
  }

  if (red > 0) {
    // RED state — rose banner, no pulse
    return (
      <button
        type="button"
        onClick={() => { window.location.href = '/surgical-risk'; }}
        className="w-full mb-6 rounded-xl border border-rose-300 bg-rose-50 px-4 sm:px-6 py-3 text-left cursor-pointer hover:shadow-md hover:bg-rose-100 transition-all"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-rose-700">Surgical Risk</div>
              <div className="text-sm sm:text-base font-semibold text-rose-900">
                {total} surger{total === 1 ? 'y' : 'ies'} upcoming · {reviewable} high-risk · review now
              </div>
            </div>
          </div>
          <span className="text-rose-700 font-bold text-lg">→</span>
        </div>
      </button>
    );
  }

  // GREEN/AMBER calm state — muted slate banner
  return (
    <button
      type="button"
      onClick={() => { window.location.href = '/surgical-risk'; }}
      className="w-full mb-6 rounded-lg border border-slate-200 bg-slate-50 px-4 sm:px-6 py-2.5 text-left cursor-pointer hover:bg-slate-100 hover:border-slate-300 transition-all"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Surgical Risk</span>
          <span className="text-slate-700">
            {total} surger{total === 1 ? 'y' : 'ies'} upcoming
            {amber > 0 && <span className="text-amber-700"> · {amber} AMBER</span>}
            {amber === 0 && <span className="text-emerald-700"> · all clear</span>}
          </span>
        </div>
        <span className="text-slate-400">→</span>
      </div>
    </button>
  );
}
