'use client';

/**
 * ScoreGauge — single sub-score bar (Patient / Procedure / System).
 * Per Mockup.jsx ScoreGauge component + PRD v2 §14.4.4.
 *
 * Note: fill colors are by SEVERITY (not by tier), because a single sub-score
 * doesn't determine tier on its own. Tier comes from composite + overrides.
 */

interface Props {
  label: string;
  score: number;
}

export default function ScoreGauge({ label, score }: Props) {
  const pct = Math.min(100, (score / 10) * 100);
  const barColor =
    score >= 7.5 ? 'bg-red-500'
    : score >= 5 ? 'bg-amber-500'
    : score >= 2.5 ? 'bg-yellow-400'
    : 'bg-emerald-500';

  return (
    <div className="flex-1 min-w-0">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
        <span className="text-sm font-bold text-slate-900">{score.toFixed(1)}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
