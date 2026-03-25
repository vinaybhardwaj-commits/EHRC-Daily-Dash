'use client';

import React, { useEffect, useState } from 'react';

/* ── Types ────────────────────────────────────────────────────────── */

interface MonthSummary {
  month: string;
  label: string;
  daysReported: number;
  totalFalls: number;
  totalMedErrors: number;
  totalAdverseEvents: number;
  totalSentinelEvents: number;
  totalNearMiss: number;
  totalCorrectivesClosed: number;
  incidentDays: number;
  incidentFreeRate: number;
  avgBundleCompliance: number;
  latestOpenRCAs: number;
  latestOpenNabh: number;
}

interface DayData {
  date: string;
  patientFalls: number | null;
  medicationErrors: number | null;
  adverseEvents: number | null;
  sentinelEvents: number | null;
  nearMissIncidents: number | null;
  correctiveActionsClosed: number | null;
  nabhNonCompliancesClosed: number | null;
  newNabhNonCompliances: number | null;
  openRCAs: number | null;
  totalOpenNabh: number | null;
  staffSafetyBriefed: boolean;
  clinicalAuditStatus: string | null;
  nonClinicalAuditStatus: string | null;
  vapCompliance: number | null;
  clabsiCompliance: number | null;
  ssiCompliance: number | null;
  cautiCompliance: number | null;
  safetyTopic: string | null;
  rcaSummary: string | null;
  underReportingFlag: boolean;
  otherNotes: string | null;
  hasIncident: boolean;
}

interface APIResponse {
  slug: string;
  department: string;
  summary: {
    totalDaysReported: number;
    dateRange: { from: string; to: string } | null;
    totalFalls: number;
    totalMedErrors: number;
    totalAdverseEvents: number;
    totalSentinelEvents: number;
    totalNearMiss: number;
    totalCorrectivesClosed: number;
    incidentDays: number;
    incidentFreeRate: number;
    avgBundleCompliance: number;
    latestOpenRCAs: number;
    latestOpenNabh: number;
  };
  months: MonthSummary[];
  allDays: DayData[];
}

interface Props {
  embedded?: boolean;
  onBack?: () => void;
  onNavigateToDashboard?: (date: string, slug: string) => void;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function fmtMonth(m: string) {
  const [y, mo] = m.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(mo, 10) - 1]} '${y.slice(2)}`;
}

