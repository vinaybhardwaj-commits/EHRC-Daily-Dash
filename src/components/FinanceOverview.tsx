'use client';

import React, { useState, useEffect, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────

interface DayData {
  date: string;
  revenue: number | null;
  revenueMTD: number | null;
  arpob: number | null;
  ipCensus: number | null;
  surgeriesMTD: number | null;
  opdRevenueMTD: number | null;
  revenueLeakage: string | null;
}

interface MonthSummary {
  month: string;
  label: string;
  daysReported: number;
  revenueMTD: number | null;
  surgeriesMTD: number | null;
  opdRevenueMTD: number | null;
  avgDailyRevenue: number | null;
  avgArpob: number | null;
  avgCensus: number | null;
  dailyRevenue: { date: string; value: number }[];
  dailyArpob: { date: string; value: number }[];
  dailyCensus: { date: string; value: number }[];
  dailySurgeries: { date: string; value: number }[];
  leakageAlerts: { date: string; text: string }[];
}

interface MonthlyMetric {
  month: string;
  label: string;
  value: number | null;
}

interface BrmMonth {
  month: string;
  label: string;
  revenue_lakhs: number | null;
  ebitdar_lakhs: number | null;
  ebitdar_pct: number | null;
  ebitda_before_lakhs: number | null;
  ebitda_before_pct: number | null;
  contribution_margin_pct: number | null;
  operating_days: number | null;
  opd_footfall_total: number | null;
  ip_admissions: number | null;
  ip_discharges: number | null;
  avg_occupied_beds: number | null;
  occupancy_pct: number | null;
  arpob_daily: number | null;
  arpob_annualized_lakhs: number | null;
  alos_days: number | null;
  ipd_revenue_lakhs: number | null;
  opd_revenue_lakhs: number | null;
  operating_revenue_lakhs: number | null;
  census_beds: number | null;
}

interface Summary {
  totalDaysReported: number;
  dateRange: { from: string; to: string } | null;
  latestRevenueMTD: number | null;
  latestSurgeriesMTD: number | null;
  latestArpob: number | null;
  latestCensus: number | null;
  latestOpdRevenueMTD: number | null;
  avgDailyRevenue: number | null;
  avgArpob: number | null;
  avgCensus: number | null;
  totalLeakageAlerts: number;
  revenueSparkline: { date: string; value: number }[];
  arpobSparkline: { date: string; value: number }[];
  censusSparkline: { date: string; value: number }[];
  surgeriesSparkline: { date: string; value: number }[];
}

interface ApiResponse {
  slug: string;
  department: string;
  summary: Summary;
  months: MonthSummary[];
  monthlyRevenueMTD: MonthlyMetric[];
  monthlySurgeries: MonthlyMetric[];
  monthlyAvgCensus: MonthlyMetric[];
  monthlyAvgArpob: MonthlyMetric[];
  availableMonths: string[];
  allDays: DayData[];
  brmMonths: BrmMonth[];
}

interface Props {
  onBack: () => void;
  onNavigateToDashboard: (date: string, slug: string) => void;
  embedded?: boolean;
}

// ── Formatting Helpers ───────────────────────────────────────────────

function formatLakhs(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) return '—';
  if (num === 0) return '₹0';
  if (Math.abs(num) >= 100) return '₹' + (num / 100).toFixed(2) + ' Cr';
  return '₹' + num.toFixed(1) + ' L';
}

function formatIndian(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) return '—';
  if (num === 0) return '0';
  if (Math.abs(num) >= 10000000) return '₹' + (num / 10000000).toFixed(2) + ' Cr';
  if (Math.abs(num) >= 100000) return '₹' + (num / 100000).toFixed(2) + ' L';
  if (Math.abs(num) >= 1000) return '₹' + (num / 1000).toFixed(1) + 'K';
  return '₹' + num.toFixed(0);
}

function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function formatPct(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) return '—';
  // If already in decimal form (0-1 range), multiply by 100
  const val = Math.abs(num) <= 2 ? num * 100 : num;
  return val.toFixed(1) + '%';
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

function formatFullMonth(ym: string): string {
  const [y, m] = ym.split('-');
  const names = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[parseInt(m) - 1]} ${y}`;
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

function ChangeBadge({ current, previous, invert = false, suffix = '' }: {
  current: number | null;
  previous: number | null;
  invert?: boolean;
  suffix?: string;
}) {
  const change = pctChange(current, previous);
  if (!change) return null;
  const isGood = invert ? !change.positive : change.positive;
  return (
    <span className={`inline-flex items-center text-[10px] font-medium ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>
      {change.positive ? '↑' : '↓'} {change.label}{suffix}
    </span>
  );
}

// ── BRM Monthly Progression Table ────────────────────────────────────

