'use client';

import React, { useEffect, useState } from 'react';

/* ── Types ────────────────────────────────────────────────────────── */

interface EmergencyMonthSummary {
  month: string;
  label: string;
  daysReported: number;
  totalERCases: number;
  avgERCasesPerDay: number;
  totalAdmissions: number;
  totalDischarges: number;
  totalTransfers: number;
  totalDeaths: number;
  totalMLC: number;
  totalCriticalAlerts: number;
  totalLAMA: number;
  totalIncidents: number;
  challengeDays: number;
  zeroERDays: number;
  deathDays: number;
  mlcDays: number;
  alertDays: number;
  incidentFreeDays: number;
  incidentFreeRate: number;
}

interface EmergencyDayData {
  date: string;
  erCases: number | null;
  admissions: number;
  discharges: number;
  transfers: number;
  deaths: number | null;
  mlcCases: number | null;
  criticalAlerts: number | null;
  lamaCount: number;
  lamaText: string | null;
  incidentReports: number;
  incidentText: string | null;
  hasChallenges: boolean;
  challengeText: string | null;
  othersText: string | null;
  hasOthers: boolean;
}

interface APIResponse {
  slug: string;
  department: string;
  summary: {
    totalDaysReported: number;
    dateRange: { from: string; to: string } | null;
    totalERCases: number;
    avgERPerDay: number;
    totalAdmissions: number;
    totalDischarges: number;
    totalDeaths: number;
    totalMLC: number;
    totalCriticalAlerts: number;
    totalLAMA: number;
    totalIncidents: number;
    deathDays: number;
    zeroERDays: number;
    incidentFreeDays: number;
  };
  months: EmergencyMonthSummary[];
  allDays: EmergencyDayData[];
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

export default function EmergencyOverview({ embedded, onBack, onNavigateToDashboard }: Props) {
  const [data, setData] = useState<APIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/department-overview?slug=emergency')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-3 border-red-200 border-t-red-600 rounded-full animate-spin" />
    </div>
  );
  if (error || !data) return (
    <div className="text-center py-12 text-red-500">Failed to load Emergency data</div>
  );

  const { summary, months, allDays } = data;
  const currentMonth = months[months.length - 1];
  const prevMonth = months.length > 1 ? months[months.length - 2] : null;

  // ── Hero Cards ──────────────────────────────────────────────────
  const heroCards = [
    {
      label: 'ER CASES/DAY',
      value: currentMonth ? currentMonth.avgERCasesPerDay.toFixed(1) : '—',
      sub: `${currentMonth ? currentMonth.totalERCases : 0} cases this month`,
      delta: currentMonth && prevMonth ? currentMonth.avgERCasesPerDay - prevMonth.avgERCasesPerDay : null,
      deltaFmt: (d: number) => d.toFixed(1),
      color: 'text-red-600',
      invertTrend: false,
    },
    {
      label: 'ADMISSIONS',
      value: currentMonth ? currentMonth.totalAdmissions.toString() : '—',
      sub: `${currentMonth ? currentMonth.totalDischarges : 0} discharged this month`,
      delta: currentMonth && prevMonth ? currentMonth.totalAdmissions - prevMonth.totalAdmissions : null,
      deltaFmt: (d: number) => d.toFixed(0),
      color: 'text-blue-600',
      invertTrend: false,
    },
    {
      label: 'DEATHS',
      value: currentMonth ? currentMonth.totalDeaths.toString() : '—',
      sub: `${currentMonth ? currentMonth.deathDays : 0} days with deaths`,
      delta: currentMonth && prevMonth ? currentMonth.totalDeaths - prevMonth.totalDeaths : null,
      deltaFmt: (d: number) => d.toFixed(0),
      color: 'text-red-600',
      invertTrend: true,
    },
    {
      label: 'INCIDENT-FREE',
      value: currentMonth ? `${currentMonth.incidentFreeRate.toFixed(0)}%` : '—',
      sub: `${currentMonth ? currentMonth.incidentFreeDays : 0}/${currentMonth ? currentMonth.daysReported : 0} clean days`,
      delta: currentMonth && prevMonth ? currentMonth.incidentFreeRate - prevMonth.incidentFreeRate : null,
      deltaFmt: (d: number) => `${d.toFixed(0)}pp`,
      color: 'text-emerald-600',
      invertTrend: false,
    },
  ];

  // ── Chart dimensions ────────────────────────────────────────────
  const chartW = 900, chartH = 260, padL = 50, padR = 20, padT = 30, padB = 50;
  const drawW = chartW - padL - padR;
  const drawH = chartH - padT - padB;

