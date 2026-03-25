'use client';

import React, { useEffect, useState } from 'react';

/* ── Types ────────────────────────────────────────────────────────── */

interface MonthSummary {
  month: string;
  label: string;
  daysReported: number;
  totalXray: number;
  totalUSG: number;
  totalCT: number;
  totalCases: number;
  avgCasesPerDay: number;
  modalityMix: { xray: number; usg: number; ct: number };
  equipmentIssueDays: number;
  pendingReportDays: number;
  equipmentUptimeRate: number;
}

interface DayData {
  date: string;
  xrayCases: number | null;
  usgCases: number | null;
  ctCases: number | null;
  totalCases: number | null;
  reportsInHouse: number | null;
  hasEquipmentIssue: boolean;
  equipmentText: string | null;
  hasPendingReports: boolean;
  pendingText: string | null;
  hasCriticalEscalation: boolean;
  criticalText: string | null;
  hasStockIssue: boolean;
  stockText: string | null;
  radiationSafetyOk: boolean;
}

interface APIResponse {
  slug: string;
  department: string;
  summary: {
    totalDaysReported: number;
    dateRange: { from: string; to: string } | null;
    totalCases: number;
    totalXrayCases: number;
    totalUSGCases: number;
    totalCTCases: number;
    avgCasesPerDay: number;
    equipmentUptimeDays: number;
    equipmentUptime: number;
    daysWithPendingReports: number;
    daysWithCriticalEscalations: number;
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

export default function RadiologyOverview({ embedded, onBack, onNavigateToDashboard }: Props) {
  const [data, setData] = useState<APIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/department-overview?slug=radiology')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );
  if (error || !data) return (
    <div className="text-center py-12 text-red-500">Failed to load Radiology data</div>
  );

  const { summary, months, allDays } = data;
  const currentMonth = months[months.length - 1];
  const prevMonth = months.length > 1 ? months[months.length - 2] : null;

  // ── Hero Cards ──────────────────────────────────────────────────
  const heroCards = [
    {
      label: 'TOTAL CASES/DAY',
      value: currentMonth ? currentMonth.avgCasesPerDay.toFixed(1) : '—',
      sub: currentMonth ? `${currentMonth.totalCases} total this month` : '—',
      delta: currentMonth && prevMonth ? currentMonth.avgCasesPerDay - prevMonth.avgCasesPerDay : null,
      deltaFmt: (d: number) => d.toFixed(1),
      color: 'text-indigo-600',
    },
    {
      label: 'X-RAY CASES',
      value: currentMonth ? currentMonth.totalXray : '—',
      sub: currentMonth ? `${currentMonth.modalityMix.xray.toFixed(0)}% of cases` : '—',
      delta: currentMonth && prevMonth ? currentMonth.totalXray - prevMonth.totalXray : null,
      deltaFmt: (d: number) => d.toFixed(0),
      color: 'text-blue-600',
    },
    {
      label: 'USG CASES',
      value: currentMonth ? currentMonth.totalUSG : '—',
      sub: currentMonth ? `${currentMonth.modalityMix.usg.toFixed(0)}% of cases` : '—',
      delta: currentMonth && prevMonth ? currentMonth.totalUSG - prevMonth.totalUSG : null,
      deltaFmt: (d: number) => d.toFixed(0),
      color: 'text-emerald-600',
    },
    {
      label: 'EQUIPMENT UPTIME',
      value: currentMonth ? currentMonth.equipmentUptimeRate.toFixed(0) + '%' : '—',
      sub: currentMonth ? `${currentMonth.daysReported - currentMonth.equipmentIssueDays}/${currentMonth.daysReported} days` : '—',
      delta: null,
      color: 'text-purple-600',
    },
  ];

  // ── Case Volume Trend ────────────────────────────────────────────
  const caseVolumeTrend = months.map((m, i) => ({
    month: fmtMonth(m.month),
    xray: m.totalXray,
    usg: m.totalUSG,
    ct: m.totalCT,
    x: 80 + (i * 100),
  }));

  const xrayPoints = caseVolumeTrend.map(d => ({ x: d.x, y: Math.max(10, 200 - Math.min(d.xray, 100) * 2) }));
  const usgPoints = caseVolumeTrend.map(d => ({ x: d.x, y: Math.max(10, 200 - Math.min(d.usg, 100) * 2) }));
  const ctPoints = caseVolumeTrend.map(d => ({ x: d.x, y: Math.max(10, 200 - Math.min(d.ct, 50) * 4) }));

  // ── Modality Mix (Monthly Stacked Bar) ────────────────────────────
  const modalityBars = months.map((m, i) => ({
    month: fmtMonth(m.month),
    xray: m.modalityMix.xray,
    usg: m.modalityMix.usg,
    ct: m.modalityMix.ct,
    x: 60 + (i * 140),
  }));

  // ── Equipment Status Calendar ────────────────────────────────────
  const equipmentCalendar = allDays.slice(-30).map((d, idx) => ({
    date: d.date,
    status: d.hasEquipmentIssue ? 'issue' : 'ok',
    text: d.equipmentText || 'All clear',
  }));

  // ── Incidents (Equipment + Pending + Critical) ───────────────────
  const incidents = allDays
    .filter(d => d.hasEquipmentIssue || d.hasPendingReports || d.hasCriticalEscalation || d.hasStockIssue)
    .slice(-20)
    .reverse()
    .map(d => ({
      date: d.date,
      type: d.hasEquipmentIssue ? 'equipment' : d.hasPendingReports ? 'pending' : d.hasCriticalEscalation ? 'critical' : 'stock',
      text: d.equipmentText || d.pendingText || d.criticalText || d.stockText || 'Incident noted',
    }));

  // ── Streak Calculation (Consecutive incident-free days) ──────────
  let streak = 0;
  for (let i = allDays.length - 1; i >= 0; i--) {
    const d = allDays[i];
    if (!d.hasEquipmentIssue && !d.hasPendingReports && !d.hasCriticalEscalation && d.radiationSafetyOk) {
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
            className="p-2 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-indigo-900">Radiology</h1>
        </div>
      )}

      {/* Hero Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {heroCards.map((card, i) => (
          <div key={i} className="bg-white border border-indigo-100 rounded-lg p-4 shadow-sm">
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

      {/* Case Volume Trend */}
      <div className="bg-white border border-indigo-100 rounded-lg p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Case Volume Trend</h3>
        <svg viewBox="0 0 1200 300" className="w-full h-32">
          {/* Grid */}
          <defs>
            <pattern id="grid" width="100" height="40" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 40" fill="none" stroke="#f1f5f9" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="1200" height="300" fill="url(#grid)" />

          {/* X-Ray line */}
          <path d={smoothPath(xrayPoints)} stroke="#3b82f6" strokeWidth="2" fill="none" />
          {xrayPoints.map((p, i) => (
            <circle key={`xray-${i}`} cx={p.x} cy={p.y} r="3" fill="#3b82f6" />
          ))}

          {/* USG line */}
          <path d={smoothPath(usgPoints)} stroke="#10b981" strokeWidth="2" fill="none" />
          {usgPoints.map((p, i) => (
            <circle key={`usg-${i}`} cx={p.x} cy={p.y} r="3" fill="#10b981" />
          ))}

          {/* CT line */}
          <path d={smoothPath(ctPoints)} stroke="#f59e0b" strokeWidth="2" fill="none" />
          {ctPoints.map((p, i) => (
            <circle key={`ct-${i}`} cx={p.x} cy={p.y} r="3" fill="#f59e0b" />
          ))}
        </svg>

        {/* Legend */}
        <div className="flex gap-6 mt-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-blue-500" />
            <span className="text-slate-600">X-Ray</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-emerald-500" />
            <span className="text-slate-600">USG</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-amber-500" />
            <span className="text-slate-600">CT</span>
          </div>
        </div>
      </div>

      {/* Modality Mix */}
      <div className="bg-white border border-indigo-100 rounded-lg p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Modality Mix (Monthly)</h3>
        <svg viewBox="0 0 1200 100" className="w-full h-24">
          {modalityBars.map((bar, i) => {
            const barWidth = 100;
            const xrayW = (bar.xray / 100) * barWidth;
            const usgW = (bar.usg / 100) * barWidth;
            const ctW = (bar.ct / 100) * barWidth;

            return (
              <g key={i}>
                {/* X-Ray */}
                {xrayW > 0 && (
                  <rect x={bar.x} y="10" width={xrayW} height="40" fill="#3b82f6" />
                )}
                {/* USG */}
                {usgW > 0 && (
                  <rect x={bar.x + xrayW} y="10" width={usgW} height="40" fill="#10b981" />
                )}
                {/* CT */}
                {ctW > 0 && (
                  <rect x={bar.x + xrayW + usgW} y="10" width={ctW} height="40" fill="#f59e0b" />
                )}
                {/* Label */}
                <text x={bar.x + barWidth / 2} y="65" textAnchor="middle" fontSize="11" fill="#64748b">
                  {bar.month}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Monthly Progression Table */}
      <div className="bg-white border border-indigo-100 rounded-lg p-6 shadow-sm overflow-x-auto">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Monthly Progression</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-3 font-semibold text-slate-600">Month</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">X-Ray</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">USG</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">CT</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Total</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Avg/Day</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Equipment ⬆</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => (
              <tr key={i} className="border-b border-slate-100 hover:bg-indigo-50">
                <td className="py-3 px-3 font-medium text-slate-700">{m.label}</td>
                <td className="text-right py-3 px-3 text-blue-600">{m.totalXray}</td>
                <td className="text-right py-3 px-3 text-emerald-600">{m.totalUSG}</td>
                <td className="text-right py-3 px-3 text-amber-600">{m.totalCT}</td>
                <td className="text-right py-3 px-3 font-semibold text-slate-900">{m.totalCases}</td>
                <td className="text-right py-3 px-3 text-indigo-600">{m.avgCasesPerDay.toFixed(1)}</td>
                <td className="text-right py-3 px-3">
                  <span className={m.equipmentUptimeRate >= 95 ? 'text-emerald-600 font-semibold' : m.equipmentUptimeRate >= 80 ? 'text-amber-600' : 'text-red-600'}>
                    {m.equipmentUptimeRate.toFixed(0)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Equipment Status Calendar */}
      <div className="bg-white border border-indigo-100 rounded-lg p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Equipment Status (Last 30 Days)</h3>
        <div className="grid grid-cols-10 gap-2">
          {equipmentCalendar.map((day, i) => (
            <div
              key={i}
              title={`${day.date}: ${day.text}`}
              className={`aspect-square rounded flex items-center justify-center text-xs font-bold transition-colors cursor-pointer ${
                day.status === 'ok'
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-red-100 text-red-700 hover:bg-red-200'
              }`}
            >
              {day.date.split('-')[2]}
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-4">Green = Operational | Red = Issue reported</p>
      </div>

      {/* Incident Log */}
      {incidents.length > 0 && (
        <div className="bg-white border border-indigo-100 rounded-lg p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Recent Incidents (Last 20 Events)</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {incidents.map((inc, i) => (
              <div key={i} className="flex gap-3 py-2 px-3 bg-slate-50 rounded text-xs border-l-2 border-indigo-200">
                <span className={`font-semibold min-w-20 ${
                  inc.type === 'equipment' ? 'text-red-600' :
                  inc.type === 'pending' ? 'text-amber-600' :
                  inc.type === 'critical' ? 'text-red-700' :
                  'text-orange-600'
                }`}>
                  {inc.type === 'equipment' ? '🔧' :
                   inc.type === 'pending' ? '⏳' :
                   inc.type === 'critical' ? '⚠️' :
                   '📦'}
                  {' '}
                  {inc.type === 'equipment' ? 'Equipment' :
                   inc.type === 'pending' ? 'Pending' :
                   inc.type === 'critical' ? 'Critical' :
                   'Stock'}
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
        {/* Equipment Uptime Streak */}
        <div className="bg-white border border-indigo-100 rounded-lg p-4 shadow-sm text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Uptime Streak</p>
          <p className="text-3xl font-bold text-indigo-600 mt-2">{streak}</p>
          <p className="text-xs text-slate-500 mt-1">Consecutive incident-free days</p>
        </div>

        {/* Modality Distribution */}
        <div className="bg-white border border-indigo-100 rounded-lg p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Distribution</p>
          {currentMonth && (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600">X-Ray:</span>
                <span className="font-semibold text-blue-600">{currentMonth.modalityMix.xray.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">USG:</span>
                <span className="font-semibold text-emerald-600">{currentMonth.modalityMix.usg.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">CT:</span>
                <span className="font-semibold text-amber-600">{currentMonth.modalityMix.ct.toFixed(0)}%</span>
              </div>
            </div>
          )}
        </div>

        {/* All-Time Summary */}
        <div className="bg-white border border-indigo-100 rounded-lg p-4 shadow-sm">
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
              <span className="text-slate-600">Incident-Free:</span>
              <span className="font-semibold text-emerald-600">{summary.incidentFreeDays}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