function BrmProgressionTable({ brmMonths }: { brmMonths: BrmMonth[] }) {
  if (brmMonths.length === 0) return null;

  const metrics: { key: string; label: string; format: (v: number) => string; getValue: (b: BrmMonth) => number | null; invert?: boolean }[] = [
    { key: 'revenue', label: 'Revenue', format: (v) => formatLakhs(v), getValue: b => b.revenue_lakhs },
    { key: 'opd_rev', label: 'OPD Revenue', format: (v) => formatLakhs(v), getValue: b => b.opd_revenue_lakhs },
    { key: 'ipd_rev', label: 'IPD Revenue', format: (v) => formatLakhs(v), getValue: b => b.ipd_revenue_lakhs },
    { key: 'ebitdar', label: 'EBITDAR', format: (v) => formatLakhs(v), getValue: b => b.ebitdar_lakhs },
    { key: 'cm_pct', label: 'Contrib Margin %', format: formatPct, getValue: b => b.contribution_margin_pct },
    { key: 'occupancy', label: 'Occupancy %', format: formatPct, getValue: b => b.occupancy_pct },
    { key: 'arpob_daily', label: 'ARPOB (Daily)', format: (v) => formatIndian(v), getValue: b => b.arpob_daily },
    { key: 'opd_footfall', label: 'OPD Footfall', format: formatNumber, getValue: b => b.opd_footfall_total },
    { key: 'ip_admissions', label: 'IP Admissions', format: formatNumber, getValue: b => b.ip_admissions },
    { key: 'avg_beds', label: 'Avg Occupied Beds', format: (v) => v != null ? v.toFixed(1) : '—', getValue: b => b.avg_occupied_beds },
    { key: 'alos', label: 'ALOS (days)', format: (v) => v != null ? v.toFixed(1) : '—', getValue: b => b.alos_days },
    { key: 'days', label: 'Operating Days', format: formatNumber, getValue: b => b.operating_days },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-blue-50">
        <div className="flex items-center gap-2">
          <span className="text-lg">📊</span>
          <h3 className="text-sm font-bold text-slate-800">Business Review — Monthly Progression</h3>
          <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">BRM Official</span>
        </div>
        <p className="text-[11px] text-slate-500 mt-1">Audited monthly figures from BRM Excel reports (Aug 2025 — Feb 2026)</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-2.5 text-left text-slate-600 font-semibold whitespace-nowrap sticky left-0 bg-slate-50 z-10">Metric</th>
              {brmMonths.map(b => (
                <th key={b.month} className="px-3 py-2.5 text-right text-slate-600 font-semibold whitespace-nowrap min-w-[90px]">
                  {formatMonthShort(b.month)}
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
                {brmMonths.map((b, bi) => {
                  const val = metric.getValue(b);
                  const prevVal = bi > 0 ? metric.getValue(brmMonths[bi - 1]) : null;
                  const change = pctChange(val, prevVal);
                  return (
                    <td key={b.month} className="px-3 py-2 text-right whitespace-nowrap">
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

// ── BRM vs Daily Tracker Comparison Bars ─────────────────────────────

function DualTrackBars({ brmMonths, dailyMonths, metric }: {
  brmMonths: BrmMonth[];
  dailyMonths: MonthSummary[];
  metric: 'revenue' | 'arpob' | 'occupancy' | 'opd' | 'admissions';
}) {
  // Build a unified month list
  const allMonths = new Set<string>();
  brmMonths.forEach(b => allMonths.add(b.month));
  dailyMonths.forEach(m => allMonths.add(m.month));
  const sorted = [...allMonths].sort();

  const brmMap = new Map(brmMonths.map(b => [b.month, b]));
  const dailyMap = new Map(dailyMonths.map(m => [m.month, m]));

  const configs: Record<string, {
    getBrm: (b: BrmMonth) => number | null;
    getDaily: (m: MonthSummary) => number | null;
    formatVal: (n: number) => string;
    label: string;
    brmColor: string;
    dailyColor: string;
  }> = {
    revenue: {
      getBrm: b => b.revenue_lakhs ? b.revenue_lakhs * 100000 : null,
      getDaily: m => m.revenueMTD,
      formatVal: n => formatIndian(n),
      label: 'Revenue MTD',
      brmColor: '#6366f1',
      dailyColor: '#3b82f6',
    },
    arpob: {
      getBrm: b => b.arpob_daily,
      getDaily: m => m.avgArpob,
      formatVal: n => formatIndian(n),
      label: 'ARPOB (Daily)',
      brmColor: '#7c3aed',
      dailyColor: '#a78bfa',
    },
    occupancy: {
      getBrm: b => b.occupancy_pct != null ? b.occupancy_pct * 100 : null,
      getDaily: _ => null,
      formatVal: n => n != null ? n.toFixed(1) + '%' : '—',
      label: 'Occupancy %',
      brmColor: '#059669',
      dailyColor: '#34d399',
    },
    opd: {
      getBrm: b => b.opd_footfall_total,
      getDaily: _ => null,
      formatVal: formatNumber,
      label: 'OPD Footfall',
      brmColor: '#d97706',
      dailyColor: '#fbbf24',
    },
    admissions: {
      getBrm: b => b.ip_admissions,
      getDaily: _ => null,
      formatVal: formatNumber,
      label: 'IP Admissions',
      brmColor: '#dc2626',
      dailyColor: '#f87171',
    },
  };

  const config = configs[metric];
  const pairs = sorted.map(month => ({
    month,
    brm: brmMap.has(month) ? config.getBrm(brmMap.get(month)!) : null,
    daily: dailyMap.has(month) ? config.getDaily(dailyMap.get(month)!) : null,
  }));

  const allVals = pairs.flatMap(p => [p.brm, p.daily]).filter((v): v is number => v !== null && v > 0);
  if (allVals.length === 0) return <div className="text-slate-400 text-sm py-4 text-center">No data</div>;
  const maxVal = Math.max(...allVals);
  const height = 180;

  return (
    <div>
      <div className="flex items-center gap-4 mb-3">
        <h4 className="text-sm font-semibold text-slate-700">{config.label}</h4>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: config.brmColor }} /> BRM
          </span>
          {pairs.some(p => p.daily !== null) && (
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: config.dailyColor }} /> Daily Tracker
            </span>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="flex items-end gap-1" style={{ height: `${height}px` }}>
          {pairs.map((p) => {
            const brmH = p.brm !== null ? (p.brm / maxVal) * (height - 50) : 0;
            const dailyH = p.daily !== null ? (p.daily / maxVal) * (height - 50) : 0;
            const hasBoth = p.brm !== null && p.daily !== null;

            return (
              <div key={p.month} className="flex flex-col items-center flex-1 min-w-[50px]">
                {/* Values */}
                <div className="flex flex-col items-center mb-1">
                  {p.brm !== null && <span className="text-[9px] font-medium" style={{ color: config.brmColor }}>{config.formatVal(p.brm)}</span>}
                  {hasBoth && p.daily !== null && (
                    <span className="text-[9px]" style={{ color: config.dailyColor }}>{config.formatVal(p.daily)}</span>
                  )}
                </div>
                {/* Bars */}
                <div className="flex gap-[2px] items-end w-full justify-center">
                  {p.brm !== null && (
                    <div className="rounded-t" style={{ height: `${Math.max(brmH, 3)}px`, width: hasBoth ? '40%' : '60%', backgroundColor: config.brmColor, maxWidth: '28px' }} />
                  )}
                  {p.daily !== null && (
                    <div className="rounded-t" style={{ height: `${Math.max(dailyH, 3)}px`, width: hasBoth ? '40%' : '60%', backgroundColor: config.dailyColor, maxWidth: '28px' }} />
                  )}
                  {p.brm === null && p.daily === null && (
                    <div className="rounded-t bg-slate-200" style={{ height: '3px', width: '60%', maxWidth: '28px' }} />
                  )}
                </div>
                {/* Gap indicator */}
                {hasBoth && p.brm !== null && p.daily !== null && (() => {
                  const gap = ((p.daily - p.brm) / Math.abs(p.brm)) * 100;
                  if (Math.abs(gap) < 1) return null;
                  return (
                    <span className={`text-[8px] font-medium mt-0.5 ${gap >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {gap >= 0 ? '+' : ''}{gap.toFixed(0)}%
                    </span>
                  );
                })()}
                <span className="text-[9px] text-slate-400 mt-1 whitespace-nowrap">{formatMonthShort(p.month)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── BRM Hero Cards ───────────────────────────────────────────────────

function BrmHeroCards({ brmMonths }: { brmMonths: BrmMonth[] }) {
  if (brmMonths.length === 0) return null;
  const latest = brmMonths[brmMonths.length - 1];
  const prev = brmMonths.length > 1 ? brmMonths[brmMonths.length - 2] : null;

  const cards: { label: string; value: string; subLabel: string; current: number | null; previous: number | null; invert?: boolean; color: string }[] = [
    {
      label: 'Revenue (BRM)',
      value: formatLakhs(latest.revenue_lakhs),
      subLabel: latest.label,
      current: latest.revenue_lakhs,
      previous: prev?.revenue_lakhs ?? null,
      color: 'border-indigo-200 bg-indigo-50/50',
    },
    {
      label: 'EBITDAR',
      value: formatLakhs(latest.ebitdar_lakhs),
      subLabel: latest.ebitdar_pct != null ? formatPct(latest.ebitdar_pct) + ' margin' : '',
      current: latest.ebitdar_lakhs,
      previous: prev?.ebitdar_lakhs ?? null,
      color: latest.ebitdar_lakhs !== null && latest.ebitdar_lakhs >= 0 ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50',
    },
    {
      label: 'Occupancy %',
      value: formatPct(latest.occupancy_pct),
      subLabel: `${latest.avg_occupied_beds?.toFixed(1) ?? '—'} avg beds`,
      current: latest.occupancy_pct,
      previous: prev?.occupancy_pct ?? null,
      color: 'border-teal-200 bg-teal-50/50',
    },
    {
      label: 'ARPOB (Daily)',
      value: formatIndian(latest.arpob_daily),
      subLabel: `Annualized: ${formatLakhs(latest.arpob_annualized_lakhs)}`,
      current: latest.arpob_daily,
      previous: prev?.arpob_daily ?? null,
      color: 'border-purple-200 bg-purple-50/50',
    },
    {
      label: 'IP Admissions',
      value: formatNumber(latest.ip_admissions),
      subLabel: `OPD: ${formatNumber(latest.opd_footfall_total)}`,
      current: latest.ip_admissions,
      previous: prev?.ip_admissions ?? null,
      color: 'border-amber-200 bg-amber-50/50',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map(card => (
        <div key={card.label} className={`rounded-xl border p-4 shadow-sm ${card.color}`}>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{card.label}</p>
          <p className="text-lg font-bold text-slate-900 mt-1">{card.value}</p>
          <p className="text-[10px] text-slate-500">{card.subLabel}</p>
          <ChangeBadge current={card.current} previous={card.previous} invert={card.invert} suffix=" MoM" />
        </div>
      ))}
    </div>
  );
}

// ── Bar Chart Component ──────────────────────────────────────────────

function BarChart({ data, color = '#3b82f6', formatValue, height = 200 }: {
  data: MonthlyMetric[];
  color?: string;
  formatValue: (n: number) => string;
  height?: number;
}) {
  const values = data.map(d => d.value).filter((v): v is number => v !== null);
  if (values.length === 0) return <div className="text-slate-400 text-sm py-8 text-center">No data</div>;
  const maxVal = Math.max(...values);

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-1 min-w-0" style={{ height: `${height}px` }}>
        {data.map((d, i) => {
          const barH = d.value !== null ? (d.value / maxVal) * (height - 40) : 0;
          const prev = i > 0 ? data[i - 1].value : null;
          const change = pctChange(d.value, prev);

          return (
            <div key={d.month} className="flex flex-col items-center flex-1 min-w-[40px]">
              {change && (
                <span className={`text-[9px] font-medium mb-0.5 ${change.positive ? 'text-emerald-600' : 'text-red-500'}`}>
                  {change.label}
                </span>
              )}
              <span className="text-[10px] text-slate-500 mb-1">
                {d.value !== null ? formatValue(d.value) : '—'}
              </span>
              <div
                className="w-full max-w-[32px] rounded-t transition-all"
                style={{ height: `${Math.max(barH, 2)}px`, backgroundColor: color, opacity: d.value !== null ? 1 : 0.2 }}
              />
              <span className="text-[9px] text-slate-400 mt-1 whitespace-nowrap">{formatMonthShort(d.month)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Line Chart with Range Band ───────────────────────────────────────

function LineChartWithBand({ data, color = '#3b82f6', bandColor = '#dbeafe', formatY, height = 220, title }: {
  data: { date: string; value: number }[];
  avgLine?: number;
  color?: string;
  bandColor?: string;
  formatY: (n: number) => string;
  height?: number;
  title: string;
}) {
  if (data.length < 2) return <div className="text-slate-400 text-sm py-8 text-center">Not enough data for {title}</div>;

  const values = data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padding = range * 0.1;
  const yMin = min - padding;
  const yMax = max + padding;
  const yRange = yMax - yMin;

  const w = 700;
  const h = height;
  const px = 60;
  const pt = 10;
  const pb = 30;
  const pr = 20;
  const chartW = w - px - pr;
  const chartH = h - pt - pb;

  const scaleX = (i: number) => px + (i / (data.length - 1)) * chartW;
  const scaleY = (v: number) => pt + chartH - ((v - yMin) / yRange) * chartH;

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${scaleX(i)},${scaleY(d.value)}`).join(' ');
  const avgVal = values.reduce((a, b) => a + b, 0) / values.length;
  const bandTop = scaleY(avgVal * 1.1);
  const bandBottom = scaleY(avgVal * 0.9);
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (yRange / 4) * i);
  const step = Math.max(1, Math.floor(data.length / 6));
  const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: `${h}px` }}>
        <rect x={px} y={bandTop} width={chartW} height={bandBottom - bandTop} fill={bandColor} rx="2" />
        <line x1={px} y1={scaleY(avgVal)} x2={px + chartW} y2={scaleY(avgVal)} stroke={color} strokeWidth="1" strokeDasharray="4,3" opacity="0.4" />
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={px} y1={scaleY(t)} x2={px + chartW} y2={scaleY(t)} stroke="#e2e8f0" strokeWidth="0.5" />
            <text x={px - 6} y={scaleY(t) + 3} textAnchor="end" className="text-[10px]" fill="#94a3b8">{formatY(t)}</text>
          </g>
        ))}
        <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={scaleX(0)} cy={scaleY(data[0].value)} r="3" fill={color} />
        <circle cx={scaleX(data.length - 1)} cy={scaleY(data[data.length - 1].value)} r="3" fill={color} />
        {xLabels.map((d) => {
          const idx = data.indexOf(d);
          return (
            <text key={d.date} x={scaleX(idx)} y={h - 6} textAnchor="middle" className="text-[9px]" fill="#94a3b8">
              {formatDate(d.date)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ── Revenue Combo Chart ──────────────────────────────────────────────

function RevenueComboChart({ dailyRevenue, monthLabel }: {
  dailyRevenue: { date: string; value: number }[];
  monthLabel: string;
}) {
  if (dailyRevenue.length === 0) return <div className="text-slate-400 text-sm py-8 text-center">No revenue data for {monthLabel}</div>;
  const values = dailyRevenue.map(d => d.value);
  const maxVal = Math.max(...values);

  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-700 mb-2">{monthLabel} — Daily Revenue</h4>
      <div className="overflow-x-auto">
        <div className="flex items-end gap-[2px] min-w-0" style={{ height: '160px' }}>
          {dailyRevenue.map((d) => {
            const barH = (d.value / maxVal) * 130;
            return (
              <div key={d.date} className="flex flex-col items-center flex-1 min-w-[14px] group relative">
                <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                  {formatDate(d.date)}: {formatIndian(d.value)}
                </div>
                <div
                  className="w-full max-w-[18px] rounded-t bg-blue-400 hover:bg-blue-500 transition-colors cursor-pointer"
                  style={{ height: `${Math.max(barH, 2)}px` }}
                />
                <span className="text-[8px] text-slate-300 mt-0.5">{d.date.slice(8)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Data Table ───────────────────────────────────────────────────────

function DataTable({ days, expanded, onToggle }: {
  days: DayData[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 bg-slate-50 text-left flex items-center justify-between hover:bg-slate-100 transition-colors"
      >
        <span className="text-sm font-semibold text-slate-700">Detailed Data Table ({days.length} days)</span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-slate-500 font-medium">Date</th>
                <th className="px-3 py-2 text-right text-slate-500 font-medium">Revenue</th>
                <th className="px-3 py-2 text-right text-slate-500 font-medium">Rev MTD</th>
                <th className="px-3 py-2 text-right text-slate-500 font-medium">ARPOB</th>
                <th className="px-3 py-2 text-right text-slate-500 font-medium">IP Census</th>
                <th className="px-3 py-2 text-right text-slate-500 font-medium">Surgeries MTD</th>
                <th className="px-3 py-2 text-left text-slate-500 font-medium">Leakage</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((d) => (
                <tr key={d.date} className="border-t border-slate-100 hover:bg-blue-50/30">
                  <td className="px-3 py-2 text-slate-700 font-medium whitespace-nowrap">{formatDate(d.date)}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{d.revenue !== null ? formatIndian(d.revenue) : '—'}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{d.revenueMTD !== null ? formatIndian(d.revenueMTD) : '—'}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{d.arpob !== null ? formatIndian(d.arpob) : '—'}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{d.ipCensus !== null ? formatNumber(d.ipCensus) : '—'}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{d.surgeriesMTD !== null ? formatNumber(d.surgeriesMTD) : '—'}</td>
                  <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate">
                    {d.revenueLeakage && d.revenueLeakage.toLowerCase() !== 'nil' && d.revenueLeakage.toLowerCase() !== 'none'
                      ? <span className="text-red-600">{d.revenueLeakage}</span>
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

const FinanceOverview: React.FC<Props> = ({ onBack, onNavigateToDashboard, embedded = false }) => {
  const [data, setData] = useState<ApiResponse | null>(null);
  
  // Unbilled IP Revenue state
  const [unbilledData, setUnbilledData] = useState<{
    totalPatients: number; totalBillAmt: number; totalDepositAmt: number;
    totalDueAmt: number; totalPayerPayable: number; snapshotDate: string;
    wardBreakdown: Record<string, { patients: number; billAmt: number; depositAmt: number; dueAmt: number }>;
    patientDetails: Array<{ name: string; ward: string; bed: string; billAmt: number; deposit: number; due: number; los: number; status: string }>;
  } | null>(null);
  const [unbilledTrend, setUnbilledTrend] = useState<Array<{ date: string; billAmt: number; dueAmt: number; patients: number }>>([]);

const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<{ from: string; to: string } | null>(null);
  const [showDataTable, setShowDataTable] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [activeTrack, setActiveTrack] = useState<'brm' | 'daily'>('brm');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = '/api/department-overview?slug=finance';
      if (selectedRange) {
        url += `&from=${selectedRange.from}&to=${selectedRange.to}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      const result: ApiResponse = await res.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
    setLoading(false);
  }, [selectedRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch unbilled IP revenue data
  useEffect(() => {
    (async () => {
      try {
        // Get latest snapshot
        const latestResp = await fetch('/api/kx-upload');
        if (latestResp.ok) {
          const latestData = await latestResp.json();
          if (latestData.data && latestData.data.length > 0) {
            const latest = latestData.data[0];
            setUnbilledData({
              totalPatients: latest.total_patients,
              totalBillAmt: Number(latest.total_bill_amt),
              totalDepositAmt: Number(latest.total_deposit_amt),
              totalDueAmt: Number(latest.total_due_amt),
              totalPayerPayable: Number(latest.total_payer_payable),
              snapshotDate: latest.snapshot_date,
              wardBreakdown: latest.ward_breakdown || {},
              patientDetails: latest.patient_details || [],
            });
            // Build trend from all snapshots
            setUnbilledTrend(latestData.data.map((s: Record<string, unknown>) => ({
              date: s.snapshot_date as string,
              billAmt: Number(s.total_bill_amt),
              dueAmt: Number(s.total_due_amt),
              patients: s.total_patients as number,
            })).reverse());
          }
        }
      } catch (e) {
        console.error('Failed to fetch unbilled data:', e);
      }
    })();
  }, []);


  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <svg className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-slate-400 text-sm">Loading Finance overview...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <p className="text-red-500">{error || 'No data available'}</p>
        <button onClick={onBack} className="mt-4 text-blue-600 underline text-sm">Go back</button>
      </div>
    );
  }

  const { summary, months, monthlyRevenueMTD, monthlySurgeries, monthlyAvgCensus, monthlyAvgArpob, allDays, brmMonths } = data;
  const currentMonth = months.length > 0 ? months[months.length - 1] : null;
  const prevMonth = months.length > 1 ? months[months.length - 2] : null;
  const allLeakages = months.flatMap(m => m.leakageAlerts);
  const hasBrm = brmMonths && brmMonths.length > 0;

  return (
    <div className={embedded ? 'space-y-5' : 'max-w-7xl mx-auto px-4 py-6 space-y-6'}>
      {/* Header — hidden in embedded mode */}
      {!embedded && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Finance Department Overview</h1>
              <p className="text-sm text-slate-500">
                {hasBrm && <span className="text-indigo-600 font-medium">BRM: {brmMonths[0].label} — {brmMonths[brmMonths.length - 1].label}</span>}
                {hasBrm && summary.dateRange && ' · '}
                {summary.dateRange && <span>Daily: {formatDate(summary.dateRange.from)} — {formatDate(summary.dateRange.to)} ({summary.totalDaysReported} days)</span>}
              </p>
            </div>
          </div>

          {/* Month range picker */}
          {data.availableMonths.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={selectedRange?.from || ''}
                onChange={e => {
                  const from = e.target.value;
                  if (!from) { setSelectedRange(null); return; }
                  setSelectedRange(prev => ({ from, to: prev?.to || data.availableMonths[data.availableMonths.length - 1] }));
                }}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
              >
                <option value="">All time</option>
                {data.availableMonths.map(m => (
                  <option key={m} value={m}>{formatFullMonth(m)}</option>
                ))}
              </select>
              {selectedRange && (
                <>
                  <span className="text-xs text-slate-400">to</span>
                  <select
                    value={selectedRange.to}
                    onChange={e => setSelectedRange(prev => prev ? { ...prev, to: e.target.value } : null)}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
                  >
                    {data.availableMonths.map(m => (
                      <option key={m} value={m}>{formatFullMonth(m)}</option>
                    ))}
                  </select>
                  <button onClick={() => setSelectedRange(null)} className="text-xs text-blue-600 hover:underline">Reset</button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Embedded mode: compact date range display */}
      {embedded && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {hasBrm && <span className="text-indigo-600 font-medium">BRM: {brmMonths[0].label} — {brmMonths[brmMonths.length - 1].label}</span>}
            {hasBrm && summary.dateRange && ' · '}
            {summary.dateRange && <span>Daily: {formatDate(summary.dateRange.from)} — {formatDate(summary.dateRange.to)} ({summary.totalDaysReported} days)</span>}
          </p>
        </div>
      )}

      {/* ═══ TRACK TOGGLE ═══ */}
      {hasBrm && (
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTrack('brm')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTrack === 'brm' ? 'bg-white shadow text-indigo-700' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            BRM Official
          </button>
          <button
            onClick={() => setActiveTrack('daily')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTrack === 'daily' ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Daily Tracker
          </button>
        </div>
      )}

      {/* ═══ BRM TRACK ═══ */}
      {activeTrack === 'brm' && hasBrm && (
        <>
          {/* BRM Hero Cards */}
          <BrmHeroCards brmMonths={brmMonths} />

          {/* BRM Monthly Progression Table */}
          <BrmProgressionTable brmMonths={brmMonths} />

          {/* Dual-Track Comparison Charts */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900">BRM vs Daily Tracker Comparison</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <DualTrackBars brmMonths={brmMonths} dailyMonths={months} metric="revenue" />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <DualTrackBars brmMonths={brmMonths} dailyMonths={months} metric="arpob" />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <DualTrackBars brmMonths={brmMonths} dailyMonths={months} metric="occupancy" />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <DualTrackBars brmMonths={brmMonths} dailyMonths={months} metric="admissions" />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ DAILY TRACKER TRACK ═══ */}
      {activeTrack === 'daily' && (
        <>
          {/* Daily Tracker Hero Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Revenue MTD</p>
              <p className="text-xl font-bold text-slate-900 mt-1">{formatIndian(summary.latestRevenueMTD)}</p>
              {prevMonth && currentMonth && <ChangeBadge current={currentMonth.revenueMTD} previous={prevMonth.revenueMTD} suffix=" vs prev" />}
              <div className="mt-2"><Sparkline data={summary.revenueSparkline} color="#3b82f6" width={100} height={24} /></div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Avg ARPOB</p>
              <p className="text-xl font-bold text-slate-900 mt-1">{formatIndian(summary.latestArpob)}</p>
              {prevMonth && currentMonth && <ChangeBadge current={currentMonth.avgArpob} previous={prevMonth.avgArpob} suffix=" vs prev" />}
              <div className="mt-2"><Sparkline data={summary.arpobSparkline} color="#8b5cf6" width={100} height={24} /></div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Avg IP Census</p>
              <p className="text-xl font-bold text-slate-900 mt-1">{summary.latestCensus !== null ? Math.round(summary.latestCensus).toString() : '—'}</p>
              {prevMonth && currentMonth && <ChangeBadge current={currentMonth.avgCensus} previous={prevMonth.avgCensus} suffix=" vs prev" />}
              <div className="mt-2"><Sparkline data={summary.censusSparkline} color="#f59e0b" width={100} height={24} /></div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Surgeries MTD</p>
              <p className="text-xl font-bold text-slate-900 mt-1">{summary.latestSurgeriesMTD !== null ? formatNumber(summary.latestSurgeriesMTD) : '—'}</p>
              {prevMonth && currentMonth && <ChangeBadge current={currentMonth.surgeriesMTD} previous={prevMonth.surgeriesMTD} suffix=" vs prev" />}
              <div className="mt-2"><Sparkline data={summary.surgeriesSparkline} color="#10b981" width={100} height={24} /></div>
            </div>
            <div className={`bg-white rounded-xl border p-4 shadow-sm ${summary.totalLeakageAlerts > 0 ? 'border-red-200' : 'border-slate-200'}`}>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Leakage Alerts</p>
              <p className={`text-xl font-bold mt-1 ${summary.totalLeakageAlerts > 0 ? 'text-red-600' : 'text-slate-900'}`}>{summary.totalLeakageAlerts}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">all-time incidents</p>
            </div>
          </div>

          {/* Daily Trends & Charts */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Daily Trends & Progression</h2>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700">Revenue MTD by Month</h3>
                <span className="text-[10px] text-slate-400">From daily form submissions</span>
              </div>
              <BarChart data={monthlyRevenueMTD} color="#3b82f6" formatValue={(n) => {
                if (n >= 10000000) return (n / 10000000).toFixed(1) + 'Cr';
                if (n >= 100000) return (n / 100000).toFixed(1) + 'L';
                return (n / 1000).toFixed(0) + 'K';
              }} />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700">ARPOB Trend (Daily)</h3>
                <span className="text-[10px] text-slate-400">Band = ±10% of mean</span>
              </div>
              <LineChartWithBand
                data={summary.arpobSparkline}
                color="#8b5cf6"
                bandColor="#ede9fe"
                formatY={(n) => {
                  if (n >= 100000) return (n / 100000).toFixed(1) + 'L';
                  if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
                  return n.toFixed(0);
                }}
                title="ARPOB"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">Avg IP Census by Month</h3>
                <BarChart data={monthlyAvgCensus} color="#f59e0b" formatValue={(n) => n.toString()} height={160} />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">Surgeries MTD by Month</h3>
                <BarChart data={monthlySurgeries} color="#10b981" formatValue={(n) => n.toString()} height={160} />
              </div>
            </div>

            {currentMonth && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="text-sm font-semibold text-slate-700">Daily Revenue Breakdown</h3>
                  <div className="flex gap-1">
                    {months.slice(-3).reverse().map(m => (
                      <button
                        key={m.month}
                        onClick={() => setExpandedMonth(expandedMonth === m.month ? null : m.month)}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                          expandedMonth === m.month ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {formatMonthShort(m.month)}
                      </button>
                    ))}
                  </div>
                </div>
                {expandedMonth && months.find(m => m.month === expandedMonth) ? (
                  <RevenueComboChart dailyRevenue={months.find(m => m.month === expandedMonth)!.dailyRevenue} monthLabel={months.find(m => m.month === expandedMonth)!.label} />
                ) : (
                  <RevenueComboChart dailyRevenue={currentMonth.dailyRevenue} monthLabel={currentMonth.label} />
                )}
              </div>
            )}

            <DataTable days={allDays} expanded={showDataTable} onToggle={() => setShowDataTable(!showDataTable)} />
          </div>

          {/* IP Unbilled Revenue Section */}
          {unbilledData && (
            <div className="bg-white rounded-xl border border-purple-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  IP Unbilled Revenue
                </h2>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  Snapshot: {unbilledData.snapshotDate}
                </span>
              </div>

              {/* Hero Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-purple-600 font-medium">Running Bill</div>
                  <div className="text-xl font-bold text-purple-900">{formatLakhs(unbilledData.totalBillAmt)}</div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-emerald-600 font-medium">Deposits Collected</div>
                  <div className="text-xl font-bold text-emerald-900">{formatLakhs(unbilledData.totalDepositAmt)}</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-red-600 font-medium">Net Due</div>
                  <div className="text-xl font-bold text-red-900">{formatLakhs(unbilledData.totalDueAmt)}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-slate-600 font-medium">IP Count / Dep. Cover</div>
                  <div className="text-xl font-bold text-slate-900">
                    {unbilledData.totalPatients}
                    <span className="text-sm font-normal text-slate-500"> / {unbilledData.totalBillAmt > 0 ? ((unbilledData.totalDepositAmt / unbilledData.totalBillAmt) * 100).toFixed(0) : 0}%</span>
                  </div>
                </div>
              </div>

              {/* Ward Breakdown */}
              {Object.keys(unbilledData.wardBreakdown).length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Ward-wise Breakdown</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-1.5 px-2 text-slate-500 font-medium">Ward</th>
                          <th className="text-right py-1.5 px-2 text-slate-500 font-medium">Patients</th>
                          <th className="text-right py-1.5 px-2 text-slate-500 font-medium">Bill Amt</th>
                          <th className="text-right py-1.5 px-2 text-slate-500 font-medium">Deposits</th>
                          <th className="text-right py-1.5 px-2 text-slate-500 font-medium">Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(unbilledData.wardBreakdown).map(([ward, data]) => (
                          <tr key={ward} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-1.5 px-2 font-medium text-slate-800">{ward}</td>
                            <td className="py-1.5 px-2 text-right text-slate-600">{(data as Record<string, number>).patients}</td>
                            <td className="py-1.5 px-2 text-right text-slate-600">{formatLakhs((data as Record<string, number>).billAmt)}</td>
                            <td className="py-1.5 px-2 text-right text-emerald-600">{formatLakhs((data as Record<string, number>).depositAmt)}</td>
                            <td className="py-1.5 px-2 text-right text-red-600">{formatLakhs((data as Record<string, number>).dueAmt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* High-alert patients */}
              {unbilledData.patientDetails.filter(p => p.billAmt > 200000 || p.los > 5).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
                    <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    Flagged Patients (Bill &gt; 2L or LOS &gt; 5 days)
                  </h3>
                  <div className="space-y-1">
                    {unbilledData.patientDetails
                      .filter(p => p.billAmt > 200000 || p.los > 5)
                      .map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-amber-50 rounded px-3 py-1.5 border border-amber-100">
                          <span className="font-medium text-slate-800">{p.name}</span>
                          <span className="text-slate-500">{p.ward} / {p.bed}</span>
                          <span className="text-slate-600">LOS: {p.los}d</span>
                          <span className="font-medium text-red-700">{formatLakhs(p.billAmt)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Revenue Leakage Log */}
          {allLeakages.length > 0 && (
            <div className="bg-white rounded-xl border border-red-200 p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                Revenue Leakage Log
              </h2>
              <div className="space-y-2">
                {[...allLeakages].reverse().map((alert, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 bg-red-50/50 rounded-lg border border-red-100 hover:bg-red-50 transition-colors cursor-pointer"
                    onClick={() => onNavigateToDashboard(alert.date, 'finance')}
                  >
                    <span className="text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded whitespace-nowrap">{formatDate(alert.date)}</span>
                    <p className="text-sm text-red-800">{alert.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FinanceOverview;
