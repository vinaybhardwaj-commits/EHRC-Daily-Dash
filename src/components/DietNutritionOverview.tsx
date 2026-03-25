'use client';

import React, { useEffect, useState } from 'react';

/* ── Types ────────────────────────────────────────────────────────── */

interface MonthSummary {
  month: string;
  daysReported: number;
  avgCensus: number;
  totalCensus: number;
  totalTeleConsults: number;
  totalOPConsults: number;
  totalConsults: number;
  avgConsultsPerDay: number;
  telePercentage: number;
  bcaDoneSum: number;
  bcaMTDLatest: number | null;
  dischargesWithDietSum: number;
  dischargeDietRate: number;
  foodIssueDays: number;
  kitchenIssueDays: number;
  delayDays: number;
  clinicalAuditDays: number;
  incidentFreeDays: number;
  incidentFreeRate: number;
}

interface DayData {
  date: string;
  census: number | null;
  teleConsults: number | null;
  opConsults: number | null;
  totalConsults: number | null;
  bcaDone: number | null;
  bcaMTD: number | null;
  dischargesWithDiet: number | null;
  hasFoodIssue: boolean;
  foodFeedbackText: string | null;
  hasKitchenIssue: boolean;
  kitchenText: string | null;
  hasDelay: boolean;
  delayText: string | null;
  clinicalAuditText: string | null;
  hasClinicalAudit: boolean;
}

