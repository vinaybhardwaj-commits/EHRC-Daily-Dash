'use client';

import React, { useState } from 'react';

export interface GlobalIssueData {
  id: string;
  label: string;
  severity: 'red' | 'amber';
  deptSlug?: string;
  todayCount: number;
  todayActive: boolean;
  weekTotal: number;
  weekActiveDays: number;
  prevWeekTotal: number;
  trend: 'up' | 'down' | 'flat';
  recentDetails?: { date: string; text: string; count: number }[];
}

const DEPT_NAMES: Record<string, string> = {
  'emergency': 'Emergency',
  'customer-care': 'Customer Care',
  'patient-safety': 'Patient Safety',
  'finance': 'Finance',
  'billing': 'Billing',
  'supply-chain': 'Supply Chain',
  'facility': 'Facility',
  'pharmacy': 'Pharmacy',
  'training': 'Training',
  'clinical-lab': 'Clinical Lab',
  'radiology': 'Radiology',
  'ot': 'OT',
  'hr-manpower': 'HR & Manpower',
  'diet': 'Diet & Nutrition',
  'biomedical': 'Biomedical',
  'nursing': 'Nursing',
  'it': 'IT',
};

interface Props {
  issues: GlobalIssueData[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function GlobalIssuesPanel({ issues }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const redFlags = issues.filter(i => i.severity === 'red');
  const amberWarnings = issues.filter(i => i.severity === 'amber');

  const hasActiveRed = redFlags.some(i => i.todayActive || i.weekTotal > 0);
  const hasActiveAmber = amberWarnings.some(i => i.todayActive || i.weekTotal > 0);

  const TrendArrow = ({ trend }: { trend: 'up' | 'down' | 'flat' }) => {
    if (trend === 'flat') return <span className="text-slate-400 text-xs">{'\u2014'}</span>;
    if (trend === 'up') return <span className="text-red-500 text-xs font-bold">{'\u2191'} worse</span>;
    return <span className="text-emerald-500 text-xs font-bold">{'\u2193'} better</span>;
  };

  const IssueRow = ({ issue }: { issue: GlobalIssueData }) => {
    const isActive = issue.todayActive || issue.weekTotal > 0;
    const isRed = issue.severity === 'red';
    const isExpanded = expandedId === issue.id;
    const hasDetails = isActive && issue.recentDetails && issue.recentDetails.length > 0;
    const isClickable = isActive;

    return (
      <div className={`rounded-lg overflow-hidden transition-all ${
        isExpanded && hasDetails ? 'ring-1 ring-blue-200 shadow-sm' : ''
      }`}>
        {/* Main row */}
        <button
          onClick={() => {
            if (isClickable) setExpandedId(isExpanded ? null : issue.id);
          }}
          disabled={!isClickable}
          className={`w-full flex items-center justify-between py-2.5 px-3 rounded-lg transition-colors ${
            isClickable ? 'cursor-pointer' : 'cursor-default'
          } ${
            isActive
              ? isRed ? 'bg-red-50 hover:bg-red-100/70' : 'bg-amber-50 hover:bg-amber-100/70'
              : 'bg-slate-50'
          } ${isExpanded ? 'rounded-b-none' : ''}`}
        >
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
            {isActive && issue.deptSlug && (
              <span className="text-[10px] text-slate-400 hidden sm:inline">
                {DEPT_NAMES[issue.deptSlug] || issue.deptSlug}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
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
            <div className="min-w-[50px] text-right">
              <TrendArrow trend={issue.trend} />
            </div>
            {/* Chevron for active rows */}
            {isClickable ? (
              <svg
                className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            ) : (
              <div className="w-4" />
            )}
          </div>
        </button>

        {/* Expanded detail */}
        {isExpanded && hasDetails && (
          <div className={`px-4 py-3 border-t ${
            isRed ? 'bg-red-50/50 border-red-200' : 'bg-amber-50/50 border-amber-200'
          }`}>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
              Recent occurrences ({issue.recentDetails!.length} day{issue.recentDetails!.length !== 1 ? 's' : ''} in last 7)
            </div>
            <div className="space-y-1.5">
              {issue.recentDetails!.map((detail, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs">
                  <span className="text-slate-500 font-medium whitespace-nowrap min-w-[80px]">
                    {formatDate(detail.date)}
                  </span>
                  <span className={`font-medium ${isRed ? 'text-red-700' : 'text-amber-700'}`}>
                    {detail.count > 0 && detail.text !== String(detail.count) ? (
                      <>{detail.count} &mdash; {detail.text}</>
                    ) : detail.text ? (
                      detail.text
                    ) : (
                      `Count: ${detail.count}`
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
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
