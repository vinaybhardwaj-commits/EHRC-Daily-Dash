'use client';

// GV.6 — Daily Dash governance summary card. Renders nothing when the
// governance module is off or unreachable.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

interface Summary {
  enabled: boolean;
  responses?: number; physicians?: number; filed?: number; queued?: number;
  watch_open?: number; watch_escalated?: number; ot_cases_yesterday?: number;
}

export default function GovernanceSignalsCard() {
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => {
    fetch('/api/governance/summary')
      .then(r => (r.ok ? r.json() : { enabled: false }))
      .then(setS)
      .catch(() => setS({ enabled: false }));
  }, []);
  if (!s || !s.enabled) return null;
  return (
    <Link href="/admin/governance" className="block">
      <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-colors">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-gray-800">Governance signals today</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div><div className="text-xl font-bold text-gray-900">{s.responses ?? 0}</div><div className="text-[11px] text-gray-500">observations</div></div>
          <div><div className="text-xl font-bold text-gray-900">{s.filed ?? 0}</div><div className="text-[11px] text-gray-500">filed to EPI</div></div>
          <div><div className="text-xl font-bold text-gray-900">{(s.watch_open ?? 0) + (s.watch_escalated ?? 0)}</div><div className="text-[11px] text-gray-500">post-op watch{s.watch_escalated ? ` (${s.watch_escalated} ⚠)` : ''}</div></div>
          <div><div className="text-xl font-bold text-gray-900">{s.ot_cases_yesterday ?? 0}</div><div className="text-[11px] text-gray-500">OT cases yday</div></div>
        </div>
        {(s.queued ?? 0) > 0 && <p className="text-[11px] text-amber-600 mt-2">{s.queued} observation(s) queued for delivery</p>}
      </div>
    </Link>
  );
}
