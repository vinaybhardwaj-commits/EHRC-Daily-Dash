'use client';

import React, { useEffect, useState } from 'react';

/* ── Types ────────────────────────────────────────────────────────── */

interface MonthSummary {
  month: string;
  label: string;
  daysReported: number;
  totalJoiners: number;
  totalExits: number;
  netChange: number;
  joinerDays: number;
  exitDays: number;
}

interface DayData {
  date: string;
  newJoiners: string[];
  resignations: string[];
  joinerCount: number;
  exitCount: number;
  replacementStatus: string | null;
  trainingStatus: string | null;
  doctorProfileStatus: string | null;
  otherNotes: string | null;
}

interface APIResponse {
  slug: string;
  department: string;
  summary: {
    totalDaysReported: number;
    dateRange: { from: string; to: string } | null;
    totalJoiners: number;
    totalExits: number;
    netChange: number;
    joinerDays: number;
    exitDays: number;
    joinerFrequency: Record<string, number>;
    exitFrequency: Record<string, number>;
  };
  months: MonthSummary[];
  availableMonths: string[];
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

export default function HROverview({ embedded, onBack, onNavigateToDashboard }: Props) {
  const [data, setData] = useState<APIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/department-overview?slug=hr-manpower')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-3 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
    </div>
  );
  if (error || !data) return (
    <div className="text-center py-12 text-red-500">Failed to load HR & Manpower data</div>
  );

  const { summary, months, allDays } = data;
  const currentMonth = months[months.length - 1];
  const prevMonth = months.length > 1 ? months[months.length - 2] : null;

  // ── Hero Cards ──────────────────────────────────────────────────
  const heroCards = [
    {
      label: 'TOTAL JOINERS',
      value: summary.totalJoiners,
      sub: currentMonth ? `${currentMonth.totalJoiners} this month` : '—',
      delta: currentMonth && prevMonth ? currentMonth.totalJoiners - prevMonth.totalJoiners : null,
      deltaFmt: (d: number) => d.toFixed(0),
      color: 'text-teal-600',
    },
    {
      label: 'TOTAL EXITS',
      value: summary.totalExits,
      sub: currentMonth ? `${currentMonth.totalExits} this month` : '—',
      delta: currentMonth && prevMonth ? currentMonth.totalExits - prevMonth.totalExits : null,
      deltaFmt: (d: number) => d.toFixed(0),
      color: 'text-amber-600',
    },
    {
      label: 'NET CHANGE',
      value: summary.netChange >= 0 ? `+${summary.netChange}` : summary.netChange,
      sub: currentMonth ? `${currentMonth.netChange >= 0 ? '+' : ''}${currentMonth.netChange} this month` : '—',
      delta: null,
      color: summary.netChange >= 0 ? 'text-emerald-600' : 'text-red-600',
    },
    {
      label: 'JOINER DAYS %',
      value: summary.joinerDays.toFixed(1) + '%',
      sub: currentMonth ? `${currentMonth.joinerDays.toFixed(1)}% of days had joiners` : '—',
      delta: null,
      color: 'text-teal-700',
    },
  ];

  // ── Staffing Flow Trend (Joiners vs Exits by Month) ─────────────
  const staffingTrend = months.map((m, i) => ({
    month: fmtMonth(m.month),
    joiners: m.totalJoiners,
    exits: m.totalExits,
    x: 80 + (i * 100),
  }));

  const joinerPoints = staffingTrend.map(d => ({ x: d.x, y: Math.max(10, 200 - Math.min(d.joiners, 50) * 4) }));
  const exitPoints = staffingTrend.map(d => ({ x: d.x, y: Math.max(10, 200 - Math.min(d.exits, 50) * 4) }));

  // ── Recent Activity Log (Last 30 entries with joiners/exits) ──────
  const recentActivity = allDays
    .slice(-30)
    .reverse()
    .filter(d => d.joinerCount > 0 || d.exitCount > 0)
    .map(d => ({
      date: d.date,
      joiners: d.newJoiners,
      exits: d.resignations,
      joinerCount: d.joinerCount,
      exitCount: d.exitCount,
      notes: d.otherNotes,
    }));

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      {!embedded && (
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="p-2 hover:bg-teal-50 rounded-lg transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-teal-900">HR & Manpower</h1>
        </div>
      )}

      {/* Hero Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {heroCards.map((card, i) => (
          <div key={i} className="bg-white border border-teal-100 rounded-lg p-4 shadow-sm">
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

      {/* Staffing Flow Chart */}
      <div className="bg-white border border-teal-100 rounded-lg p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Staffing Flow (Joiners vs Exits)</h3>
        <svg viewBox="0 0 1200 300" className="w-full h-48">
          {/* Grid */}
          <defs>
            <pattern id="grid" width="100" height="40" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 40" fill="none" stroke="#f1f5f9" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="1200" height="300" fill="url(#grid)" />

