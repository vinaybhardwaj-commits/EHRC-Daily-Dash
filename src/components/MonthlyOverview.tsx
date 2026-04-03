'use client';

import React, { useState, useEffect } from 'react';
import GlobalIssuesPanel, { type GlobalIssueData } from './GlobalIssuesPanel';
import DepartmentGrid, { type DeptKPIData, type DeptAlertData } from './DepartmentGrid';
import SewaOverviewPanel from './SewaOverviewPanel';
import OverviewHeatmap from './OverviewHeatmap';
import SparklineHeatmap from './SparklineHeatmap';
import DepartmentAccordion from './DepartmentAccordion';
import AIFollowUpBadge from './AIFollowUpBadge';

interface DailyMetric {
  date: string;
  revenue?: number;
  revenueMTD?: number;
  arpob?: number;
  ipCensus?: number;
  admissions?: number;
  surgeriesMTD?: number;
  erCases?: number;
  deaths?: number;
  lama?: number;
  criticalAlerts?: number;
  mlcCases?: number;
  incidentReports?: number;
  submittedDepts?: number;
  totalDepts?: number;
  stockShortages?: number;
  equipmentIssues?: number;
}

interface MonthlyData {
  daysReported: number;
  revenueMTD: number | null;
  latestArpob: number | null;
  latestCensus: number | null;
  surgeriesMTD: number | null;
  avgDailyRevenue: number | null;
  avgCensus: number | null;
  dailyRevenues: { date: string; value: number }[];
  dailyCensus: { date: string; value: number }[];
  dailyAdmissions?: { date: string; value: number }[];
  totalAdmissions?: number;
  totalErCases: number;
  totalDeaths: number;
  totalLama: number;
  totalCriticalAlerts: number;
  totalMlcCases: number;
  totalIncidents: number;
  dailyErCases: { date: string; value: number }[];
  avgSubmissionRate: number;
  daysWithShortages: number;
  daysWithEquipmentIssues: number;
  dailySubmissions: { date: string; submitted: number; total: number }[];
}

interface DeptInfo {
  slug: string;
  name: string;
}

interface TodaySubmission {
  slug: string;
  highlight: string;
}

interface WeekDay {
  date: string;
  slugs: string[];
}

interface HeatmapDay {
  date: string;
  slugs: string[];
}

interface ApiResponse {
  currentMonth: string;
  previousMonth: string;
  current: MonthlyData | null;
  previous: MonthlyData | null;
  availableMonths: string[];
  dailyMetrics: DailyMetric[];
  todayDate: string;
  todaySubmissions: TodaySubmission[];
  weekStartDate: string;
  weekDays: WeekDay[];
  allDepartments: DeptInfo[];
  globalIssues?: GlobalIssueData[];
  departmentKPIs?: DeptKPIData[];
  heatmapData?: HeatmapDay[];
  deptAlerts?: DeptAlertData[];
  historicalAvgRevenues?: { day: number; value: number }[];
  historicalAvgCensus?: { day: number; value: number }[];
  historicalMonthCount?: number;
}

interface Props {
  onNavigateToDashboard: (deptSlug?: string) => void;
  onNavigateToDeptOverview?: (slug: string) => void;
  onNavigateToDashboardWithDate?: (date: string, slug: string) => void;
  sewaKpis?: Record<string, {open: number; newToday: number; breached: number; avgRes: number; blocked: number}>;
}

