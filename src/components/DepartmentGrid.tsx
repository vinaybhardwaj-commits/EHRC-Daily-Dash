'use client';

import React, { useState } from 'react';

export interface DeptKPIData {
  slug: string;
  label: string;
  unit: string | null;
  type: 'number' | 'text-status' | 'ratio';
  invertTrend: boolean;
  value: number | null;
  textValue: string | null;
  status: 'good' | 'warning' | 'bad' | null;
  submitted: boolean;
  submissionCount: number;
  totalDays: number;
  trend: 'up' | 'down' | 'flat';
  avg7d: number | null;
  // Previous month comparison
  prevValue?: number | null;
  prevTextValue?: string | null;
  prevStatus?: 'good' | 'warning' | 'bad' | null;
  prevAvg?: number | null;
  prevSubmissionCount?: number;
  prevTotalDays?: number;
  monthTrend?: 'up' | 'down' | 'flat';
}

export interface DeptAlertData {
  slug: string;
  alerts: { message: string; severity: 'red' | 'amber' | 'info' }[];
  lastSubmissionDate: string | null;
}

const DEPT_DISPLAY_NAMES: Record<string, string> = {
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
  departments: DeptKPIData[];
  deptAlerts?: DeptAlertData[];
  onNavigateToDept?: (slug: string) => void;
  currentMonth?: string;
  previousMonth?: string;
}

