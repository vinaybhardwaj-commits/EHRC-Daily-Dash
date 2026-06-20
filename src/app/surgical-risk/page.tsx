'use client';

/**
 * /surgical-risk standalone page.
 *
 * R1 (UI overhaul): three views — Risk (default), Schedule, Calendar(R3).
 * Risk view = a "needs review now" band (unreviewed RED+ within 48h) pinned
 * above tier-grouped cards, risk-first; GREEN + reviewed cases collapse to
 * dense rows. Schedule view = the date-ordered list. All views share the
 * enriched card; every existing action (review, re-assess, remove, override)
 * is preserved.
 */

import { useEffect, useMemo, useState } from 'react';
import type { RiskTier, SurgicalRiskAssessmentRow } from '@/lib/surgical-risk/types';
import { TIER_STYLES, TIER_ORDER } from '@/components/surgical-risk/tier-styles';
import SurgicalRiskCaseCard from '@/components/surgical-risk/SurgicalRiskCaseCard';
import SrewsViewToggle, { type SrewsView } from '@/components/surgical-risk/SrewsViewToggle';
import SrewsCalendar from '@/components/surgical-risk/SrewsCalendar';
import { needsReview, byCompositeDesc, surgeryDateKey } from '@/lib/surgical-risk/derive';

interface ApiList {
  ok: boolean;
  range?: { start: string | null; end: string | null; mode?: string };
  filters?: { tiers: RiskTier[]; specialty: string | null };
  summary?: { GREEN: number; AMBER: number; RED: number; CRITICAL: number; unreviewed: number; total: number };
  assessments?: SurgicalRiskAssessmentRow[];
  error?: string;
}

