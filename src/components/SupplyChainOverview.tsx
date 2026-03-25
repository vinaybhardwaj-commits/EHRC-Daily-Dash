'use client';

import React, { useEffect, useState } from 'react';

/* ── Types ────────────────────────────────────────────────────────── */

interface MonthSummary {
  month: string;
  label: string;
  daysReported: number;
  totalPO: number;
  totalGRN: number;
  avgPOPerDay: number;
  avgGRNPerDay: number;
  shortageDays: number;
  totalEmergencyProcurements: number;
  escalationDays: number;
  highValueAlertDays: number;
}

interface DayData {
  date: string;
  poIssued: number | null;
  grnPrepared: number | null;
  shortages: number | null;
  hasShortage: boolean;
  emergencyProcurements: number | null;
  hasProcurementEscalation: boolean;
  escalationText: string | null;
  hasHighValueAlert: boolean;
  highValueText: string | null;
  criticalStockStatus: string | null;
  pendingConsumptionText: string | null;
}

interface APIResponse {
  slug: string;
  department: string;
  summary: {
    totalDaysReported: number;
    dateRange: { from: string; to: string } | null;
    totalPO: number;
    totalGRN: number;
    avgPOPerDay: number;
    shortageDays: number;
    escalationDays: number;
    highValueAlertDays: number;
    totalEmergencyProcurements: number;
    shortageFreeRate: number;
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

export default function SupplyChainOverview({ embedded, onBack, onNavigateToDashboard }: Props) {
  const [data, setData] = useState<APIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/department-overview?slug=supply-chain')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-3 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
    </div>
  );
  if (error || !data) return (
    <div className="text-center py-12 text-red-500">Failed to load Supply Chain data</div>
  );

  const { summary, months, allDays } = data;
  const currentMonth = months[months.length - 1];
  const prevMonth = months.length > 1 ? months[months.length - 2] : null;

  // ── Hero Cards ──────────────────────────────────────────────────
  const heroCards = [
    {
      label: 'AVG PO/DAY',
      value: currentMonth ? currentMonth.avgPOPerDay.toFixed(1) : '—',
      sub: currentMonth ? `${currentMonth.totalPO} total this month` : '—',
      delta: currentMonth && prevMonth ? currentMonth.avgPOPerDay - prevMonth.avgPOPerDay : null,
      deltaFmt: (d: number) => d.toFixed(1),
      color: 'text-amber-600',
    },
    {
      label: 'TOTAL GRN',
      value: currentMonth ? currentMonth.totalGRN : '—',
      sub: currentMonth ? `${currentMonth.avgGRNPerDay.toFixed(1)} per day` : '—',
      delta: currentMonth && prevMonth ? currentMonth.totalGRN - prevMonth.totalGRN : null,
      deltaFmt: (d: number) => d.toFixed(0),
      color: 'text-orange-600',
    },
    {
      label: 'SHORTAGE-FREE RATE',
      value: summary ? summary.shortageFreeRate.toFixed(0) + '%' : '—',
      sub: summary ? `${summary.shortageDays} shortage days overall` : '—',
      delta: null,
      color: 'text-emerald-600',
    },
    {
      label: 'EMERGENCY PROCUREMENTS',
      value: currentMonth ? currentMonth.totalEmergencyProcurements : '—',
      sub: currentMonth ? `${currentMonth.escalationDays} escalation days` : '—',
      delta: null,
      color: 'text-red-600',
    },
  ];

  // ── PO & GRN Trend ──────────────────────────────────────────────
  const poGrnTrend = months.map((m, i) => ({
    month: fmtMonth(m.month),
    po: m.totalPO,
    grn: m.totalGRN,
    x: 80 + (i * 100),
  }));

  const poPoints = poGrnTrend.map(d => ({ x: d.x, y: Math.max(10, 200 - Math.min(d.po, 100) * 2) }));
  const grnPoints = poGrnTrend.map(d => ({ x: d.x, y: Math.max(10, 200 - Math.min(d.grn, 100) * 2) }));

  // ── Alerts (Shortage + Escalation + High Value) ──────────────────
  const alerts = allDays
    .filter(d => d.hasShortage || d.hasProcurementEscalation || d.hasHighValueAlert)
    .slice(-20)
    .reverse()
    .map(d => ({
      date: d.date,
      type: d.hasShortage ? 'shortage' : d.hasProcurementEscalation ? 'escalation' : 'highvalue',
      text: d.shortages
        ? `${d.shortages} items short`
        : d.escalationText || d.highValueText || 'Alert noted',
    }));

  // ── Streak Calculation (Consecutive shortage-free days) ──────────
  let streak = 0;
  for (let i = allDays.length - 1; i >= 0; i--) {
    if (!allDays[i].hasShortage) {
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
            className="p-2 hover:bg-amber-50 rounded-lg transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-amber-900">Supply Chain</h1>
        </div>
      )}

      {/* Hero Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {heroCards.map((card, i) => (
          <div key={i} className="bg-white border border-amber-100 rounded-lg p-4 shadow-sm">
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

      {/* PO & GRN Trend */}
      <div className="bg-white border border-amber-100 rounded-lg p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">PO & GRN Trend</h3>
        <svg viewBox="0 0 900 260" className="w-full h-32">
          {/* Grid */}
          <defs>
            <pattern id="grid-sc" width="100" height="40" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 40" fill="none" stroke="#f1f5f9" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="900" height="260" fill="url(#grid-sc)" />

          {/* PO line */}
          <path d={smoothPath(poPoints)} stroke="#d97706" strokeWidth="2" fill="none" />
          {poPoints.map((p, i) => (
            <circle key={`po-${i}`} cx={p.x} cy={p.y} r="3" fill="#d97706" />
          ))}

          {/* GRN line */}
          <path d={smoothPath(grnPoints)} stroke="#f97316" strokeWidth="2" fill="none" />
          {grnPoints.map((p, i) => (
            <circle key={`grn-${i}`} cx={p.x} cy={p.y} r="3" fill="#f97316" />
          ))}
        </svg>

        {/* Legend */}
        <div className="flex gap-6 mt-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-amber-600" />
            <span className="text-slate-600">PO Issued</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-orange-500" />
            <span className="text-slate-600">GRN Prepared</span>
          </div>
        </div>
      </div>

      {/* Monthly Progression Table */}
      <div className="bg-white border border-amber-100 rounded-lg p-6 shadow-sm overflow-x-auto">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Monthly Progression</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-3 font-semibold text-slate-600">Month</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Days</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">POs</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">GRNs</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Avg PO/Day</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Shortages</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Emergency</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Escalations</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => (
              <tr key={i} className="border-b border-slate-100 hover:bg-amber-50">
                <td className="py-3 px-3 font-medium text-slate-700">{m.label}</td>
                <td className="text-right py-3 px-3 text-slate-600">{m.daysReported}</td>
                <td className="text-right py-3 px-3 text-amber-600">{m.totalPO}</td>
                <td className="text-right py-3 px-3 text-orange-600">{m.totalGRN}</td>
                <td className="text-right py-3 px-3 text-amber-600 font-semibold">{m.avgPOPerDay.toFixed(1)}</td>
                <td className="text-right py-3 px-3">
                  <span className={m.shortageDays > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600'}>
                    {m.shortageDays}
                  </span>
                </td>
                <td className="text-right py-3 px-3">{m.totalEmergencyProcurements}</td>
                <td className="text-right py-3 px-3">
                  <span className={m.escalationDays > 0 ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                    {m.escalationDays}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Alert Log */}
      {alerts.length > 0 && (
        <div className="bg-white border border-amber-100 rounded-lg p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Recent Alerts (Last 20 Events)</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {alerts.map((alert, i) => (
              <div key={i} className="flex gap-3 py-2 px-3 bg-slate-50 rounded text-xs border-l-2 border-amber-200">
                <span className={`font-semibold min-w-24 ${
                  alert.type === 'shortage' ? 'text-red-600' :
                  alert.type === 'escalation' ? 'text-orange-600' :
                  'text-amber-600'
                }`}>
                  {alert.type === 'shortage' ? '⚠️' :
                   alert.type === 'escalation' ? '🔴' :
                   '🔶'}
                  {' '}
                  {alert.type === 'shortage' ? 'Shortage' :
                   alert.type === 'escalation' ? 'Escalation' :
                   'High Value'}
                </span>
                <div className="flex-1">
                  <p className="text-slate-600">{alert.text}</p>
                  <p className="text-slate-400">{alert.date}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Row: Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Shortage-Free Streak */}
        <div className="bg-white border border-amber-100 rounded-lg p-4 shadow-sm text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Shortage-Free Streak</p>
          <p className="text-3xl font-bold text-amber-600 mt-2">{streak}</p>
          <p className="text-xs text-slate-500 mt-1">Consecutive days without shortages</p>
        </div>

        {/* Current Month Summary */}
        <div className="bg-white border border-amber-100 rounded-lg p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">This Month</p>
          {currentMonth && (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600">PO/Day:</span>
                <span className="font-semibold text-amber-600">{currentMonth.avgPOPerDay.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">GRN/Day:</span>
                <span className="font-semibold text-orange-600">{currentMonth.avgGRNPerDay.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Shortages:</span>
                <span className={`font-semibold ${currentMonth.shortageDays > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {currentMonth.shortageDays}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* All-Time Summary */}
        <div className="bg-white border border-amber-100 rounded-lg p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">All-Time</p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Total POs:</span>
              <span className="font-semibold">{summary.totalPO}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Total GRNs:</span>
              <span className="font-semibold">{summary.totalGRN}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Days Reported:</span>
              <span className="font-semibold">{summary.totalDaysReported}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
