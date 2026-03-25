'use client';

import React, { useEffect, useState } from 'react';

/* ── Types ────────────────────────────────────────────────────────── */

interface MonthSummary {
  month: string;
  label: string;
  daysReported: number;
  safetyIssueDays: number;
  infraIssueDays: number;
  issueFreeRate: number;
}

interface DayData {
  date: string;
  hasSafetyIssue: boolean;
  safetyText: string | null;
  housekeepingText: string | null;
  facilityReadinessText: string | null;
  hasInfraIssue: boolean;
  otherNotes: string | null;
}

interface APIResponse {
  slug: string;
  department: string;
  summary: {
    totalDaysReported: number;
    dateRange: { from: string; to: string } | null;
    safetyIssueDays: number;
    infraIssueDays: number;
    issueFreeRate: number;
    incidentFreeDays: number;
  };
  months: MonthSummary[];
  allDays: DayData[];
}

interface Props {
  embedded?: boolean;
  onBack?: () => void;
  onNavigateToDashboard?: (date: string, slug: string) => void;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function fmtMonth(m: string) {
  const [y, mo] = m.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(mo, 10) - 1]} '${y.slice(2)}`;
}

function smoothPath(points: { x: number; y: number }[], tension = 0.3): string {
  if (points.length < 2) return '';
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function smoothAreaPath(points: { x: number; y: number }[], baseY: number, tension = 0.3): string {
  const line = smoothPath(points, tension);
  if (!line || points.length < 2) return '';
  return `${line} L ${points[points.length - 1].x} ${baseY} L ${points[0].x} ${baseY} Z`;
}

/* ── Component ────────────────────────────────────────────────────── */

export default function FacilityOverview({ embedded, onBack, onNavigateToDashboard }: Props) {
  const [data, setData] = useState<APIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/department-overview?slug=facility')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-3 border-yellow-200 border-t-yellow-600 rounded-full animate-spin" />
    </div>
  );
  if (error || !data) return (
    <div className="text-center py-12 text-red-500">Failed to load Facility data</div>
  );

  const { summary, months, allDays } = data;
  const currentMonth = months[months.length - 1];
  const prevMonth = months.length > 1 ? months[months.length - 2] : null;

  // ── Hero Cards ──────────────────────────────────────────────────
  const heroCards = [
    {
      label: 'ISSUE-FREE RATE',
      value: currentMonth ? currentMonth.issueFreeRate.toFixed(0) + '%' : '—',
      sub: currentMonth ? `${Math.round(currentMonth.issueFreeRate / 100 * currentMonth.daysReported)} of ${currentMonth.daysReported} days` : '—',
      delta: currentMonth && prevMonth ? currentMonth.issueFreeRate - prevMonth.issueFreeRate : null,
      deltaFmt: (d: number) => d.toFixed(0),
      color: 'text-yellow-600',
    },
    {
      label: 'SAFETY ISSUES',
      value: currentMonth ? currentMonth.safetyIssueDays : '—',
      sub: currentMonth ? `${currentMonth.safetyIssueDays} days this month` : '—',
      delta: currentMonth && prevMonth ? currentMonth.safetyIssueDays - prevMonth.safetyIssueDays : null,
      deltaFmt: (d: number) => d.toFixed(0),
      color: 'text-red-600',
    },
    {
      label: 'INFRA ISSUES',
      value: currentMonth ? currentMonth.infraIssueDays : '—',
      sub: currentMonth ? `${currentMonth.infraIssueDays} days this month` : '—',
      delta: currentMonth && prevMonth ? currentMonth.infraIssueDays - prevMonth.infraIssueDays : null,
      deltaFmt: (d: number) => d.toFixed(0),
      color: 'text-amber-600',
    },
    {
      label: 'DAYS REPORTED',
      value: currentMonth ? currentMonth.daysReported : '—',
      sub: currentMonth ? `${summary.totalDaysReported} total` : '—',
      delta: null,
      color: 'text-yellow-700',
    },
  ];

  // ── Issue-Free Rate Trend ────────────────────────────────────────
  const issueFreeTrend = months.map((m, i) => ({
    month: fmtMonth(m.month),
    rate: m.issueFreeRate,
    x: 80 + (i * 100),
  }));

  const ratePoints = issueFreeTrend.map(d => ({ x: d.x, y: Math.max(10, 200 - (d.rate / 100) * 190) }));

  // ── Issue Log ────────────────────────────────────────────────────
  const issueLog = allDays
    .filter(d => d.hasSafetyIssue || d.hasInfraIssue)
    .slice(-20)
    .reverse()
    .map(d => ({
      date: d.date,
      type: d.hasSafetyIssue ? 'safety' : 'infra',
      text: d.safetyText || d.housekeepingText || d.facilityReadinessText || d.otherNotes || 'Issue logged',
    }));

  // ── Streak Calculation ──────────────────────────────────────────
  let streak = 0;
  for (let i = allDays.length - 1; i >= 0; i--) {
    const d = allDays[i];
    if (!d.hasSafetyIssue && !d.hasInfraIssue) {
      streak++;
    } else {
      break;
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      {!embedded && (
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="p-2 hover:bg-yellow-50 rounded-lg transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-yellow-900">Facility & Infrastructure</h1>
        </div>
      )}

      {/* Hero Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {heroCards.map((card, i) => (
          <div key={i} className="bg-white border border-yellow-100 rounded-lg p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color} mt-1`}>{card.value}</p>
            <p className="text-xs text-slate-500 mt-1">{card.sub}</p>
            {card.delta !== null && (
              <p className="text-xs mt-2">
                <span className={card.delta >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                  {card.delta >= 0 ? '↑' : '↓'} {card.deltaFmt(Math.abs(card.delta))}
                </span>
                <span className="text-slate-400"> vs last month</span>
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Issue-Free Rate Trend */}
      <div className="bg-white border border-yellow-100 rounded-lg p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Issue-Free Rate Trend</h3>
        <svg viewBox="0 0 900 260" className="w-full h-32">
          {/* Grid */}
          <defs>
            <pattern id="grid" width="100" height="40" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 40" fill="none" stroke="#fef3c7" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="900" height="260" fill="url(#grid)" />

          {/* Rate line */}
          <path d={smoothPath(ratePoints)} stroke="#ca8a04" strokeWidth="2" fill="none" />
          {ratePoints.map((p, i) => (
            <circle key={`rate-${i}`} cx={p.x} cy={p.y} r="3" fill="#ca8a04" />
          ))}
        </svg>

        {/* Legend */}
        <div className="flex gap-6 mt-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-yellow-600" />
            <span className="text-slate-600">Issue-Free Rate %</span>
          </div>
        </div>
      </div>

      {/* Monthly Progression Table */}
      <div className="bg-white border border-yellow-100 rounded-lg p-6 shadow-sm overflow-x-auto">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Monthly Progression</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-3 font-semibold text-slate-600">Month</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Days</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Safety Issues</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Infra Issues</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Issue-Free %</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => (
              <tr key={i} className="border-b border-slate-100 hover:bg-yellow-50">
                <td className="py-3 px-3 font-medium text-slate-700">{m.label}</td>
                <td className="text-right py-3 px-3 text-slate-600">{m.daysReported}</td>
                <td className="text-right py-3 px-3 text-red-600">{m.safetyIssueDays}</td>
                <td className="text-right py-3 px-3 text-amber-600">{m.infraIssueDays}</td>
                <td className="text-right py-3 px-3 font-semibold">
                  <span className={m.issueFreeRate >= 80 ? 'text-emerald-600' : m.issueFreeRate >= 50 ? 'text-amber-600' : 'text-red-600'}>
                    {m.issueFreeRate.toFixed(0)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Issue Log */}
      {issueLog.length > 0 && (
        <div className="bg-white border border-yellow-100 rounded-lg p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Recent Issues (Last 20 Events)</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {issueLog.map((inc, i) => (
              <div key={i} className="flex gap-3 py-2 px-3 bg-slate-50 rounded text-xs border-l-2 border-yellow-200">
                <span className={`font-semibold min-w-16 ${
                  inc.type === 'safety' ? 'text-red-600' : 'text-amber-600'
                }`}>
                  {inc.type === 'safety' ? '⚠️ Safety' : '🔨 Infra'}
                </span>
                <div className="flex-1">
                  <p className="text-slate-600">{inc.text}</p>
                  <p className="text-slate-400">{inc.date}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Row: Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Issue-Free Streak */}
        <div className="bg-white border border-yellow-100 rounded-lg p-4 shadow-sm text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Current Streak</p>
          <p className="text-3xl font-bold text-yellow-600 mt-2">{streak}</p>
          <p className="text-xs text-slate-500 mt-1">Consecutive issue-free days</p>
        </div>

        {/* All-Time Safety */}
        <div className="bg-white border border-yellow-100 rounded-lg p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">All-Time Safety</p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Safety Issues:</span>
              <span className="font-semibold text-red-600">{summary.safetyIssueDays}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Infra Issues:</span>
              <span className="font-semibold text-amber-600">{summary.infraIssueDays}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Issue-Free Rate:</span>
              <span className="font-semibold text-yellow-600">{summary.issueFreeRate.toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* Reporting Summary */}
        <div className="bg-white border border-yellow-100 rounded-lg p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Data Summary</p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Days Reported:</span>
              <span className="font-semibold">{summary.totalDaysReported}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Incident-Free Days:</span>
              <span className="font-semibold text-emerald-600">{summary.incidentFreeDays}</span>
            </div>
            {summary.dateRange && (
              <div className="flex justify-between">
                <span className="text-slate-600">Period:</span>
                <span className="font-semibold text-xs">{summary.dateRange.from.slice(0, 10)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
