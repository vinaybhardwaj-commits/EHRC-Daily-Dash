'use client';

import React, { useState, useEffect } from 'react';

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

interface ApiResponse {
  currentMonth: string;
  previousMonth: string;
  current: MonthlyData | null;
  previous: MonthlyData | null;
  availableMonths: string[];
  dailyMetrics: DailyMetric[];
}

interface Props {
  onNavigateToDashboard: () => void;
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
    if (num === null || num === undefined || isNaN(num)) return '—';
    if (num === 0) return '0';

    if (Math.abs(num) >= 10000000) {
      return (num / 10000000).toFixed(2) + ' Cr';
    } else if (Math.abs(num) >= 100000) {
      return (num / 100000).toFixed(2) + ' L';
    } else if (Math.abs(num) >= 1000) {
      return (num / 1000).toFixed(1) + ' K';
    }
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
        <div className="text-lg text-gray-600">Loading dashboard...</div>
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

  const renderComparisonBadge = (currentVal: number | null, prevVal: number | null) => {
    if (currentVal === null) return null;
    const pct = pctChange(currentVal, prevVal);
    if (pct === null) return <span className="text-xs text-gray-400">No prior data</span>;

    const isPositive = pct > 0;
    const bgColor = isPositive ? 'bg-emerald-100' : 'bg-red-100';
    const textColor = isPositive ? 'text-emerald-700' : 'text-red-700';
    const arrow = isPositive ? '↑' : '↓';

    return (
      <span className={`text-xs font-semibold ${textColor} ${bgColor} px-2 py-1 rounded`}>
        {arrow} {Math.abs(pct).toFixed(1)}%
      </span>
    );
  };

