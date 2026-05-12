'use client';

/**
 * /surgical-risk standalone page.
 * Per Mockup.jsx + PRD v2 §6 + §14.4.
 *
 * Layout: top nav (matches EHRC pattern) + KPI strip (5 MetricCards) +
 * filter bar (tier toggle pills + specialty dropdown) + case cards list.
 *
 * Default range: today + 3 days forward (PRD §6 v1 scope).
 * Per decision #22: search + historical + trends deferred to v1.x.
 */

import { useEffect, useMemo, useState } from 'react';
import type { RiskTier, SurgicalRiskAssessmentRow } from '@/lib/surgical-risk/types';
import { TIER_STYLES, TIER_ORDER } from '@/components/surgical-risk/tier-styles';
import SurgicalRiskCaseCard from '@/components/surgical-risk/SurgicalRiskCaseCard';

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

export default function SurgicalRiskPage() {
  const [data, setData] = useState<ApiList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<Set<RiskTier>>(new Set(['GREEN', 'AMBER', 'RED', 'CRITICAL']));
  const [rangeMode, setRangeMode] = useState<'all' | 'upcoming' | 'today' | '7d' | '30d'>('all');
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('');
  const [llmHealth, setLlmHealth] = useState<'healthy' | 'down' | 'unknown'>('unknown');

  // Fetch list
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const r = await fetch(`/api/surgical-risk?range=${rangeMode}`);
        const json: ApiList = await r.json();
        if (!cancelled) {
          if (json.ok) {
            setData(json);
            setError(null);
          } else {
            setError(json.error || 'Failed to load assessments');
          }
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

  // Derived: filtered + sorted assessments
  const visibleAssessments = useMemo(() => {
    if (!data?.assessments) return [];
    return data.assessments
      .filter(a => tierFilter.has(a.risk_tier))
      .filter(a => !specialtyFilter || (a.surgical_specialty || '').toLowerCase().includes(specialtyFilter.toLowerCase()));
  }, [data, tierFilter, specialtyFilter]);

  // Derived: distinct specialties for the dropdown
  const specialties = useMemo(() => {
    if (!data?.assessments) return [];
    const set = new Set<string>();
    for (const a of data.assessments) {
      if (a.surgical_specialty) set.add(a.surgical_specialty);
    }
    return Array.from(set).sort();
  }, [data]);

  function toggleTier(t: RiskTier) {
    setTierFilter(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  // KPI value lookup
  function kpiValue(key: string): number {
    if (!data?.summary) return 0;
    if (key === 'total') return data.summary.total;
    if (key === 'high') return data.summary.RED + data.summary.CRITICAL;
    if (key === 'amber') return data.summary.AMBER;
    if (key === 'green') return data.summary.GREEN;
    if (key === 'unreviewed') return data.summary.unreviewed;
    return 0;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top nav — matches EHRC pattern */}
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

        {/* Filter bar */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Tier:</span>
            {TIER_ORDER.map(tier => {
              const s = TIER_STYLES[tier];
              const active = tierFilter.has(tier);
              const count = data?.assessments?.filter(a => a.risk_tier === tier).length || 0;
              return (
                <button
                  key={tier}
                  onClick={() => toggleTier(tier)}
                  className={`text-xs font-bold px-3 py-1 rounded-full border transition-all ${
                    active ? `${s.badge} ${s.border}` : 'bg-slate-100 text-slate-400 border-slate-200'
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
            <span className="text-xs text-slate-500">
              {data?.range?.mode === 'all' ? 'all dates' :
               data?.range?.start && data?.range?.end ? `${data.range.start} → ${data.range.end}` : ''}
              {data?.assessments && ` · ${data.assessments.length} shown`}
            </span>
          </div>
        </div>

        {/* Body */}
        {loading && (
          <div className="text-center py-16 text-slate-400">Loading assessments…</div>
        )}
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
                ? 'No upcoming surgical bookings in the database. New form submissions will appear here within seconds via the Apps Script webhook (or hourly via the safety-net polling).'
                : 'Try toggling more tier filters or clearing the specialty filter.'}
            </p>
          </div>
        )}
        {!loading && !error && visibleAssessments.length > 0 && (
          <div className="space-y-3">
            {visibleAssessments.map(row => (
              <SurgicalRiskCaseCard
                key={row.id}
                row={row}
                onReviewed={() => {
                  // Reload to refresh "reviewed" badge
                  fetch(`/api/surgical-risk?range=${rangeMode}`).then(r => r.json()).then((j: ApiList) => { if (j.ok) setData(j); });
                }}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-slate-400">
          Risk scores computed by Qwen 2.5 14B via Ollama · Arithmetic validated server-side per PRD §13.3 · Even Hospitals, Race Course Road
        </div>
      </div>
    </div>
  );
}
