'use client';

import React, { useState, useEffect, useCallback } from 'react';
import SewaResponsePanel from './SewaResponsePanel';
import { type SewaRequest } from '@/lib/sewa-config';

interface SewaKpiData {
  openCount: number;
  newToday: number;
  slaBreachCount: number;
  avgResolutionMin: number | null;
  blockedCount: number;
}

const DEPT_LABELS: Record<string, string> = {
  emergency: 'Emergency', 'customer-care': 'Customer Care', 'patient-safety': 'Patient Safety',
  finance: 'Finance', billing: 'Billing', 'supply-chain': 'Supply Chain',
  facility: 'Facility', pharmacy: 'Pharmacy', training: 'Training',
  'clinical-lab': 'Clinical Lab', radiology: 'Radiology', ot: 'OT',
  'hr-manpower': 'HR & Manpower', diet: 'Diet & Nutrition', biomedical: 'Biomedical',
  nursing: 'Nursing', it: 'IT', administration: 'Administration',
};

const DEPT_ICONS: Record<string, string> = {
  emergency: 'ED', 'customer-care': 'CC', 'patient-safety': 'PS',
  finance: 'FN', billing: 'BL', 'supply-chain': 'SC',
  facility: 'FM', pharmacy: 'PH', training: 'TR',
  'clinical-lab': 'CL', radiology: 'RD', ot: 'OT',
  'hr-manpower': 'HR', diet: 'DT', biomedical: 'BM',
  nursing: 'NR', it: 'IT', administration: 'AD',
};

