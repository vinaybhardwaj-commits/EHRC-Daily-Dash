'use client';

/**
 * FactorTable — list of factor contributions for one sub-score.
 * Per Mockup.jsx FactorTable + PRD v2 §14.4.3 expanded card.
 */

import type { FactorContribution } from '@/lib/surgical-risk/types';

interface Props {
  factors: FactorContribution[];
}

export default function FactorTable({ factors }: Props) {
  if (!factors || factors.length === 0) {
    return <p className="text-xs text-slate-400 italic">No risk factors identified</p>;
  }
  return (
    <div className="space-y-1">
      {factors.map((f, i) => (
        <div key={i} className="flex items-start gap-2 text-sm">
          <span
            className={`font-mono text-xs px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${
              f.points > 0 ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-400'
            }`}
          >
            +{f.points}
          </span>
          <div>
            <span className="font-medium text-slate-800">{f.factor}</span>
            {f.detail && <span className="text-slate-500 ml-1">— {f.detail}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
