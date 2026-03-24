'use client';

import React from 'react';

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
}

function formatValue(value: number | null, unit?: string | null): string {
  if (value === null) return '—';
  // Indian formatting for large numbers
  if (unit === '₹') {
    if (Math.abs(value) >= 10000000) return '₹' + (value / 10000000).toFixed(2) + ' Cr';
    if (Math.abs(value) >= 100000) return '₹' + (value / 100000).toFixed(2) + ' L';
    if (Math.abs(value) >= 1000) return '₹' + (value / 1000).toFixed(1) + 'K';
    return '₹' + value.toFixed(0);
  }
  if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
  return value.toFixed(0);
}

export default function DepartmentGrid({ departments }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-slate-900">Department Progress</h3>
        <span className="text-xs text-slate-500">
          Signature KPI per department — latest value with 7-day trend
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {departments.map(dept => {
          const displayName = DEPT_DISPLAY_NAMES[dept.slug] || dept.slug;

          // Determine trend color — for inverted metrics, "up" is bad
          let trendColor = 'text-slate-400';
          let trendIcon = '—';
          if (dept.trend === 'up') {
            trendColor = dept.invertTrend ? 'text-red-500' : 'text-emerald-500';
            trendIcon = '↑';
          } else if (dept.trend === 'down') {
            trendColor = dept.invertTrend ? 'text-emerald-500' : 'text-red-500';
            trendIcon = '↓';
          }

          // Status badge colors for text-status type
          const statusColors = {
            good: 'bg-emerald-100 text-emerald-800 border-emerald-200',
            warning: 'bg-amber-100 text-amber-800 border-amber-200',
            bad: 'bg-red-100 text-red-800 border-red-200',
          };

          // Submission rate as a percentage
          const submissionPct = dept.totalDays > 0
            ? Math.round((dept.submissionCount / dept.totalDays) * 100)
            : 0;

          return (
            <div
              key={dept.slug}
              className={`bg-white rounded-xl border p-4 transition-all hover:shadow-md ${
                dept.submitted
                  ? 'border-slate-200'
                  : 'border-red-200 bg-red-50/30'
              }`}
            >
              {/* Header: name + submission dot */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    dept.submitted ? 'bg-emerald-500' : 'bg-red-400'
                  }`} />
                  <span className="text-sm font-semibold text-slate-900 truncate">
                    {displayName}
                  </span>
                </div>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  submissionPct >= 80 ? 'bg-emerald-100 text-emerald-700' :
                  submissionPct >= 50 ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {dept.submissionCount}/{dept.totalDays}d
                </span>
              </div>

              {/* KPI Value */}
              <div className="mb-1">
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
                     'No Data'}
                  </div>
                ) : (
                  <span className="text-lg font-bold text-slate-400">—</span>
                )}
              </div>

              {/* Unit label */}
              {dept.type === 'number' && dept.unit && dept.unit !== '₹' && (
                <div className="text-[10px] text-slate-400">{dept.unit}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
