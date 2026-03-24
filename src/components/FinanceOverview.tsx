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
}

interface Props {
  onBack: () => void;
  onNavigateToDashboard: (date: string, slug: string) => void;
}

// ── Formatting Helpers ───────────────────────────────────────────────

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

function pctChange(current: number | null, previous: number | null): { value: number; label: string; positive: boolean } | null {
  if (current === null || previous === null || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
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
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
              {/* Delta annotation */}
              {change && (
                <span className={`text-[9px] font-medium mb-0.5 ${change.positive ? 'text-emerald-600' : 'text-red-500'}`}>
                  {change.label}
                </span>
              )}
              {/* Value */}
              <span className="text-[10px] text-slate-500 mb-1">
                {d.value !== null ? formatValue(d.value) : '—'}
              </span>
              {/* Bar */}
              <div
                className="w-full max-w-[32px] rounded-t transition-all"
                style={{ height: `${Math.max(barH, 2)}px`, backgroundColor: color, opacity: d.value !== null ? 1 : 0.2 }}
              />
              {/* Label */}
              <span className="text-[9px] text-slate-400 mt-1 whitespace-nowrap">{formatMonthShort(d.month)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Line Chart with Range Band ───────────────────────────────────────

function LineChartWithBand({ data, avgLine, color = '#3b82f6', bandColor = '#dbeafe', formatY, height = 220, title }: {
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
  const px = 60; // left padding for labels
  const pt = 10;
  const pb = 30;
  const pr = 20;
  const chartW = w - px - pr;
  const chartH = h - pt - pb;

  const scaleX = (i: number) => px + (i / (data.length - 1)) * chartW;
  const scaleY = (v: number) => pt + chartH - ((v - yMin) / yRange) * chartH;

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${scaleX(i)},${scaleY(d.value)}`).join(' ');

  // Avg band (±10%)
  const avgVal = avgLine ?? values.reduce((a, b) => a + b, 0) / values.length;
  const bandTop = scaleY(avgVal * 1.1);
  const bandBottom = scaleY(avgVal * 0.9);

  // Y-axis ticks (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (yRange / 4) * i);

  // X-axis labels (show ~6 dates)
  const step = Math.max(1, Math.floor(data.length / 6));
  const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: `${h}px` }}>
        {/* Band */}
        <rect x={px} y={bandTop} width={chartW} height={bandBottom - bandTop} fill={bandColor} rx="2" />
        {/* Avg line */}
        <line x1={px} y1={scaleY(avgVal)} x2={px + chartW} y2={scaleY(avgVal)} stroke={color} strokeWidth="1" strokeDasharray="4,3" opacity="0.4" />
        {/* Y ticks */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={px} y1={scaleY(t)} x2={px + chartW} y2={scaleY(t)} stroke="#e2e8f0" strokeWidth="0.5" />
            <text x={px - 6} y={scaleY(t) + 3} textAnchor="end" className="text-[10px]" fill="#94a3b8">{formatY(t)}</text>
          </g>
        ))}
        {/* Data line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots for first and last */}
        <circle cx={scaleX(0)} cy={scaleY(data[0].value)} r="3" fill={color} />
        <circle cx={scaleX(data.length - 1)} cy={scaleY(data[data.length - 1].value)} r="3" fill={color} />
        {/* X labels */}
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

// ── Revenue Combo Chart (daily bars + MTD line) ──────────────────────

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
        <span className="text-sm font-semibold text-slate-700">
          Detailed Data Table ({days.length} days)
        </span>
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

const FinanceOverview: React.FC<Props> = ({ onBack, onNavigateToDashboard }) => {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<{ from: string; to: string } | null>(null);
  const [showDataTable, setShowDataTable] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

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

  const { summary, months, monthlyRevenueMTD, monthlySurgeries, monthlyAvgCensus, monthlyAvgArpob, allDays } = data;
  const currentMonth = months.length > 0 ? months[months.length - 1] : null;
  const prevMonth = months.length > 1 ? months[months.length - 2] : null;

  // Collect all leakage alerts across all months
  const allLeakages = months.flatMap(m => m.leakageAlerts);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Finance Department Overview</h1>
            <p className="text-sm text-slate-500">
              {summary.dateRange
                ? `${formatDate(summary.dateRange.from)} — ${formatDate(summary.dateRange.to)} · ${summary.totalDaysReported} days of data`
                : 'No data yet'
              }
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

      {/* ═══ LAYER 1: ALL-TIME SUMMARY HERO CARDS ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Revenue MTD */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Revenue MTD</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{formatIndian(summary.latestRevenueMTD)}</p>
          {prevMonth && currentMonth && (
            <MoMBadge current={currentMonth.revenueMTD} previous={prevMonth.revenueMTD} />
          )}
          <div className="mt-2">
            <Sparkline data={summary.revenueSparkline} color="#3b82f6" width={100} height={24} />
          </div>
        </div>

        {/* ARPOB */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Avg ARPOB</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{formatIndian(summary.latestArpob)}</p>
          {prevMonth && currentMonth && (
            <MoMBadge current={currentMonth.avgArpob} previous={prevMonth.avgArpob} />
          )}
          <div className="mt-2">
            <Sparkline data={summary.arpobSparkline} color="#8b5cf6" width={100} height={24} />
          </div>
        </div>

        {/* IP Census */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Avg IP Census</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{summary.latestCensus !== null ? Math.round(summary.latestCensus).toString() : '—'}</p>
          {prevMonth && currentMonth && (
            <MoMBadge current={currentMonth.avgCensus} previous={prevMonth.avgCensus} />
          )}
          <div className="mt-2">
            <Sparkline data={summary.censusSparkline} color="#f59e0b" width={100} height={24} />
          </div>
        </div>

        {/* Surgeries MTD */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Surgeries MTD</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{summary.latestSurgeriesMTD !== null ? formatNumber(summary.latestSurgeriesMTD) : '—'}</p>
          {prevMonth && currentMonth && (
            <MoMBadge current={currentMonth.surgeriesMTD} previous={prevMonth.surgeriesMTD} />
          )}
          <div className="mt-2">
            <Sparkline data={summary.surgeriesSparkline} color="#10b981" width={100} height={24} />
          </div>
        </div>

        {/* Revenue Leakage */}
        <div className={`bg-white rounded-xl border p-4 shadow-sm ${summary.totalLeakageAlerts > 0 ? 'border-red-200' : 'border-slate-200'}`}>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Leakage Alerts</p>
          <p className={`text-xl font-bold mt-1 ${summary.totalLeakageAlerts > 0 ? 'text-red-600' : 'text-slate-900'}`}>
            {summary.totalLeakageAlerts}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">all-time incidents</p>
          {summary.totalLeakageAlerts > 0 && (
            <div className="mt-2">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600 border border-red-100">
                {allLeakages.length > 0 ? `Latest: ${formatDate(allLeakages[allLeakages.length - 1].date)}` : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ═══ LAYER 2: TREND CHARTS ═══ */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Trends & Progression</h2>

        {/* Revenue MTD — Monthly Bars */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Revenue MTD by Month</h3>
            <span className="text-[10px] text-slate-400">Month-over-month comparison</span>
          </div>
          <BarChart
            data={monthlyRevenueMTD}
            color="#3b82f6"
            formatValue={(n) => {
              if (n >= 10000000) return (n / 10000000).toFixed(1) + 'Cr';
              if (n >= 100000) return (n / 100000).toFixed(1) + 'L';
              return (n / 1000).toFixed(0) + 'K';
            }}
          />
        </div>

        {/* ARPOB — Line Chart with Band */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">ARPOB Trend (Daily)</h3>
            <span className="text-[10px] text-slate-400">Avg Revenue Per Occupied Bed · Band = ±10% of mean</span>
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

        {/* IP Census + Surgeries — Side by Side Monthly Bars */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700">Avg IP Census by Month</h3>
            </div>
            <BarChart
              data={monthlyAvgCensus}
              color="#f59e0b"
              formatValue={(n) => n.toString()}
              height={160}
            />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700">Surgeries MTD by Month</h3>
            </div>
            <BarChart
              data={monthlySurgeries}
              color="#10b981"
              formatValue={(n) => n.toString()}
              height={160}
            />
          </div>
        </div>

        {/* Per-Month Daily Revenue Breakdown (expandable) */}
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
                      expandedMonth === m.month
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {formatMonthShort(m.month)}
                  </button>
                ))}
              </div>
            </div>
            {expandedMonth && months.find(m => m.month === expandedMonth) && (
              <RevenueComboChart
                dailyRevenue={months.find(m => m.month === expandedMonth)!.dailyRevenue}
                monthLabel={months.find(m => m.month === expandedMonth)!.label}
              />
            )}
            {!expandedMonth && (
              <RevenueComboChart
                dailyRevenue={currentMonth.dailyRevenue}
                monthLabel={currentMonth.label}
              />
            )}
          </div>
        )}

        {/* Data Table */}
        <DataTable
          days={allDays}
          expanded={showDataTable}
          onToggle={() => setShowDataTable(!showDataTable)}
        />
      </div>

      {/* ═══ LAYER 3: REVENUE LEAKAGE LOG ═══ */}
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
                <span className="text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded whitespace-nowrap">
                  {formatDate(alert.date)}
                </span>
                <p className="text-sm text-red-800">{alert.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Small Helper Components ──────────────────────────────────────────

function MoMBadge({ current, previous }: { current: number | null; previous: number | null }) {
  const change = pctChange(current, previous);
  if (!change) return null;
  return (
    <span className={`inline-flex items-center text-[10px] font-medium mt-0.5 ${change.positive ? 'text-emerald-600' : 'text-red-500'}`}>
      {change.positive ? '↑' : '↓'} {change.label} vs prev
    </span>
  );
}

export default FinanceOverview;
