'use client';

import React, { useState, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────────────

interface BiomedicalDayData {
  date: string;
  hasBreakdown: boolean;
  breakdownResolved: boolean;
  breakdownCategories: string[];
  breakdownText: string | null;
  hasPendingRepair: boolean;
  pendingText: string | null;
  equipmentReady: boolean;
  equipmentText: string | null;
  pmCompliant: boolean;
  pmText: string | null;
  otherNotes: string | null;
}

interface BiomedicalMonthSummary {
  month: string;
  label: string;
  daysReported: number;
  breakdownDays: number;
  breakdownResolvedDays: number;
  pendingRepairDays: number;
  equipmentReadyDays: number;
  pmReportedDays: number;
  equipmentReadinessRate: number;
  breakdownRate: number;
  resolutionRate: number;
  pmComplianceRate: number;
  topEquipmentIssues: { category: string; count: number }[];
}

interface Summary {
  totalDaysReported: number;
  dateRange: { from: string; to: string } | null;
  totalBreakdownDays: number;
  totalPendingDays: number;
  equipmentReadinessRate: number;
  overallBreakdownRate: number;
  overallResolutionRate: number;
  topEquipmentIssues: { category: string; count: number }[];
  categoryLabels: Record<string, string>;
}

interface ApiResponse {
  slug: string;
  department: string;
  summary: Summary;
  months: BiomedicalMonthSummary[];
  availableMonths: string[];
  allDays: BiomedicalDayData[];
}

interface Props {
  onBack: () => void;
  onNavigateToDashboard: (date: string, slug: string) => void;
  embedded?: boolean;
}

// ── Formatting Helpers ───────────────────────────────────────────────

function formatPct(num: number): string {
  return num.toFixed(0) + '%';
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

// ── Smooth SVG path helper ──────────────────────────────────────────

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

// Category color map
const CATEGORY_COLORS: Record<string, string> = {
  ct: '#ef4444',
  eto: '#f59e0b',
  ecg: '#3b82f6',
  ot_equip: '#8b5cf6',
  monitors: '#06b6d4',
  ventilator: '#10b981',
  imaging: '#ec4899',
  cssd: '#f97316',
  other: '#94a3b8',
};

// ── Hero Cards ───────────────────────────────────────────────────────

function HeroCards({ summary, months }: { summary: Summary; months: BiomedicalMonthSummary[] }) {
  const latest = months.length > 0 ? months[months.length - 1] : null;
  const prev = months.length > 1 ? months[months.length - 2] : null;

  const cards: Array<{
    label: string;
    value: string;
    subLabel: string;
    color: string;
    icon: string;
    trend?: { value: number; good: boolean };
  }> = [
    {
      label: 'Equipment Readiness',
      value: latest ? formatPct(latest.equipmentReadinessRate) : '—',
      subLabel: `${latest?.equipmentReadyDays ?? 0} of ${latest?.daysReported ?? 0} days all-clear`,
      color: (latest?.equipmentReadinessRate ?? 0) >= 80 ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50',
      icon: '✅',
      trend: prev && latest ? {
        value: latest.equipmentReadinessRate - prev.equipmentReadinessRate,
        good: latest.equipmentReadinessRate >= prev.equipmentReadinessRate,
      } : undefined,
    },
    {
      label: 'Breakdown Rate',
      value: latest ? formatPct(latest.breakdownRate) : '—',
      subLabel: `${latest?.breakdownDays ?? 0} days with breakdowns`,
      color: (latest?.breakdownRate ?? 100) <= 40 ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50',
      icon: '🔧',
      trend: prev && latest ? {
        value: latest.breakdownRate - prev.breakdownRate,
        good: latest.breakdownRate <= prev.breakdownRate,
      } : undefined,
    },
    {
      label: 'Same-Day Resolution',
      value: latest ? formatPct(latest.resolutionRate) : '—',
      subLabel: `${latest?.breakdownResolvedDays ?? 0} of ${latest?.breakdownDays ?? 0} resolved same day`,
      color: (latest?.resolutionRate ?? 0) >= 70 ? 'border-blue-200 bg-blue-50/50' : 'border-amber-200 bg-amber-50/50',
      icon: '⚡',
      trend: prev && latest ? {
        value: latest.resolutionRate - prev.resolutionRate,
        good: latest.resolutionRate >= prev.resolutionRate,
      } : undefined,
    },
    {
      label: 'PM Compliance',
      value: latest ? formatPct(latest.pmComplianceRate) : '—',
      subLabel: `${latest?.pmReportedDays ?? 0} of ${latest?.daysReported ?? 0} days reported`,
      color: (latest?.pmComplianceRate ?? 0) >= 60 ? 'border-indigo-200 bg-indigo-50/50' : 'border-amber-200 bg-amber-50/50',
      icon: '📋',
      trend: prev && latest ? {
        value: latest.pmComplianceRate - prev.pmComplianceRate,
        good: latest.pmComplianceRate >= prev.pmComplianceRate,
      } : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {cards.map(card => (
        <div key={card.label} className={`rounded-xl border p-4 shadow-sm ${card.color}`}>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{card.label}</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-lg font-bold text-slate-900">{card.value}</p>
            {card.trend && (
              <span className={`text-[10px] font-medium ${card.trend.good ? 'text-emerald-600' : 'text-red-500'}`}>
                {card.trend.value >= 0 ? '↑' : '↓'} {Math.abs(card.trend.value).toFixed(0)}pp
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">{card.subLabel}</p>
        </div>
      ))}
    </div>
  );
}

// ── Equipment Health Trend Chart ─────────────────────────────────────

function EquipmentHealthChart({ months }: { months: BiomedicalMonthSummary[] }) {
  if (months.length < 2) return null;

  const marginLeft = 32;
  const marginBottom = 24;
  const marginTop = 12;
  const marginRight = 12;
  const chartWidth = 540;
  const chartHeight = 200;
  const plotW = chartWidth - marginLeft - marginRight;
  const plotH = chartHeight - marginTop - marginBottom;

  const toX = (i: number) => marginLeft + (i / Math.max(months.length - 1, 1)) * plotW;
  const toY = (pct: number) => marginTop + plotH - (pct / 100) * plotH;
  const baseline = marginTop + plotH;

  const series: { key: string; label: string; color: string; getValue: (m: BiomedicalMonthSummary) => number }[] = [
    { key: 'readiness', label: 'Equipment Readiness', color: '#10b981', getValue: m => m.equipmentReadinessRate },
    { key: 'resolution', label: 'Same-Day Resolution', color: '#3b82f6', getValue: m => m.resolutionRate },
    { key: 'pm', label: 'PM Compliance', color: '#8b5cf6', getValue: m => m.pmComplianceRate },
    { key: 'breakdown', label: 'Breakdown Rate', color: '#ef4444', getValue: m => m.breakdownRate },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-800 mb-4">Equipment Health Trends — Monthly</h3>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" style={{ minHeight: '220px' }} preserveAspectRatio="xMidYMid meet">
        <defs>
          {series.map(s => (
            <linearGradient key={`grad-${s.key}`} id={`biograd-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.12" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
            </linearGradient>
          ))}
        </defs>

        {/* Y-axis grid */}
        {[0, 25, 50, 75, 100].map(v => (
          <g key={`ygrid-${v}`}>
            <line x1={marginLeft} y1={toY(v)} x2={chartWidth - marginRight} y2={toY(v)} stroke="#e2e8f0" strokeWidth="0.7" />
            <text x={marginLeft - 5} y={toY(v) + 3} textAnchor="end" className="fill-slate-400" style={{ fontSize: '9px' }}>{v}%</text>
          </g>
        ))}

        {/* Area fills */}
        {series.map(s => {
          const points = months.map((m, i) => ({ x: toX(i), y: toY(s.getValue(m)) }));
          return points.length >= 2 ? (
            <path key={`area-${s.key}`} d={smoothAreaPath(points, baseline)} fill={`url(#biograd-${s.key})`} />
          ) : null;
        })}

        {/* Lines */}
        {series.map(s => {
          const points = months.map((m, i) => ({ x: toX(i), y: toY(s.getValue(m)) }));
          return points.length >= 2 ? (
            <path key={`line-${s.key}`} d={smoothPath(points)} stroke={s.color} strokeWidth="2" fill="none" strokeLinecap="round" />
          ) : null;
        })}

        {/* Dots */}
        {series.map(s => months.map((m, i) => (
          <circle key={`dot-${s.key}-${i}`} cx={toX(i)} cy={toY(s.getValue(m))} r="3" fill="white" stroke={s.color} strokeWidth="1.5" />
        )))}

        {/* X-axis labels */}
        {months.map((m, i) => (
          <text key={`xlabel-${m.month}`} x={toX(i)} y={chartHeight - 4} textAnchor="middle" className="fill-slate-400" style={{ fontSize: '8px' }}>{formatMonthShort(m.month)}</text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-4 mt-4 text-xs">
        {series.map(s => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-slate-600">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Equipment Issue Breakdown (horizontal bar chart) ─────────────────

function EquipmentCategoryChart({ summary }: { summary: Summary }) {
  const issues = summary.topEquipmentIssues;
  if (issues.length === 0) return null;

  const maxCount = Math.max(...issues.map(i => i.count), 1);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-800 mb-4">Breakdown Hotspots — Equipment Categories</h3>
      <div className="space-y-2.5">
        {issues.map(issue => {
          const label = summary.categoryLabels[issue.category] || issue.category;
          const color = CATEGORY_COLORS[issue.category] || '#94a3b8';
          const pct = (issue.count / maxCount) * 100;
          return (
            <div key={issue.category}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-700">{label}</span>
                <span className="text-xs text-slate-500">{issue.count} incidents</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Monthly Progression Table ────────────────────────────────────────

function ProgressionTable({ months }: { months: BiomedicalMonthSummary[] }) {
  if (months.length === 0) return null;

  const metrics: { key: string; label: string; getValue: (m: BiomedicalMonthSummary) => number; format: (v: number) => string; goodDirection: 'up' | 'down' }[] = [
    { key: 'readiness', label: 'Equipment Readiness %', getValue: m => m.equipmentReadinessRate, format: v => formatPct(v), goodDirection: 'up' },
    { key: 'breakdown', label: 'Breakdown Rate %', getValue: m => m.breakdownRate, format: v => formatPct(v), goodDirection: 'down' },
    { key: 'resolution', label: 'Same-Day Resolution %', getValue: m => m.resolutionRate, format: v => formatPct(v), goodDirection: 'up' },
    { key: 'pending', label: 'Pending Repair Days', getValue: m => m.pendingRepairDays, format: v => String(v), goodDirection: 'down' },
    { key: 'pm', label: 'PM Compliance %', getValue: m => m.pmComplianceRate, format: v => formatPct(v), goodDirection: 'up' },
    { key: 'days', label: 'Days Reported', getValue: m => m.daysReported, format: v => String(v), goodDirection: 'up' },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-emerald-50">
        <div className="flex items-center gap-2">
          <span className="text-lg">📊</span>
          <h3 className="text-sm font-bold text-slate-800">Monthly Progression</h3>
          <span className="text-[10px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium">Text Analysis</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-2.5 text-left text-slate-600 font-semibold whitespace-nowrap sticky left-0 bg-slate-50 z-10">Metric</th>
              {months.map(m => (
                <th key={m.month} className="px-3 py-2.5 text-right text-slate-600 font-semibold whitespace-nowrap min-w-[80px]">
                  {formatMonthShort(m.month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric, mi) => (
              <tr key={metric.key} className={`border-b border-slate-100 ${mi % 2 === 0 ? '' : 'bg-slate-50/50'} hover:bg-teal-50/30`}>
                <td className="px-4 py-2 text-slate-700 font-medium whitespace-nowrap sticky left-0 bg-white z-10">
                  {mi % 2 !== 0 && <span className="absolute inset-0 bg-slate-50/50" />}
                  <span className="relative">{metric.label}</span>
                </td>
                {months.map((m, mi_idx) => {
                  const val = metric.getValue(m);
                  const prevVal = mi_idx > 0 ? metric.getValue(months[mi_idx - 1]) : null;
                  const delta = prevVal !== null ? val - prevVal : null;
                  const isGood = delta !== null ? (metric.goodDirection === 'up' ? delta >= 0 : delta <= 0) : null;
                  return (
                    <td key={m.month} className="px-3 py-2 text-right whitespace-nowrap">
                      <span className="text-slate-800 font-medium">{metric.format(val)}</span>
                      {delta !== null && Math.abs(delta) > 0.5 && (
                        <span className={`block text-[9px] font-medium ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>
                          {delta > 0 ? '+' : ''}{metric.key === 'pending' || metric.key === 'days' ? delta.toFixed(0) : delta.toFixed(0) + 'pp'}
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

// ── Breakdown Calendar ───────────────────────────────────────────────

function BreakdownCalendar({ allDays, months }: { allDays: BiomedicalDayData[]; months: BiomedicalMonthSummary[] }) {
  // Show last 3 months
  const recentMonths = months.slice(-3);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-800 mb-4">Breakdown Calendar</h3>
      <div className="space-y-3">
        {recentMonths.map(m => {
          const monthDays = allDays.filter(d => d.date.startsWith(m.month));
          return (
            <div key={m.month} className="pb-3 border-b border-slate-100 last:border-b-0">
              <p className="text-xs font-semibold text-slate-700 mb-2">{m.label}</p>
              <div className="flex flex-wrap gap-1">
                {monthDays.map(d => {
                  let bg = 'bg-emerald-100 text-emerald-700'; // No breakdown
                  let symbol = '·';
                  if (d.hasBreakdown && d.breakdownResolved) {
                    bg = 'bg-amber-100 text-amber-800';
                    symbol = '✓';
                  } else if (d.hasBreakdown) {
                    bg = 'bg-red-500 text-white';
                    symbol = '!';
                  }
                  return (
                    <div
                      key={d.date}
                      className={`w-6 h-6 rounded text-[9px] flex items-center justify-center font-bold ${bg}`}
                      title={`${formatDate(d.date)}: ${d.hasBreakdown ? (d.breakdownResolved ? 'Resolved' : 'Unresolved') : 'No breakdown'}${d.breakdownText ? ' — ' + d.breakdownText.substring(0, 80) : ''}`}
                    >
                      {symbol}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 mt-1.5 text-[9px] text-slate-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-100" /> Clear</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-100" /> Resolved</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500" /> Open</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Clean Streak Counter ─────────────────────────────────────────────

function CleanStreak({ allDays }: { allDays: BiomedicalDayData[] }) {
  let currentStreak = 0;
  let maxStreak = 0;

  for (const d of allDays) {
    if (!d.hasBreakdown) {
      currentStreak++;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Zero-Breakdown Streak</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{currentStreak} days</p>
          <p className="text-xs text-slate-400 mt-1">Current (best: {maxStreak} days)</p>
        </div>
        <span className="text-3xl">{currentStreak >= 5 ? '🏆' : currentStreak >= 2 ? '🎯' : '🔧'}</span>
      </div>
    </div>
  );
}

// ── Pending Repair Trend ─────────────────────────────────────────────

function PendingRepairTrend({ months }: { months: BiomedicalMonthSummary[] }) {
  const latest = months.length > 0 ? months[months.length - 1] : null;
  if (!latest) return null;

  const pctPending = latest.daysReported > 0 ? (latest.pendingRepairDays / latest.daysReported) * 100 : 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Open Repairs This Month</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{latest.pendingRepairDays} days</p>
          <p className="text-xs text-slate-400 mt-1">{formatPct(pctPending)} of days had pending work</p>
        </div>
        <span className="text-3xl">{pctPending <= 20 ? '✅' : '⏳'}</span>
      </div>
      <div className="mt-3 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(pctPending, 100)}%` }} />
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

const BiomedicalOverview: React.FC<Props> = ({ onBack, embedded = false }) => {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/department-overview?slug=biomedical');
        if (!res.ok) throw new Error('Failed to fetch biomedical overview');
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
          <div className="w-8 h-8 border-2 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
        </div>
        <p className="text-slate-500 text-sm mt-3">Loading biomedical overview...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center bg-red-50 rounded-lg border border-red-200">
        <p className="text-red-700 font-medium">Unable to load biomedical overview</p>
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
            <h1 className="text-2xl font-bold text-slate-900">Biomedical Department Overview</h1>
            <p className="text-sm text-slate-500 mt-1">
              {summary.dateRange ? `${summary.dateRange.from} to ${summary.dateRange.to} · ${summary.totalDaysReported} days analyzed` : 'No data available'}
            </p>
          </div>
        </div>
      )}

      {embedded && summary.dateRange && (
        <div className="mb-4 text-xs text-slate-500">
          {summary.dateRange.from} to {summary.dateRange.to} · {summary.totalDaysReported} days of narrative data analyzed
        </div>
      )}

      <div className="space-y-6">
        {/* Hero Cards */}
        <HeroCards summary={summary} months={months} />

        {/* Equipment Health Trends */}
        <EquipmentHealthChart months={months} />

        {/* Monthly Progression Table */}
        <ProgressionTable months={months} />

        {/* Bottom Row: Category Chart + Calendar + Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <EquipmentCategoryChart summary={summary} />
          <BreakdownCalendar allDays={allDays} months={months} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <CleanStreak allDays={allDays} />
          <PendingRepairTrend months={months} />
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">All-Time Summary</p>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-slate-600">Total days analyzed</span><span className="font-bold text-slate-800">{summary.totalDaysReported}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Days with breakdowns</span><span className="font-bold text-slate-800">{summary.totalBreakdownDays}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Days with pending repairs</span><span className="font-bold text-slate-800">{summary.totalPendingDays}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Overall readiness</span><span className="font-bold text-emerald-700">{formatPct(summary.equipmentReadinessRate)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Overall resolution rate</span><span className="font-bold text-blue-700">{formatPct(summary.overallResolutionRate)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BiomedicalOverview;