const KPI_CARDS = [
  { key: 'total',      label: 'Upcoming Surgeries', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { key: 'high',       label: 'High Risk (RED+)',   color: 'bg-rose-50 border-rose-200 text-rose-700' },
  { key: 'amber',      label: 'Attention (AMBER)',  color: 'bg-amber-50 border-amber-200 text-amber-700' },
  { key: 'green',      label: 'Clear (GREEN)',      color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  { key: 'unreviewed', label: 'Unreviewed',         color: 'bg-purple-50 border-purple-200 text-purple-700' },
] as const;

const AVAILABLE_VIEWS: SrewsView[] = ['risk', 'schedule', 'calendar'];

const TIER_LABEL: Record<RiskTier, string> = {
  CRITICAL: 'Critical',
  RED: 'Red — high risk',
  AMBER: 'Attention — amber',
  GREEN: 'Cleared — green',
};

export default function SurgicalRiskPage() {
  const [data, setData] = useState<ApiList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<Set<RiskTier>>(new Set(['GREEN', 'AMBER', 'RED', 'CRITICAL']));
  const [rangeMode, setRangeMode] = useState<'all' | 'upcoming' | 'today' | '7d' | '30d'>('all');
  const [removedExpanded, setRemovedExpanded] = useState(false);
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('');
  const [llmHealth, setLlmHealth] = useState<'healthy' | 'down' | 'unknown'>('unknown');
  const [view, setView] = useState<SrewsView>('risk');
  const [scheduleSort, setScheduleSort] = useState<'upcoming' | 'recent'>('upcoming');

  // Restore view from ?view= / localStorage
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('view') as SrewsView | null;
      const stored = localStorage.getItem('srews_view') as SrewsView | null;
      const pick = (v: SrewsView | null) => (v && AVAILABLE_VIEWS.includes(v) ? v : null);
      setView(pick(fromUrl) || pick(stored) || 'risk');
    } catch { /* default risk */ }
  }, []);

  function changeView(v: SrewsView) {
    setView(v);
    try {
      localStorage.setItem('srews_view', v);
      const u = new URL(window.location.href);
      u.searchParams.set('view', v);
      window.history.replaceState({}, '', u);
    } catch { /* ignore */ }
  }

  function reload() {
    fetch(`/api/surgical-risk?range=${rangeMode}&include_removed=true`)
      .then(r => r.json())
      .then((j: ApiList) => { if (j.ok) setData(j); });
  }

  // Fetch list
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const r = await fetch(`/api/surgical-risk?range=${rangeMode}&include_removed=true`);
        const json: ApiList = await r.json();
        if (!cancelled) {
          if (json.ok) { setData(json); setError(null); }
          else { setError(json.error || 'Failed to load assessments'); }
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [rangeMode]);

  // Fetch LLM health
  useEffect(() => {
    let cancelled = false;
    fetch('/api/llm-health')
      .then(r => r.json())
      .then((j) => { if (!cancelled) setLlmHealth(j?.status === 'healthy' ? 'healthy' : 'down'); })
      .catch(() => { if (!cancelled) setLlmHealth('down'); });
    return () => { cancelled = true; };
  }, []);

  // Active (non-removed), tier+specialty filtered
  const visibleAssessments = useMemo(() => {
    if (!data?.assessments) return [];
    return data.assessments
      .filter(a => !a.removed_at)
      .filter(a => tierFilter.has(a.risk_tier))
      .filter(a => !specialtyFilter || (a.surgical_specialty || '').toLowerCase().includes(specialtyFilter.toLowerCase()));
  }, [data, tierFilter, specialtyFilter]);

  const removedAssessments = useMemo(() => {
    if (!data?.assessments) return [];
    return data.assessments
      .filter(a => !!a.removed_at)
      .filter(a => tierFilter.has(a.risk_tier))
      .filter(a => !specialtyFilter || (a.surgical_specialty || '').toLowerCase().includes(specialtyFilter.toLowerCase()));
  }, [data, tierFilter, specialtyFilter]);

  // Risk view derivation: needs-review band + tier groups (risk-first)
  const riskGroups = useMemo(() => {
    const now = Date.now();
    const needs = visibleAssessments.filter(a => needsReview(a, now)).sort(byCompositeDesc);
    const needsIds = new Set(needs.map(a => a.id));
    const rest = visibleAssessments.filter(a => !needsIds.has(a.id));
    const groups = TIER_ORDER
      .map(tier => ({ tier, rows: rest.filter(a => a.risk_tier === tier).sort(byCompositeDesc) }))
      .filter(g => g.rows.length > 0);
    return { needs, groups };
  }, [visibleAssessments]);

  // Schedule view derivation: group by surgery date; "upcoming" = today+future
  // ascending then past most-recent-first (forward-looking roster default);
  // "recent" = strict latest-first. Undated go last.
  const scheduleGroups = useMemo(() => {
    const map = new Map<string, SurgicalRiskAssessmentRow[]>();
    const undated: SurgicalRiskAssessmentRow[] = [];
    for (const a of visibleAssessments) {
      const k = surgeryDateKey(a);
      if (!k) { undated.push(a); continue; }
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(a);
    }
    const t = new Date();
    const tKey = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    const all = Array.from(map.keys());
    let ordered: string[];
    if (scheduleSort === 'recent') {
      ordered = all.slice().sort().reverse();
    } else {
      const future = all.filter(k => k >= tKey).sort();
      const past = all.filter(k => k < tKey).sort().reverse();
      ordered = [...future, ...past];
    }
    const firstPastKey = scheduleSort === 'upcoming' ? (ordered.find(k => k < tKey) ?? null) : null;
    const days = ordered.map(k => ({ key: k, rows: map.get(k)!.slice().sort(byCompositeDesc) }));
    return { days, undated, firstPastKey };
  }, [visibleAssessments, scheduleSort]);

  const specialties = useMemo(() => {
    if (!data?.assessments) return [];
    const set = new Set<string>();
    for (const a of data.assessments) if (a.surgical_specialty) set.add(a.surgical_specialty);
    return Array.from(set).sort();
  }, [data]);

  function toggleTier(t: RiskTier) {
    setTierFilter(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  function kpiValue(key: string): number {
    if (!data?.summary) return 0;
    if (key === 'total') return data.summary.total;
    if (key === 'high') return data.summary.RED + data.summary.CRITICAL;
    if (key === 'amber') return data.summary.AMBER;
    if (key === 'green') return data.summary.GREEN;
    if (key === 'unreviewed') return data.summary.unreviewed;
    return 0;
  }

  // Shared card renderer
  function card(row: SurgicalRiskAssessmentRow, compact: boolean, hideDate = false) {
    return (
      <SurgicalRiskCaseCard
        key={row.id}
        row={row}
        compact={compact}
        hideDate={hideDate}
        onReviewed={reload}
        onRemoved={reload}
        onRestored={reload}
      />
    );
  }

  // Schedule day header label: "Today · Fri, 19 Jun 2026" etc.
  function dayLabel(key: string): string {
    const d = new Date(key + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return key;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
    const rel = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : '';
    const full = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    return rel ? `${rel} · ${full}` : full;
  }

  // Per-day tier counts for the schedule header chips
  function dayTierCounts(rows: SurgicalRiskAssessmentRow[]): { tier: RiskTier; n: number }[] {
    return TIER_ORDER
      .map(tier => ({ tier, n: rows.filter(r => r.risk_tier === tier).length }))
      .filter(t => t.n > 0);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top nav */}
      <nav className="bg-gradient-to-r from-blue-900 to-blue-950 text-white sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold tracking-tight">EHRC</span>
            <span className="text-blue-300 text-sm">|</span>
            <span className="text-sm font-medium text-blue-200">Surgical Risk Assessment</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a href="/" className="text-blue-300 hover:text-white transition-colors">← Dashboard</a>
            <a href="/admin/surgical-risk" className="text-blue-300 hover:text-white transition-colors" title="SPAS — prompt + rubric admin">⚙ Config</a>
            <div className="flex items-center gap-1.5" title={`LLM: ${llmHealth}`}>
              <div className={`w-2 h-2 rounded-full ${llmHealth === 'healthy' ? 'bg-emerald-400 animate-pulse' : llmHealth === 'down' ? 'bg-red-500' : 'bg-slate-400'}`} />
              <span className="text-xs text-blue-300 hidden sm:inline">
                LLM {llmHealth === 'healthy' ? 'Online' : llmHealth === 'down' ? 'Offline' : '…'}
              </span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {KPI_CARDS.map(({ key, label, color }) => (
            <div key={key} className={`rounded-xl border p-3 ${color}`}>
              <p className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</p>
              <p className="text-2xl font-bold mt-1">{kpiValue(key)}</p>
            </div>
          ))}
        </div>

        {/* View toggle */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <SrewsViewToggle view={view} views={AVAILABLE_VIEWS} onChange={changeView} />
          <span className="text-xs text-slate-500">{data?.assessments ? `${data.assessments.length} shown` : ''}</span>
        </div>

        {/* Filter bar */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Tier:</span>
            {TIER_ORDER.map(tier => {
              const stl = TIER_STYLES[tier];
              const active = tierFilter.has(tier);
              const count = data?.assessments?.filter(a => a.risk_tier === tier).length || 0;
              return (
                <button
                  key={tier}
                  onClick={() => toggleTier(tier)}
                  className={`text-xs font-bold px-3 py-1 rounded-full border transition-all ${
                    active ? `${stl.badge} ${stl.border}` : 'bg-slate-100 text-slate-400 border-slate-200'
                  }`}
                >
                  {tier} {active && count > 0 && <span className="ml-1 opacity-60">({count})</span>}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {specialties.length > 0 && (
              <select
                value={specialtyFilter}
                onChange={(e) => setSpecialtyFilter(e.target.value)}
                className="text-xs px-2 py-1 border border-slate-300 rounded-lg bg-white text-slate-700"
              >
                <option value="">All specialties</option>
                {specialties.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <select
              value={rangeMode}
              onChange={(e) => setRangeMode(e.target.value as typeof rangeMode)}
              className="text-xs px-2 py-1 border border-slate-300 rounded-lg bg-white text-slate-700"
              title="Date range filter (by surgery_date)"
            >
              <option value="all">All submissions</option>
              <option value="upcoming">Upcoming (today + 3 days)</option>
              <option value="today">Today only</option>
              <option value="7d">Past 7d + upcoming</option>
              <option value="30d">Past 30d + upcoming</option>
            </select>
          </div>
        </div>

        {/* Body */}
        {loading && <div className="text-center py-16 text-slate-400">Loading assessments…</div>}
        {error && !loading && (
          <div className="text-center py-16 text-red-600">
            <p className="text-lg mb-1">Failed to load</p>
            <p className="text-sm text-slate-500">{error}</p>
          </div>
        )}
        {!loading && !error && visibleAssessments.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-lg mb-1">No cases match the selected filters</p>
            <p className="text-sm">
              {data?.summary?.total === 0
                ? 'No upcoming surgical bookings yet. New submissions appear here within seconds.'
                : 'Try toggling more tier filters or clearing the specialty filter.'}
            </p>
          </div>
        )}

        {/* RISK VIEW */}
        {!loading && !error && view === 'risk' && visibleAssessments.length > 0 && (
          <div>
            {riskGroups.needs.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-rose-600" aria-hidden>⚠</span>
                  <span className="text-sm font-semibold text-rose-700">Needs review now</span>
                  <span className="text-xs text-slate-400">unreviewed · RED+ · surgery within 48h</span>
                  <span className="ml-auto text-xs font-bold text-rose-700">{riskGroups.needs.length}</span>
                </div>
                <div className="space-y-3">
                  {riskGroups.needs.map(row => card(row, false))}
                </div>
              </div>
            )}
            {riskGroups.groups.map(g => (
              <div key={g.tier} className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2.5 h-2.5 rounded ${TIER_STYLES[g.tier].bar}`} />
                  <span className="text-sm font-medium text-slate-600">{TIER_LABEL[g.tier]}</span>
                  <span className="text-xs text-slate-400">{g.rows.length}</span>
                </div>
                <div className={g.tier === 'GREEN' ? 'space-y-2' : 'space-y-3'}>
                  {g.rows.map(row => card(row, g.tier === 'GREEN' || !!row.reviewed_at))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SCHEDULE VIEW — grouped by surgery date, day headers + sort toggle */}
        {!loading && !error && view === 'schedule' && visibleAssessments.length > 0 && (
          <div>
            <div className="flex items-center justify-end mb-3">
              <button
                onClick={() => setScheduleSort(s => (s === 'upcoming' ? 'recent' : 'upcoming'))}
                className="text-xs px-2.5 py-1 border border-slate-300 rounded-lg bg-white text-slate-600 hover:bg-slate-50"
                title="Toggle date order"
              >
                {scheduleSort === 'upcoming' ? 'Upcoming first' : 'Latest first'} ⇅
              </button>
            </div>
            {scheduleGroups.days.map(day => (
              <div key={day.key} className="mb-5">
                {day.key === scheduleGroups.firstPastKey && (
                  <div className="flex items-center gap-2 my-4 text-xs text-slate-400">
                    <span className="h-px flex-1 bg-slate-200" />
                    Earlier surgeries
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-slate-700">{dayLabel(day.key)}</span>
                  <span className="text-xs text-slate-400">{day.rows.length} case{day.rows.length > 1 ? 's' : ''}</span>
                  <span className="flex items-center gap-2 ml-1">
                    {dayTierCounts(day.rows).map(({ tier, n }) => (
                      <span key={tier} className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <span className={`w-2 h-2 rounded-full ${TIER_STYLES[tier].bar}`} />{n}
                      </span>
                    ))}
                  </span>
                </div>
                <div className="space-y-2">
                  {day.rows.map(row => card(row, true, true))}
                </div>
              </div>
            ))}
            {scheduleGroups.undated.length > 0 && (
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-slate-500">Unscheduled</span>
                  <span className="text-xs text-slate-400">{scheduleGroups.undated.length}</span>
                </div>
                <div className="space-y-2">
                  {scheduleGroups.undated.map(row => card(row, true, true))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CALENDAR VIEW — month grid bucketed by surgery date */}
        {!loading && !error && view === 'calendar' && visibleAssessments.length > 0 && (
          <SrewsCalendar rows={visibleAssessments} renderCase={(row) => card(row, true, true)} />
        )}

        {/* Removed group (collapsible) — hidden in calendar view */}
        {!loading && !error && view !== 'calendar' && removedAssessments.length > 0 && (
          <div className="mt-8 border-t border-slate-200 pt-4">
            <button
              onClick={() => setRemovedExpanded(v => !v)}
              className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 mb-3"
            >
              <span className="inline-block w-4 transition-transform" style={{ transform: removedExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
              Removed ({removedAssessments.length})
              <span className="text-xs font-normal text-slate-400">— click to {removedExpanded ? 'collapse' : 'expand'}</span>
            </button>
            {removedExpanded && (
              <div className="space-y-3 opacity-70">
                {removedAssessments.map(row => card(row, false))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-slate-400">
          Risk scores computed by Gemini 2.5 Pro on Vertex · Arithmetic validated server-side per PRD §13.3 · Even Hospitals, Race Course Road
        </div>
      </div>
    </div>
  );
}