  // ── ER Volume & Admissions Trend ────────────────────────────────
  const erMax = Math.max(...months.map(m => m.avgERCasesPerDay), 1);
  const admMax = Math.max(...months.map(m => m.totalAdmissions), 1);
  const dualMax = Math.ceil(Math.max(erMax, admMax) / 5) * 5 + 5;

  const erPts = months.map((m, i) => ({
    x: padL + (i / Math.max(months.length - 1, 1)) * drawW,
    y: padT + drawH - (m.avgERCasesPerDay / dualMax) * drawH,
  }));
  const admPts = months.map((m, i) => ({
    x: padL + (i / Math.max(months.length - 1, 1)) * drawW,
    y: padT + drawH - (m.totalAdmissions / dualMax) * drawH,
  }));

  // ── Case Outcome Mix — Stacked Bar ──────────────────────────────
  const barMax = Math.max(...months.map(m => m.totalAdmissions + m.totalDischarges + m.totalLAMA), 1);
  const barYMax = Math.ceil(barMax / 10) * 10 + 10;
  const barW = Math.min(36, drawW / months.length - 8);

  // ── Critical Events Calendar ────────────────────────────────────
  const recentMonths = months.slice(-3);

  // ── Incident Log ────────────────────────────────────────────────
  const incidents = allDays.filter(d =>
    (d.deaths || 0) > 0 || d.lamaCount > 0 || (d.criticalAlerts || 0) > 0 || d.incidentReports > 0
  );