  const SparklineRevenue = ({ data }: { data: { date: string; value: number }[] }) => {
    if (!data || data.length === 0) return <div className="h-12 bg-gray-50 rounded" />;

    const values = data.map(d => d.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;

    const width = 300;
    const height = 60;
    const padding = 4;
    const pointSpacing = (width - padding * 2) / (values.length - 1 || 1);

    const points = values.map((v, i) => {
      const x = padding + i * pointSpacing;
      const y = height - padding - ((v - min) / range) * (height - padding * 2);
      return { x, y, value: v };
    });

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

    return (
      <svg width={width} height={height} className="w-full">
        <defs>
          <linearGradient id="revenueGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#revenueGrad)" />
        <path d={pathD} stroke="#059669" strokeWidth="2" fill="none" />
        <text x={5} y={15} fontSize="10" fill="#6b7280">{formatIndian(max)}</text>
        <text x={5} y={height - 2} fontSize="10" fill="#6b7280">{formatIndian(min)}</text>
      </svg>
    );
  };

  const SparklineCensus = ({ data }: { data: { date: string; value: number }[] }) => {
    if (!data || data.length === 0) return <div className="h-12 bg-gray-50 rounded" />;

    const values = data.map(d => d.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;

    const width = 300;
    const height = 60;
    const padding = 4;
    const pointSpacing = (width - padding * 2) / (values.length - 1 || 1);

    const points = values.map((v, i) => {
      const x = padding + i * pointSpacing;
      const y = height - padding - ((v - min) / range) * (height - padding * 2);
      return { x, y, value: v };
    });

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

    return (
      <svg width={width} height={height} className="w-full">
        <defs>
          <linearGradient id="censusGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#censusGrad)" />
        <path d={pathD} stroke="#1d4ed8" strokeWidth="2" fill="none" />
        <text x={5} y={15} fontSize="10" fill="#6b7280">{Math.round(max)}</text>
        <text x={5} y={height - 2} fontSize="10" fill="#6b7280">{Math.round(min)}</text>
      </svg>
    );
  };

  const SubmissionSparkline = ({ data }: { data: { date: string; submitted: number; total: number }[] }) => {
    if (!data || data.length === 0) return <div className="h-12 bg-gray-50 rounded" />;

    const values = data.map(d => d.submitted);
    const max = Math.max(...values);

    const width = 250;
    const height = 60;
    const padding = 4;
    const barWidth = (width - padding * 2) / values.length;

    const bars = values.map((v, i) => {
      const x = padding + i * barWidth;
      const barHeight = max > 0 ? (v / max) * (height - padding * 2) : 0;
      const y = height - padding - barHeight;
      return { x, y, height: barHeight, value: v };
    });

    return (
      <svg width={width} height={height} className="w-full">
        {bars.map((bar, i) => (
          <rect
            key={i}
            x={bar.x}
            y={bar.y}
            width={barWidth - 1}
            height={bar.height}
            fill={bar.value > 14 ? '#3b82f6' : bar.value > 10 ? '#f59e0b' : '#ef4444'}
            opacity="0.7"
          />
        ))}
      </svg>
    );
  };

  const DailySubmissionChart = ({ data }: { data: { date: string; submitted: number; total: number }[] }) => {
    if (!data) return null;

    const daysInMonth = data.length;
    const chartWidth = Math.max(400, daysInMonth * 12);
    const chartHeight = 80;
    const padding = 8;
    const barWidth = 10;
    const spacing = (chartWidth - padding * 2) / daysInMonth;

    return (
      <svg width={chartWidth} height={chartHeight} className="w-full overflow-x-auto">
        {data.map((d, i) => {
          const submitted = d.submitted || 0;
          const barHeight = (submitted / 17) * (chartHeight - padding * 2 - 10);
          const x = padding + i * spacing + spacing / 2 - barWidth / 2;
          const y = chartHeight - padding - 10 - barHeight;

          let color = '#e5e7eb';
          if (submitted === 0) color = '#e5e7eb';
          else if (submitted > 14) color = '#10b981';
          else if (submitted >= 10) color = '#f59e0b';
          else color = '#ef4444';

          return (
            <g key={i}>
              <rect x={x} y={y} width={barWidth} height={barHeight} fill={color} />
              <text x={x + barWidth / 2} y={chartHeight - 2} fontSize="8" textAnchor="middle" fill="#9ca3af">
                {i + 1}
              </text>
            </g>
          );
        })}
        <line x1={padding} y1={chartHeight - 10} x2={chartWidth - padding} y2={chartHeight - 10} stroke="#d1d5db" strokeWidth="1" />
        <text x={5} y={chartHeight - 15} fontSize="9" fill="#6b7280">0</text>
        <text x={5} y={15} fontSize="9" fill="#6b7280">17</text>
      </svg>
    );
  };

  const metricCards = [
    {
      label: 'Revenue MTD',
      value: formatIndian(current.revenueMTD),
      comparison: renderComparisonBadge(current.revenueMTD, previous?.revenueMTD || null),
      color: 'emerald',
      icon: '₹',
    },
    {
      label: 'IP Census',
      value: Math.round(current.latestCensus || 0),
      subtitle: `Avg: ${current.avgCensus ? Math.round(current.avgCensus) : '—'}`,
      comparison: renderComparisonBadge(current.latestCensus, previous?.latestCensus || null),
      color: 'blue',
      icon: '👥',
    },
    {
      label: 'Surgeries MTD',
      value: current.surgeriesMTD || '—',
      comparison: renderComparisonBadge(current.surgeriesMTD, previous?.surgeriesMTD || null),
      color: 'purple',
      icon: '⚕️',
    },
    {
      label: 'ARPOB',
      value: formatIndian(current.latestArpob),
      comparison: renderComparisonBadge(current.latestArpob, previous?.latestArpob || null),
      color: 'amber',
      icon: '📊',
    },
    {
      label: 'ER Cases',
      value: current.totalErCases || '—',
      comparison: renderComparisonBadge(current.totalErCases, previous?.totalErCases || null),
      color: 'red',
      icon: '🚨',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 md:p-8">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
              Even Hospital
            </h1>
            <p className="text-lg text-gray-600">Race Course Road</p>
          </div>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 font-medium hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {data.availableMonths.map(month => (
                <option key={month} value={month}>
                  {formatMonth(month)}
                </option>
              ))}
            </select>
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900">
                {formatMonth(data.currentMonth)}
              </div>
              <div className="text-sm text-gray-600">
                {current.daysReported} days of data
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hero Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {metricCards.map((card, idx) => {
          const bgClass = {
            emerald: 'bg-emerald-50 border-emerald-200',
            blue: 'bg-blue-50 border-blue-200',
            purple: 'bg-purple-50 border-purple-200',
            amber: 'bg-amber-50 border-amber-200',
            red: 'bg-red-50 border-red-200',
          }[card.color];

          const textClass = {
            emerald: 'text-emerald-900',
            blue: 'text-blue-900',
            purple: 'text-purple-900',
            amber: 'text-amber-900',
            red: 'text-red-900',
          }[card.color];

          return (
            <div key={idx} className={`${bgClass} border rounded-lg p-4`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">{card.label}</span>
                <span className="text-xl">{card.icon}</span>
              </div>
              <div className={`text-2xl font-bold ${textClass} mb-1`}>
                {card.value}
              </div>
              {card.subtitle && <div className="text-xs text-gray-600 mb-2">{card.subtitle}</div>}
              <div className="text-xs">{card.comparison}</div>
            </div>
          );
        })}
      </div>

      {/* Two-Column Trend Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="text-emerald-600">📈</span> Revenue Trend
          </h3>
          <SparklineRevenue data={current.dailyRevenues} />
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="text-blue-600">📊</span> IP Census Trend
          </h3>
          <SparklineCensus data={current.dailyCensus} />
        </div>
      </div>

      {/* Three-Column Summary Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Financial Summary */}
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg shadow p-6 border border-emerald-200">
          <h3 className="text-lg font-bold text-emerald-900 mb-4">Financial Summary</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center pb-2 border-b border-emerald-200">
              <span className="text-emerald-800">Revenue MTD</span>
              <span className="font-bold text-emerald-900">{formatIndian(current.revenueMTD)}</span>
            </div>
            {previous && (
              <div className="flex justify-between items-center text-xs text-emerald-700">
                <span>vs Previous Month</span>
                <span>{formatIndian(previous.revenueMTD)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pb-2 border-b border-emerald-200">
              <span className="text-emerald-800">Avg Daily Revenue</span>
              <span className="font-bold text-emerald-900">{formatIndian(current.avgDailyRevenue)}</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-emerald-200">
              <span className="text-emerald-800">ARPOB</span>
              <span className="font-bold text-emerald-900">{formatIndian(current.latestArpob)}</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-emerald-200">
              <span className="text-emerald-800">Surgeries MTD</span>
              <span className="font-bold text-emerald-900">{current.surgeriesMTD || '—'}</span>
            </div>
            <div className="flex justify-between items-center text-xs text-emerald-700 pt-2">
              <span>Days Reporting</span>
              <span className="font-semibold">{current.daysReported}</span>
            </div>
          </div>
        </div>

        {/* Clinical & Patient Safety */}
        <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-lg shadow p-6 border border-rose-200">
          <h3 className="text-lg font-bold text-rose-900 mb-4">Clinical & Patient Safety</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center pb-2 border-b border-rose-200">
              <span className="text-rose-800">ER Cases</span>
              <span className="font-bold text-rose-900">{current.totalErCases || '—'}</span>
            </div>
            <div className={`flex justify-between items-center pb-2 border-b border-rose-200 ${current.totalDeaths > 0 ? 'text-rose-900' : 'text-emerald-700'}`}>
              <span className={current.totalDeaths > 0 ? 'text-rose-800' : 'text-emerald-800'}>Deaths</span>
              <span className={`font-bold px-2 py-1 rounded text-xs ${
                current.totalDeaths === 0
                  ? 'bg-emerald-200 text-emerald-900'
                  : 'bg-rose-200 text-rose-900'
              }`}>
                {current.totalDeaths}
              </span>
            </div>
            <div className={`flex justify-between items-center pb-2 border-b border-rose-200 ${current.totalLama > 0 ? 'text-amber-900' : 'text-emerald-700'}`}>
              <span className={current.totalLama > 0 ? 'text-rose-800' : 'text-emerald-800'}>LAMA/DAMA</span>
              <span className={`font-bold px-2 py-1 rounded text-xs ${
                current.totalLama === 0
                  ? 'bg-emerald-200 text-emerald-900'
                  : 'bg-amber-200 text-amber-900'
              }`}>
                {current.totalLama}
              </span>
            </div>
            <div className={`flex justify-between items-center pb-2 border-b border-rose-200 ${current.totalCriticalAlerts > 0 ? 'text-amber-900' : 'text-emerald-700'}`}>
              <span className={current.totalCriticalAlerts > 0 ? 'text-rose-800' : 'text-emerald-800'}>Critical Alerts</span>
              <span className={`font-bold px-2 py-1 rounded text-xs ${
                current.totalCriticalAlerts === 0
                  ? 'bg-emerald-200 text-emerald-900'
                  : 'bg-amber-200 text-amber-900'
              }`}>
                {current.totalCriticalAlerts}
              </span>
            </div>
            <div className={`flex justify-between items-center pb-2 border-b border-rose-200 ${current.totalMlcCases > 0 ? 'text-amber-900' : 'text-emerald-700'}`}>
              <span className={current.totalMlcCases > 0 ? 'text-rose-800' : 'text-emerald-800'}>MLC Cases</span>
              <span className={`font-bold px-2 py-1 rounded text-xs ${
                current.totalMlcCases === 0
                  ? 'bg-emerald-200 text-emerald-900'
                  : 'bg-amber-200 text-amber-900'
              }`}>
                {current.totalMlcCases}
              </span>
            </div>
            <div className={`flex justify-between items-center text-xs ${current.totalIncidents > 0 ? 'text-amber-900' : 'text-emerald-700'}`}>
              <span className={current.totalIncidents > 0 ? 'text-rose-800' : 'text-emerald-800'}>Incident Reports</span>
              <span className={`font-semibold px-2 py-1 rounded ${
                current.totalIncidents === 0
                  ? 'bg-emerald-200 text-emerald-900'
                  : 'bg-amber-200 text-amber-900'
              }`}>
                {current.totalIncidents}
              </span>
            </div>
          </div>
        </div>

        {/* Operational Compliance */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg shadow p-6 border border-blue-200">
          <h3 className="text-lg font-bold text-blue-900 mb-4">Operational Compliance</h3>
          <div className="space-y-3 text-sm">
            <div className="pb-2 border-b border-blue-200">
              <div className="flex justify-between items-center mb-2">
                <span className="text-blue-800">Dept Submissions</span>
                <span className="font-bold text-blue-900">{current.avgSubmissionRate.toFixed(1)}/17</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${(current.avgSubmissionRate / 17) * 100}%` }}
                />
              </div>
            </div>
            <div className="pb-2">
              <span className="text-blue-800 text-xs">Submission Trend</span>
              <SubmissionSparkline data={current.dailySubmissions} />
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-blue-200">
              <span className="text-blue-800">Stock Shortages</span>
              <span className={`font-bold px-2 py-1 rounded text-xs ${
                current.daysWithShortages === 0
                  ? 'bg-emerald-200 text-emerald-900'
                  : 'bg-amber-200 text-amber-900'
              }`}>
                {current.daysWithShortages} days
              </span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-blue-200">
              <span className="text-blue-800">Equipment Issues</span>
              <span className={`font-bold px-2 py-1 rounded text-xs ${
                current.daysWithEquipmentIssues === 0
                  ? 'bg-emerald-200 text-emerald-900'
                  : 'bg-amber-200 text-amber-900'
              }`}>
                {current.daysWithEquipmentIssues} days
              </span>
            </div>
            <div className="flex justify-between items-center text-xs text-blue-700 pt-2">
              <span>Overall Compliance</span>
              <span className="font-semibold">
                {((current.avgSubmissionRate / 17) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Submission Chart */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-8">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-indigo-600">📋</span> Daily Department Submissions
        </h3>
        <div className="text-xs text-gray-600 mb-3">
          <span className="inline-block bg-emerald-200 px-2 py-1 rounded mr-2">Green: {'>'} 14</span>
          <span className="inline-block bg-amber-200 px-2 py-1 rounded mr-2">Amber: 10-14</span>
          <span className="inline-block bg-red-200 px-2 py-1 rounded mr-2">Red: {'<'} 10</span>
          <span className="inline-block bg-gray-200 px-2 py-1 rounded">Gray: No data</span>
        </div>
        <div className="overflow-x-auto">
          <DailySubmissionChart data={current.dailySubmissions} />
        </div>
      </div>

      {/* Action Button */}
      <div className="flex justify-center">
        <button
          onClick={onNavigateToDashboard}
          className="px-8 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-semibold rounded-lg hover:from-emerald-700 hover:to-emerald-800 transition-all shadow-lg hover:shadow-xl"
        >
          View Daily Details Dashboard
        </button>
      </div>
    </div>
  );
};

export default MonthlyOverview;
