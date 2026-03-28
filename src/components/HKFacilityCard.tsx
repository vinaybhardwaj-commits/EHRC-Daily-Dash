'use client';

import { useState, useEffect } from 'react';

interface ShiftSummary {
  shiftId: number;
  date: string;
  shiftType: string;
  supervisorName: string | null;
  staffCount: number | null;
  totalTasks: number;
  doneTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  completionPct: number;
}

const SHIFT_LABELS: Record<string, string> = {
  AM: 'Morning', PM: 'Evening', NIGHT: 'Night',
};

export default function HKFacilityCard() {
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/hk/current-shift');
        const data = await res.json();
        if (data.summary) setSummary(data.summary);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
        <div className="h-3 bg-gray-100 rounded w-1/2" />
      </div>
    );
  }

  if (!summary) {
    return (
      <a href="/hk/dashboard" className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">\ud83e\uddf9</span>
          <h3 className="text-sm font-bold text-gray-900">Housekeeping</h3>
        </div>
        <p className="text-xs text-gray-400">No active shift</p>
      </a>
    );
  }

  const pctColor = summary.completionPct >= 80 ? 'text-green-600' :
    summary.completionPct >= 50 ? 'text-yellow-600' : 'text-red-600';
  const barColor = summary.completionPct >= 80 ? 'bg-green-500' :
    summary.completionPct >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <a href="/hk/dashboard" className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">\ud83e\uddf9</span>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Housekeeping</h3>
            <p className="text-[11px] text-gray-500">
              {SHIFT_LABELS[summary.shiftType] || summary.shiftType} | {summary.supervisorName || 'No supervisor'}
            </p>
          </div>
        </div>
        <span className={`text-xl font-bold ${pctColor}`}>{summary.completionPct}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${summary.completionPct}%` }} />
      </div>

      <div className="flex justify-between text-[11px]">
        {summary.overdueTasks > 0 && (
          <span className="text-red-600 font-semibold">\ud83d\udd34 Overdue: {summary.overdueTasks}</span>
        )}
        <span className="text-gray-500">\u23f3 Pending: {summary.pendingTasks}</span>
        <span className="text-gray-400">View Dashboard \u2192</span>
      </div>
    </a>
  );
}
