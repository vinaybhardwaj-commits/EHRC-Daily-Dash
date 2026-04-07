'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Save, ChevronDown, ChevronUp, Package, AlertTriangle, Clock, CheckCircle2, Truck, ClipboardList, X } from 'lucide-react';

/* ── Types ─────────────────────────────────────────────────────────── */

interface Requirement {
  id: number;
  item_name: string;
  quantity: number;
  priority: 'Urgent' | 'Normal';
  status: 'Requested' | 'Approved' | 'Ordered' | 'Received' | 'Closed';
  notes: string;
  requesting_department: string;
  expected_date: string | null;
  vendor: string;
  cost_estimate: number | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  created_by: string | null;
}

type NewRequirement = {
  item_name: string;
  quantity: number;
  priority: 'Urgent' | 'Normal';
  notes: string;
  requesting_department: string;
  expected_date: string;
  vendor: string;
  cost_estimate: string;
};

const EMPTY_NEW: NewRequirement = {
  item_name: '',
  quantity: 1,
  priority: 'Normal',
  notes: '',
  requesting_department: '',
  expected_date: '',
  vendor: '',
  cost_estimate: '',
};

const STATUS_ORDER: Requirement['status'][] = ['Requested', 'Approved', 'Ordered', 'Received', 'Closed'];

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  Requested: { icon: <ClipboardList size={14} />, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', label: 'Requested' },
  Approved: { icon: <CheckCircle2 size={14} />, color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', label: 'Approved' },
  Ordered: { icon: <Truck size={14} />, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', label: 'Ordered' },
  Received: { icon: <Package size={14} />, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', label: 'Received' },
  Closed: { icon: <CheckCircle2 size={14} />, color: 'text-slate-500', bg: 'bg-slate-50 border-slate-200', label: 'Closed' },
};

const DEPARTMENTS = [
  'Nursing', 'OT', 'Clinical Lab', 'Pharmacy', 'Radiology',
  'Emergency', 'ICU', 'Dietary', 'Housekeeping', 'Biomedical',
  'Facilities', 'Administration', 'Other',
];

/* ── Subcomponents ─────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.Requested;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === 'Urgent') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 border border-red-200 text-red-700">
        <AlertTriangle size={12} /> Urgent
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-50 border border-slate-200 text-slate-600">
      Normal
    </span>
  );
}

function StatusStepper({ current, onChange }: { current: Requirement['status']; onChange: (s: Requirement['status']) => void }) {
  const currentIdx = STATUS_ORDER.indexOf(current);
  return (
    <div className="flex items-center gap-1">
      {STATUS_ORDER.map((s, i) => {
        const cfg = STATUS_CONFIG[s];
        const isActive = i <= currentIdx;
        const isCurrent = s === current;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all
              ${isCurrent ? cfg.bg + ' ' + cfg.color + ' border ring-1 ring-offset-1 ring-current' :
                isActive ? cfg.bg + ' ' + cfg.color + ' border opacity-70' :
                'bg-white border border-slate-200 text-slate-400 hover:border-slate-300'}`}
            title={`Set status to ${s}`}
          >
            {cfg.icon}
            <span className="hidden sm:inline">{s}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────────── */

export default function SupplyChainTracker() {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newReq, setNewReq] = useState<NewRequirement>({ ...EMPTY_NEW });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<number, string>>({});
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  /* ── Fetch requirements ── */
  const fetchRequirements = useCallback(async () => {
    try {
      const res = await fetch('/api/supply-chain-requirements');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setRequirements(data.requirements || []);
      setError(null);
    } catch (err) {
      console.error('Supply chain fetch error:', err);
      setError('Could not load requirements. Tap to retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequirements(); }, [fetchRequirements]);

  /* ── Show success message briefly ── */
  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  /* ── Add new requirement ── */
  const handleAdd = async () => {
    if (!newReq.item_name.trim() || saving) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        item_name: newReq.item_name.trim(),
        quantity: newReq.quantity || 1,
        priority: newReq.priority,
        notes: newReq.notes,
        requesting_department: newReq.requesting_department,
      };
      if (newReq.expected_date) body.expected_date = newReq.expected_date;
      if (newReq.vendor) body.vendor = newReq.vendor;
      if (newReq.cost_estimate) {
        const costVal = parseFloat(newReq.cost_estimate);
        if (!isNaN(costVal) && costVal >= 0) body.cost_estimate = costVal;
      }

      const res = await fetch('/api/supply-chain-requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add');
      }
      setNewReq({ ...EMPTY_NEW });
      setShowAddForm(false);
      showSuccess('Requirement added');
      await fetchRequirements();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  /* ── Update status ── */
  const handleStatusChange = async (id: number, newStatus: Requirement['status']) => {
    if (updatingId !== null) return;
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/supply-chain-requirements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update');
      showSuccess(`Status → ${newStatus}`);
      await fetchRequirements();
    } catch (err) {
      setError(String(err));
    } finally {
      setUpdatingId(null);
    }
  };

  /* ── Save notes ── */
  const handleSaveNotes = async (id: number) => {
    const notes = editingNotes[id];
    if (notes === undefined || updatingId !== null) return;
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/supply-chain-requirements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error('Failed to save notes');
      setEditingNotes(prev => { const n = { ...prev }; delete n[id]; return n; });
      showSuccess('Notes saved');
      await fetchRequirements();
    } catch (err) {
      setError(String(err));
    } finally {
      setUpdatingId(null);
    }
  };

  /* ── Partition items ── */
  const activeReqs = requirements.filter(r => r.status !== 'Closed');
  const closedReqs = requirements.filter(r => r.status === 'Closed');

  /* ── Render ── */
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-slate-500 mt-2 text-sm">Loading requirements...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={20} />
            <div>
              <h2 className="font-bold text-lg leading-tight">Requirement Tracker</h2>
              <p className="text-orange-100 text-xs">
                {activeReqs.length} active item{activeReqs.length !== 1 ? 's' : ''}
                {activeReqs.filter(r => r.priority === 'Urgent').length > 0 &&
                  ` · ${activeReqs.filter(r => r.priority === 'Urgent').length} urgent`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
          >
            {showAddForm ? <X size={16} /> : <Plus size={16} />}
            {showAddForm ? 'Cancel' : 'Add New'}
          </button>
        </div>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="mx-4 mt-3 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-center gap-2">
          <CheckCircle2 size={16} /> {successMsg}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mx-4 mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm cursor-pointer"
             onClick={() => { setError(null); setLoading(true); fetchRequirements(); }}>
          {error}
          <button className="ml-2 underline text-xs">tap to retry</button>
        </div>
      )}

      {/* Add New Form */}
      {showAddForm && (
        <div className="m-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <h3 className="font-semibold text-sm text-orange-800 mb-3">New Requirement</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Item Name *</label>
              <input
                type="text"
                value={newReq.item_name}
                onChange={e => setNewReq(p => ({ ...p, item_name: e.target.value }))}
                placeholder="e.g., Surgical gloves (medium)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Quantity</label>
              <input
                type="number"
                min={1}
                step={1}
                value={newReq.quantity}
                onChange={e => setNewReq(p => ({ ...p, quantity: Math.max(1, Math.floor(parseInt(e.target.value) || 1)) }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
              <div className="flex gap-2">
                {(['Normal', 'Urgent'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setNewReq(prev => ({ ...prev, priority: p }))}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors
                      ${newReq.priority === p
                        ? (p === 'Urgent' ? 'bg-red-100 border-red-300 text-red-700' : 'bg-blue-100 border-blue-300 text-blue-700')
                        : 'bg-white border-slate-300 text-slate-500 hover:border-slate-400'
                      }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Requesting Department</label>
              <select
                value={newReq.requesting_department}
                onChange={e => setNewReq(p => ({ ...p, requesting_department: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none bg-white"
              >
                <option value="">Select department</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Expected Delivery Date</label>
              <input
                type="date"
                value={newReq.expected_date}
                onChange={e => setNewReq(p => ({ ...p, expected_date: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Vendor / Supplier</label>
              <input
                type="text"
                value={newReq.vendor}
                onChange={e => setNewReq(p => ({ ...p, vendor: e.target.value }))}
                placeholder="e.g., MedSupply Co."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Estimated Cost (₹)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={newReq.cost_estimate}
                onChange={e => setNewReq(p => ({ ...p, cost_estimate: e.target.value }))}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
              <textarea
                value={newReq.notes}
                onChange={e => setNewReq(p => ({ ...p, notes: e.target.value }))}
                rows={2}
                placeholder="Additional details, specifications..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none resize-none"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newReq.item_name.trim() || saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Plus size={16} />
              )}
              Add Requirement
            </button>
          </div>
        </div>
      )}

      {/* Active Requirements */}
      <div className="divide-y divide-slate-100">
        {activeReqs.length === 0 && !showAddForm && (
          <div className="p-8 text-center">
            <Package size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500 text-sm">No active requirements</p>
            <p className="text-slate-400 text-xs mt-1">Click &ldquo;Add New&rdquo; to create one</p>
          </div>
        )}

        {activeReqs.map(req => {
          const isExpanded = expandedId === req.id;
          const isUpdating = updatingId === req.id;
          const expectedDateValid = req.expected_date && !isNaN(new Date(req.expected_date).getTime());
          const isOverdue = expectedDateValid && new Date(req.expected_date!) < new Date() && !['Received', 'Closed'].includes(req.status);
          const daysSinceCreated = req.created_at ? Math.max(0, Math.floor((Date.now() - new Date(req.created_at).getTime()) / 86400000)) : 0;

          return (
            <div key={req.id} className={`${isUpdating ? 'opacity-60' : ''} ${req.priority === 'Urgent' ? 'border-l-4 border-l-red-400' : ''}`}>
              {/* Compact row */}
              <div
                className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : req.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-slate-900 truncate">{req.item_name}</span>
                    <PriorityBadge priority={req.priority} />
                    {isOverdue && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
                        <Clock size={10} /> Overdue
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    {req.requesting_department && <span>{req.requesting_department}</span>}
                    <span>Qty: {req.quantity}</span>
                    {req.vendor && <span>Vendor: {req.vendor}</span>}
                    <span>{daysSinceCreated}d old</span>
                    {req.cost_estimate && <span>₹{Number(req.cost_estimate).toLocaleString('en-IN')}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={req.status} />
                  {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-4 bg-slate-50 border-t border-slate-100">
                  <div className="pt-3 space-y-3">
                    {/* Status stepper */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Update Status</label>
                      <StatusStepper
                        current={req.status}
                        onChange={(s) => handleStatusChange(req.id, s)}
                      />
                    </div>

                    {/* Details grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      {req.expected_date && (
                        <div>
                          <span className="text-slate-500">Expected:</span>
                          <span className={`ml-1 font-medium ${isOverdue ? 'text-red-600' : 'text-slate-700'}`}>
                            {new Date(req.expected_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-slate-500">Created:</span>
                        <span className="ml-1 text-slate-700">
                          {new Date(req.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                      {req.cost_estimate && (
                        <div>
                          <span className="text-slate-500">Cost:</span>
                          <span className="ml-1 font-medium text-slate-700">₹{Number(req.cost_estimate).toLocaleString('en-IN')}</span>
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Notes / Daily Update</label>
                      <div className="flex gap-2">
                        <textarea
                          value={editingNotes[req.id] ?? req.notes ?? ''}
                          onChange={e => setEditingNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                          rows={2}
                          placeholder="Add an update..."
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none resize-none bg-white"
                        />
                        {editingNotes[req.id] !== undefined && editingNotes[req.id] !== (req.notes ?? '') && (
                          <button
                            type="button"
                            onClick={() => handleSaveNotes(req.id)}
                            className="self-end px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-medium transition-colors"
                          >
                            <Save size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Recently Closed */}
      {closedReqs.length > 0 && (
        <div className="border-t border-slate-200">
          <div className="px-4 py-2 bg-slate-50">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Recently Closed ({closedReqs.length})
            </p>
          </div>
          <div className="divide-y divide-slate-50 opacity-60">
            {closedReqs.map(req => (
              <div key={req.id} className="px-4 py-2 flex items-center justify-between">
                <div>
                  <span className="text-sm text-slate-500 line-through">{req.item_name}</span>
                  <span className="text-xs text-slate-400 ml-2">Qty: {req.quantity}</span>
                  {req.requesting_department && <span className="text-xs text-slate-400 ml-2">{req.requesting_department}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {req.closed_at && (
                    <span className="text-xs text-slate-400">
                      Closed {new Date(req.closed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                  <StatusBadge status="Closed" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
