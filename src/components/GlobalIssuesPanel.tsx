'use client';

import React from 'react';

export interface GlobalIssueData {
  id: string;
  label: string;
  severity: 'red' | 'amber';
  todayCount: number;
  todayActive: boolean;
  weekTotal: number;
  weekActiveDays: number;
  prevWeekTotal: number;
  trend: 'up' | 'down' | 'flat';
}

interface Props {
  issues: GlobalIssueData[];
}

export default function GlobalIssuesPanel({ issues }: Props) {
  const redFlags = issues.filter(i => i.severity === 'red');
  const amberWarnings = issues.filter(i => i.severity === 'amber');

  const hasActiveRed = redFlags.some(i => i.todayActive || i.weekTotal > 0);
  const hasActiveAmber = amberWarnings.some(i => i.todayActive || i.weekTotal > 0);

  const TrendArrow = ({ trend, severity }: { trend: 'up' | 'down' | 'flat'; severity: 'red' | 'amber' }) => {
    if (trend === 'flat') return <span className="text-slate-400 text-xs">—</span>;

    // For issues: up = getting worse (red arrow), down = improving (green arrow)
    if (trend === 'up') {
      return <span className="text-red-500 text-xs font-bold">↑ worse</span>;
    }
    return <span className="text-emerald-500 text-xs font-bold">↓ better</span>;
  };

  const IssueRow = ({ issue }: { issue: GlobalIssueData }) => {
    const isActive = issue.todayActive || issue.weekTotal > 0;
    const isRed = issue.severity === 'red';

    return (
      <div className={`flex items-center justify-between py-2 px-3 rounded-lg ${
        isActive
          ? isRed ? 'bg-red-50' : 'bg-amber-50'
          : 'bg-slate-50'
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
            isActive
              ? isRed ? 'bg-red-500' : 'bg-amber-500'
              : 'bg-slate-300'
          }`} />
          <span className={`text-sm font-medium truncate ${
            isActive ? 'text-slate-900' : 'text-slate-500'
          }`}>
            {issue.label}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Today's count */}
          <div className="text-center min-w-[36px]">
            <span className={`text-sm font-bold ${
              issue.todayCount > 0
                ? isRed ? 'text-red-700' : 'text-amber-700'
                : 'text-slate-400'
            }`}>
              {issue.todayCount}
            </span>
            <div className="text-[10px] text-slate-400">today</div>
          </div>
          {/* Week total */}
          <div className="text-center min-w-[36px]">
            <span className={`text-sm font-semibold ${
              issue.weekTotal > 0
                ? isRed ? 'text-red-600' : 'text-amber-600'
                : 'text-slate-400'
            }`}>
              {issue.weekTotal}
            </span>
            <div className="text-[10px] text-slate-400">7d</div>
          </div>
          {/* Trend */}
          <div className="min-w-[50px] text-right">
            <TrendArrow trend={issue.trend} severity={issue.severity} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            Hospital-Wide Issues & Trends
          </h3>
          <div className="flex items-center gap-3 text-xs">
            {hasActiveRed && (
              <span className="flex items-center gap-1 text-red-600 font-semibold bg-red-50 px-2 py-1 rounded">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                Active Alerts
              </span>
            )}
            {hasActiveAmber && !hasActiveRed && (
              <span className="flex items-center gap-1 text-amber-600 font-semibold bg-amber-50 px-2 py-1 rounded">
                <span className="w-2 h-2 bg-amber-500 rounded-full" />
                Warnings
              </span>
            )}
            {!hasActiveRed && !hasActiveAmber && (
              <span className="flex items-center gap-1 text-emerald-600 font-semibold bg-emerald-50 px-2 py-1 rounded">
                <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                All Clear
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Red Flags */}
          <div>
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-xs font-semibold text-red-700 uppercase tracking-wider">Critical Alerts</span>
              <div className="flex-1 h-px bg-red-200" />
            </div>
            <div className="space-y-1.5">
              {redFlags.map(issue => (
                <IssueRow key={issue.id} issue={issue} />
              ))}
            </div>
          </div>

          {/* Amber Warnings */}
          <div>
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Warnings</span>
              <div className="flex-1 h-px bg-amber-200" />
            </div>
            <div className="space-y-1.5">
              {amberWarnings.map(issue => (
                <IssueRow key={issue.id} issue={issue} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
