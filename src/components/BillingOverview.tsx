'use client';

import React, { useState, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────────────

interface BillingDayData {
  date: string;
  pipelineCases: number | null;
  otClearancePending: number | null;
  damaLama: number | null;
  financialCounselling: number | null;
  interimCounselling: number | null;
  otScheduleAdherence: number | null;
  conversionRate: number | null;
}

interface BillingMonthSummary {
  month: string;
  label: string;
  daysReported: number;
  avgPipelineCases: number | null;
  avgOtClearancePending: number | null;
  avgCounsellingSessions: number | null;
  totalDamaLama: number | null;
  avgInterimCounselling: number | null;
  dailyPipeline: { date: string; value: number }[];
  dailyOtClearance: { date: string; value: number }[];
  dailyCounselling: { date: string; value: number }[];
  dailyDamaLama: { date: string; value: number }[];
  dailyInterimCounselling: { date: string; value: number }[];
  dataQuality: 'legacy' | 'mixed' | 'standardized';
}

interface Summary {
  totalDaysReported: number;
  dateRange: { from: string; to: string } | null;
  latestPipelineCases: number | null;
  latestOtClearance: number | null;
  latestCounselling: number | null;
  latestDamaLama: number | null;
  avgPipeline: number | null;
  avgCounselling: number | null;
  avgOtClearance: number | null;
  totalDamaLama: number | null;
  pipelineSparkline: { date: string; value: number }[];
  counsellingSparkline: { date: string; value: number }[];
  otClearanceSparkline: { date: string; value: number }[];
  damaLamaSparkline: { date: string; value: number }[];
}

interface ApiResponse {
  slug: string;
  department: string;
  summary: Summary;
  months: BillingMonthSummary[];
  availableMonths: string[];
  allDays: BillingDayData[];
}

interface Props {
  onBack: () => void;
  onNavigateToDashboard: (date: string, slug: string) => void;
  embedded?: boolean;
}

// ── Formatting Helpers ───────────────────────────────────────────────

function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return num.toLocaleString('en-IN', { maximumFractionDigits: 1 });
}

function formatInt(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return Math.round(num).toString();
}

function formatPct(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return (num.toFixed(1)) + '%';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatMonthShort(ym: string): string {
  const [y, m] = ym.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(m) - 1]} '${y.slice(2)}`;
}