const MonthlyOverview: React.FC<Props> = ({ onNavigateToDashboard, onNavigateToDeptOverview, onNavigateToDashboardWithDate, sewaKpis }) => {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPulse, setExpandedPulse] = useState<string | null>(null);
  const [expandedSparkline, setExpandedSparkline] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const month = selectedMonth || new Date().toISOString().slice(0, 7);
        const response = await fetch(`/api/overview?month=${month}`);
        if (!response.ok) throw new Error('Failed to fetch data');
        const result: ApiResponse = await response.json();
        setData(result);
        setSelectedMonth(result.currentMonth);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedMonth]);

  const formatIndian = (num: number | null | undefined): string => {
    if (num === null || num === undefined || isNaN(num)) return '\u2014';
    if (num === 0) return '0';
    if (Math.abs(num) >= 10000000) return (num / 10000000).toFixed(2) + ' Cr';
    if (Math.abs(num) >= 100000) return (num / 100000).toFixed(2) + ' L';
    if (Math.abs(num) >= 1000) return (num / 1000).toFixed(1) + ' K';
    return num.toFixed(0);
  };

  const formatMonth = (yearMonth: string): string => {
    const [year, month] = yearMonth.split('-');
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  };

  const formatShortMonth = (yearMonth: string): string => {
    const [, month] = yearMonth.split('-');
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return names[parseInt(month) - 1];
  };

  const pctChange = (current: number | null, previous: number | null): number | null => {
    if (current === null || previous === null || previous === 0) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-slate-400 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !data || !data.current) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-red-600">{error || 'No data available'}</div>
      </div>
    );
  }

  const current = data.current;
  const previous = data.previous;

  // ---- Dual Sparkline: current month (bold) + comparison (faded) ----
  const DualSparkline = ({
    currentData,
    comparisonData,
    color,
    fadedColor,
    gradientId,
    height = 72,
  }: {
    currentData: { date: string; value: number }[];
    comparisonData: { value: number }[];
    color: string;
    fadedColor: string;
    gradientId: string;
    height?: number;
  }) => {
    if (!currentData || currentData.length === 0) return <div className="h-16 bg-gray-50 rounded" />;

    // Combine both datasets to find global min/max
    const currentValues = currentData.map(d => d.value);
    const compValues = comparisonData.map(d => d.value);
    const allValues = [...currentValues, ...compValues].filter(v => v !== undefined);
    const max = Math.max(...allValues);
    const min = Math.min(...allValues);
    const range = max - min || 1;
    const width = 400;
    const padding = 4;

    const toPoints = (values: number[]) => {
      const spacing = (width - padding * 2) / (values.length - 1 || 1);
      return values.map((v, i) => ({
        x: padding + i * spacing,
        y: height - padding - ((v - min) / range) * (height - padding * 2),
      }));
    };

    const toPath = (points: { x: number; y: number }[]) =>
      points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    const currentPoints = toPoints(currentValues);
    const currentPathD = toPath(currentPoints);
    const currentAreaPath = `${currentPathD} L ${currentPoints[currentPoints.length - 1].x} ${height} L ${currentPoints[0].x} ${height} Z`;

    // Comparison line (previous month, same x-spacing as current)
    let compPathD = '';
    if (compValues.length > 0) {
      const compPoints = toPoints(compValues);
      compPathD = toPath(compPoints);
    }

    return (
      <svg width={width} height={height} className="w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Comparison line (faded, behind) */}
        {compPathD && (
          <path d={compPathD} stroke={fadedColor} strokeWidth="1.5" fill="none" strokeDasharray="4,3" opacity="0.5" />
        )}
        {/* Current month area + line */}
        <path d={currentAreaPath} fill={`url(#${gradientId})`} />
        <path d={currentPathD} stroke={color} strokeWidth="2.5" fill="none" />
        {/* Labels */}
        <text x={5} y={13} fontSize="9" fill="#9ca3af">{formatIndian(max)}</text>
        <text x={5} y={height - 2} fontSize="9" fill="#9ca3af">{formatIndian(min)}</text>
      </svg>
    );
  };

  // ---- Full expanded sparkline with historical average ----
  const ExpandedSparkline = ({
    currentData,
    histAvgData,
    color,
    label,
    currentMonthLabel,
    histMonthCount,
  }: {
    currentData: { date: string; value: number }[];
    histAvgData: { day: number; value: number }[];
    color: string;
    label: string;
    currentMonthLabel: string;
    histMonthCount: number;
  }) => {
    if (!currentData || currentData.length === 0) return null;

    const currentValues = currentData.map(d => d.value);
    const histValues = histAvgData.map(d => d.value);
    const allValues = [...currentValues, ...histValues];
    const max = Math.max(...allValues);
    const min = Math.min(...allValues);
    const range = max - min || 1;
    const width = 600;
    const height = 160;
    const padding = 8;
    const leftPad = 50;

    const toPoints = (values: number[], count?: number) => {
      const n = count || values.length;
      const spacing = (width - leftPad - padding) / (n - 1 || 1);
      return values.map((v, i) => ({
        x: leftPad + i * spacing,
        y: height - padding - 20 - ((v - min) / range) * (height - padding * 2 - 20),
      }));
    };

    const toPath = (points: { x: number; y: number }[]) =>
      points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    const maxDays = Math.max(currentValues.length, histValues.length);
    const curPoints = toPoints(currentValues, maxDays);
    const histPoints = toPoints(histValues, maxDays);

    const curAvg = currentValues.reduce((s, v) => s + v, 0) / currentValues.length;
    const histAvg = histValues.length > 0 ? histValues.reduce((s, v) => s + v, 0) / histValues.length : 0;

    return (
      <div className="mt-3 p-3 bg-white rounded-lg border border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-slate-700">{label}: Current vs Historical Average</div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded" style={{ backgroundColor: color }} /> {currentMonthLabel}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded bg-slate-300" style={{ borderTop: '1px dashed #94a3b8' }} /> Avg of {histMonthCount} months</span>
          </div>
        </div>
        <svg width={width} height={height} className="w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
            const y = height - padding - 20 - frac * (height - padding * 2 - 20);
            const val = min + frac * range;
            return (
              <g key={i}>
                <line x1={leftPad} x2={width - padding} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="0.5" />
                <text x={leftPad - 4} y={y + 3} fontSize="8" fill="#94a3b8" textAnchor="end">{formatIndian(val)}</text>
              </g>
            );
          })}
          {/* Historical avg line */}
          {histPoints.length > 0 && (
            <path d={toPath(histPoints)} stroke="#94a3b8" strokeWidth="1.5" fill="none" strokeDasharray="5,4" />
          )}
          {/* Current month line */}
          <path d={toPath(curPoints)} stroke={color} strokeWidth="2.5" fill="none" />
          {/* Day numbers at bottom */}
          {curPoints.filter((_, i) => i % 5 === 0 || i === curPoints.length - 1).map((p, i, arr) => {
            const dayIdx = currentValues.length > 1 ? Math.round((p.x - leftPad) / ((width - leftPad - padding) / (maxDays - 1))) : 0;
            return (
              <text key={i} x={p.x} y={height - 4} fontSize="8" fill="#94a3b8" textAnchor="middle">
                {dayIdx + 1}
              </text>
            );
          })}
        </svg>
        <div className="flex items-center gap-4 mt-1 text-xs">
          <span className="font-medium" style={{ color }}>This month avg: {formatIndian(curAvg)}</span>
          <span className="text-slate-400">Historical avg: {formatIndian(histAvg)}</span>
          {histAvg > 0 && (
            <span className={`font-semibold px-1.5 py-0.5 rounded ${
              curAvg > histAvg ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
            }`}>
              {curAvg > histAvg ? '\u2191' : '\u2193'} {Math.abs(((curAvg - histAvg) / histAvg) * 100).toFixed(1)}%
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderTrendBadge = (currentVal: number | null, prevVal: number | null, invertGood?: boolean) => {
    if (currentVal === null) return null;
    const pct = pctChange(currentVal, prevVal);
    if (pct === null) return <span className="text-[10px] text-slate-400">No prior</span>;
    const isUp = pct > 0;
    const isGood = invertGood ? !isUp : isUp;
    return (
      <span className={`text-xs font-bold ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>
        {isUp ? '\u2191' : '\u2193'} {Math.abs(pct).toFixed(1)}%
      </span>
    );
  };

  // ---- Hero metric cards config ----
  const heroCards = [
    {
      id: 'revenue', label: 'Revenue MTD', value: formatIndian(current.revenueMTD),
      comparison: renderTrendBadge(current.revenueMTD, previous?.revenueMTD || null), color: 'emerald',
      currentVal: current.revenueMTD, prevVal: previous?.revenueMTD ?? null,
      detail: `Daily avg: ${formatIndian(current.avgDailyRevenue)}`,
      prevDetail: previous ? `Last month: ${formatIndian(previous.revenueMTD)}` : null,
      prevAvgDetail: previous?.avgDailyRevenue ? `Daily avg last month: ${formatIndian(previous.avgDailyRevenue)}` : null,
    },
    {
      id: 'admissions', label: 'Admissions MTD', value: current.totalAdmissions ?? '\u2014',
      comparison: renderTrendBadge(current.totalAdmissions ?? null, previous?.totalAdmissions ?? null), color: 'blue',
      currentVal: current.totalAdmissions ?? null, prevVal: previous?.totalAdmissions ?? null,
      detail: `Over ${current.daysReported} days of data`,
      prevDetail: previous?.totalAdmissions !== undefined ? `Last month: ${previous.totalAdmissions} over ${previous.daysReported} days` : null,
    },
    {
      id: 'surgeries', label: 'Surgeries MTD', value: current.surgeriesMTD || '\u2014',
      comparison: renderTrendBadge(current.surgeriesMTD, previous?.surgeriesMTD || null), color: 'purple',
      currentVal: current.surgeriesMTD, prevVal: previous?.surgeriesMTD ?? null,
      detail: `${current.daysReported} days reported`,
      prevDetail: previous?.surgeriesMTD ? `Last month: ${previous.surgeriesMTD}` : null,
      prevAvgDetail: previous ? `Over ${previous.daysReported} days` : null,
    },
    {
      id: 'arpob', label: 'ARPOB', value: formatIndian(current.latestArpob),
      comparison: renderTrendBadge(current.latestArpob, previous?.latestArpob || null), color: 'amber',
      currentVal: current.latestArpob, prevVal: previous?.latestArpob ?? null,
      detail: `Latest value this month`,
      prevDetail: previous?.latestArpob ? `Last month: ${formatIndian(previous.latestArpob)}` : null,
    },
    {
      id: 'er', label: 'ER Cases MTD', value: current.totalErCases || '\u2014',
      comparison: renderTrendBadge(current.totalErCases, previous?.totalErCases || null), color: 'red',
      currentVal: current.totalErCases, prevVal: previous?.totalErCases ?? null,
      detail: `${current.daysReported} days of data`,
      prevDetail: previous ? `Last month: ${previous.totalErCases} over ${previous.daysReported} days` : null,
    },
  ];

  const colorMap: Record<string, { bg: string; border: string; text: string; expandBg: string }> = {
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900', expandBg: 'bg-emerald-50/60' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', expandBg: 'bg-blue-50/60' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900', expandBg: 'bg-purple-50/60' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', expandBg: 'bg-amber-50/60' },
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-900', expandBg: 'bg-red-50/60' },
  };

  // Previous month daily data for sparkline overlay
  const prevDailyRevenues = previous?.dailyRevenues?.map(d => ({ value: d.value })) || [];
  const prevDailyCensus = previous?.dailyCensus?.map(d => ({ value: d.value })) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-6 lg:p-8">
      {/* ===== HEADER ===== */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Even Hospital</h1>
            <p className="text-sm text-slate-500">Race Course Road &mdash; Monthly Overview</p>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {data.availableMonths.map(month => (
                <option key={month} value={month}>{formatMonth(month)}</option>
              ))}
            </select>
            <div className="text-right">
              <div className="text-lg font-bold text-slate-900">{formatMonth(data.currentMonth)}</div>
              <div className="text-xs text-slate-500">{current.daysReported} days of data</div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== SECTION 1: HOSPITAL PULSE ===== */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {heroCards.map((card) => {
          const c = colorMap[card.color];
          const isExpanded = expandedPulse === card.id;
          const pctVal = pctChange(card.currentVal ?? null, card.prevVal ?? null);
          return (
            <div key={card.id} className={`${c.bg} ${c.border} border rounded-xl overflow-hidden transition-all ${
              isExpanded ? 'ring-1 ring-blue-200 shadow-md col-span-2 md:col-span-1' : ''
            }`}>
              <button
                onClick={() => setExpandedPulse(isExpanded ? null : card.id)}
                className="w-full text-left p-3.5 cursor-pointer"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-medium text-slate-600">{card.label}</div>
                  <svg
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                <div className={`text-xl md:text-2xl font-bold ${c.text} leading-tight`}>{card.value}</div>
                <div className="mt-1">{card.comparison}</div>
              </button>
              {isExpanded && (
                <div className={`px-3.5 pb-3.5 pt-0 border-t ${c.border} ${c.expandBg}`}>
                  <div className="space-y-1.5 mt-2">
                    {card.detail && (
                      <div className="text-xs text-slate-600">{card.detail}</div>
                    )}
                    {card.prevDetail && (
                      <div className="text-xs text-slate-500">{card.prevDetail}</div>
                    )}
                    {'prevAvgDetail' in card && card.prevAvgDetail && (
                      <div className="text-xs text-slate-500">{card.prevAvgDetail}</div>
                    )}
                    {pctVal !== null && (
                      <div className={`text-xs font-semibold mt-1 px-2 py-1 rounded-md inline-block ${
                        pctVal > 0 ? 'bg-emerald-100 text-emerald-800' : pctVal < 0 ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {pctVal > 0 ? '\u2191' : '\u2193'} {Math.abs(pctVal).toFixed(1)}% vs last month
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ===== TREND SPARKLINES (clickable, with previous month overlay) ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Revenue Sparkline */}
        <div
          className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all cursor-pointer ${
            expandedSparkline === 'revenue' ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200 hover:border-slate-300'
          }`}
          onClick={() => setExpandedSparkline(expandedSparkline === 'revenue' ? null : 'revenue')}
        >
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-slate-700">Daily Revenue Trend</div>
              <div className="flex items-center gap-2">
                {previous && (
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <span className="w-3 border-t border-dashed border-slate-400" /> {formatShortMonth(data.previousMonth)}
                  </span>
                )}
                <svg
                  className={`w-4 h-4 text-slate-400 transition-transform ${expandedSparkline === 'revenue' ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            <DualSparkline
              currentData={current.dailyRevenues}
              comparisonData={prevDailyRevenues}
              color="#059669"
              fadedColor="#94a3b8"
              gradientId="revGrad"
            />
          </div>
          {expandedSparkline === 'revenue' && data.historicalAvgRevenues && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <ExpandedSparkline
                currentData={current.dailyRevenues}
                histAvgData={data.historicalAvgRevenues}
                color="#059669"
                label="Daily Revenue"
                currentMonthLabel={formatShortMonth(data.currentMonth)}
                histMonthCount={data.historicalMonthCount || 0}
              />
            </div>
          )}
        </div>

        {/* IP Census Sparkline */}
        <div
          className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all cursor-pointer ${
            expandedSparkline === 'census' ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-200 hover:border-slate-300'
          }`}
          onClick={() => setExpandedSparkline(expandedSparkline === 'census' ? null : 'census')}
        >
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-slate-700">IP Census Trend</div>
              <div className="flex items-center gap-2">
                {previous && (
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <span className="w-3 border-t border-dashed border-slate-400" /> {formatShortMonth(data.previousMonth)}
                  </span>
                )}
                <svg
                  className={`w-4 h-4 text-slate-400 transition-transform ${expandedSparkline === 'census' ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            <DualSparkline
              currentData={current.dailyCensus}
              comparisonData={prevDailyCensus}
              color="#1d4ed8"
              fadedColor="#94a3b8"
              gradientId="censusGrad"
            />
          </div>
          {expandedSparkline === 'census' && data.historicalAvgCensus && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <ExpandedSparkline
                currentData={current.dailyCensus}
                histAvgData={data.historicalAvgCensus}
                color="#1d4ed8"
                label="IP Census"
                currentMonthLabel={formatShortMonth(data.currentMonth)}
                histMonthCount={data.historicalMonthCount || 0}
              />
            </div>
          )}
        </div>
      </div>

      {/* ===== SECTION 2: GLOBAL ISSUES ===== */}
      {data.globalIssues && data.globalIssues.length > 0 && (
        <div className="mb-6">
          <GlobalIssuesPanel issues={data.globalIssues} currentMonth={data.currentMonth} previousMonth={data.previousMonth} onNavigateToDashboard={onNavigateToDashboardWithDate} />
        </div>
      )}

      {/* ===== AI FOLLOW-UPS BADGE ===== */}
      <AIFollowUpBadge month={selectedMonth} />

      {/* ===== SECTION 3: DEPARTMENT GRID ===== */}
      {data.departmentKPIs && data.departmentKPIs.length > 0 && (
        <div className="mb-6">
          <DepartmentGrid
            departments={data.departmentKPIs}
            deptAlerts={data.deptAlerts}
            sewaKpis={sewaKpis}
            onNavigateToDept={(slug) => onNavigateToDashboard(slug)}
            onNavigateToDashboard={onNavigateToDashboardWithDate}
            currentMonth={data.currentMonth}
            previousMonth={data.previousMonth}
            latestDate={data.todayDate}
          />
        </div>
      )}

      {/* ===== SEWA SERVICE REQUESTS ===== */}
      <div className="mb-6">
        <SewaOverviewPanel />
      </div>

      {/* ===== SECTION 4: SUBMISSION HEATMAP + FORM ANALYTICS ===== */}
      {data.heatmapData && data.allDepartments && (
        <div className="mb-6 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <SparklineHeatmap
            heatmapData={data.heatmapData}
            departments={data.allDepartments.map((d: { slug: string; name: string }) => ({ slug: d.slug, label: d.name }))}
            currentMonth={data.currentMonth}
          />
        </div>
      )}

      {/* ===== SECTION 5: DEPARTMENT DEEP DIVES ===== */}
      {data.departmentKPIs && data.departmentKPIs.length > 0 && (
        <DepartmentAccordion
          departments={data.departmentKPIs}
          onNavigateToDashboard={onNavigateToDashboardWithDate || ((date, slug) => {
            onNavigateToDashboard(slug);
          })}
        />
      )}

      {/* Action Button */}
      <div className="flex justify-center pt-2 pb-4">
        <button
          onClick={() => onNavigateToDashboard()}
          className="px-8 py-3 bg-gradient-to-r from-blue-700 to-blue-800 text-white font-semibold rounded-xl hover:from-blue-800 hover:to-blue-900 transition-all shadow-lg hover:shadow-xl"
        >
          View Daily Details Dashboard
        </button>
      </div>
    </div>
  );
};

export default MonthlyOverview;