interface APIResponse {
  slug: string;
  department: string;
  summary: {
    totalDaysReported: number;
    dateRange: { from: string; to: string } | null;
    totalCensus: number;
    avgCensusPerDay: number;
    totalConsults: number;
    totalTeleConsults: number;
    totalOPConsults: number;
    overallTelePercentage: number;
    totalBCADone: number;
    totalDischargesWithDiet: number;
    foodIssueDays: number;
    kitchenIssueDays: number;
    delayDays: number;
    clinicalAuditDays: number;
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

export default function DietNutritionOverview({ embedded, onBack, onNavigateToDashboard }: Props) {
  const [data, setData] = useState<APIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/department-overview?slug=diet')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-3 border-green-200 border-t-green-600 rounded-full animate-spin" />
    </div>
  );
  if (error || !data) return (
    <div className="text-center py-12 text-red-500">Failed to load Diet & Nutrition data</div>
  );

  const { summary, months, allDays } = data;
  const currentMonth = months[months.length - 1];
  const prevMonth = months.length > 1 ? months[months.length - 2] : null;

  // ── Hero Cards ──────────────────────────────────────────────────
  const heroCards = [
    {
      label: 'CENSUS AVG/DAY',
      value: currentMonth ? currentMonth.avgCensus.toFixed(0) : '—',
      sub: `${currentMonth ? currentMonth.totalCensus : 0} diet patients this month`,
      delta: currentMonth && prevMonth ? currentMonth.avgCensus - prevMonth.avgCensus : null,
      deltaFmt: (d: number) => d.toFixed(1),
      color: 'text-emerald-600',
    },
    {
      label: 'CONSULTATIONS',
      value: currentMonth ? currentMonth.totalConsults.toString() : '—',
      sub: `${currentMonth ? currentMonth.totalTeleConsults : 0} tele + ${currentMonth ? currentMonth.totalOPConsults : 0} OP`,
      delta: currentMonth && prevMonth ? currentMonth.totalConsults - prevMonth.totalConsults : null,
      deltaFmt: (d: number) => d.toFixed(0),
      color: 'text-blue-600',
    },
    {
      label: 'BCA THIS MONTH',
      value: currentMonth ? (currentMonth.bcaMTDLatest ?? currentMonth.bcaDoneSum).toString() : '—',
      sub: `${summary.totalBCADone} all-time assessments`,
      delta: currentMonth && prevMonth ? currentMonth.bcaDoneSum - prevMonth.bcaDoneSum : null,
      deltaFmt: (d: number) => d.toFixed(0),
      color: 'text-violet-600',
    },
    {
      label: 'INCIDENT-FREE',
      value: currentMonth ? `${currentMonth.incidentFreeRate.toFixed(0)}%` : '—',
      sub: `${currentMonth ? currentMonth.incidentFreeDays : 0}/${currentMonth ? currentMonth.daysReported : 0} clean days`,
      delta: currentMonth && prevMonth ? currentMonth.incidentFreeRate - prevMonth.incidentFreeRate : null,
      deltaFmt: (d: number) => `${d.toFixed(0)}pp`,
      color: 'text-amber-600',
    },
  ];

  // ── Chart dimensions ────────────────────────────────────────────
  const chartW = 900, chartH = 260, padL = 50, padR = 20, padT = 30, padB = 50;
  const drawW = chartW - padL - padR;
  const drawH = chartH - padT - padB;

  // ── Census & Consultation Trend ─────────────────────────────────
  const censusMax = Math.max(...months.map(m => m.avgCensus), 1);
  const consultMax = Math.max(...months.map(m => m.avgConsultsPerDay), 1);
  const dualMax = Math.ceil(Math.max(censusMax, consultMax) / 5) * 5 + 5;

  const censusPts = months.map((m, i) => ({
    x: padL + (i / Math.max(months.length - 1, 1)) * drawW,
    y: padT + drawH - (m.avgCensus / dualMax) * drawH,
  }));
  const consultPts = months.map((m, i) => ({
    x: padL + (i / Math.max(months.length - 1, 1)) * drawW,
    y: padT + drawH - (m.avgConsultsPerDay / dualMax) * drawH,
  }));

  // ── Consultation Channel Bar Chart ──────────────────────────────
  const barMax = Math.max(...months.map(m => m.totalConsults), 1);
  const barYMax = Math.ceil(barMax / 10) * 10 + 10;
  const barW = Math.min(36, drawW / months.length - 8);

  // ── BCA Growth Tracking ─────────────────────────────────────────
  const bcaMonths = months.filter(m => m.bcaDoneSum > 0 || (m.bcaMTDLatest !== null && m.bcaMTDLatest > 0));

  // ── Food Service Quality Calendar ───────────────────────────────
  const recentMonths = months.slice(-3);

  // ── Incident Log ────────────────────────────────────────────────
  const incidents = allDays.filter(d => d.hasFoodIssue || d.hasKitchenIssue || d.hasDelay);

  // ── Incident-Free Streak ────────────────────────────────────────
  let currentStreak = 0;
  let bestStreak = 0;
  let tempStreak = 0;
  for (const d of allDays) {
    if (!d.hasFoodIssue && !d.hasKitchenIssue && !d.hasDelay) {
      tempStreak++;
      if (tempStreak > bestStreak) bestStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  }
  for (let i = allDays.length - 1; i >= 0; i--) {
    if (!allDays[i].hasFoodIssue && !allDays[i].hasKitchenIssue && !allDays[i].hasDelay) currentStreak++;
    else break;
  }

  // ── Discharge Diet Coverage ─────────────────────────────────────
  const dcMonths = months.filter(m => m.dischargesWithDietSum > 0);

  return (
    <div className={embedded ? '' : 'max-w-5xl mx-auto px-4 py-8'}>
      {/* Header */}
      {embedded && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-slate-400">
            {summary.dateRange ? `${summary.dateRange.from} to ${summary.dateRange.to}` : ''} · {summary.totalDaysReported} days of nutrition data analyzed
          </p>
        </div>
      )}

      {/* Hero Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {heroCards.map((card) => (
          <div key={card.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3.5">
            <p className="text-[10px] font-semibold tracking-wider text-slate-400 mb-1">{card.label}</p>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${card.color}`}>{card.value}</span>
              {card.delta !== null && card.delta !== 0 && (
                <span className={`text-xs font-medium ${card.delta >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                  {card.delta >= 0 ? '↑' : '↓'} {card.deltaFmt(Math.abs(card.delta))}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Census & Consultation Trend */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Patient Census & Consultation Trends — Monthly</h3>
        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full">
          <defs>
            <linearGradient id="diet-census-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="diet-consult-grad" x1="0" y1="0" x2="0" y2="1">
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

          {censusPts.length >= 2 && (
            <>
              <path d={smoothAreaPath(censusPts, padT + drawH)} fill="url(#diet-census-grad)" />
              <path d={smoothPath(censusPts)} fill="none" stroke="#10b981" strokeWidth="2.5" />
            </>
          )}
          {consultPts.length >= 2 && (
            <>
              <path d={smoothAreaPath(consultPts, padT + drawH)} fill="url(#diet-consult-grad)" />
              <path d={smoothPath(consultPts)} fill="none" stroke="#3b82f6" strokeWidth="2.5" />
            </>
          )}

          {censusPts.map((p, i) => (
            <g key={`c${i}`}>
              <circle cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#10b981" strokeWidth="2" />
              <text x={p.x} y={p.y - 10} textAnchor="middle" className="text-[9px] fill-emerald-600 font-medium">
                {months[i].avgCensus.toFixed(0)}
              </text>
            </g>
          ))}
          {consultPts.map((p, i) => (
            <g key={`q${i}`}>
              <circle cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#3b82f6" strokeWidth="2" />
              <text x={p.x} y={p.y - 10} textAnchor="middle" className="text-[9px] fill-blue-600 font-medium">
                {months[i].avgConsultsPerDay.toFixed(1)}
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
            <span className="w-3 h-3 rounded-full bg-emerald-500" /> Avg Census/Day
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded-full bg-blue-500" /> Avg Consults/Day
          </span>
        </div>
      </div>

      {/* Consultation Channel Mix — Stacked Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Consultation Channel Mix — Monthly</h3>
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
            const teleH = (m.totalTeleConsults / barYMax) * drawH;
            const opH = (m.totalOPConsults / barYMax) * drawH;
            const baseY = padT + drawH;
            return (
              <g key={m.month}>
                <rect x={cx - barW / 2} y={baseY - teleH} width={barW} height={teleH} fill="#3b82f6" rx={2} opacity={0.8} />
                <rect x={cx - barW / 2} y={baseY - teleH - opH} width={barW} height={opH} fill="#f59e0b" rx={2} opacity={0.8} />
                {m.totalConsults > 0 && (
                  <text x={cx} y={baseY - teleH - opH - 6} textAnchor="middle" className="text-[9px] fill-slate-600 font-medium">
                    {m.totalConsults}
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
        <div className="flex items-center gap-4 mt-2 justify-center">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded bg-blue-500 opacity-80" /> Teleconsultation
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded bg-amber-500 opacity-80" /> In-Person / OP
          </span>
        </div>
      </div>

      {/* Monthly Progression Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 overflow-x-auto">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-base">🍎</span>
          <h3 className="text-sm font-semibold text-slate-800">Monthly Progression</h3>
          <span className="text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Nutrition Services</span>
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
              { label: 'Avg Census/Day', key: 'avgCensus', fmt: (v: number) => v.toFixed(1) },
              { label: 'Total Consults', key: 'totalConsults', fmt: (v: number) => String(v) },
              { label: 'Tele %', key: 'telePercentage', fmt: (v: number) => `${v.toFixed(0)}%` },
              { label: 'BCA Done', key: 'bcaDoneSum', fmt: (v: number) => String(v) },
              { label: 'Discharges w/ Diet', key: 'dischargesWithDietSum', fmt: (v: number) => String(v) },
              { label: 'Incident-Free Rate', key: 'incidentFreeRate', fmt: (v: number) => `${v.toFixed(0)}%` },
              { label: 'Clinical Audit Days', key: 'clinicalAuditDays', fmt: (v: number) => String(v) },
              { label: 'Days Reported', key: 'daysReported', fmt: (v: number) => String(v) },
            ].map(({ label, key, fmt }) => (
              <tr key={key} className="border-b border-slate-50">
                <td className="py-2.5 pr-4 text-slate-700 font-medium whitespace-nowrap">{label}</td>
                {months.map((m, i) => {
                  const val = (m as unknown as Record<string, number>)[key];
                  const prev = i > 0 ? (months[i - 1] as unknown as Record<string, number>)[key] : null;
                  const delta = prev !== null ? val - prev : null;
                  const isBadMetric = false; // All diet metrics are positive-is-good
                  return (
                    <td key={m.month} className="text-center py-2.5 px-2">
                      <span className="text-slate-800 font-medium">{fmt(val)}</span>
                      {delta !== null && delta !== 0 && (
                        <div className={`text-[9px] ${
                          isBadMetric
                            ? delta > 0 ? 'text-red-400' : 'text-emerald-500'
                            : delta > 0 ? 'text-emerald-500' : 'text-red-400'
                        }`}>
                          {delta > 0 ? '+' : ''}{key === 'telePercentage' || key === 'incidentFreeRate' ? `${delta.toFixed(0)}pp` : delta.toFixed(key === 'avgCensus' ? 1 : 0)}
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

      {/* BCA Growth + Discharge Diet Coverage */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* BCA Growth Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">📐</span>
            <h3 className="text-sm font-semibold text-slate-800">BCA — Body Composition Analysis</h3>
          </div>
          <p className="text-[10px] text-slate-400 mb-4">Emerging service line — {summary.totalBCADone} assessments completed</p>
          {bcaMonths.length > 0 ? (
            <div className="space-y-2">
              {months.slice(-5).map(m => {
                const val = m.bcaMTDLatest ?? m.bcaDoneSum;
                const maxBCA = Math.max(...months.slice(-5).map(mm => (mm.bcaMTDLatest ?? mm.bcaDoneSum) || 0), 1);
                return (
                  <div key={m.month} className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-500 w-14">{fmtMonth(m.month)}</span>
                    <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-400 to-purple-500 flex items-center justify-end pr-2"
                        style={{ width: `${val > 0 ? Math.max((val / maxBCA) * 100, 15) : 0}%` }}
                      >
                        {val > 0 && <span className="text-[9px] text-white font-bold">{val}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[10px] text-slate-400 text-center py-4">BCA tracking begins in recent months</p>
          )}
        </div>

        {/* Discharge Diet Coverage */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">🏥</span>
            <h3 className="text-sm font-semibold text-slate-800">Discharge Diet Planning</h3>
          </div>
          <p className="text-[10px] text-slate-400 mb-4">{summary.totalDischargesWithDiet} patients discharged with diet plan</p>
          <div className="flex items-end gap-1.5 h-28">
            {months.map(m => {
              const maxDC = Math.max(...months.map(mm => mm.dischargesWithDietSum), 1);
              const h = m.dischargesWithDietSum > 0 ? Math.max((m.dischargesWithDietSum / maxDC) * 100, 5) : 2;
              return (
                <div key={m.month} className="flex flex-col items-center gap-0.5 flex-1">
                  {m.dischargesWithDietSum > 0 && (
                    <span className="text-[8px] text-emerald-600 font-semibold">{m.dischargesWithDietSum}</span>
                  )}
                  <div className="w-full max-w-[24px] rounded bg-emerald-400 mx-auto" style={{ height: `${h}%` }} />
                  <span className="text-[7px] text-slate-400">{fmtMonth(m.month).split(' ')[0]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Food Service Calendar + Incident Log */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Service Quality Calendar */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Food Service Quality Calendar</h3>
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
                    if (dayData.hasFoodIssue) {
                      bg = 'bg-red-200 text-red-700'; symbol = 'F';
                    } else if (dayData.hasDelay) {
                      bg = 'bg-orange-200 text-orange-700'; symbol = 'D';
                    } else if (dayData.hasKitchenIssue) {
                      bg = 'bg-amber-200 text-amber-700'; symbol = 'K';
                    } else if (dayData.hasClinicalAudit) {
                      bg = 'bg-blue-200 text-blue-700'; symbol = 'A';
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
              { color: 'bg-red-200', label: 'Food Issue' },
              { color: 'bg-orange-200', label: 'Delay' },
              { color: 'bg-amber-200', label: 'Kitchen' },
              { color: 'bg-blue-200', label: 'Audit' },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1 text-[9px] text-slate-500">
                <span className={`w-3 h-3 rounded ${color}`} /> {label}
              </span>
            ))}
          </div>
        </div>

        {/* Incident Log */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Service Incidents — {incidents.length} Days</h3>
          <p className="text-[10px] text-slate-400 mb-3">Food issues, kitchen problems, and delays</p>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
            {incidents.slice(-12).reverse().map((d) => {
              const texts: string[] = [];
              if (d.foodFeedbackText) texts.push(`🍽️ ${d.foodFeedbackText}`);
              if (d.kitchenText) texts.push(`👨‍🍳 ${d.kitchenText}`);
              if (d.delayText) texts.push(`⏰ ${d.delayText}`);
              const typeColor = d.hasFoodIssue ? 'border-red-300' : d.hasDelay ? 'border-orange-300' : 'border-amber-300';
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
              <p className="text-[10px] text-slate-400 text-center py-4">No service incidents recorded</p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom row: Streak + Clinical Audits + All-Time Summary */}
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

        {/* Clinical Audits Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-[10px] font-semibold tracking-wider text-slate-400 mb-1">CLINICAL AUDITS</p>
          <div className="flex items-end gap-1">
            <span className="text-3xl font-bold text-blue-600">{summary.clinicalAuditDays}</span>
            <span className="text-sm text-slate-400 mb-1">audit days</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Quality & compliance checks</p>
          <div className="flex items-end gap-1.5 mt-3 h-10">
            {months.slice(-6).map(m => {
              const maxA = Math.max(...months.slice(-6).map(mm => mm.clinicalAuditDays), 1);
              const h = m.clinicalAuditDays > 0 ? Math.max((m.clinicalAuditDays / maxA) * 36, 3) : 2;
              return (
                <div key={m.month} className="flex flex-col items-center gap-0.5 flex-1">
                  <div className="w-full max-w-[20px] rounded bg-blue-300" style={{ height: `${h}px` }} />
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
              { label: 'Total diet patients', value: summary.totalCensus.toLocaleString() },
              { label: 'Total consultations', value: summary.totalConsults },
              { label: 'Tele consults', value: summary.totalTeleConsults },
              { label: 'OP consults', value: summary.totalOPConsults },
              { label: 'BCA assessments', value: summary.totalBCADone },
              { label: 'Discharges with diet', value: summary.totalDischargesWithDiet },
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