function smoothPath(points: { x: number; y: number }[], tension = 0.3): string {
  if (points.length < 2) return '';
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function smoothAreaPath(points: { x: number; y: number }[], baseY: number, tension = 0.3): string {
  const line = smoothPath(points, tension);
  if (!line || points.length < 2) return '';
  return `${line} L ${points[points.length - 1].x} ${baseY} L ${points[0].x} ${baseY} Z`;
}

/* ── Component ────────────────────────────────────────────────────── */

export default function PatientSafetyOverview({ embedded, onBack, onNavigateToDashboard }: Props) {
  const [data, setData] = useState<APIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/department-overview?slug=patient-safety')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-3 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
    </div>
  );
  if (error || !data) return (
    <div className="text-center py-12 text-red-500">Failed to load Patient Safety data</div>
  );

  const { summary, months, allDays } = data;
  const currentMonth = months[months.length - 1];
  const prevMonth = months.length > 1 ? months[months.length - 2] : null;

  // ── Hero Cards ──────────────────────────────────────────────────
  const heroCards = [
    {
      label: 'INCIDENT-FREE RATE',
      value: currentMonth ? currentMonth.incidentFreeRate.toFixed(0) + '%' : '—',
      sub: currentMonth ? `${Math.round(currentMonth.incidentFreeRate / 100 * currentMonth.daysReported)} of ${currentMonth.daysReported} days` : '—',
      delta: currentMonth && prevMonth ? currentMonth.incidentFreeRate - prevMonth.incidentFreeRate : null,
      deltaFmt: (d: number) => d.toFixed(0),
      color: 'text-amber-600',
    },
    {
      label: 'BUNDLE COMPLIANCE',
      value: currentMonth ? currentMonth.avgBundleCompliance.toFixed(0) + '%' : '—',
      sub: 'VAP, CLABSI, SSI, CAUTI',
      delta: currentMonth && prevMonth ? currentMonth.avgBundleCompliance - prevMonth.avgBundleCompliance : null,
      deltaFmt: (d: number) => d.toFixed(0),
      color: 'text-emerald-600',
    },
    {
      label: 'NEAR-MISS REPORTS',
      value: currentMonth ? currentMonth.totalNearMiss : '—',
      sub: 'Proactive safety culture',
      delta: currentMonth && prevMonth ? currentMonth.totalNearMiss - prevMonth.totalNearMiss : null,
      deltaFmt: (d: number) => d.toFixed(0),
      color: 'text-blue-600',
    },
    {
      label: 'OPEN RCAs',
      value: currentMonth ? currentMonth.latestOpenRCAs : '—',
      sub: 'Root cause analyses',
      delta: null,
      color: 'text-red-600',
    },
  ];

  // ── Dual Trend: Incident-Free Rate + Bundle Compliance ─────────
  const dualTrend = months.map((m, i) => ({
    month: fmtMonth(m.month),
    incidentFreeRate: m.incidentFreeRate,
    bundleCompliance: m.avgBundleCompliance,
    x: 80 + (i * 100),
  }));

  const incidentPoints = dualTrend.map(d => ({ x: d.x, y: Math.max(10, 200 - (d.incidentFreeRate / 100) * 190) }));
  const bundlePoints = dualTrend.map(d => ({ x: d.x, y: Math.max(10, 200 - (d.bundleCompliance / 100) * 190) }));

  // ── Incident Breakdown ────────────────────────────────────────
  const incidentBreakdown = allDays
    .filter(d => d.hasIncident && (d.patientFalls || d.medicationErrors || d.adverseEvents || d.nearMissIncidents))
    .slice(-20)
    .reverse()
    .map(d => ({
      date: d.date,
      falls: d.patientFalls || 0,
      medErrors: d.medicationErrors || 0,
      adverse: d.adverseEvents || 0,
      sentinel: d.sentinelEvents || 0,
      nearMiss: d.nearMissIncidents || 0,
      notes: d.otherNotes || '',
    }));

  // ── Bundle Compliance by Protocol ────────────────────────────
  const bundleAvg = {
    vap: (allDays.filter(d => d.vapCompliance).reduce((sum, d) => sum + ((d.vapCompliance as unknown as Record<string, number>)['compliance'] || (d.vapCompliance as any) || 0), 0) / allDays.filter(d => d.vapCompliance).length) || 0,
    clabsi: (allDays.filter(d => d.clabsiCompliance).reduce((sum, d) => sum + ((d.clabsiCompliance as unknown as Record<string, number>)['compliance'] || (d.clabsiCompliance as any) || 0), 0) / allDays.filter(d => d.clabsiCompliance).length) || 0,
    ssi: (allDays.filter(d => d.ssiCompliance).reduce((sum, d) => sum + ((d.ssiCompliance as unknown as Record<string, number>)['compliance'] || (d.ssiCompliance as any) || 0), 0) / allDays.filter(d => d.ssiCompliance).length) || 0,
    cauti: (allDays.filter(d => d.cautiCompliance).reduce((sum, d) => sum + ((d.cautiCompliance as unknown as Record<string, number>)['compliance'] || (d.cautiCompliance as any) || 0), 0) / allDays.filter(d => d.cautiCompliance).length) || 0,
  };

  // ── Streak Calculation ──────────────────────────────────────────
  let streak = 0;
  for (let i = allDays.length - 1; i >= 0; i--) {
    const d = allDays[i];
    if (!d.hasIncident) {
      streak++;
    } else {
      break;
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      {!embedded && (
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="p-2 hover:bg-amber-50 rounded-lg transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-amber-900">Patient Safety</h1>
        </div>
      )}

      {/* Hero Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {heroCards.map((card, i) => (
          <div key={i} className="bg-white border border-amber-100 rounded-lg p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color} mt-1`}>{card.value}</p>
            <p className="text-xs text-slate-500 mt-1">{card.sub}</p>
            {card.delta !== null && (
              <p className="text-xs mt-2">
                <span className={card.delta >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                  {card.delta >= 0 ? '↑' : '↓'} {card.deltaFmt(Math.abs(card.delta))}
                </span>
                <span className="text-slate-400"> vs last month</span>
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Dual Trend Chart: Incident-Free Rate + Bundle Compliance */}
      <div className="bg-white border border-amber-100 rounded-lg p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Safety Performance Trends</h3>
        <svg viewBox="0 0 900 260" className="w-full h-32">
          {/* Grid */}
          <defs>
            <pattern id="grid" width="100" height="40" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 40" fill="none" stroke="#fef3c7" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="900" height="260" fill="url(#grid)" />

          {/* Incident-Free Rate line */}
          <path d={smoothPath(incidentPoints)} stroke="#dc2626" strokeWidth="2" fill="none" />
          {incidentPoints.map((p, i) => (
            <circle key={`incident-${i}`} cx={p.x} cy={p.y} r="3" fill="#dc2626" />
          ))}

          {/* Bundle Compliance line */}
          <path d={smoothPath(bundlePoints)} stroke="#10b981" strokeWidth="2" fill="none" />
          {bundlePoints.map((p, i) => (
            <circle key={`bundle-${i}`} cx={p.x} cy={p.y} r="3" fill="#10b981" />
          ))}
        </svg>

        {/* Legend */}
        <div className="flex gap-6 mt-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-red-600" />
            <span className="text-slate-600">Incident-Free Rate %</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-emerald-500" />
            <span className="text-slate-600">Bundle Compliance %</span>
          </div>
        </div>
      </div>

      {/* Bundle Compliance Breakdown */}
      <div className="bg-white border border-amber-100 rounded-lg p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Infection Prevention Bundles</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'VAP', value: summary.totalFalls, color: 'bg-blue-50', textColor: 'text-blue-600' },
            { label: 'CLABSI', value: summary.totalMedErrors, color: 'bg-red-50', textColor: 'text-red-600' },
            { label: 'SSI', value: summary.totalAdverseEvents, color: 'bg-amber-50', textColor: 'text-amber-600' },
            { label: 'CAUTI', value: summary.totalSentinelEvents, color: 'bg-purple-50', textColor: 'text-purple-600' },
          ].map((bundle, i) => (
            <div key={i} className={`${bundle.color} border border-slate-200 rounded-lg p-4`}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{bundle.label} Prevention</p>
              <p className={`text-2xl font-bold ${bundle.textColor} mt-2`}>{bundle.value}</p>
              <p className="text-xs text-slate-500 mt-1">Bundle protocol compliance</p>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly Progression Table */}
      <div className="bg-white border border-amber-100 rounded-lg p-6 shadow-sm overflow-x-auto">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Monthly Progression</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-3 font-semibold text-slate-600">Month</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Days</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Falls</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Med Errors</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Adverse</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Near-Miss</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Inc-Free %</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600">Bundle %</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => (
              <tr key={i} className="border-b border-slate-100 hover:bg-amber-50">
                <td className="py-3 px-3 font-medium text-slate-700">{m.label}</td>
                <td className="text-right py-3 px-3 text-slate-600">{m.daysReported}</td>
                <td className="text-right py-3 px-3 text-blue-600">{m.totalFalls}</td>
                <td className="text-right py-3 px-3 text-red-600">{m.totalMedErrors}</td>
                <td className="text-right py-3 px-3 text-amber-600">{m.totalAdverseEvents}</td>
                <td className="text-right py-3 px-3 text-purple-600">{m.totalNearMiss}</td>
                <td className="text-right py-3 px-3 font-semibold">
                  <span className={m.incidentFreeRate >= 80 ? 'text-emerald-600' : m.incidentFreeRate >= 50 ? 'text-amber-600' : 'text-red-600'}>
                    {m.incidentFreeRate.toFixed(0)}%
                  </span>
                </td>
                <td className="text-right py-3 px-3 font-semibold">
                  <span className={m.avgBundleCompliance >= 90 ? 'text-emerald-600' : m.avgBundleCompliance >= 70 ? 'text-amber-600' : 'text-red-600'}>
                    {m.avgBundleCompliance.toFixed(0)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Incident Log */}
      {incidentBreakdown.length > 0 && (
        <div className="bg-white border border-amber-100 rounded-lg p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Recent Incidents (Last 20 Events)</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {incidentBreakdown.map((inc, i) => (
              <div key={i} className="flex gap-3 py-2 px-3 bg-slate-50 rounded text-xs border-l-2 border-amber-200">
                <span className="font-semibold min-w-16 text-red-600">⚠️ Incident</span>
                <div className="flex-1">
                  <div className="flex gap-3 text-slate-600">
                    {inc.falls > 0 && <span className="text-blue-600">Falls: {inc.falls}</span>}
                    {inc.medErrors > 0 && <span className="text-red-600">Med Errors: {inc.medErrors}</span>}
                    {inc.adverse > 0 && <span className="text-amber-600">Adverse: {inc.adverse}</span>}
                    {inc.nearMiss > 0 && <span className="text-purple-600">Near-Miss: {inc.nearMiss}</span>}
                  </div>
                  {inc.notes && <p className="text-slate-500 mt-1">{inc.notes}</p>}
                  <p className="text-slate-400">{inc.date}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Row: Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Incident-Free Streak */}
        <div className="bg-white border border-amber-100 rounded-lg p-4 shadow-sm text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Current Streak</p>
          <p className="text-3xl font-bold text-amber-600 mt-2">{streak}</p>
          <p className="text-xs text-slate-500 mt-1">Consecutive incident-free days</p>
        </div>

        {/* All-Time Incidents */}
        <div className="bg-white border border-amber-100 rounded-lg p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">All-Time Incidents</p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Patient Falls:</span>
              <span className="font-semibold text-blue-600">{summary.totalFalls}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Med Errors:</span>
              <span className="font-semibold text-red-600">{summary.totalMedErrors}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Adverse Events:</span>
              <span className="font-semibold text-amber-600">{summary.totalAdverseEvents}</span>
            </div>
          </div>
        </div>

        {/* Quality Metrics */}
        <div className="bg-white border border-amber-100 rounded-lg p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Quality Metrics</p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Incident-Free Rate:</span>
              <span className="font-semibold text-emerald-600">{summary.incidentFreeRate.toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Bundle Compliance:</span>
              <span className="font-semibold text-emerald-600">{summary.avgBundleCompliance.toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Open RCAs:</span>
              <span className="font-semibold text-red-600">{summary.latestOpenRCAs}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
