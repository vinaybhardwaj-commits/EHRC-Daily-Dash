'use client';

import React, { useState } from 'react';

export interface SecondaryKPIData {
  label: string;
  value: number | null;
  textValue: string | null;
  status: 'good' | 'warning' | 'bad' | null;
  unit: string | null;
  type: 'number' | 'text-status';
  trend: 'up' | 'down' | 'flat';
  invertTrend: boolean;
}

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
  prevValue?: number | null;
  prevTextValue?: string | null;
  prevStatus?: 'good' | 'warning' | 'bad' | null;
  prevAvg?: number | null;
  prevSubmissionCount?: number;
  prevTotalDays?: number;
  monthTrend?: 'up' | 'down' | 'flat';
  secondaryKpis?: SecondaryKPIData[];
  health?: 'green' | 'amber' | 'red';
  lastSubmissionDate?: string | null;
  isStale?: boolean;
  staleDate?: string | null;
  staleTooOld?: boolean;
}

export interface DeptAlertData {
  slug: string;
  alerts: { message: string; severity: 'red' | 'amber' | 'info' }[];
  lastSubmissionDate: string | null;
}

const DEPT_NAMES: Record<string, string> = {
  'emergency': 'Emergency', 'customer-care': 'Customer Care', 'patient-safety': 'Patient Safety',
  'finance': 'Finance', 'billing': 'Billing', 'supply-chain': 'Supply Chain',
  'facility': 'Facility', 'pharmacy': 'Pharmacy', 'training': 'Training',
  'clinical-lab': 'Clinical Lab', 'radiology': 'Radiology', 'ot': 'OT',
  'hr-manpower': 'HR & Manpower', 'diet': 'Diet & Nutrition', 'biomedical': 'Biomedical',
  'nursing': 'Nursing', 'it': 'IT',
};

function fmtVal(value: number | null, unit?: string | null): string {
  if (value === null) return '—';
  if (unit === '₹') {
    if (Math.abs(value) >= 10000000) return '₹' + (value / 10000000).toFixed(2) + ' Cr';
    if (Math.abs(value) >= 100000) return '₹' + (value / 100000).toFixed(2) + ' L';
    if (Math.abs(value) >= 1000) return '₹' + (value / 1000).toFixed(1) + 'K';
    return '₹' + value.toFixed(0);
  }
  if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
  return value.toFixed(0);
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function TrendArrow({ trend, invert }: { trend: 'up' | 'down' | 'flat'; invert: boolean }) {
  if (trend === 'flat') return <span className="text-slate-400 text-xs">{'→'}</span>;
  const isUp = trend === 'up';
  const isGood = invert ? !isUp : isUp;
  return (
    <span className={"text-xs font-bold " + (isGood ? 'text-emerald-500' : 'text-red-500')}>
      {isUp ? '↑' : '↓'}
    </span>
  );
}

function KPIRow({ label, value, textValue, status, unit, type, trend, invertTrend, isStale }: {
  label: string; value: number | null; textValue: string | null; status: 'good' | 'warning' | 'bad' | null;
  unit: string | null; type: string; trend: 'up' | 'down' | 'flat'; invertTrend: boolean; isStale?: boolean;
}) {
  const statusBg: Record<string, string> = {
    good: 'text-emerald-700', warning: 'text-amber-700', bad: 'text-red-700',
  };
  const statusLabel: Record<string, string> = { good: 'OK', warning: 'Partial', bad: 'Issue' };

  const valueColor = isStale ? 'text-slate-400' : 'text-slate-900';
  const staleStatusColor = isStale ? 'text-slate-400' : '';

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[11px] text-slate-500 truncate mr-2">{label}</span>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {type === 'number' ? (
          <>
            <span className={"text-sm font-semibold " + valueColor}>{fmtVal(value, unit)}</span>
            {!isStale && <TrendArrow trend={trend} invert={invertTrend} />}
          </>
        ) : type === 'text-status' && status ? (
          <span className={"text-xs font-semibold " + (staleStatusColor || statusBg[status] || 'text-slate-500')}>
            {statusLabel[status] || textValue || '—'}
          </span>
        ) : (
          <span className="text-xs text-slate-400">{'—'}</span>
        )}
      </div>
    </div>
  );
}

