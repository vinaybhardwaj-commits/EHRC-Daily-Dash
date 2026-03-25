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
  currentMonthTotal?: number;
  currentMonthActiveDays?: number;
  currentMonthDaysReported?: number;
  prevDetails?: { date: string; text: string; count: number }[];
  prevMonthTotal?: number;
  prevMonthActiveDays?: number;
  prevMonthDaysReported?: number;
  changeSummary?: string;
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
  currentMonth?: string; // e.g. '2026-03'
  previousMonth?: string; // e.g. '2026-02'
  onNavigateToDashboard?: (date: string, slug: string) => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatMonthLabel(ym: string | undefined): string {
  if (!ym) return 'This month';
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function pctChange(current: number, prev: number): string {
  if (prev === 0 && current === 0) return 'No change';
  if (prev === 0) return `New (${current})`;
  const pct = Math.round(((current - prev) / prev) * 100);
  if (pct > 0) return `+${pct}% increase`;
  if (pct < 0) return `${pct}% decrease`;
  return 'No change';
}

export default function GlobalIssuesPanel({ issues, currentMonth, previousMonth, onNavigateToDashboard }: Props) {
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

  const DetailList = ({ details, color, emptyMsg, deptSlug }: {
    details: { date: string; text: string; count: number }[];
    color: 'red' | 'amber' | 'emerald';
    emptyMsg: string;
    deptSlug?: string;
  }) => {
    if (details.length === 0) {
      return <div className="text-xs text-slate-400 italic py-1">{emptyMsg}</div>;
    }
    // Show max 5 entries, with a "and X more" note
    const shown = details.slice(0, 5);
    const remaining = details.length - shown.length;
    return (
      <div className="space-y-1">
        {shown.map((d, idx) => (
          <button
            key={idx}
            onClick={(e) => {
              e.stopPropagation();
              if (onNavigateToDashboard && deptSlug) onNavigateToDashboard(d.date, deptSlug);
            }}
            className="flex items-start gap-2 text-xs text-left w-full rounded px-1 -mx-1 hover:bg-white/60 group cursor-pointer transition-colors"
          >
            <span className="text-slate-500 font-medium whitespace-nowrap min-w-[80px] group-hover:text-blue-600">
              {formatDate(d.date)}
            </span>
            <span className={`font-medium flex-1 ${
              color === 'red' ? 'text-red-700 group-hover:text-blue-700' :
              color === 'amber' ? 'text-amber-700 group-hover:text-blue-700' :
              'text-emerald-700 group-hover:text-blue-700'
            }`}>
              {d.count > 0 && d.text !== String(d.count) ? (
                <>{d.count} &mdash; {d.text}</>
              ) : d.text ? (
                d.text
              ) : (
                `Count: ${d.count}`
              )}
            </span>
            <span className="text-blue-400 opacity-0 group-hover:opacity-100 text-[10px] mt-0.5 flex-shrink-0">{String.fromCharCode(8594)}</span>
          </button>
        ))}
        {remaining > 0 && (
          <div className="text-[10px] text-slate-400">...and {remaining} more day{remaining !== 1 ? 's' : ''}</div>
        )}
      </div>
    );
  };

  const IssueRow = ({ issue }: { issue: GlobalIssueData }) => {
    const isActive = issue.todayActive || issue.weekTotal > 0;
    const isRed = issue.severity === 'red';
    const isExpanded = expandedId === issue.id;

    // ALL rows are clickable now â the comparison data is always available
    const hasTrendData = issue.trend !== 'flat' || isActive ||
      (issue.prevMonthTotal !== undefined && issue.prevMonthTotal > 0) ||
      (issue.currentMonthTotal !== undefined && issue.currentMonthTotal > 0);
    const isClickable = hasTrendData;

    const currentDetails = issue.recentDetails || [];
    const prevDetails = issue.prevDetails || [];
    const curTotal = issue.currentMonthTotal ?? 0;
    const prevTotal = issue.prevMonthTotal ?? 0;

    return (
      <div className={`rounded-lg overflow-hidden transition-all ${
        isExpanded ? 'ring-1 ring-blue-200 shadow-sm' : ''
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
              : isClickable ? 'bg-slate-50 hover:bg-slate-100' : 'bg-slate-50'
          } ${isExpanded ? 'rounded-b-none' : ''}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
              isActive
                ? isRed ? 'bg-red-500' : 'bg-amber-500'
                : 'bg-slate-300'
            }`} />
            <span className={`text-sm font-medium leading-tight ${
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
            {/* Chevron for clickable rows */}
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

        {/* Expanded comparison view */}
        {isExpanded && isClickable && (
          <div className={`px-4 py-3 border-t ${
            isActive
              ? isRed ? 'bg-red-50/50 border-red-200' : 'bg-amber-50/50 border-amber-200'
              : 'bg-slate-50/80 border-slate-200'
          }`}>
            {/* Change summary bar */}
            {issue.changeSummary && (
              <div className={`text-xs font-semibold px-3 py-2 rounded-md mb-3 ${
                issue.trend === 'up' ? 'bg-red-100 text-red-800' :
                issue.trend === 'down' ? 'bg-emerald-100 text-emerald-800' :
                'bg-slate-100 text-slate-600'
              }`}>
                <span className="mr-1">
                  {issue.trend === 'up' ? '\u2191' : issue.trend === 'down' ? '\u2193' : '\u2014'}
                </span>
                {pctChange(curTotal, prevTotal)}
                <span className="font-normal ml-1">&mdash; {issue.changeSummary}</span>
              </div>
            )}

            {/* Side-by-side comparison */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Current month */}
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${curTotal > 0 ? (isRed ? 'bg-red-500' : 'bg-amber-500') : 'bg-emerald-500'}`} />
                  {formatMonthLabel(currentMonth)}
                  <span className="text-slate-400 font-normal ml-auto">
                    {curTotal > 0 ? `${curTotal} total` : 'Clear'}
                  </span>
                </div>
                <DetailList
                  details={currentDetails}
                  color={curTotal > 0 ? (isRed ? 'red' : 'amber') : 'emerald'}
                  emptyMsg="No occurrences this month"
                  deptSlug={issue.deptSlug}
                />
              </div>

              {/* Previous month */}
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${prevTotal > 0 ? 'bg-slate-400' : 'bg-emerald-500'}`} />
                  {formatMonthLabel(previousMonth)}
                  <span className="text-slate-400 font-normal ml-auto">
                    {prevTotal > 0 ? `${prevTotal} total` : 'Clear'}
                  </span>
                </div>
                <DetailList
                  details={prevDetails}
                  color={prevTotal > 0 ? (isRed ? 'red' : 'amber') : 'emerald'}
                  emptyMsg="No occurrences last month"
                  deptSlug={issue.deptSlug}
                />
              </div>
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
