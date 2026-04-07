'use client';

import React, { useState, useEffect } from 'react';
import { Package, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';

interface Summary {
  totalActive: number;
  urgentOpen: number;
  overdue: number;
  closedThisWeek: number;
  byStatus: Record<string, number>;
}

export default function SupplyChainSummary() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch('/api/supply-chain-requirements/summary')
      .then(r => r.json())
      .then(data => setSummary(data.summary))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-1/2 mb-3"></div>
        <div className="h-8 bg-slate-100 rounded w-full"></div>
      </div>
    );
  }

  if (!summary || summary.totalActive === 0) {
    return null; // Don't show card when there are no requirements
  }

  return (
    <div
      className="bg-white rounded-xl border border-slate-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header bar */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <Package size={16} />
          <span className="font-semibold text-sm">Supply Chain Tracker</span>
        </div>
        {summary.urgentOpen > 0 && (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
            <AlertTriangle size={12} /> {summary.urgentOpen} urgent
          </span>
        )}
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-4 gap-0 divide-x divide-slate-100">
        <div className="px-3 py-3 text-center">
          <p className="text-lg font-bold text-slate-900">{summary.totalActive}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Active</p>
        </div>
        <div className="px-3 py-3 text-center">
          <p className={`text-lg font-bold ${summary.urgentOpen > 0 ? 'text-red-600' : 'text-slate-900'}`}>
            {summary.urgentOpen}
          </p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Urgent</p>
        </div>
        <div className="px-3 py-3 text-center">
          <p className={`text-lg font-bold ${summary.overdue > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
            {summary.overdue}
          </p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Overdue</p>
        </div>
        <div className="px-3 py-3 text-center">
          <p className="text-lg font-bold text-emerald-600">{summary.closedThisWeek}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Closed/wk</p>
        </div>
      </div>

      {/* Expanded: status breakdown */}
      {expanded && (
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
          <p className="text-xs font-medium text-slate-600 mb-2">Pipeline Breakdown</p>
          <div className="flex items-center gap-1">
            {['Requested', 'Approved', 'Ordered', 'Received', 'Closed'].map(status => {
              const count = summary.byStatus[status] || 0;
              if (count === 0) return null;
              const colors: Record<string, string> = {
                Requested: 'bg-blue-100 text-blue-700',
                Approved: 'bg-indigo-100 text-indigo-700',
                Ordered: 'bg-amber-100 text-amber-700',
                Received: 'bg-emerald-100 text-emerald-700',
                Closed: 'bg-slate-100 text-slate-500',
              };
              return (
                <span key={status} className={`px-2 py-1 rounded text-xs font-medium ${colors[status]}`}>
                  {status}: {count}
                </span>
              );
            })}
          </div>
          <a
            href="/form/supply-chain"
            className="inline-block mt-2 text-xs text-orange-600 hover:text-orange-700 font-medium"
            onClick={e => e.stopPropagation()}
          >
            Open full tracker →
          </a>
        </div>
      )}
    </div>
  );
}
