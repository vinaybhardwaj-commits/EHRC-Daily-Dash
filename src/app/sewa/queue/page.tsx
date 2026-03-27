'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import SewaResponsePanel from '@/components/SewaResponsePanel';
import {
  SEWA_DEPARTMENTS,
  getDepartment,
  type DepartmentConfig,
  type SewaRequest,
} from '@/lib/sewa-config';

// ── Main Queue Page ─────────────────────────────────────────────

export default function SewaQueuePage() {
  // ── Auth state ──
  const [responderName, setResponderName] = useState('');
  const [responderDept, setResponderDept] = useState('');
  const [isAuthed, setIsAuthed] = useState(false);

  // ── Data state ──
  const [requests, setRequests] = useState<SewaRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'open' | 'blocked' | 'all'>('open');
  const [selectedDeptConfig, setSelectedDeptConfig] = useState<DepartmentConfig | null>(null);

  // ── Load saved identity ──
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('sewa-responder') || '{}');
      if (saved.name && saved.dept) {
        setResponderName(saved.name);
        setResponderDept(saved.dept);
        setIsAuthed(true);
      }
    } catch { /* first time */ }
  }, []);

  useEffect(() => {
    if (responderDept) {
      setSelectedDeptConfig(getDepartment(responderDept) || null);
    }
  }, [responderDept]);

  // ── Fetch queue ──
  const loadQueue = useCallback(async () => {
    if (!responderDept) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sewa/requests?dept=${encodeURIComponent(responderDept)}&limit=200`);
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch { /* silently fail */ }
    setLoading(false);
  }, [responderDept]);

  useEffect(() => {
    if (isAuthed) loadQueue();
  }, [isAuthed, loadQueue]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isAuthed) loadQueue();
    }, 30000);
    return () => clearInterval(interval);
  }, [isAuthed, loadQueue]);

  // ── Auth handler ──
  const handleAuth = () => {
    if (!responderName.trim() || !responderDept) return;
    const user = { name: responderName.trim(), dept: responderDept };
    try { sessionStorage.setItem('sewa-responder', JSON.stringify(user)); } catch { /* ok */ }
    setIsAuthed(true);
  };

  // ════════════════════════════════════════════════════════════════
  // RENDER: Auth Screen
  // ════════════════════════════════════════════════════════════════
  if (!isAuthed) {
    return (
      <div className="max-w-[480px] mx-auto bg-white min-h-screen" style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <div className="bg-gradient-to-br from-[#059669] to-[#047857] text-white px-4 pt-12 pb-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-3xl mx-auto mb-3">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-1">Department Login</h1>
          <p className="text-sm opacity-90">Sign in to manage your department's complaints</p>
        </div>
        <div className="p-6">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Your Name *</label>
          <input
            value={responderName}
            onChange={e => setResponderName(e.target.value)}
            placeholder="e.g., Rajesh Kumar"
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm mb-4 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200"
          />

          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Your Department *</label>
          <select
            value={responderDept}
            onChange={e => setResponderDept(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm mb-6 bg-white focus:outline-none focus:border-emerald-500"
          >
            <option value="">Select department...</option>
            {SEWA_DEPARTMENTS.map(d => (
              <option key={d.slug} value={d.slug}>{d.name}</option>
            ))}
          </select>

          <button
            onClick={handleAuth}
            disabled={!responderName.trim() || !responderDept}
            className="w-full py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] hover:bg-emerald-700"
          >
            View My Queue
          </button>

          <div className="mt-6 text-center">
            <Link href="/sewa" className="text-sm text-emerald-600 font-medium hover:underline">
              &larr; Back to Sewa
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // RENDER: Queue View
  // ════════════════════════════════════════════════════════════════

  const filteredRequests = filter === 'all'
    ? requests
    : filter === 'blocked'
    ? requests.filter(r => r.status === 'BLOCKED')
    : requests.filter(r => r.status !== 'RESOLVED');

  const openCount = requests.filter(r => r.status !== 'RESOLVED').length;
  const blockedCount = requests.filter(r => r.status === 'BLOCKED').length;
  const breachedCount = requests.filter(r => {
    if (r.status === 'RESOLVED') return false;
    const elapsed = (Date.now() - new Date(r.createdAt).getTime()) / 60000;
    return (r.status === 'NEW' && elapsed > r.responseSlaMin) || elapsed > r.resolutionSlaMin;
  }).length;

  return (
    <div className="max-w-[640px] mx-auto bg-slate-50 min-h-screen pb-16" style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div className="bg-gradient-to-br from-[#059669] to-[#047857] text-white px-4 pt-5 pb-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h1 className="text-lg font-bold mb-0.5">{selectedDeptConfig?.name || 'Department'} Queue</h1>
            <p className="text-xs opacity-80">Sewa &middot; Respond to complaints</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold opacity-90">{responderName}</p>
            <button onClick={() => { setIsAuthed(false); sessionStorage.removeItem('sewa-responder'); }}
              className="text-[10px] opacity-70 hover:opacity-100 bg-transparent border-none text-white cursor-pointer underline p-0">
              Switch
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mt-2">
          <div className="bg-white/15 rounded-lg px-2 py-2 text-center">
            <p className="text-lg font-bold">{openCount}</p>
            <p className="text-[9px] opacity-80">Open</p>
          </div>
          <div className={`rounded-lg px-2 py-2 text-center ${blockedCount > 0 ? 'bg-red-500/30' : 'bg-white/15'}`}>
            <p className="text-lg font-bold">{blockedCount}</p>
            <p className="text-[9px] opacity-80">Blocked</p>
          </div>
          <div className={`rounded-lg px-2 py-2 text-center ${breachedCount > 0 ? 'bg-red-500/30' : 'bg-white/15'}`}>
            <p className="text-lg font-bold">{breachedCount}</p>
            <p className="text-[9px] opacity-80">Breach</p>
          </div>
          <div className="bg-white/15 rounded-lg px-2 py-2 text-center">
            <p className="text-lg font-bold">{requests.length}</p>
            <p className="text-[9px] opacity-80">Total</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mt-3">
          <button onClick={() => setFilter('open')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${filter === 'open' ? 'bg-white text-emerald-700' : 'bg-white/20 text-white'}`}>
            Open ({openCount})
          </button>
          <button onClick={() => setFilter('blocked')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${filter === 'blocked' ? 'bg-white text-red-700' : 'bg-white/20 text-white'}`}>
            Blocked ({blockedCount})
          </button>
          <button onClick={() => setFilter('all')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${filter === 'all' ? 'bg-white text-emerald-700' : 'bg-white/20 text-white'}`}>
            All ({requests.length})
          </button>
        </div>
      </div>

      {/* Request List */}
      <div className="p-4 space-y-2">
        {loading && requests.length === 0 ? (
          <div className="text-center py-16">
            <svg className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-slate-500">Loading queue...</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <div className="text-4xl mb-3">&#10003;</div>
            <p className="text-sm text-slate-500">
              {filter === 'blocked' ? 'No blocked complaints' :
               filter === 'open' ? 'No open complaints - great job!' :
               'No complaints found'}
            </p>
          </div>
        ) : (
          filteredRequests.map(req => (
            <SewaResponsePanel
              key={req.id}
              request={req}
              onActionComplete={loadQueue}
              responderName={responderName}
            />
          ))
        )}
      </div>

      {/* Footer nav */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[640px] mx-auto bg-white border-t border-slate-100 px-4 py-2 flex justify-between items-center z-40">
        <Link href="/sewa" className="text-xs text-emerald-600 font-medium hover:underline">&larr; File Complaint</Link>
        <Link href="/" className="text-xs text-emerald-600 font-medium hover:underline">EHRC Dashboard</Link>
        <Link href="/sewa/dashboard" className="text-xs text-emerald-600 font-medium hover:underline">Dashboard &rarr;</Link>
      </div>
    </div>
  );
}
