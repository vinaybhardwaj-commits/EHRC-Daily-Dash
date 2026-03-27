'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface SewaKpiData {
  openCount: number;
  newToday: number;
  slaBreachCount: number;
  avgResolutionMin: number | null;
}

interface SewaRequestRow {
  id: string;
  requestorName: string;
  requestorDept: string;
  targetDept: string;
  complaintTypeId: string;
  complaintTypeName: string;
  priority: string;
  status: string;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  responseSlaMin: number;
  resolutionSlaMin: number;
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

function elapsedStr(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return mins + 'm';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ' + (mins % 60) + 'm';
  const days = Math.floor(hrs / 24);
  return days + 'd ' + (hrs % 24) + 'h';
}

function slaPercent(createdAt: string, slaMin: number): number {
  const elapsed = (Date.now() - new Date(createdAt).getTime()) / 60000;
  return Math.max(0, Math.min(100, 100 - (elapsed / slaMin) * 100));
}

const STATUS_CHIP: Record<string, { bg: string; text: string; label: string }> = {
  NEW: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'New' },
  ACKNOWLEDGED: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Ack' },
  IN_PROGRESS: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'In Progress' },
  RESOLVED: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Resolved' },
};

export default function SewaOverviewPanel() {
  const [kpis, setKpis] = useState<Record<string, SewaKpiData>>({});
  const [requests, setRequests] = useState<SewaRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [kpiRes, reqRes] = await Promise.all([
        fetch('/api/sewa/kpis'),
        fetch('/api/sewa/requests?limit=15'),
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

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Aggregate hospital-wide totals
  const totals = Object.values(kpis).reduce(
    (acc, k) => ({
      open: acc.open + k.openCount,
      newToday: acc.newToday + k.newToday,
      breached: acc.breached + k.slaBreachCount,
    }),
    { open: 0, newToday: 0, breached: 0 }
  );

  // Sort departments by open count desc for hotspots
  const hotspots = Object.entries(kpis)
    .filter(([, k]) => k.openCount > 0)
    .sort((a, b) => b[1].openCount - a[1].openCount);

  const hasData = totals.open > 0 || totals.newToday > 0 || requests.length > 0;
  const healthColor = totals.breached > 2 ? 'red' : totals.breached > 0 ? 'amber' : 'emerald';

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
      {/* Collapsed Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <div className={"flex items-center justify-between px-4 py-3 bg-gradient-to-r text-white " + hs.headerBg}>
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-white/20 text-white text-sm font-bold flex items-center justify-center">S</span>
            <div>
              <div className="text-sm font-bold">Sewa Service Requests</div>
              <div className="text-[11px] opacity-80">Internal staff complaint tracker</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!hasData && <span className="text-xs opacity-80">No active requests</span>}
            {hasData && (
              <div className="flex items-center gap-2.5 text-xs">
                <span className="bg-white/20 px-2 py-0.5 rounded-full font-bold">{totals.open} open</span>
                {totals.breached > 0 && (
                  <span className="bg-red-500/30 px-2 py-0.5 rounded-full font-bold">{totals.breached} SLA breach</span>
                )}
                {totals.newToday > 0 && (
                  <span className="bg-white/20 px-2 py-0.5 rounded-full">+{totals.newToday} today</span>
                )}
              </div>
            )}
            <svg className={"w-4 h-4 transition-transform " + (expanded ? 'rotate-180' : '')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-4">
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-900">{totals.open}</div>
              <div className="text-[11px] font-medium text-blue-600">Open</div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-orange-900">{totals.newToday}</div>
              <div className="text-[11px] font-medium text-orange-600">New Today</div>
            </div>
            <div className={"rounded-lg p-3 text-center border " + (totals.breached > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200')}>
              <div className={"text-2xl font-bold " + (totals.breached > 0 ? 'text-red-900' : 'text-slate-400')}>{totals.breached}</div>
              <div className={"text-[11px] font-medium " + (totals.breached > 0 ? 'text-red-600' : 'text-slate-400')}>SLA Breached</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-slate-900">{requests.length}</div>
              <div className="text-[11px] font-medium text-slate-500">Recent</div>
            </div>
          </div>

          {/* Department Hotspots */}
          {hotspots.length > 0 && (
            <div className="mb-5">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Department Hotspots</div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {hotspots.map(([slug, k]) => (
                  <a
                    key={slug}
                    href={'/sewa/queue'}
                    className={"flex items-center gap-2 p-2.5 rounded-lg border transition-colors hover:shadow-sm " + (k.slaBreachCount > 0 ? 'border-red-200 bg-red-50/50 hover:bg-red-50' : 'border-slate-200 bg-white hover:bg-slate-50')}
                  >
                    <span className="w-7 h-7 rounded-full bg-slate-700 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{DEPT_ICONS[slug] || '??'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-800 truncate">{DEPT_LABELS[slug] || slug}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-slate-500">{k.openCount} open</span>
                        {k.slaBreachCount > 0 && (
                          <span className="text-[10px] text-red-600 font-bold">{k.slaBreachCount} breach</span>
                        )}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Recent Complaints Table */}
          {requests.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Recent Complaints</div>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-3 py-2 font-semibold text-slate-600">ID</th>
                        <th className="text-left px-3 py-2 font-semibold text-slate-600">From</th>
                        <th className="text-left px-3 py-2 font-semibold text-slate-600">To</th>
                        <th className="text-left px-3 py-2 font-semibold text-slate-600">Type</th>
                        <th className="text-left px-3 py-2 font-semibold text-slate-600">Status</th>
                        <th className="text-left px-3 py-2 font-semibold text-slate-600">SLA</th>
                        <th className="text-right px-3 py-2 font-semibold text-slate-600">Elapsed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map((r) => {
                        const chip = STATUS_CHIP[r.status] || STATUS_CHIP.NEW;
                        const resSla = slaPercent(r.createdAt, r.resolutionSlaMin);
                        const slaColor = r.status === 'RESOLVED' ? 'bg-emerald-400' : resSla > 50 ? 'bg-emerald-400' : resSla > 25 ? 'bg-amber-400' : 'bg-red-500';
                        return (
                          <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                            <td className="px-3 py-2 font-mono font-bold text-blue-600 whitespace-nowrap">{r.id}</td>
                            <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{DEPT_LABELS[r.requestorDept] || r.requestorDept}</td>
                            <td className="px-3 py-2 text-slate-900 font-semibold whitespace-nowrap">{DEPT_LABELS[r.targetDept] || r.targetDept}</td>
                            <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate">{r.complaintTypeName}</td>
                            <td className="px-3 py-2">
                              <span className={"px-1.5 py-0.5 rounded text-[10px] font-bold " + chip.bg + " " + chip.text}>{chip.label}</span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={"h-full rounded-full transition-all " + slaColor} style={{ width: (r.status === 'RESOLVED' ? 100 : Math.max(resSla, 2)) + '%' }} />
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right text-slate-500 whitespace-nowrap">{elapsedStr(r.createdAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Footer link to full Sewa dashboard */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <a
              href="/sewa/dashboard"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
            >
              Open Sewa Dashboard →
            </a>
            <div className="flex items-center gap-2">
              <a
                href="/sewa/queue"
                className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
              >
                Responder Queue
              </a>
              <span className="text-slate-300">|</span>
              <a
                href="/sewa"
                className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
              >
                File Complaint
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
