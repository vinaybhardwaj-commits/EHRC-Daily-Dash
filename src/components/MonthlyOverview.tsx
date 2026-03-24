'use client';

import React, { useState, useEffect } from 'react';
import GlobalIssuesPanel, { type GlobalIssueData } from './GlobalIssuesPanel';
import DepartmentGrid, { type DeptKPIData, type DeptAlertData } from './DepartmentGrid';
import OverviewHeatmap from './OverviewHeatmap';

interface DailyMetric {
  date: string;
  revenue?: number;
  revenueMTD?: number;
  arpob?: number;
  ipCensus?: number;
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
  // New fields
  globalIssues?: GlobalIssueData[];
  departmentKPIs?: DeptKPIData[];
  heatmapData?: HeatmapDay[];
  deptAlerts?: DeptAlertData[];
}

interface Props {
  onNavigateToDashboard: (deptSlug?: string) => void;
}

const MonthlyOverview: React.FC<Props> = ({ onNavigateToDashboard }) => {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // ---- Sparkline components ----
  const Sparkline = ({ dataPoints, color, gradientId }: { dataPoints: { date: string; value: number }[]; color: string; gradientId: string }) => {
    if (!dataPoints || dataPoints.length === 0) return <div className="h-12 bg-gray-50 rounded" />;
    const values = dataPoints.map(d => d.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const width = 300;
    const height = 56;
    const padding = 4;
    const pointSpacing = (width - padding * 2) / (values.length - 1 || 1);
    const points = values.map((v, i) => ({
      x: padding + i * pointSpacing,
      y: height - padding - ((v - min) / range) * (height - padding * 2),
    }));
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;
    return (
      <svg width={width} height={height} className="w-full">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={pathD} stroke={color} strokeWidth="2" fill="none" />
        <text x={5} y={13} fontSize="9" fill="#9ca3af">{formatIndian(max)}</text>
        <text x={5} y={height - 2} fontSize="9" fill="#9ca3af">{formatIndian(min)}</text>
      </svg>
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
    { label: 'Revenue MTD', value: formatIndian(current.revenueMTD), comparison: renderTrendBadge(current.revenueMTD, previous?.revenueMTD || null), color: 'emerald' },
    { label: 'IP Census', value: current.latestCensus ? Math.round(current.latestCensus) : '\u2014', subtitle: `Avg: ${current.avgCensus ? Math.round(current.avgCensus) : '\u2014'}`, comparison: renderTrendBadge(current.latestCensus, previous?.latestCensus || null), color: 'blue' },
    { label: 'Surgeries MTD', value: current.surgeriesMTD || '\u2014', comparison: renderTrendBadge(current.surgeriesMTD, previous?.surgeriesMTD || null), color: 'purple' },
    { label: 'ARPOB', value: formatIndian(current.latestArpob), comparison: renderTrendBadge(current.latestArpob, previous?.latestArpob || null), color: 'amber' },
    { label: 'ER Cases MTD', value: current.totalErCases || '\u2014', comparison: renderTrendBadge(current.totalErCases, previous?.totalErCases || null), color: 'red' },
  ];

  const colorMap: Record<string, { bg: string; border: string; text: string }> = {
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900' },
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-900' },
  };

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
        {heroCards.map((card, idx) => {
          const c = colorMap[card.color];
          return (
            <div key={idx} className={`${c.bg} ${c.border} border rounded-xl p-3.5`}>
              <div className="text-xs font-medium text-slate-600 mb-1">{card.label}</div>
              <div className={`text-xl md:text-2xl font-bold ${c.text} leading-tight`}>{card.value}</div>
              {'subtitle' in card && card.subtitle && <div className="text-[10px] text-slate-500 mt-0.5">{card.subtitle}</div>}
              <div className="mt-1">{card.comparison}</div>
            </div>
          );
        })}
      </div>

      {/* Trend sparklines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="text-sm font-semibold text-slate-700 mb-2">Daily Revenue Trend</div>
          <Sparkline dataPoints={current.dailyRevenues} color="#059669" gradientId="revGrad" />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="text-sm font-semibold text-slate-700 mb-2">IP Census Trend</div>
          <Sparkline dataPoints={current.dailyCensus} color="#1d4ed8" gradientId="censusGrad" />
        </div>
      </div>

      {/* ===== SECTION 2: GLOBAL ISSUES ===== */}
      {data.globalIssues && data.globalIssues.length > 0 && (
        <div className="mb-6">
          <GlobalIssuesPanel issues={data.globalIssues} />
        </div>
      )}

      {/* ===== SECTION 3: DEPARTMENT GRID ===== */}
      {data.departmentKPIs && data.departmentKPIs.length > 0 && (
        <div className="mb-6">
          <DepartmentGrid
            departments={data.departmentKPIs}
            deptAlerts={data.deptAlerts}
            onNavigateToDept={(slug) => onNavigateToDashboard(slug)}
          />
        </div>
      )}

      {/* ===== SECTION 4: SUBMISSION HEATMAP ===== */}
      {data.heatmapData && data.allDepartments && (
        <div className="mb-6">
          <OverviewHeatmap
            heatmapData={data.heatmapData}
            allDepartments={data.allDepartments}
            currentMonth={data.currentMonth}
          />
        </div>
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
