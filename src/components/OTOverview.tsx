'use client';

import React, { useEffect, useState } from 'react';

/* ── Types ────────────────────────────────────────────────────────── */

interface MonthSummary {
  month: string;
  label: string;
  daysReported: number;
  totalCases: number;
  avgCasesPerDay: number;
  postponedDays: number;
  avgDelayMinutes: number;
  totalEscalations: number;
  totalConsumableTrips: number;
  avgPlannedSurgeries: number;
  delayDays: number;
}

interface DayData {
  date: string;
  otCases: number | null;
  casePostponed: boolean;
  firstCaseDelayMinutes: number | null;
  firstCaseDelayReason: string | null;
  escalationsBySurgeon: number | null;
  timesLeftForConsumables: number | null;
  surgeriesPlannedNextDay: number | null;
}

interface APIResponse {
  slug: string;
  department: string;
  summary: {
    totalDaysReported: number;
    dateRange: { from: string; to: string } | null;
    totalCases: number;
    avgCasesPerDay: number;
    postponedDays: number;
    totalEscalations: number;
    delayDays: number;
    avgDelayMinutes: number;
    totalConsumableTrips: number;
    avgPlannedSurgeries: number;
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

export default function OTOverview({ embedded, onBack, onNavigateToDashboard }: Props) {
  const [data, setData] = useState<APIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/department-overview?slug=ot')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
    </div>
  );
  if (error || !data) return (
    <div className="text-center py-12 text-red-500">Failed to load OT data</div>
  );

  const { summary, months, allDays } = data;
  const currentMonth = months[months.length - 1];
  const prevMonth = months.length > 1 ? months[months.length - 2] : null;

  // ── Hero Cards ──────────────────────────────────────────────────
  const heroCards = [
    {
      label: 'OT CASES/DAY',
      value: currentMonth ? currentMonth.avgCasesPerDay.toFixed(1) : '—',
      sub: currentMonth ? `${currentMonth.totalCases} total this month` : '—',
      delta: currentMonth && prevMonth ? currentMonth.avgCasesPerDay - prevMonth.avgCasesPerDay : null,
      deltaFmt: (d: number) => d.toFixed(1),
      color: 'text-purple-600',
    },
    {
      label: 'POSTPONED DAYS',
      value: currentMonth ? currentMonth.postponedDays : '—',
      sub: currentMonth ? `${((currentMonth.postponedDays / currentMonth.daysReported) * 100).toFixed(0)}% of month` : '—',
      delta: currentMonth && prevMonth ? currentMonth.postponedDays - prevMonth.postponedDays : null,
      deltaFmt: (d: number) => d.toFixed(0),
      color: 'text-amber-600',
    },
    {
      label: 'AVG DELAY (MIN)',
      value: currentMonth ? currentMonth.avgDelayMinutes.toFixed(0) : '—',
      sub: currentMonth ? `${currentMonth.delayDays} days with delays` : '—',
      delta: null,
      color: 'text-red-600',
    },
    {
      label: 'ESCALATIONS',
      value: currentMonth ? currentMonth.totalEscalations : '—',
      sub: currentMonth ? `${(currentMonth.totalEscalations / currentMonth.totalCases).toFixed(2)} per case` : '—',
      delta: null,
      color: 'text-red-700',
    },
  ];

  // ── OT Cases Trend ──────────────────────────────────────────────
  const casesTrend = months.map((m, i) => ({
    month: fmtMonth(m.month),
    cases: m.totalCases,
    x: 80 + (i * 100),
  }));

  const casesPoints = casesTrend.map(d => ({ x: d.x, y: Math.max(10, 220 - Math.min(d.cases, 50) * 4) }));

  // ── Postponements & Delays Grid (Last 30 days) ───────────────────
  const incidentGrid = allDays.slice(-30).map((d, idx) => ({
    date: d.date,
    hasPostponement: d.casePostponed,
    hasDelay: d.firstCaseDelayMinutes !== null && d.firstCaseDelayMinutes > 0,
    delayMinutes: d.firstCaseDelayMinutes || 0,
    reason: d.firstCaseDelayReason || '',
  }));

  // ── Incidents (Postponements + Delays + Escalations) ──────────────
  const incidents = allDays
    .filter(d => d.casePostponed || (d.firstCaseDelayMinutes !== null && d.firstCaseDelayMinutes > 0) || d.escalationsBySurgeon || d.timesLeftForConsumables)
    .slice(-20)
    .reverse()
    .map(d => ({
      date: d.date,
      type: d.casePostponed ? 'postponed' : (d.firstCaseDelayMinutes !== null && d.firstCaseDelayMinutes > 0) ? 'delay' : d.escalationsBySurgeon ? 'escalation' : 'consumable',
      text: d.casePostponed ? 'Case postponed' : (d.firstCaseDelayMinutes !== null && d.firstCaseDelayMinutes > 0) ? `${d.firstCaseDelayMinutes}min delay: ${d.firstCaseDelayReason || '(no reason)'}` : d.escalationsBySurgeon ? `${d.escalationsBySurgeon} escalation(s)` : `${d.timesLeftForConsumables || 0} consumable run(s)`,
    }));

  // ── Incident-Free Streak ────────────────────────────────────────
  let streak = 0;
  for (let i = allDays.length - 1; i >= 0; i--) {
    const d = allDays[i];
    if (!d.casePostponed && (d.firstCaseDelayMinutes === null || d.firstCaseDelayMinutes === 0) && !d.escalationsBySurgeon) {
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
            className="p-2 hover:bg-purple-50 rounded-lg transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-purple-900">Operation Theatre</h1>
        </div>
      )}

      {/* Hero Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {heroCards.map((card, i) => (
          <div key={i} className="bg-white border border-purple-100 rounded-lg p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color} mt-1`}>{card.value}</p>
            <p className="text-xs text-slate-500 mt-1">{card.sub}</p>
            {card.delta !== null && (
              <p className="text-xs mt-2">
                <span className={card.delta >= 0 ? 'text-red-600' : 'text-emerald-600'}>
                  {card.delta >= 0 ? '↑' : '↓'} {card.deltaFmt(Math.abs(card.delta))}
                </span>
                <span className="text-slate-400"> vs last month</span>
              </p>
            )}
          </div>
        ))}
      </div>

      {/* OT Cases Trend */}
      <div className="bg-white border border-purple-100 rounded-lg p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">OT Cases Trend</h3>
        <svg viewBox="0 0 1200 300" className="w-full h-32">
          {/* Grid */}
          <defs>
            <pattern id="grid-ot" width="100" height="40" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 40" fill="none" stroke="#f1f5f9" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="1200" height="300" fill="url(#grid-ot)" />

          {/* Area fill */}
          <path d={smoothAreaPath(casesPoints, 220)} stroke="none" fill="#c4b5fd" fillOpacity="0.3" />

          {/* Line */}
          <path d={smoothPath(casesPoints)} stroke="#7c3aed" strokeWidth="2.5" fill="none" />
          {casesPoints.map((p, i) => (
            <circle key={`case-${i}`} cx={p.x} cy={p.y} r="3" fill="#7c3aed" />
          ))}
        </svg>

        {/* Legend */}
        <div className="flex gap-6 mt-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-purple-500" />
            <span className="text-slate-600">Total Cases</span>
          </div>
        </div>
      </div>

      {/* Monthly Progression Table */}
      <div className="bg-white border border-purple-100 rounded-lg p-6 shadow-sm overflow-x-auto">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Monthly Progression</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-3 font-semibold text-slate-600">Month</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Days Reported</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Total Cases</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Avg/Day</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Postponed</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Delay Days</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Avg Delay (min)</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Escalations</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Consumable Trips</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => (
              <tr key={i} className="border-b border-slate-100 hover:bg-purple-50">
                <td className="py-3 px-3 font-medium text-slate-700">{m.label}</td>
                <td className="text-right py-3 px-3 text-slate-600">{m.daysReported}</td>
                <td className="text-right py-3 px-3 font-semibold text-purple-600">{m.totalCases}</td>
                <td className="text-right py-3 px-3 text-purple-600">{m.avgCasesPerDay.toFixed(1)}</td>
                <td className="text-right py-3 px-3 text-amber-600">{m.postponedDays}</td>
                <td className="text-right py-3 px-3 text-red-600">{m.delayDays}</td>
                <td className="text-right py-3 px-3 text-red-600">{m.avgDelayMinutes.toFixed(0)}</td>
                <td className="text-right py-3 px-3">
                  <span className={m.totalEscalations === 0 ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
                    {m.totalEscalations}
                  </span>
                </td>
                <td className="text-right py-3 px-3 text-slate-600">{m.totalConsumableTrips}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Postponements & Delays Calendar */}
      <div className="bg-white border border-purple-100 rounded-lg p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Postponements & Delays (Last 30 Days)</h3>
        <div className="grid grid-cols-10 gap-2">
          {incidentGrid.map((day, i) => (
            <div
              key={i}
              title={`${day.date}${day.hasPostponement ? ' [Postponed]' : ''}${day.hasDelay ? ` [${day.delayMinutes}min delay: ${day.reason}]` : ''}`}
              className={`aspect-square rounded flex items-center justify-center text-xs font-bold transition-colors cursor-pointer ${
                day.hasPostponement
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : day.hasDelay
                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                  : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
              }`}
            >
              {day.date.split('-')[2]}
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-4">Green = No issues | Amber = Delay | Red = Postponed</p>
      </div>

      {/* Incident Log */}
      {incidents.length > 0 && (
        <div className="bg-white border border-purple-100 rounded-lg p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Recent Incidents (Last 20 Events)</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {incidents.map((inc, i) => (
              <div key={i} className="flex gap-3 py-2 px-3 bg-slate-50 rounded text-xs border-l-2 border-purple-200">
                <span className={`font-semibold min-w-24 ${
                  inc.type === 'postponed' ? 'text-red-600' :
                  inc.type === 'delay' ? 'text-amber-600' :
                  inc.type === 'escalation' ? 'text-red-700' :
                  'text-orange-600'
                }`}>
                  {inc.type === 'postponed' ? '🛑' :
                   inc.type === 'delay' ? '⏱️' :
                   inc.type === 'escalation' ? '⚠️' :
                   '📦'}
                  {' '}
                  {inc.type === 'postponed' ? 'Postponed' :
                   inc.type === 'delay' ? 'Delay' :
                   inc.type === 'escalation' ? 'Escalation' :
                   'Consumable'}
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
        {/* Incident-Free Streak */}
        <div className="bg-white border border-purple-100 rounded-lg p-4 shadow-sm text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Smooth Days Streak</p>
          <p className="text-3xl font-bold text-purple-600 mt-2">{streak}</p>
          <p className="text-xs text-slate-500 mt-1">No postponements or escalations</p>
        </div>

        {/* Current Month Summary */}
        <div className="bg-white border border-purple-100 rounded-lg p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">This Month</p>
          {currentMonth && (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600">Total Cases:</span>
                <span className="font-semibold text-purple-600">{currentMonth.totalCases}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Avg Cases/Day:</span>
                <span className="font-semibold text-purple-600">{currentMonth.avgCasesPerDay.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Planned Next Day:</span>
                <span className="font-semibold text-slate-700">{currentMonth.avgPlannedSurgeries.toFixed(1)}/day</span>
              </div>
            </div>
          )}
        </div>

        {/* All-Time Summary */}
        <div className="bg-white border border-purple-100 rounded-lg p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">All-Time</p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Total Cases:</span>
              <span className="font-semibold">{summary.totalCases}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Days Reported:</span>
              <span className="font-semibold">{summary.totalDaysReported}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Avg Cases/Day:</span>
              <span className="font-semibold text-purple-600">{summary.avgCasesPerDay.toFixed(1)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
