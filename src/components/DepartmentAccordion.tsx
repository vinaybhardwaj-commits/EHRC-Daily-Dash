'use client';

import React, { useState } from 'react';
import { type DeptKPIData } from './DepartmentGrid';
import FinanceOverview from './FinanceOverview';
import BillingOverview from './BillingOverview';

// ── Config ────────────────────────────────────────────────────────────

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

const DEPT_ICONS: Record<string, string> = {
  'finance': '₹',
  'emergency': '🚑',
  'billing': '📋',
  'pharmacy': '💊',
  'patient-safety': '🛡️',
  'nursing': '👩‍⚕️',
  'ot': '🔬',
  'hr-manpower': '👥',
  'customer-care': '📞',
  'supply-chain': '📦',
  'facility': '🏗️',
  'training': '🎓',
  'clinical-lab': '🧪',
  'radiology': '📡',
  'diet': '🍎',
  'biomedical': '⚙️',
  'it': '💻',
};

const DEPT_ACCENT: Record<string, { bg: string; border: string; text: string; ring: string }> = {
  'finance': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', ring: 'ring-blue-200' },
  'emergency': { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', ring: 'ring-red-200' },
  'billing': { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', ring: 'ring-indigo-200' },
  'pharmacy': { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', ring: 'ring-green-200' },
  'patient-safety': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', ring: 'ring-amber-200' },
  'nursing': { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', ring: 'ring-pink-200' },
  'ot': { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', ring: 'ring-purple-200' },
  'hr-manpower': { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', ring: 'ring-teal-200' },
};

const DEFAULT_ACCENT = { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', ring: 'ring-slate-200' };

// Departments with full overview pages
const AVAILABLE_OVERVIEWS = new Set(['finance', 'billing']);

// ── Helpers ───────────────────────────────────────────────────────────

function formatKPIValue(dept: DeptKPIData): string {
  if (dept.textValue) return dept.textValue;
  if (dept.value === null) return '—';
  const unit = dept.unit || '';
  if (unit === '₹') {
    const n = dept.value;
    if (Math.abs(n) >= 10000000) return '₹' + (n / 10000000).toFixed(1) + ' Cr';
    if (Math.abs(n) >= 100000) return '₹' + (n / 100000).toFixed(1) + ' L';
    if (Math.abs(n) >= 1000) return '₹' + (n / 1000).toFixed(0) + 'K';
    return '₹' + n.toFixed(0);
  }
  return `${dept.value}${unit ? ' ' + unit : ''}`;
}

function TrendArrow({ trend, invertTrend }: { trend: 'up' | 'down' | 'flat'; invertTrend: boolean }) {
  if (trend === 'flat') return <span className="text-slate-400 text-xs">→</span>;
  const isGood = invertTrend ? trend === 'down' : trend === 'up';
  return (
    <span className={`text-xs font-semibold ${isGood ? 'text-emerald-500' : 'text-red-500'}`}>
      {trend === 'up' ? '▲' : '▼'}
    </span>
  );
}

function SubmissionBar({ count, total }: { count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${pct >= 80 ? 'bg-emerald-400' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-slate-400 tabular-nums">{count}/{total}d</span>
    </div>
  );
}

// ── Chevron SVG ───────────────────────────────────────────────────────

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

// ── Props ─────────────────────────────────────────────────────────────

interface Props {
  departments: DeptKPIData[];
  onNavigateToDashboard: (date: string, slug: string) => void;
}

// ── Main Component ────────────────────────────────────────────────────

const DepartmentAccordion: React.FC<Props> = ({ departments, onNavigateToDashboard }) => {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  if (!departments || departments.length === 0) return null;

  // Sort: available overviews first, then alphabetical
  const sorted = [...departments].sort((a, b) => {
    const aAvail = AVAILABLE_OVERVIEWS.has(a.slug) ? 0 : 1;
    const bAvail = AVAILABLE_OVERVIEWS.has(b.slug) ? 0 : 1;
    if (aAvail !== bAvail) return aAvail - bAvail;
    const aName = DEPT_DISPLAY_NAMES[a.slug] || a.label;
    const bName = DEPT_DISPLAY_NAMES[b.slug] || b.label;
    return aName.localeCompare(bName);
  });

  const toggle = (slug: string) => {
    setExpandedSlug(prev => prev === slug ? null : slug);
  };

  return (
    <div className="mt-8 mb-6">
      {/* Section Header */}
      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-lg font-bold text-slate-900">Department Deep Dives</h2>
        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
          {departments.length} departments
        </span>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Expand a department to view its detailed analytics and trends.
      </p>

      {/* Accordion List */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
        {sorted.map((dept) => {
          const isAvailable = AVAILABLE_OVERVIEWS.has(dept.slug);
          const isExpanded = expandedSlug === dept.slug;
          const accent = DEPT_ACCENT[dept.slug] || DEFAULT_ACCENT;
          const icon = DEPT_ICONS[dept.slug] || '📊';
          const name = DEPT_DISPLAY_NAMES[dept.slug] || dept.label;

          return (
            <div key={dept.slug}>
              {/* ── Row Header ── */}
              <button
                onClick={() => toggle(dept.slug)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors hover:bg-slate-50 ${
                  isExpanded ? (isAvailable ? accent.bg : 'bg-slate-50') : ''
                }`}
              >
                {/* Chevron */}
                <Chevron open={isExpanded} />

                {/* Icon */}
                <span className="text-base w-6 text-center flex-shrink-0">{icon}</span>

                {/* Name */}
                <span className={`text-sm font-semibold flex-shrink-0 min-w-[120px] ${
                  isAvailable ? accent.text : 'text-slate-700'
                }`}>
                  {name}
                </span>

                {/* KPI Pill */}
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  isAvailable
                    ? `${accent.bg} ${accent.text} ${accent.border} border`
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {formatKPIValue(dept)}
                </span>

                {/* KPI label + trend */}
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  {dept.label}
                </span>
                <TrendArrow trend={dept.trend} invertTrend={dept.invertTrend} />

                {/* Spacer */}
                <span className="flex-1" />

                {/* Submission bar */}
                <SubmissionBar count={dept.submissionCount} total={dept.totalDays} />

                {/* Status badge */}
                {isAvailable ? (
                  <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full hidden sm:inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                    Overview
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 hidden sm:inline">
                    Coming soon
                  </span>
                )}
              </button>

              {/* ── Expanded Content ── */}
              {isExpanded && (
                <div className={`border-t ${isAvailable ? accent.border : 'border-slate-100'}`}>
                  {dept.slug === 'finance' ? (
                    <div className="px-4 py-4">
                      <FinanceOverview
                        embedded
                        onBack={() => setExpandedSlug(null)}
                        onNavigateToDashboard={onNavigateToDashboard}
                      />
                    </div>
                  ) : dept.slug === 'billing' ? (
                    <div className="px-4 py-4">
                      <BillingOverview
                        embedded
                        onBack={() => setExpandedSlug(null)}
                        onNavigateToDashboard={onNavigateToDashboard}
                      />
                    </div>
                  ) : (
                    <div className="px-6 py-8 text-center">
                      <span className="text-3xl mb-3 block">{icon}</span>
                      <p className="text-sm font-medium text-slate-700">{name} Department</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Detailed analytics coming soon. Daily form data is being collected ({dept.submissionCount}/{dept.totalDays} days reported).
                      </p>
                      <div className="mt-3 flex items-center justify-center gap-1">
                        <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-400 rounded-full"
                            style={{ width: `${dept.totalDays > 0 ? (dept.submissionCount / dept.totalDays) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {dept.totalDays > 0 ? Math.round((dept.submissionCount / dept.totalDays) * 100) : 0}% reporting
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DepartmentAccordion;
