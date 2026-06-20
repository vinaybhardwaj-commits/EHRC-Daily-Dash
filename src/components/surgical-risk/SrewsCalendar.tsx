'use client';

/**
 * SrewsCalendar (R3) — month grid bucketed by surgery date.
 * Each day shows its case count coloured by the highest-risk tier that day, with
 * a flag on days that carry an unreviewed RED/CRITICAL case, today ringed.
 * Clicking a day fills the selected-day panel below (cases via `renderCase`).
 * Pure presentation over the rows it's given; no fetching.
 */

import { useMemo, useState, type ReactNode } from 'react';
import type { SurgicalRiskAssessmentRow, RiskTier } from '@/lib/surgical-risk/types';
import { surgeryDateKey, tierRank } from '@/lib/surgical-risk/derive';
import { TIER_STYLES } from './tier-styles';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
function todayKey() { const t = new Date(); return keyOf(t.getFullYear(), t.getMonth(), t.getDate()); }

const COUNT_COLOR: Record<RiskTier, string> = {
  GREEN: 'text-emerald-700',
  AMBER: 'text-amber-700',
  RED: 'text-rose-700',
  CRITICAL: 'text-red-700',
};

interface Props {
  rows: SurgicalRiskAssessmentRow[];
  renderCase: (row: SurgicalRiskAssessmentRow) => ReactNode;
}

export default function SrewsCalendar({ rows, renderCase }: Props) {
  const buckets = useMemo(() => {
    const m = new Map<string, SurgicalRiskAssessmentRow[]>();
    for (const r of rows) {
      const k = surgeryDateKey(r);
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  }, [rows]);

  const tKey = todayKey();
  // Default to the soonest day with cases on/after today, else the latest dated day.
  const defaultSel = useMemo(() => {
    const keys = Array.from(buckets.keys()).sort();
    if (keys.length === 0) return tKey;
    return keys.find(k => k >= tKey) ?? keys[keys.length - 1];
  }, [buckets, tKey]);

  const [selected, setSelected] = useState<string>(defaultSel);
  const [cursor, setCursor] = useState<{ y: number; m: number }>(() => {
    const d = new Date(defaultSel + 'T00:00:00');
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const { y, m } = cursor;
  const monthLabel = new Date(y, m, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const firstWeekday = (new Date(y, m, 1).getDay() + 6) % 7; // 0 = Monday
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  function dayMeta(dateKey: string) {
    const list = buckets.get(dateKey) || [];
    let highest: RiskTier | null = null;
    let flag = false;
    for (const r of list) {
      if (!highest || tierRank(r.risk_tier) > tierRank(highest)) highest = r.risk_tier;
      if ((r.risk_tier === 'RED' || r.risk_tier === 'CRITICAL') && !r.reviewed_at && !r.removed_at) flag = true;
    }
    return { n: list.length, highest, flag };
  }

  const cells: ({ day: number; key: string } | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, key: keyOf(y, m, d) });

  const prevMonth = () => setCursor(c => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }));
  const nextMonth = () => setCursor(c => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }));

  const selList = (buckets.get(selected) || []).slice()
    .sort((a, b) => Number(b.composite_risk_score) - Number(a.composite_risk_score));
  const selLabel = (() => {
    const d = new Date(selected + 'T00:00:00');
    return Number.isNaN(d.getTime())
      ? selected
      : d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  })();

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="text-slate-500 hover:text-slate-900 px-2 py-1 text-lg leading-none" aria-label="Previous month">‹</button>
          <span className="text-sm font-semibold text-slate-700 min-w-[120px] text-center">{monthLabel}</span>
          <button onClick={nextMonth} className="text-slate-500 hover:text-slate-900 px-2 py-1 text-lg leading-none" aria-label="Next month">›</button>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
          <span>count colour = highest risk</span>
          <span className="inline-flex items-center gap-1"><span className="text-rose-600">⚑</span> unreviewed high-risk</span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map(w => <div key={w} className="text-xs text-slate-400 text-center pb-1">{w}</div>)}
        {cells.map((c, i) => {
          if (!c) return <div key={`b${i}`} />;
          const meta = dayMeta(c.key);
          const isToday = c.key === tKey;
          const isSel = c.key === selected;
          const clickable = meta.n > 0;
          const tint = meta.highest ? TIER_STYLES[meta.highest].bg : '';
          return (
            <button
              key={c.key}
              disabled={!clickable}
              onClick={() => clickable && setSelected(c.key)}
              className={`relative min-h-[58px] rounded-lg border p-1.5 text-left transition-colors ${
                isSel ? 'border-blue-500 ring-1 ring-blue-300' : isToday ? 'border-blue-300' : 'border-slate-200'
              } ${clickable ? `${tint} hover:border-slate-400 cursor-pointer` : 'bg-white opacity-60 cursor-default'}`}
            >
              <div className={`text-xs ${isToday ? 'font-bold text-blue-700' : 'text-slate-400'}`}>
                {c.day}{isToday && ' · today'}
              </div>
              {meta.flag && (
                <span className="absolute top-1 right-1.5 text-rose-600 text-xs" title="unreviewed high-risk">⚑</span>
              )}
              {meta.n > 0 && (
                <div className={`mt-1 text-lg font-bold ${meta.highest ? COUNT_COLOR[meta.highest] : 'text-slate-700'}`}>{meta.n}</div>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-5 border-t border-slate-200 pt-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-semibold text-slate-700">{selLabel}</span>
          <span className="text-xs text-slate-400">{selList.length} surger{selList.length === 1 ? 'y' : 'ies'}</span>
        </div>
        {selList.length === 0 ? (
          <p className="text-sm text-slate-400 py-4">No surgeries scheduled this day.</p>
        ) : (
          <div className="space-y-2">{selList.map(renderCase)}</div>
        )}
      </div>
    </div>
  );
}