          {/* Joiners line */}
          <path d={smoothPath(joinerPoints)} stroke="#0d9488" strokeWidth="2" fill="none" />
          {joinerPoints.map((p, i) => (
            <circle key={`joiner-${i}`} cx={p.x} cy={p.y} r="3" fill="#0d9488" />
          ))}

          {/* Exits line */}
          <path d={smoothPath(exitPoints)} stroke="#f59e0b" strokeWidth="2" fill="none" />
          {exitPoints.map((p, i) => (
            <circle key={`exit-${i}`} cx={p.x} cy={p.y} r="3" fill="#f59e0b" />
          ))}
        </svg>

        {/* Legend */}
        <div className="flex gap-6 mt-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-teal-500" />
            <span className="text-slate-600">New Joiners</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-amber-500" />
            <span className="text-slate-600">Exits/Resignations</span>
          </div>
        </div>
      </div>

      {/* Monthly Progression Table */}
      <div className="bg-white border border-teal-100 rounded-lg p-6 shadow-sm overflow-x-auto">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Monthly Progression</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-3 font-semibold text-slate-600">Month</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Days Reported</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Joiners</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Exits</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Net Change</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Joiner Days %</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => (
              <tr key={i} className="border-b border-slate-100 hover:bg-teal-50">
                <td className="py-3 px-3 font-medium text-slate-700">{m.label}</td>
                <td className="text-right py-3 px-3 text-slate-600">{m.daysReported}</td>
                <td className="text-right py-3 px-3 text-teal-600 font-semibold">{m.totalJoiners}</td>
                <td className="text-right py-3 px-3 text-amber-600 font-semibold">{m.totalExits}</td>
                <td className="text-right py-3 px-3 font-semibold">
                  <span className={m.netChange >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                    {m.netChange >= 0 ? '+' : ''}{m.netChange}
                  </span>
                </td>
                <td className="text-right py-3 px-3 text-teal-700 font-semibold">{m.joinerDays.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent Activity Log */}
      {recentActivity.length > 0 && (
        <div className="bg-white border border-teal-100 rounded-lg p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Recent Activity (Last 30 Days)</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {recentActivity.map((activity, i) => (
              <div key={i} className="py-3 px-3 bg-slate-50 rounded border-l-2 border-teal-200">
                <p className="text-xs font-semibold text-slate-600 mb-2">{activity.date}</p>

                {/* Joiners */}
                {activity.joiners.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-semibold text-teal-700 mb-1">
                      🎯 New Joiners ({activity.joinerCount})
                    </p>
                    <ul className="text-xs text-slate-600 ml-4 space-y-0.5">
                      {activity.joiners.map((name, j) => (
                        <li key={j}>• {name}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Exits */}
                {activity.exits.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-semibold text-amber-700 mb-1">
                      📤 Resignations/Exits ({activity.exitCount})
                    </p>
                    <ul className="text-xs text-slate-600 ml-4 space-y-0.5">
                      {activity.exits.map((name, j) => (
                        <li key={j}>• {name}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Notes */}
                {activity.notes && (
                  <p className="text-xs text-slate-500 italic mt-1">
                    📝 {activity.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Row: Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Records */}
        <div className="bg-white border border-teal-100 rounded-lg p-4 shadow-sm text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Total Records</p>
          <p className="text-3xl font-bold text-teal-600 mt-2">153</p>
          <p className="text-xs text-slate-500 mt-1">Days tracked (new joiners & resignations)</p>
        </div>

        {/* Summary Period */}
        <div className="bg-white border border-teal-100 rounded-lg p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Summary Period</p>
          {summary.dateRange && (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600">From:</span>
                <span className="font-semibold">{summary.dateRange.from}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">To:</span>
                <span className="font-semibold">{summary.dateRange.to}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Days:</span>
                <span className="font-semibold">{summary.totalDaysReported}</span>
              </div>
            </div>
          )}
        </div>

        {/* All-Time Snapshot */}
        <div className="bg-white border border-teal-100 rounded-lg p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">All-Time Snapshot</p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Total Joiners:</span>
              <span className="font-semibold text-teal-600">{summary.totalJoiners}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Total Exits:</span>
              <span className="font-semibold text-amber-600">{summary.totalExits}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Net Staff Change:</span>
              <span className={`font-semibold ${summary.netChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {summary.netChange >= 0 ? '+' : ''}{summary.netChange}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
