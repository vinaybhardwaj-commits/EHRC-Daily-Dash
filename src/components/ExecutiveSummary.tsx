'use client';

import { DaySnapshot, DEPARTMENTS } from '@/lib/types';

interface Props {
  snapshot: DaySnapshot;
}

function extractNumeric(val: string | number | undefined): number | null {
  if (val === undefined || val === '') return null;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[,\sâ¹Rs.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function formatCurrency(val: number, compact = false): string {
  if (compact) {
    if (val >= 10000000) return `${(val / 10000000).toFixed(1)}Cr`;
    if (val >= 100000) return `${(val / 100000).toFixed(1)}L`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
  }
  return val.toLocaleString('en-IN');
}

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: string;
  color: 'emerald' | 'blue' | 'purple' | 'amber' | 'rose' | 'teal';
}

function MetricCard({ label, value, icon, color }: MetricCardProps) {
  const colorMap = {
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-600', value: 'text-emerald-700' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-600', value: 'text-blue-700' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', icon: 'text-purple-600', value: 'text-purple-700' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'text-amber-600', value: 'text-amber-700' },
    rose: { bg: 'bg-rose-50', border: 'border-rose-200', icon: 'text-rose-600', value: 'text-rose-700' },
    teal: { bg: 'bg-teal-50', border: 'border-teal-200', icon: 'text-teal-600', value: 'text-teal-700' },
  };
  const c = colorMap[color];

  return (
    <div className={`${c.bg} border ${c.border} rounded-xl p-3 sm:p-4`}>
      <div className="flex items-center gap-2 mb-1.5">
        <svg className={`w-4 h-4 ${c.icon} flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider truncate">{label}</p>
      </div>
      <p className={`text-xl sm:text-2xl font-bold ${c.value}`}>{value}</p>
    </div>
  );
}

export default function ExecutiveSummary({ snapshot }: Props) {
  const getDeptField = (slug: string, field: string): string | number | undefined => {
    const dept = snapshot.departments.find(d => d.slug === slug);
    if (!dept || !dept.entries.length) return undefined;
    return dept.entries[dept.entries.length - 1].fields[field];
  };

  // Financial KPIs
  const revenue = extractNumeric(getDeptField('finance', 'Revenue for the day (Rs.)'));
  const revenueMTD = extractNumeric(getDeptField('finance', 'Total revenue MTD (Rs.)'));
  const census = extractNumeric(getDeptField('finance', 'Midnight census â total IP patients'));
  const surgeries = extractNumeric(getDeptField('finance', 'Surgeries MTD'));
  const arpob = extractNumeric(getDeptField('finance', 'ARPOB â Avg Revenue Per Occupied Bed (Rs.)'));
  const edCases = extractNumeric(getDeptField('emergency', '# of genuine walk-in / ambulance emergencies (last 24h)'));
  const otCases = extractNumeric(getDeptField('ot', '# of OT cases done (yesterday)'));
  const pharmacyMTD = extractNumeric(getDeptField('pharmacy', 'Pharmacy revenue MTD (Rs.)'));

  // Safety alerts
  const deaths = extractNumeric(getDeptField('emergency', '# of Deaths'));
  const critAlerts = extractNumeric(getDeptField('emergency', '# of Critical alerts (Code Blue / Red / Yellow)'));
  const sentinelEvents = extractNumeric(getDeptField('patient-safety', '# of Sentinel events reported today'));
  const medErrors = extractNumeric(getDeptField('patient-safety', '# of Medication errors today'));
  const adverseEvents = extractNumeric(getDeptField('patient-safety', '# of Adverse events reported today'));

  // Operational flags
  const stockouts = getDeptField('supply-chain', 'Shortages / backorders');
  const eqBreakdowns = getDeptField('biomedical', 'Breakdown updates');
  const pendingComplaints = extractNumeric(getDeptField('customer-care', '# of total complaints currently pending resolution'));
  const overdueRCAs = extractNumeric(getDeptField('patient-safety', '# of open RCAs past their due date'));

  const submittedDepts = snapshot.departments.map(d => d.slug);
  const totalDepts = DEPARTMENTS.length;
  const reportedCount = submittedDepts.length;

  const hasAlerts = (deaths !== null && deaths > 0) ||
    (critAlerts !== null && critAlerts > 0) ||
    (sentinelEvents !== null && sentinelEvents > 0) ||
    (medErrors !== null && medErrors > 0) ||
    (adverseEvents !== null && adverseEvents > 0);

  const hasFlags = !!(stockouts) || !!(eqBreakdowns) ||
    (pendingComplaints !== null && pendingComplaints > 5) ||
    (overdueRCAs !== null && overdueRCAs > 0);

  // Collect available KPIs
  const metrics: MetricCardProps[] = [];
  if (revenue !== null) metrics.push({ label: 'Revenue Today', value: `â¹${formatCurrency(revenue, true)}`, icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', color: 'emerald' });
  if (revenueMTD !== null) metrics.push({ label: 'Revenue MTD', value: `â¹${formatCurrency(revenueMTD, true)}`, icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', color: 'emerald' });
  if (census !== null) metrics.push({ label: 'IP Census', value: census, icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', color: 'blue' });
  if (surgeries !== null) metrics.push({ label: 'Surgeries MTD', value: surgeries, icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z', color: 'purple' });
  if (arpob !== null) metrics.push({ label: 'ARPOB', value: `â¹${formatCurrency(arpob, true)}`, icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', color: 'teal' });
  if (edCases !== null) metrics.push({ label: 'ED Cases', value: edCases, icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10', color: 'amber' });
  if (otCases !== null) metrics.push({ label: 'OT Cases', value: otCases, icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', color: 'purple' });
  if (pharmacyMTD !== null) metrics.push({ label: 'Pharmacy MTD', value: `â¹${formatCurrency(pharmacyMTD, true)}`, icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z', color: 'emerald' });

  return (
    <div className="space-y-4">
      {/* KPI Grid */}
      {metrics.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {metrics.map(m => <MetricCard key={m.label} {...m} />)}
        </div>
      )}

      {/* Critical Alerts */}
      {hasAlerts && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h3 className="font-bold text-red-800 text-sm uppercase tracking-wide">Critical Alerts</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {deaths !== null && deaths > 0 && (
              <div className="flex items-center gap-2 bg-red-100 rounded-lg px-3 py-2">
                <span className="w-2 h-2 rounded-full bg-red-600" />
                <span className="text-sm text-red-800"><span className="font-semibold">{deaths}</span> Death{deaths > 1 ? 's' : ''}</span>
              </div>
            )}
            {critAlerts !== null && critAlerts > 0 && (
              <div className="flex items-center gap-2 bg-red-100 rounded-lg px-3 py-2">
                <span className="w-2 h-2 rounded-full bg-red-600" />
                <span className="text-sm text-red-800"><span className="font-semibold">{critAlerts}</span> Code Alert{critAlerts > 1 ? 's' : ''}</span>
              </div>
            )}
            {sentinelEvents !== null && sentinelEvents > 0 && (
              <div className="flex items-center gap-2 bg-red-100 rounded-lg px-3 py-2">
                <span className="w-2 h-2 rounded-full bg-red-600" />
                <span className="text-sm text-red-800"><span className="font-semibold">{sentinelEvents}</span> Sentinel Event{sentinelEvents > 1 ? 's' : ''}</span>
              </div>
            )}
            {medErrors !== null && medErrors > 0 && (
              <div className="flex items-center gap-2 bg-red-100 rounded-lg px-3 py-2">
                <span className="w-2 h-2 rounded-full bg-red-600" />
                <span className="text-sm text-red-800"><span className="font-semibold">{medErrors}</span> Medication Error{medErrors > 1 ? 's' : ''}</span>
              </div>
            )}
            {adverseEvents !== null && adverseEvents > 0 && (
              <div className="flex items-center gap-2 bg-red-100 rounded-lg px-3 py-2">
                <span className="w-2 h-2 rounded-full bg-red-600" />
                <span className="text-sm text-red-800"><span className="font-semibold">{adverseEvents}</span> Adverse Event{adverseEvents > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Row: Submission Status + Operational Flags */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Department Submissions */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider mb-3">Submissions</h3>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl font-bold text-blue-700">{reportedCount}</span>
            <span className="text-sm text-slate-500">of {totalDepts}</span>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${(reportedCount / totalDepts) * 100}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {DEPARTMENTS.map(dept => {
              const hasSubmitted = submittedDepts.includes(dept.slug);
              return (
                <span
                  key={dept.slug}
                  className={`w-3 h-3 rounded-sm ${hasSubmitted ? 'bg-emerald-500' : 'bg-slate-200'}`}
                  title={`${dept.name}: ${hasSubmitted ? 'Submitted' : 'Not submitted'}`}
                />
              );
            })}
          </div>
        </div>

        {/* Operational Flags */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider mb-3">Operational Flags</h3>
          {hasFlags ? (
            <div className="space-y-2">
              {stockouts && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-xs font-bold flex-shrink-0">!</span>
                  <span className="text-slate-700">Stock shortages reported</span>
                </div>
              )}
              {eqBreakdowns && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-xs font-bold flex-shrink-0">!</span>
                  <span className="text-slate-700">Equipment breakdowns</span>
                </div>
              )}
              {pendingComplaints !== null && pendingComplaints > 5 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-xs font-bold flex-shrink-0">!</span>
                  <span className="text-slate-700">{pendingComplaints} pending complaints</span>
                </div>
              )}
              {overdueRCAs !== null && overdueRCAs > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xs font-bold flex-shrink-0">!</span>
                  <span className="text-slate-700">{overdueRCAs} overdue RCA{overdueRCAs > 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-slate-500">No major issues flagged</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