function pctChange(current: number | null | undefined, previous: number | null | undefined): { value: number; label: string; positive: boolean } | null {
  if (current == null || previous == null || previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (!isFinite(pct)) return null;
  return {
    value: Math.abs(pct),
    label: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
    positive: pct >= 0,
  };
}

// ── SVG Sparkline ────────────────────────────────────────────────────

function Sparkline({ data, color = '#3b82f6', width = 120, height = 32 }: {
  data: { date: string; value: number }[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return <span className="text-slate-300 text-xs">—</span>;
  const values = data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Change Badge ─────────────────────────────────────────────────────

function ChangeBadge({ current, previous, invert = false }: {
  current: number | null;
  previous: number | null;
  invert?: boolean;
}) {
  const change = pctChange(current, previous);
  if (!change) return null;
  const isGood = invert ? !change.positive : change.positive;
  return (
    <span className={`inline-flex items-center text-[10px] font-medium ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>
      {change.positive ? '↑' : '↓'} {change.label}
    </span>
  );
}

// ── Smooth SVG path helper (Catmull-Rom → cubic bezier) ─────────────

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
  const linePath = smoothPath(points, tension);
  return `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`;
}

// ── Multi-Series Area Chart (Last 30 Days) ─────────────────────────

function DailyActivityChart({ allDays }: { allDays: BillingDayData[] }) {
  if (allDays.length === 0) return null;

  // Get last 30 days
  const last30 = allDays.slice(Math.max(0, allDays.length - 30));

  // Build per-series data (only dates where the metric has a value)
  const counselling = last30.filter(d => d.financialCounselling !== null).map(d => ({ date: d.date, value: d.financialCounselling! }));
  const pipeline = last30.filter(d => d.pipelineCases !== null).map(d => ({ date: d.date, value: d.pipelineCases! }));
  const otClearance = last30.filter(d => d.otClearancePending !== null).map(d => ({ date: d.date, value: d.otClearancePending! }));
  const damaLama = last30.filter(d => d.damaLama !== null).map(d => ({ date: d.date, value: d.damaLama! }));

  // Collect ALL unique dates
  const allDates = new Set<string>();
  counselling.forEach(d => allDates.add(d.date));
  pipeline.forEach(d => allDates.add(d.date));
  otClearance.forEach(d => allDates.add(d.date));
  damaLama.forEach(d => allDates.add(d.date));
  const sortedDates = [...allDates].sort();

  // Use a SHARED Y-axis max so the lines are on the same scale
  const allValues = [
    ...counselling.map(d => d.value),
    ...pipeline.map(d => d.value),
    ...otClearance.map(d => d.value),
    ...damaLama.map(d => d.value),
  ];
  const globalMax = allValues.length > 0 ? Math.max(...allValues, 1) : 1;

  // Chart dimensions with margins for labels
  const marginLeft = 28;
  const marginBottom = 24;
  const marginTop = 8;
  const marginRight = 8;
  const chartWidth = 540;
  const chartHeight = 180;
  const plotW = chartWidth - marginLeft - marginRight;
  const plotH = chartHeight - marginTop - marginBottom;

  // Map dates → x position
  const dateToX = (date: string) => {
    const idx = sortedDates.indexOf(date);
    return marginLeft + (idx / Math.max(sortedDates.length - 1, 1)) * plotW;
  };
  const valToY = (val: number) => marginTop + plotH - (val / globalMax) * plotH;

  // Build point arrays for each series
  const toPoints = (data: { date: string; value: number }[]) =>
    data.map(d => ({ x: dateToX(d.date), y: valToY(d.value) }));

  const cPoints = toPoints(counselling);
  const pPoints = toPoints(pipeline);
  const otPoints = toPoints(otClearance);
  const dPoints = toPoints(damaLama);

  const baseline = marginTop + plotH;

  // Y-axis tick values (nice round numbers)
  const yTicks: number[] = [];
  const step = globalMax <= 5 ? 1 : globalMax <= 12 ? 2 : globalMax <= 25 ? 5 : 10;
  for (let v = 0; v <= globalMax; v += step) yTicks.push(v);
  if (yTicks[yTicks.length - 1] < globalMax) yTicks.push(Math.ceil(globalMax));

  // X-axis: show every 5th date label
  const xLabels = sortedDates.filter((_, i) => i % 5 === 0 || i === sortedDates.length - 1);

  const series: { points: { x: number; y: number }[]; color: string; label: string; id: string }[] = [
    { points: cPoints, color: '#3b82f6', label: 'Counselling', id: 'counsel' },
    { points: pPoints, color: '#f59e0b', label: 'Pipeline Cases', id: 'pipeline' },
    { points: otPoints, color: '#a855f7', label: 'OT Clearance', id: 'ot' },
    { points: dPoints, color: '#ef4444', label: 'DAMA/LAMA', id: 'dama' },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-800 mb-4">Daily Activity — Last 30 Days</h3>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" style={{ minHeight: '220px' }} preserveAspectRatio="xMidYMid meet">
          <defs>
            {series.map(s => (
              <linearGradient key={`grad-${s.id}`} id={`grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.15" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
              </linearGradient>
            ))}
          </defs>

          {/* Horizontal grid lines + Y labels */}
          {yTicks.map(v => {
            const y = valToY(v);
            return (
              <g key={`ytick-${v}`}>
                <line x1={marginLeft} y1={y} x2={chartWidth - marginRight} y2={y} stroke="#e2e8f0" strokeWidth="0.7" />
                <text x={marginLeft - 5} y={y + 3} textAnchor="end" className="fill-slate-400" style={{ fontSize: '9px' }}>{v}</text>
              </g>
            );
          })}

          {/* Area fills (smooth) */}
          {series.map(s => s.points.length >= 2 && (
            <path key={`area-${s.id}`} d={smoothAreaPath(s.points, baseline)} fill={`url(#grad-${s.id})`} />
          ))}

          {/* Smooth lines */}
          {series.map(s => s.points.length >= 2 && (
            <path key={`line-${s.id}`} d={smoothPath(s.points)} stroke={s.color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}

          {/* Data dots */}
          {series.map(s => s.points.map((p, i) => (
            <circle key={`dot-${s.id}-${i}`} cx={p.x} cy={p.y} r="2.5" fill="white" stroke={s.color} strokeWidth="1.5" />
          )))}

          {/* X-axis date labels */}
          {xLabels.map(date => {
            const x = dateToX(date);
            const d = new Date(date + 'T00:00:00');
            const label = `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}`;
            return (
              <text key={`xlabel-${date}`} x={x} y={chartHeight - 4} textAnchor="middle" className="fill-slate-400" style={{ fontSize: '8px' }}>{label}</text>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-4 mt-4 text-xs">
        {series.map(s => (
          <div key={s.id} className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-slate-600">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Monthly Progression Table ────────────────────────────────────────

function BillingProgressionTable({ months }: { months: BillingMonthSummary[] }) {
  if (months.length === 0) return null;

  const metrics: { key: string; label: string; format: (v: number) => string; getValue: (m: BillingMonthSummary) => number | null; invert?: boolean }[] = [
    { key: 'counselling', label: 'Counselling Sessions/day', format: formatNumber, getValue: m => m.avgCounsellingSessions, invert: false },
    { key: 'pipeline', label: 'Pipeline Cases/day', format: formatNumber, getValue: m => m.avgPipelineCases, invert: true },
    { key: 'ot_clearance', label: 'OT Clearance Pending/day', format: formatNumber, getValue: m => m.avgOtClearancePending, invert: true },
    { key: 'dama_lama', label: 'DAMA/LAMA (total)', format: formatInt, getValue: m => m.totalDamaLama, invert: true },
    { key: 'interim', label: 'Interim Counselling/day', format: formatNumber, getValue: m => m.avgInterimCounselling, invert: false },
    { key: 'days', label: 'Days Reported', format: formatInt, getValue: m => m.daysReported },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-blue-50">
        <div className="flex items-center gap-2">
          <span className="text-lg">📊</span>
          <h3 className="text-sm font-bold text-slate-800">Monthly Progression</h3>
          <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">Daily Tracker</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-2.5 text-left text-slate-600 font-semibold whitespace-nowrap sticky left-0 bg-slate-50 z-10">Metric</th>
              {months.map(m => (
                <th key={m.month} className="px-3 py-2.5 text-right text-slate-600 font-semibold whitespace-nowrap min-w-[90px]">
                  <div>{formatMonthShort(m.month)}</div>
                  <div className="text-[9px] text-slate-400 font-normal">{m.dataQuality === 'standardized' ? '✓' : m.dataQuality === 'legacy' ? '⚠️' : '◐'}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric, mi) => (
              <tr key={metric.key} className={`border-b border-slate-100 ${mi % 2 === 0 ? '' : 'bg-slate-50/50'} hover:bg-blue-50/30`}>
                <td className="px-4 py-2 text-slate-700 font-medium whitespace-nowrap sticky left-0 bg-white z-10">
                  {mi % 2 !== 0 && <span className="absolute inset-0 bg-slate-50/50" />}
                  <span className="relative">{metric.label}</span>
                </td>
                {months.map((m, mi_idx) => {
                  const val = metric.getValue(m);
                  const prevVal = mi_idx > 0 ? metric.getValue(months[mi_idx - 1]) : null;
                  const change = pctChange(val, prevVal);
                  return (
                    <td key={m.month} className="px-3 py-2 text-right whitespace-nowrap">
                      <span className="text-slate-800 font-medium">{val != null ? metric.format(val) : '—'}</span>
                      {change && (
                        <span className={`block text-[9px] font-medium ${
                          metric.invert ? (!change.positive ? 'text-emerald-600' : 'text-red-500') : (change.positive ? 'text-emerald-600' : 'text-red-500')
                        }`}>
                          {change.label}
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

// ── Hero Cards ───────────────────────────────────────────────────────

function HeroCards({ summary, months }: { summary: Summary; months: BillingMonthSummary[] }) {
  const latest = months.length > 0 ? months[months.length - 1] : null;
  const prev = months.length > 1 ? months[months.length - 2] : null;

  const cards: Array<{
    label: string;
    value: string;
    subLabel: string;
    current: number | null;
    previous: number | null;
    color: string;
    icon: string;
    invert?: boolean;
  }> = [
    {
      label: 'Counselling Today',
      value: formatInt(latest?.avgCounsellingSessions),
      subLabel: `avg/day this month`,
      current: latest?.avgCounsellingSessions ?? null,
      previous: prev?.avgCounsellingSessions ?? null,
      color: 'border-blue-200 bg-blue-50/50',
      icon: '💬',
    },
    {
      label: 'Pipeline Cases',
      value: formatInt(latest?.avgPipelineCases),
      subLabel: `avg/day (target: ↓)`,
      current: latest?.avgPipelineCases ?? null,
      previous: prev?.avgPipelineCases ?? null,
      color: 'border-amber-200 bg-amber-50/50',
      icon: '📈',
      invert: true,
    },
    {
      label: 'OT Clearance Pending',
      value: formatInt(latest?.avgOtClearancePending),
      subLabel: `avg/day (target: ↓)`,
      current: latest?.avgOtClearancePending ?? null,
      previous: prev?.avgOtClearancePending ?? null,
      color: 'border-purple-200 bg-purple-50/50',
      icon: '⏳',
      invert: true,
    },
    {
      label: 'DAMA/LAMA MTD',
      value: formatInt(latest?.totalDamaLama),
      subLabel: `incidents (target: 0)`,
      current: latest?.totalDamaLama ?? null,
      previous: prev?.totalDamaLama ?? null,
      color: (latest?.totalDamaLama ?? 0) > 0 ? 'border-red-200 bg-red-50/50' : 'border-emerald-200 bg-emerald-50/50',
      icon: '🚨',
      invert: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {cards.map(card => (
        <div key={card.label} className={`rounded-xl border p-4 shadow-sm ${card.color}`}>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{card.label}</p>
          <p className="text-lg font-bold text-slate-900 mt-1">{card.value}</p>
          <p className="text-[10px] text-slate-500">{card.subLabel}</p>
          <ChangeBadge current={card.current} previous={card.previous} invert={card.invert} />
        </div>
      ))}
    </div>
  );
}

// ── DAMA/LAMA Tracker (Calendar dots) ────────────────────────────────

function DamaLamaTracker({ allDays, months }: { allDays: BillingDayData[]; months: BillingMonthSummary[] }) {
  const monthMap = new Map(months.map(m => [m.month, m]));

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-800 mb-4">DAMA/LAMA Incident Calendar</h3>
      <div className="space-y-3">
        {[...monthMap.entries()].slice(-3).map(([month, m]) => {
          const monthStart = month + '-01';
          const monthDays = allDays.filter(d => d.date.startsWith(month));
          const incidentDays = new Set(monthDays.filter(d => d.damaLama !== null && d.damaLama > 0).map(d => d.date));

          return (
            <div key={month} className="pb-3 border-b border-slate-100 last:border-b-0">
              <p className="text-xs font-semibold text-slate-700 mb-2">{m.label}</p>
              <div className="flex flex-wrap gap-1">
                {monthDays.map(d => (
                  <div
                    key={d.date}
                    className={`w-6 h-6 rounded text-[9px] flex items-center justify-center font-bold ${
                      incidentDays.has(d.date)
                        ? 'bg-red-500 text-white'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                    title={`${formatDate(d.date)}: ${d.damaLama ?? 0} incidents`}
                  >
                    {d.damaLama ?? '·'}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Zero Pipeline Streak ─────────────────────────────────────────────

function ZeroPipelineStreak({ allDays }: { allDays: BillingDayData[] }) {
  let currentStreak = 0;
  let maxStreak = 0;
  let lastStreakDate = '';

  for (const d of allDays) {
    if (d.pipelineCases === 0) {
      currentStreak++;
      lastStreakDate = d.date;
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
      }
    } else {
      currentStreak = 0;
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Zero Pipeline Streak</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{currentStreak} days</p>
          <p className="text-xs text-slate-400 mt-1">Current streak (max: {maxStreak} days)</p>
        </div>
        <span className="text-3xl">🎯</span>
      </div>
      <div className="mt-3 pt-3 border-t border-slate-100">
        <p className="text-[10px] text-slate-500">Last zero-pipeline day: {currentStreak > 0 ? formatDate(lastStreakDate) : 'N/A'}</p>
      </div>
    </div>
  );
}

// ── Counselling Coverage ─────────────────────────────────────────────

function CounsellingCoverage({ allDays, months }: { allDays: BillingDayData[]; months: BillingMonthSummary[] }) {
  const latest = months.length > 0 ? months[months.length - 1] : null;
  if (!latest) return null;

  const counsellingData = latest.dailyCounselling || [];
  const goodDays = counsellingData.filter(d => d.value >= 3).length;
  const totalDays = counsellingData.length;
  const coverage = totalDays > 0 ? (goodDays / totalDays) * 100 : 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Counselling Coverage</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{formatPct(coverage / 100)}</p>
          <p className="text-xs text-slate-400 mt-1">{goodDays} of {totalDays} days with 3+ sessions</p>
        </div>
        <span className="text-3xl">📊</span>
      </div>
      <div className="mt-3 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${coverage}%` }} />
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

const BillingOverview: React.FC<Props> = ({ onBack, embedded = false }) => {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/department-overview?slug=billing');
        if (!res.ok) throw new Error('Failed to fetch billing overview');
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
        <p className="text-slate-500 text-sm mt-3">Loading billing overview...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center bg-red-50 rounded-lg border border-red-200">
        <p className="text-red-700 font-medium">Unable to load billing overview</p>
        <p className="text-red-600 text-sm mt-1">{error || 'No data available'}</p>
      </div>
    );
  }

  const { summary, months, allDays } = data;

  return (
    <div className={embedded ? '' : 'p-6'}>
      {!embedded && (
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Billing Department Overview</h1>
            <p className="text-sm text-slate-500 mt-1">
              {summary.dateRange ? `${summary.dateRange.from} to ${summary.dateRange.to} · ${summary.totalDaysReported} days reported` : 'No data available'}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Hero Cards */}
        <HeroCards summary={summary} months={months} />

        {/* Daily Activity Chart */}
        <DailyActivityChart allDays={allDays} />

        {/* Monthly Progression */}
        <BillingProgressionTable months={months} />

        {/* Risk & Efficiency Dashboard */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <DamaLamaTracker allDays={allDays} months={months} />
          <ZeroPipelineStreak allDays={allDays} />
          <CounsellingCoverage allDays={allDays} months={months} />
        </div>
      </div>
    </div>
  );
};

export default BillingOverview;
