'use client';

import React from 'react';
import { type DeptKPIData } from './DepartmentGrid';

interface Props {
  departments: DeptKPIData[];
  onSelectDepartment: (slug: string) => void;
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
  'it': 'IT',
  'nursing': 'Nursing',
};

const DEPT_COLORS: Record<string, { bg: string; border: string; icon: string; accent: string }> = {
  'finance': { bg: 'bg-blue-50', border: 'border-blue-200', icon: '₹', accent: 'text-blue-600' },
  'emergency': { bg: 'bg-red-50', border: 'border-red-200', icon: '🚑', accent: 'text-red-600' },
  'billing': { bg: 'bg-indigo-50', border: 'border-indigo-200', icon: '📋', accent: 'text-indigo-600' },
  'pharmacy': { bg: 'bg-green-50', border: 'border-green-200', icon: '💊', accent: 'text-green-600' },
  'patient-safety': { bg: 'bg-amber-50', border: 'border-amber-200', icon: '🛡️', accent: 'text-amber-600' },
  'nursing': { bg: 'bg-pink-50', border: 'border-pink-200', icon: '👩‍⚕️', accent: 'text-pink-600' },
  'ot': { bg: 'bg-purple-50', border: 'border-purple-200', icon: '🔬', accent: 'text-purple-600' },
  'hr-manpower': { bg: 'bg-teal-50', border: 'border-teal-200', icon: '👥', accent: 'text-teal-600' },
};

const DEFAULT_COLOR = { bg: 'bg-slate-50', border: 'border-slate-200', icon: '📊', accent: 'text-slate-600' };

function formatKPIValue(dept: DeptKPIData): string {
  if (dept.textValue) return dept.textValue;
  if (dept.value === null) return '—';
  const unit = dept.unit || '';
  if (unit === '₹') {
    const n = dept.value;
    if (Math.abs(n) >= 10000000) return '₹' + (n / 10000000).toFixed(1) + 'Cr';
    if (Math.abs(n) >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
    if (Math.abs(n) >= 1000) return '₹' + (n / 1000).toFixed(0) + 'K';
    return '₹' + n.toFixed(0);
  }
  return `${dept.value}${unit ? ' ' + unit : ''}`;
}

function TrendArrow({ trend, invertTrend }: { trend: 'up' | 'down' | 'flat'; invertTrend: boolean }) {
  if (trend === 'flat') return <span className="text-slate-400 text-xs">→</span>;
  const isGood = invertTrend ? trend === 'down' : trend === 'up';
  return (
    <span className={`text-xs font-medium ${isGood ? 'text-emerald-500' : 'text-red-500'}`}>
      {trend === 'up' ? '↑' : '↓'}
    </span>
  );
}

// Available department overviews (only finance for now)
const AVAILABLE_OVERVIEWS = new Set(['finance']);

const DepartmentDeepDiveCards: React.FC<Props> = ({ departments, onSelectDepartment }) => {
  if (!departments || departments.length === 0) return null;

  return (
    <div className="mt-8 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-bold text-slate-900">Department Deep Dives</h2>
        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
          {departments.length} departments
        </span>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Click a department to view its full historical overview with trends and detailed analytics.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {departments.map((dept) => {
          const colors = DEPT_COLORS[dept.slug] || DEFAULT_COLOR;
          const isAvailable = AVAILABLE_OVERVIEWS.has(dept.slug);

          return (
            <button
              key={dept.slug}
              onClick={() => isAvailable ? onSelectDepartment(dept.slug) : undefined}
              disabled={!isAvailable}
              className={`relative text-left rounded-xl border p-3.5 transition-all ${
                isAvailable
                  ? `${colors.bg} ${colors.border} hover:shadow-md hover:scale-[1.02] cursor-pointer`
                  : 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
              }`}
            >
              {/* Available badge */}
              {isAvailable && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400" />
              )}

              {/* Icon + Name */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{colors.icon}</span>
                <span className="text-xs font-semibold text-slate-800 truncate">
                  {DEPT_DISPLAY_NAMES[dept.slug] || dept.label}
                </span>
              </div>

              {/* KPI Value */}
              <p className={`text-base font-bold ${isAvailable ? colors.accent : 'text-slate-500'}`}>
                {formatKPIValue(dept)}
              </p>

              {/* Label + Trend */}
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-slate-400 truncate">{dept.label}</span>
                <TrendArrow trend={dept.trend} invertTrend={dept.invertTrend} />
              </div>

              {/* Submission rate */}
              <div className="mt-2 flex items-center gap-1">
                <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full"
                    style={{ width: `${dept.totalDays > 0 ? (dept.submissionCount / dept.totalDays) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-[9px] text-slate-400">{dept.submissionCount}/{dept.totalDays}d</span>
              </div>

              {/* Coming soon label */}
              {!isAvailable && (
                <span className="text-[9px] text-slate-400 mt-1 block">Coming soon</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default DepartmentDeepDiveCards;
