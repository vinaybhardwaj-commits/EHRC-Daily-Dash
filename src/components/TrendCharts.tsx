'use client';

import { DaySnapshot } from '@/lib/types';

interface Props {
  snapshots: DaySnapshot[]; // Sorted by date ascending
}

function extractNumeric(val: string | number | undefined): number | null {
  if (val === undefined || val === '') return null;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[,\s₹Rs.]/g, '');
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

  const width = 300;
  const height = 120;
  const padding = 30;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const minVal = Math.min(...data.map(d => d.value));
  const maxVal = Math.max(...data.map(d => d.value));
  const range = maxVal - minVal || 1;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1 || 1)) * plotWidth;
    const y = height - padding - ((d.value - minVal) / range) * plotHeight;
    return { x, y, ...d };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-sm font-medium text-gray-900 mb-3">{label}</p>
      <svg width={width} height={height} className="w-full h-auto">
        {/* Grid lines */}
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e5e7eb" strokeWidth="1" />
        {/* Line */}
        <path d={pathD} stroke={color} strokeWidth="2" fill="none" />
        {/* Points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />
        ))}
      </svg>
      <div className="mt-2 flex justify-between text-xs text-gray-500">
        <span>{minVal.toLocaleString('en-IN')}</span>
        <span>{maxVal.toLocaleString('en-IN')}</span>
      </div>
      <p className="text-xs text-gray-400 mt-2">{data.length} days</p>
    </div>
  );
}

export default function TrendCharts({ snapshots }: Props) {
  if (snapshots.length < 2) {
    return <div className="text-gray-400 text-center py-8">Need at least 2 days of data to show trends</div>;
  }

  // Financial trends
  const revenueTrend = getDeptFieldTrend(snapshots, 'finance', 'Revenue for the day (Rs.)');
  const arpobjTrend = getDeptFieldTrend(snapshots, 'finance', 'ARPOB — Avg Revenue Per Occupied Bed (Rs.)');

  // Clinical trends
  const edCasesTrend = getDeptFieldTrend(snapshots, 'emergency', '# of genuine walk-in / ambulance emergencies (last 24h)');
  const otCasesTrend = getDeptFieldTrend(snapshots, 'ot', '# of OT cases done (yesterday)');
  const censusTrend = getDeptFieldTrend(snapshots, 'finance', 'Midnight census — total IP patients');

  const trends = [
    { data: revenueTrend, label: 'Daily Revenue', color: '#10b981' },
    { data: arpobjTrend, label: 'ARPOB', color: '#3b82f6' },
    { data: edCasesTrend, label: 'ED Cases', color: '#f59e0b' },
    { data: otCasesTrend, label: 'OT Cases', color: '#8b5cf6' },
    { data: censusTrend, label: 'IP Census', color: '#ec4899' },
  ].filter(t => t.data.length > 0);

  if (trends.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 text-lg mb-4">Key Metric Trends</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {trends.map(trend => (
          <SimpleLineChart key={trend.label} data={trend.data} label={trend.label} color={trend.color} />
        ))}
      </div>
    </div>
  );
}