export default function SewaOverviewPanel() {
  const [kpis, setKpis] = useState<Record<string, SewaKpiData>>({});
  const [requests, setRequests] = useState<SewaRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'blocked' | 'breached'>('all');

  const fetchData = useCallback(async () => {
    try {
      const [kpiRes, reqRes] = await Promise.all([
        fetch('/api/sewa/kpis'),
        fetch('/api/sewa/requests?limit=25'),
      ]);
      const kpiData = await kpiRes.json();
      const reqData = await reqRes.json();
      if (kpiData.kpis) setKpis(kpiData.kpis);
      if (reqData.requests) setRequests(reqData.requests);
    } catch (e) {
      console.error('SewaOverviewPanel fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Aggregate totals
  const totals = Object.values(kpis).reduce(
    (acc, k) => ({
      open: acc.open + k.openCount,
      newToday: acc.newToday + k.newToday,
      breached: acc.breached + k.slaBreachCount,
      blocked: acc.blocked + (k.blockedCount || 0),
    }),
    { open: 0, newToday: 0, breached: 0, blocked: 0 }
  );

  // Hotspots
  const hotspots = Object.entries(kpis)
    .filter(([, k]) => k.openCount > 0)
    .sort((a, b) => b[1].slaBreachCount - a[1].slaBreachCount || b[1].openCount - a[1].openCount);

  // Filter requests
  const filteredRequests = requests.filter(r => {
    if (r.status === 'RESOLVED') return false;
    if (activeFilter === 'blocked') return r.status === 'BLOCKED';
    if (activeFilter === 'breached') {
      const elapsed = (Date.now() - new Date(r.createdAt).getTime()) / 60000;
      return (r.status === 'NEW' && elapsed > r.responseSlaMin) || elapsed > r.resolutionSlaMin;
    }
    return true;
  });

  const hasData = totals.open > 0 || totals.newToday > 0 || requests.length > 0;
  const healthColor = totals.breached > 2 ? 'red' : totals.blocked > 0 ? 'amber' : totals.breached > 0 ? 'amber' : 'emerald';

  const healthStyles: Record<string, { dot: string; bg: string; border: string; headerBg: string }> = {
    emerald: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200', headerBg: 'from-emerald-600 to-emerald-700' },
    amber: { dot: 'bg-amber-400', bg: 'bg-amber-50', border: 'border-amber-200', headerBg: 'from-amber-500 to-amber-600' },
    red: { dot: 'bg-red-500', bg: 'bg-red-50', border: 'border-red-200', headerBg: 'from-red-600 to-red-700' },
  };
  const hs = healthStyles[healthColor];

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-pulse">
        <div className="p-4">
          <div className="h-5 bg-slate-200 rounded w-48 mb-3" />
          <div className="grid grid-cols-3 gap-3">
            <div className="h-16 bg-slate-100 rounded-lg" />
            <div className="h-16 bg-slate-100 rounded-lg" />
            <div className="h-16 bg-slate-100 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={"bg-white rounded-xl border shadow-sm overflow-hidden transition-all " + hs.border}>
      {/* Collapsed Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <div className={"flex items-center justify-between px-4 py-3 bg-gradient-to-r text-white " + hs.headerBg}>
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-white/20 text-white text-sm font-bold flex items-center justify-center">S</span>
            <div>
              <div className="text-sm font-bold">Sewa Service Requests</div>
              <div className="text-[11px] opacity-80">Tap complaints below to respond</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!hasData && <span className="text-xs opacity-80">No active requests</span>}
            {hasData && (
              <div className="flex items-center gap-1.5 text-[10px] sm:text-xs flex-wrap justify-end">
                <span className="bg-white/20 px-2 py-0.5 rounded-full font-bold">{totals.open} open</span>
                {totals.blocked > 0 && (
                  <span className="bg-red-500/40 px-2 py-0.5 rounded-full font-bold">{totals.blocked} blocked</span>
                )}
                {totals.breached > 0 && (
                  <span className="bg-red-500/30 px-2 py-0.5 rounded-full font-bold">{totals.breached} breach</span>
                )}
                {totals.newToday > 0 && (
                  <span className="bg-white/20 px-2 py-0.5 rounded-full hidden sm:inline-block">+{totals.newToday} today</span>
                )}
              </div>
            )}
            <svg className={"w-4 h-4 transition-transform flex-shrink-0 " + (expanded ? 'rotate-180' : '')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-4">
          {/* KPI Row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 mb-5">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
              <div className="text-xl sm:text-2xl font-bold text-blue-900">{totals.open}</div>
              <div className="text-[10px] sm:text-[11px] font-medium text-blue-600">Open</div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
              <div className="text-xl sm:text-2xl font-bold text-orange-900">{totals.newToday}</div>
              <div className="text-[10px] sm:text-[11px] font-medium text-orange-600">New Today</div>
            </div>
            <div className={`rounded-lg p-3 text-center border ${totals.blocked > 0 ? 'bg-red-50 border-red-300' : 'bg-slate-50 border-slate-200'}`}>
              <div className={`text-xl sm:text-2xl font-bold ${totals.blocked > 0 ? 'text-red-900' : 'text-slate-400'}`}>{totals.blocked}</div>
              <div className={`text-[10px] sm:text-[11px] font-medium ${totals.blocked > 0 ? 'text-red-600' : 'text-slate-400'}`}>Blocked</div>
            </div>
            <div className={`rounded-lg p-3 text-center border ${totals.breached > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className={`text-xl sm:text-2xl font-bold ${totals.breached > 0 ? 'text-red-900' : 'text-slate-400'}`}>{totals.breached}</div>
              <div className={`text-[10px] sm:text-[11px] font-medium ${totals.breached > 0 ? 'text-red-600' : 'text-slate-400'}`}>SLA Breach</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center col-span-2 sm:col-span-1">
              <div className="text-xl sm:text-2xl font-bold text-slate-900">{requests.filter(r => r.status !== 'RESOLVED').length}</div>
              <div className="text-[10px] sm:text-[11px] font-medium text-slate-500">Active</div>
            </div>
          </div>

          {/* Department Hotspots */}
          {hotspots.length > 0 && (
            <div className="mb-5">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Department Hotspots</div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {hotspots.map(([slug, k]) => (
                  <div
                    key={slug}
                    className={"flex items-center gap-2 p-2.5 rounded-lg border transition-colors " + ((k.slaBreachCount > 0 || (k.blockedCount || 0) > 0) ? 'border-red-200 bg-red-50/50' : 'border-slate-200 bg-white')}
                  >
                    <span className="w-7 h-7 rounded-full bg-slate-700 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{DEPT_ICONS[slug] || '??'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-800 truncate">{DEPT_LABELS[slug] || slug}</div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-slate-500">{k.openCount} open</span>
                        {(k.blockedCount || 0) > 0 && (
                          <span className="text-[10px] text-red-600 font-bold">{k.blockedCount} blocked</span>
                        )}
                        {k.slaBreachCount > 0 && (
                          <span className="text-[10px] text-red-600 font-bold">{k.slaBreachCount} breach</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex gap-1.5 mb-3">
            {([
              { key: 'all' as const, label: 'All Open', count: requests.filter(r => r.status !== 'RESOLVED').length },
              { key: 'blocked' as const, label: 'Blocked', count: totals.blocked },
              { key: 'breached' as const, label: 'SLA Breach', count: totals.breached },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                  activeFilter === tab.key
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* Actionable Complaint Cards */}
          {filteredRequests.length > 0 ? (
            <div className="space-y-2 mb-4">
              {filteredRequests.slice(0, 15).map(req => (
                <SewaResponsePanel
                  key={req.id}
                  request={req}
                  onActionComplete={fetchData}
                  compact
                />
              ))}
              {filteredRequests.length > 15 && (
                <div className="text-center text-xs text-slate-400 py-2">
                  + {filteredRequests.length - 15} more complaints
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-slate-400">
              {activeFilter === 'blocked' ? 'No blocked complaints' :
               activeFilter === 'breached' ? 'No SLA breaches - great!' :
               'No open complaints'}
            </div>
          )}

          {/* Footer Links */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <a href="/sewa/dashboard" className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
              Full Sewa Dashboard &rarr;
            </a>
            <div className="flex items-center gap-3">
              <a href="/sewa/queue" className="text-xs text-slate-500 hover:text-slate-700 transition-colors">
                Dept Login
              </a>
              <span className="text-slate-300">|</span>
              <a href="/sewa" className="text-xs text-slate-500 hover:text-slate-700 transition-colors">
                File Complaint
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