interface Props {
  departments: DeptKPIData[];
  deptAlerts?: DeptAlertData[];
  onNavigateToDept?: (slug: string) => void;
  onNavigateToDashboard?: (date: string, slug: string) => void;
  currentMonth?: string;
  previousMonth?: string;
}

export default function DepartmentGrid({ departments, deptAlerts, onNavigateToDept, onNavigateToDashboard, currentMonth, previousMonth }: Props) {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const alertsBySlug = new Map((deptAlerts || []).map(a => [a.slug, a]));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-slate-900">Department Progress</h3>
        <span className="text-xs text-slate-500">Click to expand</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {departments.map(dept => {
          const name = DEPT_NAMES[dept.slug] || dept.slug;
          const isExpanded = expandedSlug === dept.slug;
          const alertData = alertsBySlug.get(dept.slug);
          const alerts = alertData?.alerts || [];
          const redCount = alerts.filter(a => a.severity === 'red').length;
          const health = dept.health || (dept.submitted ? 'green' : 'red');
          const submPct = dept.totalDays > 0 ? Math.round((dept.submissionCount / dept.totalDays) * 100) : 0;
          const lastDate = dept.lastSubmissionDate || alertData?.lastSubmissionDate || null;
          const secKpis = dept.secondaryKpis || [];
          const hasAnyData = dept.submissionCount > 0;
          const isStale = dept.isStale || false;
          const staleDate = dept.staleDate || null;
          const staleTooOld = dept.staleTooOld || false;

          const healthDot: Record<string, string> = { green: 'bg-emerald-500', amber: 'bg-amber-400', red: 'bg-red-400' };
          const healthBorder: Record<string, string> = { green: 'border-slate-200', amber: 'border-amber-200', red: 'border-red-200' };

          let barColor = 'bg-slate-200';
          if (submPct >= 90) barColor = 'bg-emerald-500';
          else if (submPct >= 75) barColor = 'bg-emerald-400';
          else if (submPct >= 60) barColor = 'bg-amber-400';
          else if (submPct >= 40) barColor = 'bg-orange-400';
          else if (submPct > 0) barColor = 'bg-red-400';

          let badgeColor = 'bg-red-100 text-red-700';
          if (submPct >= 90) badgeColor = 'bg-emerald-100 text-emerald-700';
          else if (submPct >= 75) badgeColor = 'bg-emerald-100 text-emerald-600';
          else if (submPct >= 60) badgeColor = 'bg-amber-100 text-amber-700';
          else if (submPct >= 40) badgeColor = 'bg-orange-100 text-orange-700';

          const hasKPIValues = dept.value !== null || dept.textValue !== null || (dept.status !== null && dept.type === 'text-status');
          const showStaleData = isStale && hasKPIValues;
          const showNoRecentData = staleTooOld || (!hasAnyData);

          return (
            <div
              key={dept.slug}
              className={"bg-white rounded-xl border transition-all hover:shadow-md " + (healthBorder[health] || 'border-slate-200') + (isExpanded ? ' sm:col-span-2 shadow-md ring-1 ring-blue-200' : '')}
            >
              <button
                onClick={() => setExpandedSlug(isExpanded ? null : dept.slug)}
                className="w-full text-left p-4"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={"w-2.5 h-2.5 rounded-full flex-shrink-0 " + (healthDot[health] || 'bg-slate-300')} />
                    <span className="text-sm font-semibold text-slate-900 truncate">{name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {alerts.length > 0 && (
                      <span className={"text-[10px] font-bold px-1.5 py-0.5 rounded-full " + (redCount > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                        {alerts.length}
                      </span>
                    )}
                    <span className={"text-[10px] font-medium px-1.5 py-0.5 rounded " + badgeColor}>
                      {dept.submissionCount}/{dept.totalDays}d
                    </span>
                    <svg className={"w-3.5 h-3.5 text-slate-400 transition-transform " + (isExpanded ? 'rotate-180' : '')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mb-3">
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={"h-full rounded-full transition-all " + barColor}
                      style={{ width: Math.max(submPct, 2) + '%' }}
                    />
                  </div>
                </div>

                {/* KPI metrics */}
                {showNoRecentData ? (
                  <div className="py-2 text-center">
                    <div className="text-xs text-slate-400 font-medium">
                      {staleTooOld ? 'No recent data' : 'No data yet this month'}
                    </div>
                    <div className="text-[10px] text-slate-300 mt-0.5">
                      {staleTooOld
                        ? 'Last submission over 7 days ago'
                        : '0 of ' + dept.totalDays + ' days reported'}
                    </div>
                  </div>
                ) : (
                  <div>
                    {showStaleData && staleDate && (
                      <div className="mb-1.5 px-2 py-1 bg-slate-50 rounded text-[10px] text-slate-400 border border-slate-100">
                        as of {fmtDate(staleDate)} — no submission today
                      </div>
                    )}
                    <div className="space-y-0.5">
                      <KPIRow
                        label={dept.label} value={dept.value} textValue={dept.textValue}
                        status={dept.status} unit={dept.unit} type={dept.type}
                        trend={dept.trend} invertTrend={dept.invertTrend} isStale={isStale}
                      />
                      {secKpis.map((sk, i) => (
                        <KPIRow
                          key={i} label={sk.label} value={sk.value} textValue={sk.textValue}
                          status={sk.status} unit={sk.unit} type={sk.type}
                          trend={sk.trend} invertTrend={sk.invertTrend} isStale={isStale}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer */}
                {lastDate && !showNoRecentData && !showStaleData && (
                  <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                    Last: {fmtDate(lastDate)}
                  </div>
                )}
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-slate-200 px-4 py-3 bg-slate-50/50 rounded-b-xl">
                  {alerts.length > 0 ? (
                    <div className="space-y-1.5 mb-3">
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">Active Alerts</div>
                      {alerts.map((alert, idx) => (
                        <div key={idx} className={"flex items-start gap-2 text-xs " + (alert.severity === 'red' ? 'text-red-700' : 'text-amber-700')}>
                          <span className={"mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 " + (alert.severity === 'red' ? 'bg-red-500' : 'bg-amber-500')} />
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

                  {dept.type === 'number' && (dept.prevValue !== null && dept.prevValue !== undefined) && (
                    <div className="mb-3 p-2.5 rounded-lg bg-white border border-slate-200">
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">vs Last Month</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-slate-400 text-[10px]">This month</div>
                          <div className="font-bold text-slate-900">{fmtVal(dept.value, dept.unit)}</div>
                        </div>
                        <div>
                          <div className="text-slate-400 text-[10px]">Last month</div>
                          <div className="font-bold text-slate-500">{fmtVal(dept.prevValue ?? null, dept.unit)}</div>
                        </div>
                      </div>
                      {dept.prevSubmissionCount !== undefined && dept.prevTotalDays !== undefined && dept.prevTotalDays > 0 && (
                        <div className="text-[10px] text-slate-400 mt-1.5">
                          Submissions: {dept.submissionCount}/{dept.totalDays}d vs {dept.prevSubmissionCount}/{dept.prevTotalDays}d
                        </div>
                      )}
                    </div>
                  )}

                  {onNavigateToDept && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onNavigateToDept(dept.slug); }}
                      className="w-full text-center text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg py-2 transition-colors"
                    >
                      View in Daily Dashboard →
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
