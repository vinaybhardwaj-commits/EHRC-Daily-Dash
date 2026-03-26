'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  SEWA_DEPARTMENTS,
  getDepartment,
  type DepartmentConfig,
  type SewaRequest,
  type RequestStatus,
} from '@/lib/sewa-config';

// ── Sub-components ──────────────────────────────────────────────

function SLABar({ slaMinutes, createdAt, label }: {
  slaMinutes: number;
  createdAt: string;
  label: string;
}) {
  const minutesPassed = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  const minutesRemaining = Math.max(0, slaMinutes - minutesPassed);
  const pct = slaMinutes > 0 ? Math.max(0, minutesRemaining / slaMinutes) : 0;
  const color = pct > 0.5 ? '#10b981' : pct > 0.25 ? '#f59e0b' : '#dc2626';
  const breached = minutesRemaining <= 0;

  return (
    <div className="mb-1.5">
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-[10px] text-gray-500">{label}</span>
        <span className="text-[10px] font-semibold" style={{ color }}>
          {breached ? 'BREACHED' : `${minutesRemaining}m left`}
        </span>
      </div>
      <div className="bg-gray-200 h-1 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300" style={{ background: color, width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-3 rounded-xl text-sm font-medium shadow-lg z-[1000] max-w-[90%] text-center"
      style={{ animation: 'sewaSlideUp 0.3s ease-out' }}>
      {message}
    </div>
  );
}

const STATUS_COLORS: Record<RequestStatus, string> = {
  NEW: '#3b82f6',
  ACKNOWLEDGED: '#f59e0b',
  IN_PROGRESS: '#8b5cf6',
  RESOLVED: '#10b981',
};

// ── Main Queue Page ─────────────────────────────────────────────

export default function SewaQueuePage() {
  // ── Auth state ──
  const [responderName, setResponderName] = useState('');
  const [responderDept, setResponderDept] = useState('');
  const [isAuthed, setIsAuthed] = useState(false);

  // ── Data state ──
  const [requests, setRequests] = useState<SewaRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [, setTick] = useState(0);
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

  // Set dept config after auth
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
      const allUrl = `/api/sewa/requests?dept=${encodeURIComponent(responderDept)}&limit=200`;
      const res = await fetch(allUrl);
      if (res.ok) {
        const data = await res.json();
        let reqs: SewaRequest[] = data.requests || [];
        if (filter === 'open') {
          reqs = reqs.filter(r => r.status !== 'RESOLVED');
        }
        setRequests(reqs);
      }
    } catch { /* silently fail */ }
    setLoading(false);
  }, [responderDept, filter]);

  useEffect(() => {
    if (isAuthed) loadQueue();
  }, [isAuthed, loadQueue]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
      if (isAuthed) loadQueue();
    }, 30000);
    return () => clearInterval(interval);
  }, [isAuthed, loadQueue]);

  // ── Action handler ──
  const handleAction = async (requestId: string, action: 'acknowledge' | 'in_progress' | 'resolve') => {
    try {
      const res = await fetch('/api/sewa/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          action,
          responderName,
          comment: actionComment || undefined,
        }),
      });
      if (res.ok) {
        const labels = { acknowledge: 'Acknowledged', in_progress: 'Marked In Progress', resolve: 'Resolved' };
        setToast(`${requestId} — ${labels[action]}`);
        setActionComment('');
        setExpandedId(null);
        loadQueue();
      } else {
        const data = await res.json();
        setToast(data.error || 'Action failed');
      }
    } catch {
      setToast('Network error');
    }
  };

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
          <div className="text-5xl mb-3">📋</div>
          <h1 className="text-2xl font-bold mb-1">Sewa Queue</h1>
          <p className="text-sm opacity-90">Department Responder View</p>
        </div>
        <div className="p-6" style={{ animation: 'sewaFadeIn 0.3s ease-out' }}>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Sign In</h2>
          <p className="text-sm text-gray-500 mb-6">Enter your details to view your department&apos;s queue</p>

          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Your Name *</label>
          <input
            value={responderName}
            onChange={e => setResponderName(e.target.value)}
            placeholder="e.g., Rajesh Kumar"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm mb-4 focus:outline-none focus:border-emerald-500"
          />

          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Your Department *</label>
          <select
            value={responderDept}
            onChange={e => setResponderDept(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm mb-6 bg-white focus:outline-none focus:border-emerald-500"
          >
            <option value="">Select department...</option>
            {SEWA_DEPARTMENTS.map(d => (
              <option key={d.slug} value={d.slug}>{d.name}</option>
            ))}
          </select>

          <button
            onClick={handleAuth}
            disabled={!responderName.trim() || !responderDept}
            className="w-full py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            View Queue
          </button>

          <div className="mt-6 text-center">
            <Link href="/sewa" className="text-sm text-emerald-600 font-medium hover:underline">
              ← Back to Sewa
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // RENDER: Queue View
  // ════════════════════════════════════════════════════════════════
  const openCount = requests.filter(r => r.status !== 'RESOLVED').length;
  const breachedCount = requests.filter(r => {
    if (r.status === 'RESOLVED') return false;
    const elapsed = (Date.now() - new Date(r.createdAt).getTime()) / 60000;
    return (r.status === 'NEW' && elapsed > r.responseSlaMin) || elapsed > r.resolutionSlaMin;
  }).length;

  return (
    <div className="max-w-[600px] mx-auto bg-gray-50 min-h-screen" style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div className="bg-gradient-to-br from-[#059669] to-[#047857] text-white px-4 pt-5 pb-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h1 className="text-lg font-bold mb-0.5">{selectedDeptConfig?.icon} {selectedDeptConfig?.name} Queue</h1>
            <p className="text-xs opacity-80">Sewa &middot; Responder View</p>
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
        <div className="flex gap-3 mt-2">
          <div className="flex-1 bg-white/15 rounded-lg px-3 py-2 text-center">
            <p className="text-xl font-bold">{openCount}</p>
            <p className="text-[10px] opacity-80">Open</p>
          </div>
          <div className={`flex-1 rounded-lg px-3 py-2 text-center ${breachedCount > 0 ? 'bg-red-500/30' : 'bg-white/15'}`}>
            <p className="text-xl font-bold">{breachedCount}</p>
            <p className="text-[10px] opacity-80">SLA Breach</p>
          </div>
          <div className="flex-1 bg-white/15 rounded-lg px-3 py-2 text-center">
            <p className="text-xl font-bold">{requests.length}</p>
            <p className="text-[10px] opacity-80">Total</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mt-3">
          <button onClick={() => setFilter('open')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${filter === 'open' ? 'bg-white text-emerald-700' : 'bg-white/20 text-white'}`}>
            Open
          </button>
          <button onClick={() => setFilter('all')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${filter === 'all' ? 'bg-white text-emerald-700' : 'bg-white/20 text-white'}`}>
            All
          </button>
        </div>
      </div>

      {/* Request List */}
      <div className="p-4">
        {loading && requests.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-gray-500">Loading...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">✅</div>
            <p className="text-sm text-gray-500">{filter === 'open' ? 'No open complaints — great job!' : 'No complaints found'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map(req => {
              const isExpanded = expandedId === req.id;
              const elapsed = (Date.now() - new Date(req.createdAt).getTime()) / 60000;
              const responsBreached = req.status === 'NEW' && elapsed > req.responseSlaMin;
              const resolutionBreached = req.status !== 'RESOLVED' && elapsed > req.resolutionSlaMin;

              return (
                <div key={req.id}
                  className={`bg-white border rounded-xl overflow-hidden transition-all ${responsBreached || resolutionBreached ? 'border-red-300' : 'border-gray-200'}`}
                  style={req.priority === 'urgent' && req.status !== 'RESOLVED' ? { animation: 'sewaPulseEmergency 2s infinite' } : undefined}>

                  {/* Summary row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : req.id)}
                    className="w-full p-3 text-left cursor-pointer bg-transparent border-none">
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {req.priority === 'urgent' && <span className="text-[10px]">🚨</span>}
                          <p className="text-xs font-bold text-gray-900 truncate">{req.complaintTypeName}</p>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">{req.id} &middot; by {req.requestorName} ({getDepartment(req.requestorDept)?.name})</p>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white ml-2 flex-shrink-0"
                        style={{ background: STATUS_COLORS[req.status] }}>
                        {req.status}
                      </span>
                    </div>
                    <SLABar slaMinutes={req.responseSlaMin} createdAt={req.createdAt} label="Response" />
                    <SLABar slaMinutes={req.resolutionSlaMin} createdAt={req.createdAt} label="Resolution" />
                  </button>

                  {/* Expanded details + actions */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 p-3 bg-gray-50 space-y-2" style={{ animation: 'sewaFadeIn 0.2s ease-out' }}>
                      {req.location && <p className="text-xs text-gray-600"><span className="font-semibold">Location:</span> {req.location}</p>}
                      <p className="text-xs text-gray-600"><span className="font-semibold">Description:</span> {req.description}</p>
                      {req.patientName && <p className="text-xs text-gray-600"><span className="font-semibold">Patient:</span> {req.patientName} {req.patientUhid ? `(${req.patientUhid})` : ''}</p>}
                      {req.subMenu && <p className="text-xs text-gray-600"><span className="font-semibold">Category:</span> {req.subMenu}</p>}

                      {/* Extra fields */}
                      {Object.keys(req.extraFields || {}).length > 0 && (
                        <div className="bg-white rounded-lg p-2 space-y-1">
                          {Object.entries(req.extraFields).filter(([, v]) => v).map(([k, v]) => (
                            <p key={k} className="text-[11px] text-gray-600">
                              <span className="font-semibold capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}:</span> {v}
                            </p>
                          ))}
                        </div>
                      )}

                      <p className="text-[10px] text-gray-400">
                        Raised {new Date(req.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                        {req.acknowledgedBy && ` · Ack'd by ${req.acknowledgedBy}`}
                        {req.resolvedBy && ` · Resolved by ${req.resolvedBy}`}
                      </p>

                      {/* Comments */}
                      {(req.comments || []).length > 0 && (
                        <div className="bg-white rounded-lg p-2 space-y-1">
                          <p className="text-[10px] font-semibold text-gray-500">Comments</p>
                          {(req.comments as { user: string; text: string; time: string }[]).map((c, i) => (
                            <p key={i} className="text-[11px] text-gray-600">
                              <span className="font-semibold">{c.user}:</span> {c.text}
                              <span className="text-gray-400 ml-1">({new Date(c.time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })})</span>
                            </p>
                          ))}
                        </div>
                      )}

                      {/* Action buttons */}
                      {req.status !== 'RESOLVED' && (
                        <div className="pt-2 space-y-2">
                          <input
                            value={actionComment}
                            onChange={e => setActionComment(e.target.value)}
                            placeholder="Add a comment (optional)"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-emerald-500"
                          />
                          <div className="flex gap-2">
                            {req.status === 'NEW' && (
                              <button onClick={() => handleAction(req.id, 'acknowledge')}
                                className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold cursor-pointer transition-all active:scale-[0.97]">
                                Acknowledge
                              </button>
                            )}
                            {(req.status === 'NEW' || req.status === 'ACKNOWLEDGED') && (
                              <button onClick={() => handleAction(req.id, 'in_progress')}
                                className="flex-1 py-2 bg-purple-500 text-white rounded-lg text-xs font-bold cursor-pointer transition-all active:scale-[0.97]">
                                In Progress
                              </button>
                            )}
                            <button onClick={() => handleAction(req.id, 'resolve')}
                              className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold cursor-pointer transition-all active:scale-[0.97]">
                              Resolve
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[600px] mx-auto bg-white border-t border-gray-100 px-4 py-2 flex justify-between items-center">
        <Link href="/sewa" className="text-xs text-emerald-600 font-medium hover:underline">← Sewa Home</Link>
        <Link href="/sewa/dashboard" className="text-xs text-emerald-600 font-medium hover:underline">Dashboard →</Link>
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
