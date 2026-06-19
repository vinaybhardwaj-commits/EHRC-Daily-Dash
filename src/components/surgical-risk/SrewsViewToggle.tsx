'use client';

/**
 * SrewsViewToggle — segmented control for the three SREWS views.
 * R1 ships Risk + Schedule; Calendar is added in R3 (pass it in `views`).
 */

export type SrewsView = 'risk' | 'schedule' | 'calendar';

const LABELS: Record<SrewsView, string> = {
  risk: 'Risk',
  schedule: 'Schedule',
  calendar: 'Calendar',
};

interface Props {
  view: SrewsView;
  views: SrewsView[];
  onChange: (v: SrewsView) => void;
}

export default function SrewsViewToggle({ view, views, onChange }: Props) {
  return (
    <div className="inline-flex border border-slate-300 rounded-lg overflow-hidden" role="tablist" aria-label="SREWS view">
      {views.map((v, i) => {
        const active = view === v;
        return (
          <button
            key={v}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={`text-sm px-3 py-1.5 transition-colors ${i > 0 ? 'border-l border-slate-200' : ''} ${
              active ? 'bg-blue-600 text-white font-medium' : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {LABELS[v]}
          </button>
        );
      })}
    </div>
  );
}
