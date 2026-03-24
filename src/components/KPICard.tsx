'use client';

interface KPICardProps {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  subtitle?: string;
}

export default function KPICard({ label, value, trend, subtitle }: KPICardProps) {
  const trendColor = trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-slate-500';
  const trendIcon = trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider truncate" title={label}>{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-2xl font-bold text-slate-900">
          {typeof value === 'number' ? value.toLocaleString('en-IN') : value || '--'}
        </p>
        {trend && <span className={`text-sm font-medium ${trendColor}`}>{trendIcon}</span>}
      </div>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </div>
  );
}
