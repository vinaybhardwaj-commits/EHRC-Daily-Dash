'use client';

import React, { useState, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────────────

interface ClinicalLabDayData {
  date: string;
  outsourcedTestCount: number;
  outsourcedRaw: string | null;
  hasReagentShortage: boolean;
  reagentText: string | null;
  equipmentOk: boolean;
  tatOnTarget: boolean;
  hasSampleError: boolean;
  sampleErrorText: string | null;
  hasCriticalReport: boolean;
  criticalReportText: string | null;
  hasTransfusionActivity: boolean;
  transfusionText: string | null;
}

interface ClinicalLabMonthSummary {
  month: string;
  label: string;
  daysReported: number;
  totalOutsourcedTests: number;
  avgOutsourcedPerDay: number;
  reagentShortageDays: number;
  equipmentOkDays: number;
  tatOnTargetDays: number;
  sampleErrorCount: number;
  criticalReportCount: number;
  transfusionDays: number;
  qualityScore: number;
  reagentReliability: number;
}

interface Summary {
  totalDaysReported: number;
  dateRange: { from: string; to: string } | null;
  totalOutsourcedTests: number;
  totalSampleErrors: number;
  totalCriticalReports: number;
  totalTransfusionDays: number;
  overallQualityScore: number;
  overallReagentReliability: number;
  tatComplianceRate: number;
  equipmentUptimeRate: number;
  errorRate: number;
}

interface ApiResponse {
  slug: string;
  department: string;
  summary: Summary;
  months: ClinicalLabMonthSummary[];
  availableMonths: string[];
  allDays: ClinicalLabDayData[];
}

interface Props {
  onBack: () => void;
  onNavigateToDashboard: (date: string, slug: string) => void;
  embedded?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatPct(num: number): string { return num.toFixed(0) + '%'; }
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function formatMonthShort(ym: string): string {
  const [y, m] = ym.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(m) - 1]} '${y.slice(2)}`;
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

function smoothAreaPath(points: { x: number; y: number }[], baseline: number, tension = 0.3): string {
  if (points.length < 2) return '';
  return `${smoothPath(points, tension)} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`;
}

// ── Hero Cards ───────────────────────────────────────────────────────

function HeroCards({ summary, months }: { summary: Summary; months: ClinicalLabMonthSummary[] }) {
  const latest = months.length > 0 ? months[months.length - 1] : null;
  const prev = months.length > 1 ? months[months.length - 2] : null;

  function delta(cur: number | undefined, pre: number | undefined): { pp: number; good: boolean } | null {
    if (cur === undefined || pre === undefined) return null;
    const d = cur - pre;
    return { pp: d, good: d >= 0 };
  }

  const cards: Array<{
    label: string; value: string; subLabel: string; color: string; icon: string;
    trend?: { pp: number; good: boolean } | null;
  }> = [
    {
      label: 'Quality Score',
      value: latest ? formatPct(latest.qualityScore) : '—',
      subLabel: 'TAT + equipment + error-free composite',
      color: (latest?.qualityScore ?? 0) >= 90 ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50',
      icon: '🏅',
      trend: delta(latest?.qualityScore, prev?.qualityScore),
    },
    {
      label: 'TAT Compliance',
      value: latest ? formatPct(latest.tatOnTargetDays / Math.max(latest.daysReported, 1) * 100) : '—',
      subLabel: `${latest?.tatOnTargetDays ?? 0} of ${latest?.daysReported ?? 0} days on target`,
      color: 'border-blue-200 bg-blue-50/50',
      icon: '⏱️',
      trend: delta(
        latest ? (latest.tatOnTargetDays / Math.max(latest.daysReported, 1)) * 100 : undefined,
        prev ? (prev.tatOnTargetDays / Math.max(prev.daysReported, 1)) * 100 : undefined
      ),
    },
    {
      label: 'Sample Errors',
      value: latest ? String(latest.sampleErrorCount) : '—',
      subLabel: `incidents this month (target: 0)`,
      color: (latest?.sampleErrorCount ?? 0) === 0 ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50',
      icon: '⚠️',
    },
    {
      label: 'Outsourced Tests',
      value: latest ? String(latest.totalOutsourcedTests) : '—',
      subLabel: `tests MTD (avg ${latest ? latest.avgOutsourcedPerDay.toFixed(1) : '—'}/day)`,
      color: 'border-indigo-200 bg-indigo-50/50',
      icon: '📤',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {cards.map(card => (
        <div key={card.label} className={`rounded-xl border p-4 shadow-sm ${card.color}`}>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{card.label}</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-lg font-bold text-slate-900">{card.value}</p>
            {card.trend && Math.abs(card.trend.pp) > 0.5 && (
              <span className={`text-[10px] font-medium ${card.trend.good ? 'text-emerald-600' : 'text-red-500'}`}>
                {card.trend.pp >= 0 ? '↑' : '↓'} {Math.abs(card.trend.pp).toFixed(0)}pp
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">{card.subLabel}</p>
        </div>
      ))}
    </div>
  );
}

// ── Outsourced Test Volume Chart (bar + trend) ───────────────────────

function OutsourcedVolumeChart({ months }: { months: ClinicalLabMonthSummary[] }) {
  if (months.length < 2) return null;

  const maxVal = Math.max(...months.map(m => m.totalOutsourcedTests), 1);
  const marginLeft = 36;
  const marginBottom = 24;
  const marginTop = 12;
  const marginRight = 12;
  const chartWidth = 540;
  const chartHeight = 180;
  const plotW = chartWidth - marginLeft - marginRight;
  const plotH = chartHeight - marginTop - marginBottom;
  const barW = plotW / months.length * 0.6;
  const baseline = marginTop + plotH;

  // Trend line points (avg per day)
  const maxAvg = Math.max(...months.map(m => m.avgOutsourcedPerDay), 1);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-800 mb-4">Outsourced Test Volume — Monthly</h3>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" style={{ minHeight: '200px' }} preserveAspectRatio="xMidYMid meet">
        {/* Y grid */}
        {[0.25, 0.5, 0.75, 1].map(pct => {
          const y = marginTop + plotH * (1 - pct);
          const val = Math.round(maxVal * pct);
          return (
            <g key={`yg-${pct}`}>
              <line x1={marginLeft} y1={y} x2={chartWidth - marginRight} y2={y} stroke="#e2e8f0" strokeWidth="0.7" />
              <text x={marginLeft - 5} y={y + 3} textAnchor="end" className="fill-slate-400" style={{ fontSize: '9px' }}>{val}</text>
            </g>
          );
        })}
        <line x1={marginLeft} y1={baseline} x2={chartWidth - marginRight} y2={baseline} stroke="#e2e8f0" strokeWidth="0.7" />

        {/* Bars */}
        {months.map((m, i) => {
          const cx = marginLeft + (i + 0.5) / months.length * plotW;
          const h = (m.totalOutsourcedTests / maxVal) * plotH;
          return (
            <g key={`bar-${m.month}`}>
              <rect x={cx - barW / 2} y={baseline - h} width={barW} height={h} rx="3" fill="#6366f1" fillOpacity="0.7" />
              <text x={cx} y={baseline - h - 4} textAnchor="middle" className="fill-slate-600" style={{ fontSize: '9px', fontWeight: 600 }}>{m.totalOutsourcedTests}</text>
              <text x={cx} y={chartHeight - 4} textAnchor="middle" className="fill-slate-400" style={{ fontSize: '8px' }}>{formatMonthShort(m.month)}</text>
            </g>
          );
        })}

        {/* Avg/day trend line */}
        {(() => {
          const points = months.map((m, i) => ({
            x: marginLeft + (i + 0.5) / months.length * plotW,
            y: marginTop + plotH - (m.avgOutsourcedPerDay / maxAvg) * plotH * 0.9,
          }));
          return points.length >= 2 ? (
            <>
              <path d={smoothPath(points)} stroke="#f59e0b" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="4,3" />
              {points.map((p, i) => (
                <circle key={`trd-${i}`} cx={p.x} cy={p.y} r="3" fill="white" stroke="#f59e0b" strokeWidth="1.5" />
              ))}
            </>
          ) : null;
        })()}
      </svg>
      <div className="flex flex-wrap gap-4 mt-3 text-xs">
        <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-indigo-500" /><span className="text-slate-600">Total Tests</span></div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-amber-500" style={{ borderTop: '2px dashed #f59e0b' }} /><span className="text-slate-600">Avg/Day</span></div>
      </div>
    </div>
  );
}

// ── Quality & Safety Trends ──────────────────────────────────────────

function QualityTrendChart({ months }: { months: ClinicalLabMonthSummary[] }) {
  if (months.length < 2) return null;

  const marginLeft = 32; const marginBottom = 24; const marginTop = 12; const marginRight = 12;
  const chartWidth = 540; const chartHeight = 200;
  const plotW = chartWidth - marginLeft - marginRight;
  const plotH = chartHeight - marginTop - marginBottom;
  const toX = (i: number) => marginLeft + (i / Math.max(months.length - 1, 1)) * plotW;
  const toY = (pct: number) => marginTop + plotH - (pct / 100) * plotH;
  const baseline = marginTop + plotH;

  const series = [
    { key: 'quality', label: 'Quality Score', color: '#10b981', getValue: (m: ClinicalLabMonthSummary) => m.qualityScore },
    { key: 'tat', label: 'TAT Compliance', color: '#3b82f6', getValue: (m: ClinicalLabMonthSummary) => (m.tatOnTargetDays / Math.max(m.daysReported, 1)) * 100 },
    { key: 'reagent', label: 'Reagent Reliability', color: '#f59e0b', getValue: (m: ClinicalLabMonthSummary) => m.reagentReliability },
    { key: 'errorFree', label: 'Error-Free Rate', color: '#ef4444', getValue: (m: ClinicalLabMonthSummary) => ((m.daysReported - m.sampleErrorCount) / Math.max(m.daysReported, 1)) * 100 },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-800 mb-4">Quality & Safety Trends — Monthly</h3>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" style={{ minHeight: '220px' }} preserveAspectRatio="xMidYMid meet">
        <defs>
          {series.map(s => (
            <linearGradient key={`g-${s.key}`} id={`clgrad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.12" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
            </linearGradient>
          ))}
        </defs>
        {[0, 25, 50, 75, 100].map(v => (
          <g key={`yg-${v}`}>
            <line x1={marginLeft} y1={toY(v)} x2={chartWidth - marginRight} y2={toY(v)} stroke="#e2e8f0" strokeWidth="0.7" />
            <text x={marginLeft - 5} y={toY(v) + 3} textAnchor="end" className="fill-slate-400" style={{ fontSize: '9px' }}>{v}%</text>
          </g>
        ))}
        {series.map(s => {
          const pts = months.map((m, i) => ({ x: toX(i), y: toY(s.getValue(m)) }));
          return pts.length >= 2 ? (
            <g key={s.key}>
              <path d={smoothAreaPath(pts, baseline)} fill={`url(#clgrad-${s.key})`} />
              <path d={smoothPath(pts)} stroke={s.color} strokeWidth="2" fill="none" strokeLinecap="round" />
              {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="white" stroke={s.color} strokeWidth="1.5" />)}
            </g>
          ) : null;
        })}
        {months.map((m, i) => (
          <text key={m.month} x={toX(i)} y={chartHeight - 4} textAnchor="middle" className="fill-slate-400" style={{ fontSize: '8px' }}>{formatMonthShort(m.month)}</text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-4 mt-4 text-xs">
        {series.map(s => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: s.color }} /><span className="text-slate-600">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Monthly Progression Table ────────────────────────────────────────

function ProgressionTable({ months }: { months: ClinicalLabMonthSummary[] }) {
  if (months.length === 0) return null;

  const metrics: { key: string; label: string; getValue: (m: ClinicalLabMonthSummary) => number; format: (v: number) => string; goodDir: 'up' | 'down' }[] = [
    { key: 'quality', label: 'Quality Score %', getValue: m => m.qualityScore, format: v => formatPct(v), goodDir: 'up' },
    { key: 'outsourced', label: 'Outsourced Tests', getValue: m => m.totalOutsourcedTests, format: v => String(Math.round(v)), goodDir: 'up' },
    { key: 'errors', label: 'Sample Errors', getValue: m => m.sampleErrorCount, format: v => String(v), goodDir: 'down' },
    { key: 'critical', label: 'Critical Reports', getValue: m => m.criticalReportCount, format: v => String(v), goodDir: 'down' },
    { key: 'reagent', label: 'Reagent Reliability %', getValue: m => m.reagentReliability, format: v => formatPct(v), goodDir: 'up' },
    { key: 'transfusion', label: 'Blood Bank Active Days', getValue: m => m.transfusionDays, format: v => String(v), goodDir: 'up' },
    { key: 'days', label: 'Days Reported', getValue: m => m.daysReported, format: v => String(v), goodDir: 'up' },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-cyan-50 to-blue-50">
        <div className="flex items-center gap-2">
          <span className="text-lg">📊</span>
          <h3 className="text-sm font-bold text-slate-800">Monthly Progression</h3>
          <span className="text-[10px] bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full font-medium">Lab Analytics</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-2.5 text-left text-slate-600 font-semibold whitespace-nowrap sticky left-0 bg-slate-50 z-10">Metric</th>
              {months.map(m => (
                <th key={m.month} className="px-3 py-2.5 text-right text-slate-600 font-semibold whitespace-nowrap min-w-[80px]">{formatMonthShort(m.month)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric, mi) => (
              <tr key={metric.key} className={`border-b border-slate-100 ${mi % 2 === 0 ? '' : 'bg-slate-50/50'} hover:bg-cyan-50/30`}>
                <td className="px-4 py-2 text-slate-700 font-medium whitespace-nowrap sticky left-0 bg-white z-10">
                  {mi % 2 !== 0 && <span className="absolute inset-0 bg-slate-50/50" />}
                  <span className="relative">{metric.label}</span>
                </td>
                {months.map((m, idx) => {
                  const val = metric.getValue(m);
                  const prevVal = idx > 0 ? metric.getValue(months[idx - 1]) : null;
                  const delta = prevVal !== null ? val - prevVal : null;
                  const isGood = delta !== null ? (metric.goodDir === 'up' ? delta >= 0 : delta <= 0) : null;
                  return (
                    <td key={m.month} className="px-3 py-2 text-right whitespace-nowrap">
                      <span className="text-slate-800 font-medium">{metric.format(val)}</span>
                      {delta !== null && Math.abs(delta) > 0.5 && (
                        <span className={`block text-[9px] font-medium ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>
                          {delta > 0 ? '+' : ''}{metric.key.includes('%') || metric.key === 'quality' || metric.key === 'reagent' ? delta.toFixed(0) + 'pp' : Math.round(delta)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sample Error Timeline ────────────────────────────────────────────

function ErrorTimeline({ allDays }: { allDays: ClinicalLabDayData[] }) {
  const errors = allDays.filter(d => d.hasSampleError && d.sampleErrorText);
  if (errors.length === 0) return (
    <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-800 mb-2">Sample Error Log</h3>
      <p className="text-xs text-emerald-600">No sample errors recorded — excellent quality control.</p>
    </div>
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-800 mb-3">Sample Error Log — {errors.length} Incidents</h3>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {errors.slice(-12).map(d => (
          <div key={d.date} className="flex gap-3 items-start text-xs border-l-2 border-red-300 pl-3 py-1">
            <span className="text-slate-400 whitespace-nowrap font-mono">{formatDate(d.date)}</span>
            <span className="text-slate-700">{d.sampleErrorText!.substring(0, 120)}{(d.sampleErrorText!.length > 120 ? '...' : '')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Error Calendar ───────────────────────────────────────────────────

function QualityCalendar({ allDays, months }: { allDays: ClinicalLabDayData[]; months: ClinicalLabMonthSummary[] }) {
  const recentMonths = months.slice(-3);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-800 mb-4">Quality Calendar</h3>
      <div className="space-y-3">
        {recentMonths.map(m => {
          const monthDays = allDays.filter(d => d.date.startsWith(m.month));
          return (
            <div key={m.month} className="pb-3 border-b border-slate-100 last:border-b-0">
              <p className="text-xs font-semibold text-slate-700 mb-2">{m.label}</p>
              <div className="flex flex-wrap gap-1">
                {monthDays.map(d => {
                  let bg = 'bg-emerald-100 text-emerald-700';
                  let symbol = '·';
                  if (d.hasSampleError) {
                    bg = 'bg-red-500 text-white';
                    symbol = '!';
                  } else if (d.hasCriticalReport) {
                    bg = 'bg-amber-200 text-amber-800';
                    symbol = 'C';
                  } else if (d.hasReagentShortage) {
                    bg = 'bg-yellow-100 text-yellow-700';
                    symbol = 'R';
                  }
                  return (
                    <div
                      key={d.date}
                      className={`w-6 h-6 rounded text-[9px] flex items-center justify-center font-bold ${bg}`}
                      title={`${formatDate(d.date)}: ${d.hasSampleError ? 'Error' : d.hasCriticalReport ? 'Critical Report' : d.hasReagentShortage ? 'Reagent Shortage' : 'Clear'}`}
                    >
                      {symbol}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 mt-1.5 text-[9px] text-slate-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-100" /> Clear</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500" /> Error</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-200" /> Critical</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-yellow-100" /> Reagent</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Blood Bank Activity ──────────────────────────────────────────────

function BloodBankCard({ months }: { months: ClinicalLabMonthSummary[] }) {
  const latest = months.length > 0 ? months[months.length - 1] : null;
  if (!latest) return null;
  const pct = latest.daysReported > 0 ? (latest.transfusionDays / latest.daysReported) * 100 : 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Blood Bank Activity</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{latest.transfusionDays} days</p>
          <p className="text-xs text-slate-400 mt-1">{formatPct(pct)} of days had transfusion requests</p>
        </div>
        <span className="text-3xl">🩸</span>
      </div>
      <div className="mt-3 flex gap-1">
        {months.slice(-6).map(m => {
          const pctM = m.daysReported > 0 ? (m.transfusionDays / m.daysReported) * 100 : 0;
          return (
            <div key={m.month} className="flex-1 text-center">
              <div className="h-12 bg-slate-100 rounded relative overflow-hidden">
                <div className="absolute bottom-0 left-0 right-0 bg-rose-400 rounded-b" style={{ height: `${pctM}%` }} />
              </div>
              <p className="text-[8px] text-slate-400 mt-1">{formatMonthShort(m.month)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Error-Free Streak ────────────────────────────────────────────────

function ErrorFreeStreak({ allDays }: { allDays: ClinicalLabDayData[] }) {
  let currentStreak = 0; let maxStreak = 0;
  for (const d of allDays) {
    if (!d.hasSampleError) { currentStreak++; if (currentStreak > maxStreak) maxStreak = currentStreak; } else { currentStreak = 0; }
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Error-Free Streak</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{currentStreak} days</p>
          <p className="text-xs text-slate-400 mt-1">Current (best: {maxStreak} days)</p>
        </div>
        <span className="text-3xl">{currentStreak >= 20 ? '🏆' : currentStreak >= 7 ? '🎯' : '📋'}</span>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

const ClinicalLabOverview: React.FC<Props> = ({ onBack, embedded = false }) => {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/department-overview?slug=clinical-lab')
      .then(res => { if (!res.ok) throw new Error('Failed'); return res.json(); })
      .then(json => setData(json))
      .catch(err => setError(err instanceof Error ? err.message : 'Unknown error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="p-8 text-center">
      <div className="inline-block"><div className="w-8 h-8 border-2 border-slate-200 border-t-cyan-600 rounded-full animate-spin" /></div>
      <p className="text-slate-500 text-sm mt-3">Loading clinical lab overview...</p>
    </div>
  );

  if (error || !data) return (
    <div className="p-8 text-center bg-red-50 rounded-lg border border-red-200">
      <p className="text-red-700 font-medium">Unable to load clinical lab overview</p>
      <p className="text-red-600 text-sm mt-1">{error || 'No data available'}</p>
    </div>
  );

  const { summary, months, allDays } = data;

  return (
    <div className={embedded ? '' : 'p-6'}>
      {!embedded && (
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Clinical Lab Overview</h1>
            <p className="text-sm text-slate-500 mt-1">
              {summary.dateRange ? `${summary.dateRange.from} to ${summary.dateRange.to} · ${summary.totalDaysReported} days analyzed` : 'No data'}
            </p>
          </div>
        </div>
      )}

      {embedded && summary.dateRange && (
        <div className="mb-4 text-xs text-slate-500">
          {summary.dateRange.from} to {summary.dateRange.to} · {summary.totalDaysReported} days of lab data analyzed
        </div>
      )}

      <div className="space-y-6">
        <HeroCards summary={summary} months={months} />
        <QualityTrendChart months={months} />
        <OutsourcedVolumeChart months={months} />
        <ProgressionTable months={months} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ErrorTimeline allDays={allDays} />
          <QualityCalendar allDays={allDays} months={months} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ErrorFreeStreak allDays={allDays} />
          <BloodBankCard months={months} />
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">All-Time Summary</p>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-slate-600">Total days analyzed</span><span className="font-bold text-slate-800">{summary.totalDaysReported}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Total outsourced tests</span><span className="font-bold text-indigo-700">{summary.totalOutsourcedTests}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Sample errors</span><span className="font-bold text-red-600">{summary.totalSampleErrors}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Critical reports</span><span className="font-bold text-amber-600">{summary.totalCriticalReports}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">TAT compliance</span><span className="font-bold text-blue-700">{formatPct(summary.tatComplianceRate)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Equipment uptime</span><span className="font-bold text-emerald-700">{formatPct(summary.equipmentUptimeRate)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClinicalLabOverview;
