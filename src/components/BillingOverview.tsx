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

// ── Multi-Series Area Chart (Last 30 Days) ─────────────────────────

function DailyActivityChart({ allDays }: { allDays: BillingDayData[] }) {
  if (allDays.length === 0) return null;

  // Get last 30 days
  const last30 = allDays.slice(Math.max(0, allDays.length - 30));

  // Normalize each series independently
  const counselling = last30.filter(d => d.financialCounselling !== null).map(d => ({ date: d.date, value: d.financialCounselling! }));
  const pipeline = last30.filter(d => d.pipelineCases !== null).map(d => ({ date: d.date, value: d.pipelineCases! }));
  const otClearance = last30.filter(d => d.otClearancePending !== null).map(d => ({ date: d.date, value: d.otClearancePending! }));
  const damaLama = last30.filter(d => d.damaLama !== null).map(d => ({ date: d.date, value: d.damaLama! }));

  const allDates = new Set<string>();
  counselling.forEach(d => allDates.add(d.date));
  pipeline.forEach(d => allDates.add(d.date));
  otClearance.forEach(d => allDates.add(d.date));
  damaLama.forEach(d => allDates.add(d.date));

  const sortedDates = [...allDates].sort();
  const counsellingMap = new Map(counselling.map(d => [d.date, d.value]));
  const pipelineMap = new Map(pipeline.map(d => [d.date, d.value]));
  const otClearanceMap = new Map(otClearance.map(d => [d.date, d.value]));
  const damaLamaMap = new Map(damaLama.map(d => [d.date, d.value]));

  const counsellingValues = [...counsellingMap.values()];
  const pipelineValues = [...pipelineMap.values()];
  const otClearanceValues = [...otClearanceMap.values()];
  const damaLamaValues = [...damaLamaMap.values()];

  const cMax = counsellingValues.length > 0 ? Math.max(...counsellingValues) : 1;
  const pMax = pipelineValues.length > 0 ? Math.max(...pipelineValues) : 1;
  const otMax = otClearanceValues.length > 0 ? Math.max(...otClearanceValues) : 1;
  const dMax = damaLamaValues.length > 0 ? Math.max(...damaLamaValues) : 1;

  const height = 160;
  const width = Math.max(400, sortedDates.length * 8);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-800 mb-4">Daily Activity — Last 30 Days</h3>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minHeight: '180px' }}>
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map(pct => (
            <line key={`grid-${pct}`} x1="0" y1={height * (1 - pct)} x2={width} y2={height * (1 - pct)} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2,2" />
          ))}

          {/* Counselling area */}
          {counsellingValues.length > 0 && (
            <path
              d={sortedDates.map((date, i) => {
                const val = counsellingMap.get(date) ?? 0;
                const x = (i / (sortedDates.length - 1 || 1)) * width;
                const y = height - ((val / cMax) * (height - 20)) - 10;
                return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
              }).join(' ')}
              stroke="#3b82f6"
              strokeWidth="2"
              fill="none"
            />
          )}

          {/* Pipeline area */}
          {pipelineValues.length > 0 && (
            <path
              d={sortedDates.map((date, i) => {
                const val = pipelineMap.get(date) ?? 0;
                const x = (i / (sortedDates.length - 1 || 1)) * width;
                const y = height - ((val / pMax) * (height - 20)) - 10;
                return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
              }).join(' ')}
              stroke="#f59e0b"
              strokeWidth="2"
              fill="none"
            />
          )}

          {/* OT Clearance area */}
          {otClearanceValues.length > 0 && (
            <path
              d={sortedDates.map((date, i) => {
                const val = otClearanceMap.get(date) ?? 0;
                const x = (i / (sortedDates.length - 1 || 1)) * width;
                const y = height - ((val / otMax) * (height - 20)) - 10;
                return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
              }).join(' ')}
              stroke="#a855f7"
              strokeWidth="2"
              fill="none"
            />
          )}

          {/* DAMA/LAMA area */}
          {damaLamaValues.length > 0 && (
            <path
              d={sortedDates.map((date, i) => {
                const val = damaLamaMap.get(date) ?? 0;
                const x = (i / (sortedDates.length - 1 || 1)) * width;
                const y = height - ((val / dMax) * (height - 20)) - 10;
                return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
              }).join(' ')}
              stroke="#ef4444"
              strokeWidth="2"
              fill="none"
            />
          )}
        </svg>
      </div>
      <div className="flex flex-wrap gap-4 mt-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: '#3b82f6' }} />
          <span className="text-slate-600">Counselling</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: '#f59e0b' }} />
          <span className="text-slate-600">Pipeline Cases</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: '#a855f7' }} />
          <span className="text-slate-600">OT Clearance</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: '#ef4444' }} />
          <span className="text-slate-600">DAMA/LAMA</span>
        </div>
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