  // ── Incident-Free Streak ────────────────────────────────────────
  let currentStreak = 0;
  let bestStreak = 0;
  let tempStreak = 0;
  for (const d of allDays) {
    if ((d.deaths || 0) === 0 && (d.criticalAlerts || 0) === 0 && d.incidentReports === 0 && d.lamaCount === 0) {
      tempStreak++;
      if (tempStreak > bestStreak) bestStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  }
  for (let i = allDays.length - 1; i >= 0; i--) {
    if ((allDays[i].deaths || 0) === 0 && (allDays[i].criticalAlerts || 0) === 0 &&
        allDays[i].incidentReports === 0 && allDays[i].lamaCount === 0) currentStreak++;
    else break;
  }

  return (
    <div className={embedded ? '' : 'max-w-5xl mx-auto px-4 py-8'}>
      {/* Header */}
      {embedded && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-slate-400">
            {summary.dateRange ? `${summary.dateRange.from} to ${summary.dateRange.to}` : ''} · {summary.totalDaysReported} days of emergency data analyzed
          </p>
        </div>
      )}

      {/* Hero Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {heroCards.map((card) => {
          const deltaColor = card.invertTrend
            ? (card.delta !== null && card.delta !== 0 ? (card.delta > 0 ? 'text-red-400' : 'text-emerald-500') : '')
            : (card.delta !== null && card.delta !== 0 ? (card.delta >= 0 ? 'text-emerald-500' : 'text-red-400') : '');
          const deltaSymbol = card.delta !== null && card.delta !== 0 ? (card.delta >= 0 ? '↑' : '↓') : '';
          return (
            <div key={card.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3.5">
              <p className="text-[10px] font-semibold tracking-wider text-slate-400 mb-1">{card.label}</p>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold ${card.color}`}>{card.value}</span>
                {card.delta !== null && card.delta !== 0 && (
                  <span className={`text-xs font-medium ${deltaColor}`}>
                    {deltaSymbol} {card.deltaFmt(Math.abs(card.delta))}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">{card.sub}</p>
            </div>
          );
        })}
      </div>

      {/* ER Volume & Admissions Trend */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">ER Volume & Admissions Trend — Monthly</h3>
        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full">
          <defs>
            <linearGradient id="em-er-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="em-adm-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = padT + drawH - frac * drawH;
            return (
              <g key={frac}>
                <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke="#e2e8f0" strokeDasharray="3,3" />
                <text x={padL - 6} y={y + 4} textAnchor="end" className="text-[10px] fill-slate-400">
                  {Math.round(frac * dualMax)}
                </text>
              </g>
            );
          })}

          {erPts.length >= 2 && (
            <>
              <path d={smoothAreaPath(erPts, padT + drawH)} fill="url(#em-er-grad)" />
              <path d={smoothPath(erPts)} fill="none" stroke="#ef4444" strokeWidth="2.5" />
            </>
          )}
          {admPts.length >= 2 && (
            <>
              <path d={smoothAreaPath(admPts, padT + drawH)} fill="url(#em-adm-grad)" />
              <path d={smoothPath(admPts)} fill="none" stroke="#3b82f6" strokeWidth="2.5" />
            </>
          )}

          {erPts.map((p, i) => (
            <g key={`e${i}`}>
              <circle cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#ef4444" strokeWidth="2" />
              <text x={p.x} y={p.y - 10} textAnchor="middle" className="text-[9px] fill-red-600 font-medium">
                {months[i].avgERCasesPerDay.toFixed(1)}
              </text>
            </g>
          ))}
          {admPts.map((p, i) => (
            <g key={`a${i}`}>
              <circle cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#3b82f6" strokeWidth="2" />
              <text x={p.x} y={p.y - 10} textAnchor="middle" className="text-[9px] fill-blue-600 font-medium">
                {months[i].totalAdmissions}
              </text>
            </g>
          ))}

          {months.map((m, i) => (
            <text key={m.month} x={padL + (i / Math.max(months.length - 1, 1)) * drawW} y={chartH - 8} textAnchor="middle" className="text-[9px] fill-slate-400">
              {fmtMonth(m.month)}
            </text>
          ))}
        </svg>
        <div className="flex items-center gap-4 mt-2 justify-center">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded-full bg-red-500" /> Avg ER Cases/Day
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded-full bg-blue-500" /> Total Admissions
          </span>
        </div>
      </div>

      {/* Case Outcome Mix — Stacked Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Case Outcome Mix — Monthly</h3>
        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full">
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = padT + drawH - frac * drawH;
            return (
              <g key={frac}>
                <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke="#e2e8f0" strokeDasharray="3,3" />
                <text x={padL - 6} y={y + 4} textAnchor="end" className="text-[10px] fill-slate-400">
                  {Math.round(frac * barYMax)}
                </text>
              </g>
            );
          })}

          {months.map((m, i) => {
            const cx = padL + (i / Math.max(months.length - 1, 1)) * drawW;
            const admH = (m.totalAdmissions / barYMax) * drawH;
            const disH = (m.totalDischarges / barYMax) * drawH;
            const lamaH = (m.totalLAMA / barYMax) * drawH;
            const deathH = (m.totalDeaths / barYMax) * drawH;
            const baseY = padT + drawH;
            return (
              <g key={m.month}>
                <rect x={cx - barW / 2} y={baseY - admH} width={barW} height={admH} fill="#3b82f6" rx={2} opacity={0.8} />
                <rect x={cx - barW / 2} y={baseY - admH - disH} width={barW} height={disH} fill="#10b981" rx={2} opacity={0.8} />
                <rect x={cx - barW / 2} y={baseY - admH - disH - lamaH} width={barW} height={lamaH} fill="#f59e0b" rx={2} opacity={0.8} />
                <rect x={cx - barW / 2} y={baseY - admH - disH - lamaH - deathH} width={barW} height={deathH} fill="#ef4444" rx={2} opacity={0.8} />
                {(m.totalAdmissions + m.totalDischarges + m.totalLAMA + m.totalDeaths) > 0 && (
                  <text x={cx} y={baseY - admH - disH - lamaH - deathH - 6} textAnchor="middle" className="text-[9px] fill-slate-600 font-medium">
                    {m.totalAdmissions + m.totalDischarges + m.totalLAMA + m.totalDeaths}
                  </text>
                )}
              </g>
            );
          })}

          {months.map((m, i) => (
            <text key={m.month} x={padL + (i / Math.max(months.length - 1, 1)) * drawW} y={chartH - 8} textAnchor="middle" className="text-[9px] fill-slate-400">
              {fmtMonth(m.month)}
            </text>
          ))}
        </svg>
        <div className="flex items-center gap-4 mt-2 justify-center flex-wrap">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded bg-blue-500 opacity-80" /> Admissions
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded bg-emerald-500 opacity-80" /> Discharges
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded bg-amber-500 opacity-80" /> LAMA
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded bg-red-500 opacity-80" /> Deaths
          </span>
        </div>
      </div>

      {/* Monthly Progression Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 overflow-x-auto">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-base">🚑</span>
          <h3 className="text-sm font-semibold text-slate-800">Monthly Progression</h3>
          <span className="text-[9px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Emergency Services</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 pr-4 text-slate-500 font-medium">Metric</th>
              {months.map(m => (
                <th key={m.month} className="text-center py-2 px-2 text-slate-500 font-medium">{fmtMonth(m.month)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'ER Cases', key: 'totalERCases', fmt: (v: number) => String(v), badMetric: false },
              { label: 'Avg/Day', key: 'avgERCasesPerDay', fmt: (v: number) => v.toFixed(1), badMetric: false },
              { label: 'Admissions', key: 'totalAdmissions', fmt: (v: number) => String(v), badMetric: false },
              { label: 'Discharges', key: 'totalDischarges', fmt: (v: number) => String(v), badMetric: false },
              { label: 'Deaths', key: 'totalDeaths', fmt: (v: number) => String(v), badMetric: true },
              { label: 'MLC Cases', key: 'totalMLC', fmt: (v: number) => String(v), badMetric: true },
              { label: 'Critical Alerts', key: 'totalCriticalAlerts', fmt: (v: number) => String(v), badMetric: true },
              { label: 'LAMA', key: 'totalLAMA', fmt: (v: number) => String(v), badMetric: true },
              { label: 'Incident Reports', key: 'totalIncidents', fmt: (v: number) => String(v), badMetric: true },
              { label: 'Incident-Free Rate', key: 'incidentFreeRate', fmt: (v: number) => `${v.toFixed(0)}%`, badMetric: false },
              { label: 'Days Reported', key: 'daysReported', fmt: (v: number) => String(v), badMetric: false },
            ].map(({ label, key, fmt, badMetric }) => (
              <tr key={key} className="border-b border-slate-50">
                <td className="py-2.5 pr-4 text-slate-700 font-medium whitespace-nowrap">{label}</td>
                {months.map((m, i) => {
                  const val = (m as unknown as Record<string, number>)[key];
                  const prev = i > 0 ? (months[i - 1] as unknown as Record<string, number>)[key] : null;
                  const delta = prev !== null ? val - prev : null;
                  return (
                    <td key={m.month} className="text-center py-2.5 px-2">
                      <span className="text-slate-800 font-medium">{fmt(val)}</span>
                      {delta !== null && delta !== 0 && (
                        <div className={`text-[9px] ${
                          badMetric
                            ? delta > 0 ? 'text-red-400' : 'text-emerald-500'
                            : delta > 0 ? 'text-emerald-500' : 'text-red-400'
                        }`}>
                          {delta > 0 ? '+' : ''}{key === 'incidentFreeRate' ? `${delta.toFixed(0)}pp` : delta.toFixed(key === 'avgERCasesPerDay' ? 1 : 0)}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Critical Events Calendar + Incident Log */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Critical Events Calendar */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Critical Events Calendar</h3>
          {recentMonths.map((m) => {
            const mDays = allDays.filter(d => d.date.startsWith(m.month));
            const daysInMonth = new Date(parseInt(m.month.split('-')[0]), parseInt(m.month.split('-')[1]), 0).getDate();
            return (
              <div key={m.month} className="mb-3">
                <p className="text-[10px] text-slate-500 font-medium mb-1">{fmtMonth(m.month).replace("'", ' 20')}</p>
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const dayNum = String(i + 1).padStart(2, '0');
                    const dateStr = `${m.month}-${dayNum}`;
                    const dayData = mDays.find(d => d.date === dateStr);
                    if (!dayData) return (
                      <div key={i} className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center text-[7px] text-slate-300">·</div>
                    );
                    let bg = 'bg-emerald-200 text-emerald-700';
                    let symbol = '·';
                    if ((dayData.deaths || 0) > 0) {
                      bg = 'bg-red-200 text-red-700'; symbol = 'D';
                    } else if ((dayData.criticalAlerts || 0) > 0) {
                      bg = 'bg-orange-200 text-orange-700'; symbol = 'A';
                    } else if ((dayData.mlcCases || 0) > 0) {
                      bg = 'bg-yellow-200 text-yellow-700'; symbol = 'M';
                    } else if (dayData.lamaCount > 0) {
                      bg = 'bg-purple-200 text-purple-700'; symbol = 'L';
                    }
                    return (
                      <div key={i} className={`w-5 h-5 rounded ${bg} flex items-center justify-center text-[7px] font-bold`}>
                        {symbol}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {[
              { color: 'bg-emerald-200', label: 'Clean' },
              { color: 'bg-red-200', label: 'Death' },
              { color: 'bg-orange-200', label: 'Critical Alert' },
              { color: 'bg-yellow-200', label: 'MLC' },
              { color: 'bg-purple-200', label: 'LAMA' },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1 text-[9px] text-slate-500">
                <span className={`w-3 h-3 rounded ${color}`} /> {label}
              </span>
            ))}
          </div>
        </div>

        {/* Incident Log */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Critical Events — {incidents.length} Days</h3>
          <p className="text-[10px] text-slate-400 mb-3">Deaths, LAMA, alerts, and incidents</p>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
            {incidents.slice(-12).reverse().map((d) => {
              const texts: string[] = [];
              if ((d.deaths || 0) > 0) texts.push(`☠️ ${d.deaths} death(s)`);
              if (d.lamaCount > 0) texts.push(`🚪 ${d.lamaCount} LAMA${d.lamaText ? ` — ${d.lamaText}` : ''}`);
              if ((d.criticalAlerts || 0) > 0) texts.push(`🚨 ${d.criticalAlerts} critical alert(s)`);
              if (d.incidentReports > 0) texts.push(`📋 ${d.incidentReports} incident(s)${d.incidentText ? ` — ${d.incidentText}` : ''}`);

              let typeColor = 'border-slate-300';
              if ((d.deaths || 0) > 0) typeColor = 'border-red-300';
              else if ((d.criticalAlerts || 0) > 0) typeColor = 'border-orange-300';
              else if (d.lamaCount > 0) typeColor = 'border-purple-300';
              else if (d.incidentReports > 0) typeColor = 'border-yellow-300';

              return (
                <div key={d.date} className="flex gap-2 items-start">
                  <span className="text-[9px] text-slate-500 font-mono whitespace-nowrap mt-0.5">
                    {d.date.substring(5).replace('-', '/')}
                  </span>
                  <div className={`border-l-2 ${typeColor} pl-2`}>
                    {texts.map((t, ti) => (
                      <p key={ti} className="text-[10px] text-slate-600 leading-tight">{t}</p>
                    ))}
                  </div>
                </div>
              );
            })}
            {incidents.length === 0 && (
              <p className="text-[10px] text-slate-400 text-center py-4">No critical events recorded</p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom row: Streak + MLC/Alerts + All-Time Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Incident-Free Streak */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-[10px] font-semibold tracking-wider text-slate-400 mb-1">INCIDENT-FREE STREAK</p>
          <div className="flex items-end gap-1">
            <span className="text-3xl font-bold text-emerald-600">{currentStreak}</span>
            <span className="text-sm text-slate-400 mb-1">days</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Current (best: {bestStreak} days)</p>
          <span className="text-2xl mt-2 block">✨</span>
        </div>

        {/* MLC & Critical Alerts Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-[10px] font-semibold tracking-wider text-slate-400 mb-1">MLC & CRITICAL ALERTS</p>
          <div className="flex items-end gap-1">
            <span className="text-3xl font-bold text-orange-600">{summary.totalMLC + summary.totalCriticalAlerts}</span>
            <span className="text-sm text-slate-400 mb-1">events</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">{summary.totalMLC} MLC + {summary.totalCriticalAlerts} alerts</p>
          <div className="flex items-end gap-1.5 mt-3 h-10">
            {months.slice(-6).map(m => {
              const val = m.totalMLC + m.totalCriticalAlerts;
              const maxV = Math.max(...months.slice(-6).map(mm => mm.totalMLC + mm.totalCriticalAlerts), 1);
              const h = val > 0 ? Math.max((val / maxV) * 36, 3) : 2;
              return (
                <div key={m.month} className="flex flex-col items-center gap-0.5 flex-1">
                  <div className="w-full max-w-[20px] rounded bg-orange-300" style={{ height: `${h}px` }} />
                  <span className="text-[7px] text-slate-400">{fmtMonth(m.month).split(' ')[0]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* All-Time Summary */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-[10px] font-semibold tracking-wider text-slate-400 mb-3">ALL-TIME SUMMARY</p>
          <div className="space-y-1.5">
            {[
              { label: 'Total days analyzed', value: summary.totalDaysReported },
              { label: 'Total ER cases', value: summary.totalERCases },
              { label: 'Total admissions', value: summary.totalAdmissions },
              { label: 'Total discharges', value: summary.totalDischarges },
              { label: 'Total deaths', value: summary.totalDeaths },
              { label: 'Total MLC cases', value: summary.totalMLC },
              { label: 'Total critical alerts', value: summary.totalCriticalAlerts },
              { label: 'Total LAMA', value: summary.totalLAMA },
              { label: 'Incident-free days', value: summary.incidentFreeDays },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-[10px]">
                <span className="text-slate-500">{label}</span>
                <span className="text-slate-800 font-semibold">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
