'use client';

import React, { useState } from 'react';
import { SEWA_DEPARTMENTS, getDepartment, type SewaRequest, type RequestStatus } from '@/lib/sewa-config';

// ── Status config ──
const STATUS_CONFIG: Record<RequestStatus, { bg: string; text: string; label: string; dot: string }> = {
  NEW: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'New', dot: 'bg-blue-500' },
  ACKNOWLEDGED: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Acknowledged', dot: 'bg-amber-500' },
  IN_PROGRESS: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'In Progress', dot: 'bg-indigo-500' },
  BLOCKED: { bg: 'bg-red-100', text: 'text-red-700', label: 'Blocked', dot: 'bg-red-500' },
  RESOLVED: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Resolved', dot: 'bg-emerald-500' },
};

const ACTION_LABELS: Record<string, string> = {
  acknowledge: 'Acknowledged',
  in_progress: 'In Progress',
  resolve: 'Resolved',
  blocked: 'Blocked',
  unblock: 'Unblocked',
};

// ── Helper: elapsed time ──
function elapsedStr(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ' + (mins % 60) + 'm ago';
  const days = Math.floor(hrs / 24);
  return days + 'd ' + (hrs % 24) + 'h ago';
}

// ── SLA Bar ──
function SLABar({ slaMinutes, createdAt, label, resolved }: {
  slaMinutes: number;
  createdAt: string;
  label: string;
  resolved?: boolean;
}) {
  const minutesPassed = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  const minutesRemaining = Math.max(0, slaMinutes - minutesPassed);
  const pct = slaMinutes > 0 ? Math.max(0, minutesRemaining / slaMinutes) : 0;
  const breached = minutesRemaining <= 0;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 w-16 flex-shrink-0">{label}</span>
      <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            resolved ? 'bg-emerald-400' : breached ? 'bg-red-500' : pct > 0.5 ? 'bg-emerald-400' : pct > 0.25 ? 'bg-amber-400' : 'bg-red-500'
          }`}
          style={{ width: `${resolved ? 100 : pct * 100}%` }}
        />
      </div>
      <span className={`text-[10px] font-semibold flex-shrink-0 ${
        resolved ? 'text-emerald-600' : breached ? 'text-red-600' : pct > 0.5 ? 'text-emerald-600' : pct > 0.25 ? 'text-amber-600' : 'text-red-600'
      }`}>
        {resolved ? 'Done' : breached ? 'BREACH' : `${minutesRemaining}m`}
      </span>
    </div>
  );
}

// ── Props ──
interface SewaResponsePanelProps {
  request: SewaRequest;
  onActionComplete: () => void;
  /** Pre-fill the responder name (from auth in queue, or from page context) */
  responderName?: string;
  /** Show compact view (for overview/dashboard embed) vs full view (for queue) */
  compact?: boolean;
}

export default function SewaResponsePanel({ request: req, onActionComplete, responderName: prefillName, compact = false }: SewaResponsePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [comment, setComment] = useState('');
  const [blockingDept, setBlockingDept] = useState('');
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [responderName, setResponderName] = useState(prefillName || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const chip = STATUS_CONFIG[req.status] || STATUS_CONFIG.NEW;
  const targetDept = getDepartment(req.targetDept);
  const fromDept = getDepartment(req.requestorDept);
  const isResolved = req.status === 'RESOLVED';
  const isBlocked = req.status === 'BLOCKED';

  const handleSubmitAction = async () => {
    if (!selectedAction || !comment.trim()) {
      setError('Please add an explanation before submitting.');
      return;
    }
    if (!responderName.trim()) {
      setError('Please enter your name.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/sewa/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: req.id,
          action: selectedAction,
          responderName: responderName.trim(),
          comment: comment.trim(),
          ...(selectedAction === 'blocked' && blockingDept ? { blockingDept } : {}),
        }),
      });

      if (res.ok) {
        setToast(`${req.id} - ${ACTION_LABELS[selectedAction] || selectedAction}`);
        setComment('');
        setBlockingDept('');
        setSelectedAction(null);
        setShowActions(false);
        setTimeout(() => {
          setToast(null);
          onActionComplete();
        }, 1500);
      } else {
        const data = await res.json();
        setError(data.error || 'Action failed');
      }
    } catch {
      setError('Network error - please try again');
    }
    setSubmitting(false);
  };

  // Available actions based on current status
  const availableActions: { key: string; label: string; color: string; icon: string }[] = [];
  if (req.status === 'NEW') {
    availableActions.push({ key: 'acknowledge', label: 'Acknowledge', color: 'bg-amber-500 hover:bg-amber-600', icon: 'M5 13l4 4L19 7' });
  }
  if (req.status === 'NEW' || req.status === 'ACKNOWLEDGED') {
    availableActions.push({ key: 'in_progress', label: 'In Progress', color: 'bg-indigo-500 hover:bg-indigo-600', icon: 'M13 10V3L4 14h7v7l9-11h-7z' });
  }
  if (req.status === 'BLOCKED') {
    availableActions.push({ key: 'unblock', label: 'Unblock', color: 'bg-indigo-500 hover:bg-indigo-600', icon: 'M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z' });
  }
  if (!isResolved && req.status !== 'BLOCKED') {
    availableActions.push({ key: 'blocked', label: 'Block', color: 'bg-red-500 hover:bg-red-600', icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' });
  }
  if (!isResolved) {
    availableActions.push({ key: 'resolve', label: 'Resolve', color: 'bg-emerald-600 hover:bg-emerald-700', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' });
  }

  return (
    <div className={`bg-white rounded-xl border overflow-hidden transition-all ${
      isBlocked ? 'border-red-300 border-l-4 border-l-red-500' :
      isResolved ? 'border-slate-200 opacity-75' :
      'border-slate-200 hover:border-slate-300'
    } ${toast ? 'ring-2 ring-emerald-200' : ''}`}>

      {/* ── Summary Row (always visible) ── */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-3 sm:p-4"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {req.priority === 'urgent' && (
                <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded font-bold">URGENT</span>
              )}
              <span className="text-xs font-bold text-slate-900 truncate">{req.complaintTypeName}</span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 flex-wrap">
              <span className="font-mono font-bold text-blue-600">{req.id}</span>
              <span>from {req.requestorName} ({fromDept?.name || req.requestorDept})</span>
              <span className="text-slate-300">|</span>
              <span>to {targetDept?.name || req.targetDept}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${chip.bg} ${chip.text}`}>
              {chip.label}
            </span>
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* SLA bars */}
        <div className="mt-2 space-y-1">
          <SLABar slaMinutes={req.responseSlaMin} createdAt={req.createdAt} label="Response" resolved={!!req.acknowledgedAt} />
          <SLABar slaMinutes={req.resolutionSlaMin} createdAt={req.createdAt} label="Resolution" resolved={isResolved} />
        </div>

        {/* Blocked banner */}
        {isBlocked && (
          <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
            <span className="font-bold">BLOCKED</span>
            {req.blockedReason && <span> - {req.blockedReason}</span>}
            {req.blockingDept && (
              <span className="ml-1 text-red-500">(waiting on {getDepartment(req.blockingDept)?.name || req.blockingDept})</span>
            )}
          </div>
        )}

        {/* Elapsed time */}
        <div className="mt-1.5 text-[10px] text-slate-400">
          Filed {elapsedStr(req.createdAt)}
          {req.acknowledgedBy && ` | Ack by ${req.acknowledgedBy}`}
          {req.resolvedBy && ` | Resolved by ${req.resolvedBy}`}
        </div>
      </button>

      {/* ── Expanded Details + Actions ── */}
      {expanded && (
        <div className="border-t border-slate-100 p-3 sm:p-4 space-y-3 bg-slate-50/50">
          {/* Details */}
          <div className="space-y-1.5 text-xs">
            {req.location && (
              <p className="text-slate-600"><span className="font-semibold text-slate-700">Location:</span> {req.location}</p>
            )}
            <p className="text-slate-600"><span className="font-semibold text-slate-700">Description:</span> {req.description}</p>
            {req.patientName && (
              <p className="text-slate-600"><span className="font-semibold text-slate-700">Patient:</span> {req.patientName} {req.patientUhid ? `(${req.patientUhid})` : ''}</p>
            )}
            {req.subMenu && (
              <p className="text-slate-600"><span className="font-semibold text-slate-700">Category:</span> {req.subMenu}</p>
            )}
            {/* Extra fields */}
            {Object.keys(req.extraFields || {}).length > 0 && (
              <div className="bg-white rounded-lg p-2 border border-slate-100 space-y-1">
                {Object.entries(req.extraFields).filter(([, v]) => v).map(([k, v]) => (
                  <p key={k} className="text-[11px] text-slate-600">
                    <span className="font-semibold capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}:</span> {v}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* ── Comment Thread ── */}
          {(req.comments || []).length > 0 && (
            <div className="bg-white rounded-lg border border-slate-100 p-3">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Activity Thread</div>
              <div className="space-y-2">
                {(req.comments as { user: string; text: string; time: string; action?: string; blockingDept?: string }[]).map((c, i) => {
                  const actionLabel = c.action ? ACTION_LABELS[c.action] : null;
                  return (
                    <div key={i} className="flex gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[9px] font-bold text-slate-600">{c.user.slice(0, 2).toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-bold text-slate-800">{c.user}</span>
                          {actionLabel && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">{actionLabel}</span>
                          )}
                          <span className="text-[10px] text-slate-400">
                            {new Date(c.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">{c.text}</p>
                        {c.blockingDept && (
                          <p className="text-[10px] text-red-500 mt-0.5">Blocking dept: {getDepartment(c.blockingDept)?.name || c.blockingDept}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Action Panel ── */}
          {!isResolved && (
            <>
              {!showActions ? (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowActions(true); }}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                  Respond to this complaint
                </button>
              ) : (
                <div className="bg-white rounded-lg border border-blue-200 p-3 space-y-3">
                  <div className="text-xs font-bold text-slate-700">Respond to {req.id}</div>

                  {/* Responder name (if not pre-filled) */}
                  {!prefillName && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Your Name *</label>
                      <input
                        value={responderName}
                        onChange={e => setResponderName(e.target.value)}
                        placeholder="e.g., Dr. Rajesh Kumar"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
                      />
                    </div>
                  )}

                  {/* Action selector */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Action</label>
                    <div className="flex flex-wrap gap-1.5">
                      {availableActions.map(action => (
                        <button
                          key={action.key}
                          onClick={() => setSelectedAction(selectedAction === action.key ? null : action.key)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                            selectedAction === action.key
                              ? action.color + ' text-white shadow-sm'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={action.icon} />
                          </svg>
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Blocking dept dropdown (only when blocking) */}
                  {selectedAction === 'blocked' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Blocking Department (optional)</label>
                      <select
                        value={blockingDept}
                        onChange={e => setBlockingDept(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:border-blue-400"
                      >
                        <option value="">No cross-department block</option>
                        {SEWA_DEPARTMENTS.filter(d => d.slug !== req.targetDept).map(d => (
                          <option key={d.slug} value={d.slug}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Comment (required) */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      {selectedAction === 'blocked' ? 'Why is this blocked? *' :
                       selectedAction === 'resolve' ? 'Resolution summary *' :
                       'Explanation / Update *'}
                    </label>
                    <textarea
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder={
                        selectedAction === 'blocked' ? 'e.g., Waiting for replacement part from Biomedical department...' :
                        selectedAction === 'resolve' ? 'e.g., Issue has been fixed. Replaced faulty equipment...' :
                        'e.g., Investigating the issue. Will update within 1 hour...'
                      }
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 resize-none"
                    />
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{error}</div>
                  )}

                  {/* Submit */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowActions(false); setSelectedAction(null); setComment(''); setError(null); }}
                      className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSubmitAction}
                      disabled={submitting || !selectedAction || !comment.trim()}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold text-white transition-all active:scale-[0.98] ${
                        submitting || !selectedAction || !comment.trim()
                          ? 'bg-slate-300 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {submitting ? 'Submitting...' : 'Submit Response'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Toast */}
          {toast && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-700 font-semibold text-center">
              {toast}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