function formatValue(value: number | null, unit?: string | null): string {
  if (value === null) return '\u2014';
  if (unit === '\u20b9') {
    if (Math.abs(value) >= 10000000) return '\u20b9' + (value / 10000000).toFixed(2) + ' Cr';
    if (Math.abs(value) >= 100000) return '\u20b9' + (value / 100000).toFixed(2) + ' L';
    if (Math.abs(value) >= 1000) return '\u20b9' + (value / 1000).toFixed(1) + 'K';
    return '\u20b9' + value.toFixed(0);
  }
  if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
  return value.toFixed(0);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatMonthLabel(ym: string | undefined): string {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

export default function DepartmentGrid({ departments, deptAlerts, onNavigateToDept, currentMonth, previousMonth }: Props) {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  const alertsBySlug = new Map(
    (deptAlerts || []).map(a => [a.slug, a])
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-slate-900">Department Progress</h3>
        <span className="text-xs text-slate-500">
          Click a department to see details
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {departments.map(dept => {
          const displayName = DEPT_DISPLAY_NAMES[dept.slug] || dept.slug;
          const isExpanded = expandedSlug === dept.slug;
          const alertData = alertsBySlug.get(dept.slug);
          const alerts = alertData?.alerts || [];
          const redAlerts = alerts.filter(a => a.severity === 'red');
          const amberAlerts = alerts.filter(a => a.severity === 'amber' || a.severity === 'info');
          const hasIssues = alerts.length > 0;

          // Trend
          let trendColor = 'text-slate-400';
          let trendIcon = '\u2014';
          if (dept.trend === 'up') {
            trendColor = dept.invertTrend ? 'text-red-500' : 'text-emerald-500';
            trendIcon = '\u2191';
          } else if (dept.trend === 'down') {
            trendColor = dept.invertTrend ? 'text-emerald-500' : 'text-red-500';
            trendIcon = '\u2193';
          }

          // Month-over-month trend
          const mTrend = dept.monthTrend || 'flat';
          let monthTrendColor = 'text-slate-400';
          let monthTrendIcon = '\u2014';
          let monthTrendLabel = 'flat';
          if (mTrend === 'up') {
            monthTrendColor = dept.invertTrend ? 'text-red-500' : 'text-emerald-500';
            monthTrendIcon = '\u2191';
            monthTrendLabel = dept.invertTrend ? 'worse' : 'better';
          } else if (mTrend === 'down') {
            monthTrendColor = dept.invertTrend ? 'text-emerald-500' : 'text-red-500';
            monthTrendIcon = '\u2193';
            monthTrendLabel = dept.invertTrend ? 'better' : 'worse';
          }

          // Status badge
          const statusColors = {
            good: 'bg-emerald-100 text-emerald-800 border-emerald-200',
            warning: 'bg-amber-100 text-amber-800 border-amber-200',
            bad: 'bg-red-100 text-red-800 border-red-200',
          };

          const submissionPct = dept.totalDays > 0
            ? Math.round((dept.submissionCount / dept.totalDays) * 100)
            : 0;

          // Card border color based on issues
          let borderClass = 'border-slate-200';
          if (!dept.submitted && redAlerts.length > 0) borderClass = 'border-red-300';
          else if (!dept.submitted) borderClass = 'border-amber-300';
          else if (redAlerts.length > 0) borderClass = 'border-red-200';

          // Previous month comparison data
          const hasPrevData = dept.prevValue !== null && dept.prevValue !== undefined;
          const hasPrevText = dept.prevTextValue !== null && dept.prevTextValue !== undefined;
          const hasPrevStatus = dept.prevStatus !== null && dept.prevStatus !== undefined;
          const hasComparison = hasPrevData || hasPrevText || hasPrevStatus;

          // Calculate pct change for numeric KPIs
          let pctChange: number | null = null;
          if (dept.type === 'number' && dept.avg7d !== null && dept.prevAvg !== null && dept.prevAvg !== undefined && dept.prevAvg !== 0) {
            pctChange = ((dept.avg7d - dept.prevAvg) / Math.abs(dept.prevAvg)) * 100;
          }

          return (
            <div
              key={dept.slug}
              className={`bg-white rounded-xl border ${borderClass} transition-all hover:shadow-md ${
                isExpanded ? 'sm:col-span-2 shadow-md ring-1 ring-blue-200' : ''
              } ${!dept.submitted ? 'bg-red-50/20' : ''}`}
            >
              {/* Clickable header area */}
              <button
                onClick={() => setExpandedSlug(isExpanded ? null : dept.slug)}
                className="w-full text-left p-4 pb-3"
              >
                {/* Header: name + submission dot + alert count */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      dept.submitted ? 'bg-emerald-500' : 'bg-red-400'
                    }`} />
                    <span className="text-sm font-semibold text-slate-900 truncate">
                      {displayName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {hasIssues && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        redAlerts.length > 0
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {alerts.length}
                      </span>
                    )}
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      submissionPct >= 80 ? 'bg-emerald-100 text-emerald-700' :
                      submissionPct >= 50 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {dept.submissionCount}/{dept.totalDays}d
                    </span>
                    {/* Expand chevron */}
                    <svg
                      className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* KPI Value */}
                <div>
                  <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium mb-0.5">
                    {dept.label}
                  </div>
                  {dept.type === 'number' ? (
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-slate-900">
                        {formatValue(dept.value, dept.unit)}
                      </span>
                      <span className={`text-sm font-bold ${trendColor}`}>
                        {trendIcon}
                      </span>
                    </div>
                  ) : dept.type === 'text-status' ? (
                    <div className={`inline-block px-2.5 py-1 rounded-lg border text-sm font-semibold ${
                      dept.status ? statusColors[dept.status] : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {dept.status === 'good' ? 'OK' :
                       dept.status === 'warning' ? 'Partial' :
                       dept.status === 'bad' ? 'Issue' :
                       dept.textValue || 'No Data'}
                    </div>
                  ) : (
                    <span className="text-lg font-bold text-slate-400">{'\u2014'}</span>
                  )}
                  {dept.type === 'number' && dept.unit && dept.unit !== '\u20b9' && (
                    <div className="text-[10px] text-slate-400 mt-0.5">{dept.unit}</div>
                  )}
                </div>
              </button>

              {/* Expanded detail area */}
              {isExpanded && (
                <div className="border-t border-slate-200 px-4 py-3 bg-slate-50/50 rounded-b-xl">
                  {/* Month-over-month comparison */}
                  {hasComparison && (
                    <div className="mb-3 p-2.5 rounded-lg bg-white border border-slate-200">
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
                        Month-over-Month
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {/* Current month */}
                        <div>
                          <div className="text-[10px] text-slate-400 mb-0.5">
                            {formatMonthLabel(currentMonth) || 'This month'}
                          </div>
                          {dept.type === 'number' ? (
                            <>
                              <div className="text-sm font-bold text-slate-900">
                                {formatValue(dept.value, dept.unit)}
                              </div>
                              {dept.avg7d !== null && (
                                <div className="text-[10px] text-slate-400">
                                  7d avg: {formatValue(dept.avg7d, dept.unit)}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className={`inline-block px-2 py-0.5 rounded border text-xs font-semibold ${
                              dept.status ? statusColors[dept.status] : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                              {dept.status === 'good' ? 'OK' :
                               dept.status === 'warning' ? 'Partial' :
                               dept.status === 'bad' ? 'Issue' :
                               dept.textValue || '\u2014'}
                            </div>
                          )}
                        </div>
                        {/* Previous month */}
                        <div>
                          <div className="text-[10px] text-slate-400 mb-0.5">
                            {formatMonthLabel(previousMonth) || 'Last month'}
                          </div>
                          {dept.type === 'number' ? (
                            <>
                              <div className="text-sm font-bold text-slate-500">
                                {formatValue(dept.prevValue ?? null, dept.unit)}
                              </div>
                              {dept.prevAvg !== null && dept.prevAvg !== undefined && (
                                <div className="text-[10px] text-slate-400">
                                  Avg: {formatValue(dept.prevAvg, dept.unit)}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className={`inline-block px-2 py-0.5 rounded border text-xs font-semibold ${
                              dept.prevStatus ? statusColors[dept.prevStatus] : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                              {dept.prevStatus === 'good' ? 'OK' :
                               dept.prevStatus === 'warning' ? 'Partial' :
                               dept.prevStatus === 'bad' ? 'Issue' :
                               dept.prevTextValue || '\u2014'}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Change indicator */}
                      {dept.type === 'number' && pctChange !== null && (
                        <div className={`mt-2 text-xs font-semibold px-2 py-1 rounded-md inline-block ${
                          (pctChange > 0 && !dept.invertTrend) || (pctChange < 0 && dept.invertTrend)
                            ? 'bg-emerald-100 text-emerald-800'
                            : (pctChange < 0 && !dept.invertTrend) || (pctChange > 0 && dept.invertTrend)
                            ? 'bg-red-100 text-red-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {monthTrendIcon} {Math.abs(pctChange).toFixed(1)}% {monthTrendLabel} vs last month
                        </div>
                      )}
                      {dept.type === 'text-status' && dept.status !== dept.prevStatus && dept.prevStatus && (
                        <div className={`mt-2 text-xs font-semibold px-2 py-1 rounded-md inline-block ${
                          dept.status === 'good' ? 'bg-emerald-100 text-emerald-800' :
                          dept.status === 'bad' ? 'bg-red-100 text-red-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          Status changed from {dept.prevStatus} to {dept.status}
                        </div>
                      )}
                      {/* Submission comparison */}
                      {dept.prevSubmissionCount !== undefined && dept.prevTotalDays !== undefined && dept.prevTotalDays > 0 && (
                        <div className="text-[10px] text-slate-400 mt-1.5">
                          Submissions: {dept.submissionCount}/{dept.totalDays}d this month vs {dept.prevSubmissionCount}/{dept.prevTotalDays}d last month
                        </div>
                      )}
                    </div>
                  )}

                  {/* Alerts list */}
                  {alerts.length > 0 ? (
                    <div className="space-y-1.5 mb-3">
                      {alerts.map((alert, idx) => (
                        <div
                          key={idx}
                          className={`flex items-start gap-2 text-xs ${
                            alert.severity === 'red' ? 'text-red-700' : 'text-amber-700'
                          }`}
                        >
                          <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            alert.severity === 'red' ? 'bg-red-500' : 'bg-amber-500'
                          }`} />
                          <span>{alert.message}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-emerald-600 mb-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>No active issues</span>
                    </div>
                  )}

                  {/* Last submission info */}
                  {alertData?.lastSubmissionDate && (
                    <div className="text-[10px] text-slate-400 mb-2">
                      Last submitted: {formatDate(alertData.lastSubmissionDate)}
                    </div>
                  )}

                  {/* Navigate button */}
                  {onNavigateToDept && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigateToDept(dept.slug);
                      }}
                      className="w-full text-center text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg py-2 transition-colors"
                    >
                      View in Daily Dashboard &rarr;
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
