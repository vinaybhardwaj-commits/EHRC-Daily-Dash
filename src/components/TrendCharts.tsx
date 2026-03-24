'use client';

import { DaySnapshot } from '@/lib/types';

interface Props {
  snapshots: DaySnapshot[];
}

function extractNumeric(val: string | number | undefined): number | null {
  if (val === undefined || val === '') return null;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[,\sâ¹Rs.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

interface ChartDataPoint {
  date: string;
  value: number;
}

function getDeptFieldTrend(snapshots: DaySnapshot[], deptSlug: string, fieldName: string): ChartDataPoint[] {
  return snapshots
    .map(snapshot => {
      const dept = snapshot.departments.find(d => d.slug === deptSlug);
      if (!dept?.entries.length) return null;
      const val = extractNumeric(dept.entries[dept.entries.length - 1].fields[fieldName]);
      return val !== null ? { date: snapshot.date, value: val } : null;
    })
    .filter((item): item is ChartDataPoint => item !== null);
}

function SimpleLineChart({ data, label, color }: { data: ChartDataPoint[]; label: string; color: string }) {
  if (data.length === 0) return null;

  const width = 320;
  const height = 140;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const minVal = Math.min(...data.map(d => d.value));
  const maxVal = Math.max(...data.map(d => d.value));
  const range = maxVal - minVal || 1;

  const points = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1 || 1)) * plotWidth;
    const y = height - padding.bottom - ((d.value - minVal) / range) * plotHeight;
    return { x, y, ...d };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // Area fill
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`;

  const latestValue = data[data.length - 1].value;
  const prevValue = data.length > 1 ? data[data.length - 2].value : latestValue;
  const changePercent = prevValue !== 0 ? ((latestValue - prevValue) / prevValue * 100).toFixed(0) : '0';
  const isUp = latestValue >= prevValue;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-1">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${isUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
          {isUp ? '+' : ''}{changePercent}%
        </span>
      </div>
      <p className="text-xs text-slate-400 mb-2">{data.length} days &middot; Latest: {latestValue.toLocaleString('en-IN')}</p>
      <svg width={width} height={height} className="w-full h-auto" viewBox={`0 0 ${width} ${height}`}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = height - padding.bottom - pct * plotHeight;
          return (
            <line key={pct} x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#f1f5f9" strokeWidth="1" />
          );
        })}
        {/* Area */}
        <path d={areaD} fill={color} opacity="0.08" />
        {/* Line */}
        <path d={pathD} stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {/* Points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 4 : 2.5} fill={color} stroke="white" strokeWidth="1.5" />
        ))}
        {/* Date labels */}
        {points.length > 0 && (
          <>
            <text x={points[0].x} y={height - 8} textAnchor="start" className="text-[10px]" fill="#94a3b8">
              {data[0].date.slice(5)}
            </text>
            <text x={points[points.length - 1].x} y={height - 8} textAnchor="end" className="text-[10px]" fill="#94a3b8">
              {data[data.length - 1].date.slice(5)}
            </text>
          </>
        )}
        {/* Y-axis labels */}
        <text x={padding.left - 5} y={padding.top + 4} textAnchor="end" className="text-[10px]" fill="#94a3b8">
          {maxVal >= 1000 ? `${(maxVal / 1000).toFixed(0)}K` : maxVal.toLocaleString('en-IN')}
        </text>
        <text x={padding.left - 5} y={height - padding.bottom + 4} textAnchor="end" className="text-[10px]" fill="#94a3b8">
          {minVal >= 1000 ? `${(minVal / 1000).toFixed(0)}K` : minVal.toLocaleString('en-IN')}
        </text>
      </svg>
    </div>
  );
}

export default function TrendCharts({ snapshots }: Props) {
  if (snapshots.length < 2) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
        <p className="text-slate-500 text-sm">Need at least 2 days of data to show trends</p>
      </div>
    );
  }

  const trends = [
    { data: getDeptFieldTrend(snapshots, 'finance', 'Revenue for the day (Rs.)'), label: 'Daily Revenue', color: '#10b981' },
    { data: getDeptFieldTrend(snapshots, 'finance', 'ARPOB â Avg Revenue Per Occupied Bed (Rs.)'), label: 'ARPOB', color: '#3b82f6' },
    { data: getDeptFieldTrend(snapshots, 'emergency', '# of genuine walk-in / ambulance emergencies (last 24h)'), label: 'ED Cases', color: '#f59e0b' },
    { data: getDeptFieldTrend(snapshots, 'ot', '# of OT cases done (yesterday)'), label: 'OT Cases', color: '#8b5cf6' },
    { data: getDeptFieldTrend(snapshots, 'finance', 'Midnight census â total IP patients'), label: 'IP Census', color: '#ec4899' },
  ].filter(t => t.data.length > 0);

  if (trends.length === 0) return null;

  return (
    <div>
      <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider mb-4">Key Metric Trends</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {trends.map(trend => (
          <SimpleLineChart key={trend.label} data={trend.data} label={trend.label} color={trend.color} />
        ))}
      </div>
    </div>
  );
}
