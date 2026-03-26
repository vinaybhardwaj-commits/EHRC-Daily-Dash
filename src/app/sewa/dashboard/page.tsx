'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
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
  RESOLVED: '#10b981',
};

interface DeptKPI {
  openCount: number;
  newToday: number;
  slaBreachCount: number;
  avgResolutionMin: number | null;
}

export default function SewaDashboardPage() {
  const [kpis, setKpis] = useState<Record<string, DeptKPI>>({});
  const [recentRequests, setRecentRequests] = useState<SewaRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [, setTick] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const [kpiRes, reqRes] = await Promise.all([
        fetch('/api/sewa/kpis'),
        fetch('/api/sewa/requests?limit=50'),
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

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
      loadData();
    }, 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  // ── Aggregate stats ──
  const allDeptSlugs = SEWA_DEPARTMENTS.map(d => d.slug);
  const totalOpen = allDeptSlugs.reduce((sum, slug) => sum + (kpis[slug]?.openCount || 0), 0);
  const totalNewToday = allDeptSlugs.reduce((sum, slug) => sum + (kpis[slug]?.newToday || 0), 0);
  const totalBreached = allDeptSlugs.reduce((sum, slug) => sum + (kpis[slug]?.slaBreachCount || 0), 0);
  const totalRequests = recentRequests.length;

  // Filter requests by selected dept
  const filteredRequests = selectedDept === 'all'
    ? recentRequests
    : recentRequests.filter(r => r.targetDept === selectedDept);

  // Status distribution
  const statusCounts = { NEW: 0, ACKNOWLEDGED: 0, IN_PROGRESS: 0, RESOLVED: 0 };
  filteredRequests.forEach(r => { if (statusCounts[r.status] !== undefined) statusCounts[r.status]++; });

  // Department ranking by open complaints
  const deptRanking = SEWA_DEPARTMENTS
    .map(d => ({ dept: d, open: kpis[d.slug]?.openCount || 0, breach: kpis[d.slug]?.slaBreachCount || 0 }))
    .filter(d => d.open > 0)
    .sort((a, b) => b.breach - a.breach || b.open - a.open);

  if (loading) {
    return (
      <div className="max-w-[800px] mx-auto bg-white min-h-screen flex items-center justify-center"
        style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <p className="text-sm text-gray-500">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[800px] mx-auto bg-gray-50 min-h-screen pb-16"
      style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div className="bg-gradient-to-br from-[#1e40af] to-[#1e3a8a] text-white px-4 pt-5 pb-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h1 className="text-lg font-bold mb-0.5">Sewa Dashboard</h1>
            <p className="text-xs opacity-80">Even Hospital &middot; Management View</p>
          </div>
          <div className="flex gap-2">
            <Link href="/sewa" className="px-3 py-1.5 bg-white/20 text-white rounded-lg text-xs font-medium hover:bg-white/30 transition-colors">
              Sewa Home
            </Link>
            <Link href="/" className="px-3 py-1.5 bg-white/20 text-white rounded-lg text-xs font-medium hover:bg-white/30 transition-colors">
              EHRC Dash
            </Link>
          </div>
        </div>

        {/* Top-line KPIs */}
        <div className="grid grid-cols-4 gap-3 mt-2">
          <div className="bg-white/15 rounded-xl px-3 py-3 text-center">
            <p className="text-2xl font-bold">{totalOpen}</p>
            <p className="text-[10px] opacity-80">Open</p>
          </div>
          <div className="bg-white/15 rounded-xl px-3 py-3 text-center">
            <p className="text-2xl font-bold">{totalNewToday}</p>
            <p className="text-[10px] opacity-80">New Today</p>
          </div>
          <div className={`rounded-xl px-3 py-3 text-center ${totalBreached > 0 ? 'bg-red-500/40' : 'bg-white/15'}`}>
            <p className="text-2xl font-bold">{totalBreached}</p>
            <p className="text-[10px] opacity-80">SLA Breach</p>
          </div>
          <div className="bg-white/15 rounded-xl px-3 py-3 text-center">
            <p className="text-2xl font-bold">{totalRequests}</p>
            <p className="text-[10px] opacity-80">Recent</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* Department Filter */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Filter by Department</label>
          <select
            value={selectedDept}
            onChange={e => setSelectedDept(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Departments</option>
            {SEWA_DEPARTMENTS.map(d => (
              <option key={d.slug} value={d.slug}>{d.icon} {d.name}</option>
            ))}
          </select>
        </div>

        {/* Status Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Status Distribution</h3>
          <div className="flex gap-1 h-8 rounded-lg overflow-hidden">
            {(['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'] as RequestStatus[]).map(status => {
              const count = statusCounts[status];
              const total = filteredRequests.length || 1;
              const pct = (count / total) * 100;
              return pct > 0 ? (
                <div key={status} style={{ width: `${pct}%`, background: STATUS_COLORS[status] }}
                  className="flex items-center justify-center transition-all duration-300"
                  title={`${status}: ${count}`}>
                  {pct > 12 && <span className="text-white text-[10px] font-bold">{count}</span>}
                </div>
              ) : null;
            })}
          </div>
          <div className="flex justify-between mt-2">
            {(['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'] as RequestStatus[]).map(status => (
              <div key={status} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[status] }} />
                <span className="text-[10px] text-gray-500">{status.replace('_', ' ')} ({statusCounts[status]})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Department Ranking (hotspots) */}
        {deptRanking.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Department Hotspots</h3>
            <div className="space-y-2">
              {deptRanking.map(({ dept, open, breach }) => {
                const kpi = kpis[dept.slug];
                const avgRes = kpi?.avgResolutionMin;
                return (
                  <div key={dept.slug} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    <span className="text-xl w-8 text-center">{dept.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-900">{dept.name}</p>
                      <div className="flex gap-3 mt-0.5">
                        <span className="text-[10px] text-gray-500">{open} open</span>
                        {breach > 0 && <span className="text-[10px] text-red-600 font-semibold">{breach} breached</span>}
                        {kpi?.newToday ? <span className="text-[10px] text-blue-600">+{kpi.newToday} today</span> : null}
                        {avgRes != null && <span className="text-[10px] text-gray-400">avg {avgRes}m</span>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {breach > 0 && <span className="bg-red-100 text-red-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">🔥</span>}
                      {open >= 5 && <span className="bg-amber-100 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">⚠️</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Complaints */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-3">
            Recent Complaints {selectedDept !== 'all' ? `— ${getDepartment(selectedDept)?.name}` : ''}
          </h3>
          {filteredRequests.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">No complaints found</p>
          ) : (
            <div className="space-y-2">
              {filteredRequests.slice(0, 20).map(req => {
                const dept = getDepartment(req.targetDept);
                const elapsed = (Date.now() - new Date(req.createdAt).getTime()) / 60000;
                const breached = req.status !== 'RESOLVED' && (
                  (req.status === 'NEW' && elapsed > req.responseSlaMin) || elapsed > req.resolutionSlaMin
                );
                return (
                  <div key={req.id} className={`flex items-center gap-3 py-2 border-b border-gray-50 last:border-0 ${breached ? 'bg-red-50 -mx-2 px-2 rounded-lg' : ''}`}>
                    <span className="text-lg">{dept?.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">{req.complaintTypeName}</p>
                      <p className="text-[10px] text-gray-500">
                        {req.id} &middot; {req.requestorName} → {dept?.name}
                        {req.priority === 'urgent' && ' · 🚨'}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                        style={{ background: STATUS_COLORS[req.status] }}>
                        {req.status}
                      </span>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {elapsed < 60 ? `${Math.round(elapsed)}m ago` :
                         elapsed < 1440 ? `${Math.round(elapsed / 60)}h ago` :
                         `${Math.round(elapsed / 1440)}d ago`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer nav */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[800px] mx-auto bg-white border-t border-gray-100 px-4 py-2 flex justify-between items-center">
        <Link href="/sewa" className="text-xs text-blue-600 font-medium hover:underline">← Sewa Home</Link>
        <Link href="/sewa/queue" className="text-xs text-blue-600 font-medium hover:underline">Responder Queue →</Link>
      </div>
    </div>
  );
}
