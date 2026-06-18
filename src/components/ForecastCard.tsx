'use client';

/* B.2 — Predictive forecasts card. Reads the cached overview snapshot
   (same hook as the other AI cards) and renders Gemini-Pro's next-day /
   next-week KPI projections with driver + confidence. */

import { TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import { useOverviewIntelligence } from './useOverviewIntelligence';

interface ForecastCardProps {
  date: string;
}

function dirIcon(d: string) {
  if (d === 'up') return <TrendingUp className="w-4 h-4 text-emerald-600" />;
  if (d === 'down') return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
}

const CONF_STYLE: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-600',
};

export default function ForecastCard({ date }: ForecastCardProps) {
  const { payload, computing } = useOverviewIntelligence(date);
  const forecasts = payload?.forecasts ?? [];

  // Nothing cached and nothing computing → render nothing (no empty card).
  if (!payload && !computing) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200 rounded-xl px-5 py-3">
        <TrendingUp className="w-5 h-5 text-sky-600" />
        <span className="text-sm font-semibold text-gray-800">Forecasts</span>
        <span className="text-[9px] px-1 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200 font-medium">
          EVEN AI
        </span>
        {computing && !payload && (
          <span className="flex items-center gap-1 text-xs text-sky-700">
            <Loader2 className="w-3 h-3 animate-spin" />
            Generating…
          </span>
        )}
      </div>

      {forecasts.length > 0 ? (
        <div className="mt-2 bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
          {forecasts.map((f, i) => (
            <div key={i} className="px-5 py-3 flex items-start gap-3">
              <span className="mt-0.5 flex-shrink-0">{dirIcon(f.direction)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800">{f.metric}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                    {f.horizon === 'next_week' ? 'next week' : 'next day'}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CONF_STYLE[f.confidence] || CONF_STYLE.medium}`}>
                    {f.confidence} confidence
                  </span>
                </div>
                <p className="text-xs text-gray-700 mt-0.5">
                  {f.current && <span className="text-gray-500">{f.current} → </span>}
                  <span className="font-semibold">{f.projection}</span>
                  {f.driver && <span className="text-gray-500"> · {f.driver}</span>}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : payload ? (
        <div className="mt-2 px-5 py-3 text-xs text-gray-500 italic bg-white border border-gray-200 rounded-xl">
          No forecasts available for today.
        </div>
      ) : null}
    </div>
  );
}
