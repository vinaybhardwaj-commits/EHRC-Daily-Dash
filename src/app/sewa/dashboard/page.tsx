'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import SewaResponsePanel from '@/components/SewaResponsePanel';
import {
  SEWA_DEPARTMENTS,
  getDepartment,
  type SewaRequest,
  type RequestStatus,
} from '@/lib/sewa-config';

const STATUS_COLORS: Record<RequestStatus, string> = {
  NEW: '#3b82f6',
  ACKNOWLEDGED: '#f59e0b',
  IN_PROGRESS: '#8b5cf6',
  BLOCKED: '#dc2626',
  RESOLVED: '#10b981',
};

interface DeptKPI {
  openCount: number;
  newToday: number;
  slaBreachCount: number;
  avgResolutionMin: number | null;
  blockedCount: number;
}

export default function SewaDashboardPage() {
  const [kpis, setKpis] = useState<Record<string, DeptKPI>>({});
  const [recentRequests, setRecentRequests] = useState<SewaRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'overview' | 'complaints'>('overview');

  const loadData = useCallback(async () => {
    try {
      const [kpiRes, reqRes] = await Promise.all([
        fetch('/api/sewa/kpis'),
        fetch('/api/sewa/requests?limit=100'),
      ]);

      if (kpiRes.ok) {
        const kpiData = await kpiRes.json();
        setKpis(kpiData.kpis || {});
      }
      if (reqRes.ok) {
        const reqData = await reqRes.json();
        setRecentRequests(reqData.requests || []);
      }
    } catch { /* silently fail */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Aggregates
  const allDeptSlugs = SEWA_DEPARTMENTS.map(d => d.slug);
  const totalOpen = allDeptSlugs.reduce((sum, slug) => sum + (kpis[slug]?.openCount || 0), 0);
  const totalNewToday = allDeptSlugs.reduce((sum, slug) => sum + (kpis[slug]?.newToday || 0), 0);
  const totalBreached = allDeptSlugs.reduce((sum, slug) => sum + (kpis[slug]?.slaBreachCount || 0), 0);
  const totalBlocked = allDeptSlugs.reduce((sum, slug) => sum + (kpis[slug]?.blockedCount || 0), 0);

  // Filter requests
  const filteredRequests = selectedDept === 'all'
    ? recentRequests
    : recentRequests.filter(r => r.targetDept === selectedDept);

  const openRequests = filteredRequests.filter(r => r.status !== 'RESOLVED');
  const blockedRequests = filteredRequests.filter(r => r.status === 'BLOCKED');

  // Status distribution
  const statusCounts: Record<string, number> = { NEW: 0, ACKNOWLEDGED: 0, IN_PROGRESS: 0, BLOCKED: 0, RESOLVED: 0 };
  filteredRequests.forEach(r => { if (statusCounts[r.status] !== undefined) statusCounts[r.status]++; });

  // Department ranking
  const deptRanking = SEWA_DEPARTMENTS
    .map(d => ({ dept: d, open: kpis[d.slug]?.openCount || 0, breach: kpis[d.slug]?.slaBreachCount || 0, blocked: kpis[d.slug]?.blockedCount || 0 }))
    .filter(d => d.open > 0)
    .sort((a, b) => b.blocked - a.blocked || b.breach - a.breach || b.open - a.open);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto bg-white min-h-screen flex items-center justify-center"
        style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-slate-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto bg-slate-50 min-h-screen pb-16"
      style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div className="bg-gradient-to-br from-[#1e40af] to-[#1e3a8a] text-white px-4 pt-5 pb-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h1 className="text-lg font-bold mb-0.5">Sewa Dashboard</h1>
            <p className="text-xs opacity-80">Even Hospital &middot; Management View</p>
          </div>
          <div className="flex gap-2">
            <Link href="/" className="px-3 py-1.5 bg-white/20 text-white rounded-lg text-xs font-medium hover:bg-white/30 transition-colors">
              EHRC Dash
            </Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 mt-2">
          <div className="bg-white/15 rounded-xl px-3 py-3 text-center">
            <p className="text-xl sm:text-2xl font-bold">{totalOpen}</p>
            <p className="text-[10px] opacity-80">Open</p>
          </div>
          <div className="bg-white/15 rounded-xl px-3 py-3 text-center">
            <p className="text-xl sm:text-2xl font-bold">{totalNewToday}</p>
            <p className="text-[10px] opacity-80">New Today</p>
          </div>
          <div className={`rounded-xl px-3 py-3 text-center ${totalBlocked > 0 ? 'bg-red-500/40' : 'bg-white/15'}`}>
            <p className="text-xl sm:text-2xl font-bold">{totalBlocked}</p>
            <p className="text-[10px] opacity-80">Blocked</p>
          </div>
          <div className={`rounded-xl px-3 py-3 text-center ${totalBreached > 0 ? 'bg-red-500/40' : 'bg-white/15'}`}>
            <p className="text-xl sm:text-2xl font-bold">{totalBreached}</p>
            <p className="text-[10px] opacity-80">SLA Breach</p>
          </div>
          <div className="bg-white/15 rounded-xl px-3 py-3 text-center col-span-2 sm:col-span-1">
            <p className="text-xl sm:text-2xl font-bold">{recentRequests.length}</p>
            <p className="text-[10px] opacity-80">Total</p>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex gap-2 mt-3">
          <button onClick={() => setViewMode('overview')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${viewMode === 'overview' ? 'bg-white text-blue-700' : 'bg-white/20 text-white'}`}>
            Overview
          </button>
          <button onClick={() => setViewMode('complaints')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${viewMode === 'complaints' ? 'bg-white text-blue-700' : 'bg-white/20 text-white'}`}>
            Complaints ({openRequests.length})
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Department Filter */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Filter by Department</label>
          <select
            value={selectedDept}
            onChange={e => setSelectedDept(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Departments</option>
            {SEWA_DEPARTMENTS.map(d => (
              <option key={d.slug} value={d.slug}>{d.name} {kpis[d.slug]?.openCount ? `(${kpis[d.slug].openCount} open)` : ''}</option>
            ))}
          </select>
        </div>

        {viewMode === 'overview' && (
          <>
            {/* Status Distribution */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Status Distribution</h3>
              <div className="flex gap-1 h-8 rounded-lg overflow-hidden">
                {(['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'BLOCKED', 'RESOLVED'] as RequestStatus[]).map(status => {
                  const count = statusCounts[status] || 0;
                  const total = filteredRequests.length || 1;
                  const pct = (count / total) * 100;
                  return pct > 0 ? (
                    <div key={status} style={{ width: `${pct}%`, background: STATUS_COLORS[status] }}
                      className="flex items-center justify-center transition-all duration-300"
                      title={`${status}: ${count}`}>
                      {pct > 10 && <span className="text-white text-[10px] font-bold">{count}</span>}
                    </div>
                  ) : null;
                })}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                {(['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'BLOCKED', 'RESOLVED'] as RequestStatus[]).map(status => (
                  <div key={status} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[status] }} />
                    <span className="text-[10px] text-slate-500">{status.replace('_', ' ')} ({statusCounts[status] || 0})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Blocked Complaints Alert */}
            {blockedRequests.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <h3 className="text-sm font-bold text-red-800 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Blocked Complaints ({blockedRequests.length})
                </h3>
                <div className="space-y-2">
                  {blockedRequests.map(req => (
                    <SewaResponsePanel
                      key={req.id}
                      request={req}
                      onActionComplete={loadData}
                      compact
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Department Hotspots */}
            {deptRanking.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-bold text-slate-900 mb-3">Department Hotspots</h3>
                <div className="space-y-2">
                  {deptRanking.map(({ dept, open, breach, blocked }) => {
                    const kpi = kpis[dept.slug];
                    const avgRes = kpi?.avgResolutionMin;
                    return (
                      <button
                        key={dept.slug}
                        onClick={() => { setSelectedDept(dept.slug); setViewMode('complaints'); }}
                        className="w-full flex items-center gap-3 py-2.5 px-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 rounded-lg transition-colors text-left"
                      >
                        <span className="text-lg w-8 text-center flex-shrink-0">{dept.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-900">{dept.name}</p>
                          <div className="flex gap-2 mt-0.5 flex-wrap">
                            <span className="text-[10px] text-slate-500">{open} open</span>
                            {blocked > 0 && <span className="text-[10px] text-red-600 font-semibold">{blocked} blocked</span>}
                            {breach > 0 && <span className="text-[10px] text-red-600 font-semibold">{breach} breached</span>}
                            {kpi?.newToday ? <span className="text-[10px] text-blue-600">+{kpi.newToday} today</span> : null}
                            {avgRes != null && <span className="text-[10px] text-slate-400">avg {avgRes}m</span>}
                          </div>
                        </div>
                        <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Complaints View — Actionable Cards */}
        {viewMode === 'complaints' && (
          <div className="space-y-2">
            {openRequests.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                <div className="text-4xl mb-3">&#10003;</div>
                <p className="text-sm text-slate-500">
                  No open complaints {selectedDept !== 'all' ? `for ${getDepartment(selectedDept)?.name}` : ''}
                </p>
              </div>
            ) : (
              openRequests.map(req => (
                <SewaResponsePanel
                  key={req.id}
                  request={req}
                  onActionComplete={loadData}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div className="fixed bottom-0 left-0 right-0 max-w-4xl mx-auto bg-white border-t border-slate-100 px-4 py-2 flex justify-between items-center z-40">
        <Link href="/sewa" className="text-xs text-blue-600 font-medium hover:underline">File Complaint</Link>
        <Link href="/" className="text-xs text-blue-600 font-medium hover:underline">EHRC Dashboard</Link>
        <Link href="/sewa/queue" className="text-xs text-blue-600 font-medium hover:underline">Dept Login</Link>
      </div>
    </div>
  );
}
