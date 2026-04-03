'use client';

import React, { useState, useEffect } from 'react';

/* ── Types ────────────────────────────────────────────────────────── */

interface HeatmapDay {
  date: string;
  slugs: string[];
}

interface FormAnalyticsSummary {
  form_slug: string;
  date: string;
  total_starts: number;
  total_submits: number;
  total_abandons: number;
  avg_completion_ms: number;
}

interface SparklineHeatmapProps {
  heatmapData: HeatmapDay[];
  departments: { slug: string; label: string }[];
  currentMonth: string; // YYYY-MM
}

/* ── Sparkline Heatmap ────────────────────────────────────────────── */

export default function SparklineHeatmap({ heatmapData, departments, currentMonth }: SparklineHeatmapProps) {
  const [analytics, setAnalytics] = useState<FormAnalyticsSummary[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Fetch analytics data
  useEffect(() => {
    fetch(`/api/form-analytics?all=true&period=${currentMonth}`)
      .then(r => r.json())
      .then(data => {
        if (data.summaries) setAnalytics(data.summaries);
      })
      .catch(() => { /* analytics unavailable — degrade gracefully */ });
  }, [currentMonth]);

  // Build submission map: date → Set<slug>
  const submissionMap = new Map<string, Set<string>>();
  heatmapData.forEach(day => {
    submissionMap.set(day.date, new Set(day.slugs));
  });

  // Build analytics map: slug → analytics
  const analyticsMap = new Map<string, FormAnalyticsSummary[]>();
  analytics.forEach(a => {
    if (!analyticsMap.has(a.form_slug)) analyticsMap.set(a.form_slug, []);
    analyticsMap.get(a.form_slug)!.push(a);
  });

  // Generate all dates in the month
  const year = parseInt(currentMonth.slice(0, 4));
  const month = parseInt(currentMonth.slice(5, 7));
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);
  const dates: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    dates.push(`${currentMonth}-${String(d).padStart(2, '0')}`);
  }

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Submission Status</h3>
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" /> Submitted
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-300" /> Missing
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-gray-100 border border-gray-200" /> Future
          </span>
        </div>
      </div>

      {/* Compact rows */}
      {departments.map(dept => {
        const pastDates = dates.filter(d => d <= today);
        const submittedCount = pastDates.filter(d => submissionMap.get(d)?.has(dept.slug)).length;
        const rate = pastDates.length > 0 ? Math.round((submittedCount / pastDates.length) * 100) : 0;
        const deptAnalytics = analyticsMap.get(dept.slug);

        // Aggregate analytics
        const totalStarts = deptAnalytics?.reduce((s, a) => s + (a.total_starts || 0), 0) || 0;
        const totalSubmits = deptAnalytics?.reduce((s, a) => s + (a.total_submits || 0), 0) || 0;
        const avgTimeMs = deptAnalytics && deptAnalytics.length > 0
          ? Math.round(deptAnalytics.reduce((s, a) => s + (a.avg_completion_ms || 0), 0) / deptAnalytics.length)
          : 0;
        const completionRate = totalStarts > 0 ? Math.round((totalSubmits / totalStarts) * 100) : null;

        const isExpanded = expanded === dept.slug;

        return (
          <div key={dept.slug}>
            <button
              onClick={() => setExpanded(isExpanded ? null : dept.slug)}
              className="w-full flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              {/* Department name */}
              <span className="text-xs font-medium text-gray-700 w-28 text-left truncate">{dept.label}</span>

              {/* Sparkline strip */}
              <div className="flex-1 flex items-center gap-px">
                {dates.map(date => {
                  const isFuture = date > today;
                  const submitted = submissionMap.get(date)?.has(dept.slug);
                  const bg = isFuture
                    ? 'bg-gray-100'
                    : submitted
                      ? 'bg-emerald-400'
                      : 'bg-red-300';
                  return (
                    <div
                      key={date}
                      className={`h-3 flex-1 rounded-[1px] ${bg} transition-opacity group-hover:opacity-90`}
                      title={`${dept.label} \u2014 ${date}: ${isFuture ? 'Future' : submitted ? 'Submitted' : 'Missing'}`}
                    />
                  );
                })}
              </div>

              {/* Rate badge */}
              <span className={`text-xs font-bold w-10 text-right ${
                rate >= 80 ? 'text-emerald-600' : rate >= 50 ? 'text-amber-600' : 'text-red-600'
              }`}>
                {rate}%
              </span>
            </button>

            {/* Expanded analytics panel */}
            {isExpanded && (
              <div className="ml-2 mr-2 mb-2 mt-0.5 bg-gray-50 border border-gray-100 rounded-lg p-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <AnalyticsMini
                    label="Completion Rate"
                    value={completionRate !== null ? `${completionRate}%` : '\u2014'}
                    color={completionRate !== null && completionRate >= 80 ? 'text-emerald-600' : completionRate !== null && completionRate >= 50 ? 'text-amber-600' : 'text-gray-400'}
                  />
                  <AnalyticsMini
                    label="Avg Time"
                    value={avgTimeMs > 0 ? formatDuration(avgTimeMs) : '\u2014'}
                    color="text-blue-600"
                  />
                  <AnalyticsMini
                    label="Sessions"
                    value={totalStarts > 0 ? String(totalStarts) : '\u2014'}
                    color="text-gray-600"
                  />
                </div>
                {totalStarts === 0 && (
                  <p className="text-[10px] text-gray-400 text-center mt-2">
                    Analytics will appear once forms are submitted through the new engine
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────────────── */

function AnalyticsMini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-gray-400">{label}</p>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}
