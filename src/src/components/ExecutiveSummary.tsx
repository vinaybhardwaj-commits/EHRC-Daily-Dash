'use client';

import { DaySnapshot, DEPARTMENTS } from '@/lib/types';

interface Props {
  snapshot: DaySnapshot;
}

function extractNumeric(val: string | number | undefined): number | null {
  if (val === undefined || val === '') return null;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[,\s₹Rs.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export default function ExecutiveSummary({ snapshot }: Props) {
  const getDeptField = (slug: string, field: string): string | number | undefined => {
    const dept = snapshot.departments.find(d => d.slug === slug);
    if (!dept || !dept.entries.length) return undefined;
    return dept.entries[dept.entries.length - 1].fields[field];
  };

  // Critical KPIs
  const revenue = extractNumeric(getDeptField('finance', 'Revenue for the day (Rs.)'));
  const revenueMTD = extractNumeric(getDeptField('finance', 'Total revenue MTD (Rs.)'));
  const census = extractNumeric(getDeptField('finance', 'Midnight census — total IP patients'));
  const surgeries = extractNumeric(getDeptField('finance', 'Surgeries MTD'));
  const arpob = extractNumeric(getDeptField('finance', 'ARPOB — Avg Revenue Per Occupied Bed (Rs.)'));
  const edCases = extractNumeric(getDeptField('emergency', '# of genuine walk-in / ambulance emergencies (last 24h)'));
  const otCases = extractNumeric(getDeptField('ot', '# of OT cases done (yesterday)'));
  const pharmacyMTD = extractNumeric(getDeptField('pharmacy', 'Pharmacy revenue MTD (Rs.)'));

  // Alerts
  const deaths = extractNumeric(getDeptField('emergency', '# of Deaths'));
  const critAlerts = extractNumeric(getDeptField('emergency', '# of Critical alerts (Code Blue / Red / Yellow)'));
  const sentinelEvents = extractNumeric(getDeptField('patient-safety', '# of Sentinel events reported today'));
  const medErrors = extractNumeric(getDeptField('patient-safety', '# of Medication errors today'));
  const adverseEvents = extractNumeric(getDeptField('patient-safety', '# of Adverse events reported today'));

  // Operational flags
  const stockouts = getDeptField('supply-chain', 'Shortages / backorders');
  const eqBreakdowns = getDeptField('biomedical', 'Breakdown updates');
  const pendingComplaints = extractNumeric(getDeptField('customer-care', '# of total complaints currently pending resolution'));
  const overduRCAs = extractNumeric(getDeptField('patient-safety', '# of open RCAs past their due date'));

  const submittedDepts = snapshot.departments.map(d => d.slug);
  const totalDepts = DEPARTMENTS.length;
  const reportedCount = submittedDepts.length;

  return (
    <div className="space-y-4">
      {/* Top Row: Critical Financial & Clinical KPIs */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Executive Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {revenue !== null && (
            <div className="text-center">
              <p className="text-xs font-medium text-gray-500 uppercase">Revenue Today</p>
              <p className="text-lg font-bold text-green-700 mt-1">₹{(revenue / 1000).toFixed(1)}K</p>
            </div>
          )}
          {revenueMTD !== null && (
            <div className="text-center">
              <p className="text-xs font-medium text-gray-500 uppercase">Revenue MTD</p>
              <p className="text-lg font-bold text-green-700 mt-1">₹{(revenueMTD / 1000000).toFixed(1)}M</p>
            </div>
          )}
          {census !== null && (
            <div className="text-center">
              <p className="text-xs font-medium text-gray-500 uppercase">IP Census</p>
              <p className="text-lg font-bold text-blue-700 mt-1">{census}</p>
            </div>
          )}
          {surgeries !== null && (
            <div className="text-center">
              <p className="text-xs font-medium text-gray-500 uppercase">Surgeries MTD</p>
              <p className="text-lg font-bold text-blue-700 mt-1">{surgeries}</p>
            </div>
          )}
          {arpob !== null && (
            <div className="text-center">
              <p className="text-xs font-medium text-gray-500 uppercase">ARPOB</p>
              <p className="text-lg font-bold text-green-700 mt-1">₹{(arpob / 1000).toFixed(0)}K</p>
            </div>
          )}
          {edCases !== null && (
            <div className="text-center">
              <p className="text-xs font-medium text-gray-500 uppercase">ED Cases</p>
              <p className="text-lg font-bold text-purple-700 mt-1">{edCases}</p>
            </div>
          )}
          {otCases !== null && (
            <div className="text-center">
              <p className="text-xs font-medium text-gray-500 uppercase">OT Cases</p>
              <p className="text-lg font-bold text-purple-700 mt-1">{otCases}</p>
            </div>
          )}
          {pharmacyMTD !== null && (
            <div className="text-center">
              <p className="text-xs font-medium text-gray-500 uppercase">Pharmacy MTD</p>
              <p className="text-lg font-bold text-green-700 mt-1">₹{(pharmacyMTD / 1000).toFixed(0)}K</p>
            </div>
          )}
        </div>
      </div>

      {/* Alerts Section (Red) */}
      {((deaths !== null && deaths > 0) ||
        (critAlerts !== null && critAlerts > 0) ||
        (sentinelEvents !== null && sentinelEvents > 0) ||
        (medErrors !== null && medErrors > 0) ||
        (adverseEvents !== null && adverseEvents > 0)) && (
        <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-5">
          <h3 className="font-bold text-red-900 mb-3 text-sm uppercase tracking-wide">Critical Alerts</h3>
          <div className="space-y-2">
            {deaths !== null && deaths > 0 && (
              <p className="text-sm text-red-800">
                <span className="font-semibold">Deaths:</span> {deaths} reported
              </p>
            )}
            {critAlerts !== null && critAlerts > 0 && (
              <p className="text-sm text-red-800">
                <span className="font-semibold">Critical Alerts:</span> {critAlerts} (Code Blue/Red/Yellow)
              </p>
            )}
            {sentinelEvents !== null && sentinelEvents > 0 && (
              <p className="text-sm text-red-800">
                <span className="font-semibold">Sentinel Events:</span> {sentinelEvents}
              </p>
            )}
            {medErrors !== null && medErrors > 0 && (
              <p className="text-sm text-red-800">
                <span className="font-semibold">Medication Errors:</span> {medErrors}
              </p>
            )}
            {adverseEvents !== null && adverseEvents > 0 && (
              <p className="text-sm text-red-800">
                <span className="font-semibold">Adverse Events:</span> {adverseEvents}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Submission Status + Operational Flags */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Department Submission Status */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 text-sm mb-3">Department Submissions</h3>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg font-bold text-blue-700">{reportedCount}</span>
            <span className="text-sm text-gray-600">of {totalDepts} reported</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DEPARTMENTS.map(dept => {
              const hasSubmitted = submittedDepts.includes(dept.slug);
              return (
                <span
                  key={dept.slug}
                  className={`w-3 h-3 rounded-full ${hasSubmitted ? 'bg-green-500' : 'bg-red-300'}`}
                  title={`${dept.name}: ${hasSubmitted ? 'Submitted' : 'Not submitted'}`}
                />
              );
            })}
          </div>
        </div>

        {/* Operational Flags */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 text-sm mb-3">Operational Flags</h3>
          <div className="space-y-2 text-sm">
            {stockouts && (
              <div className="flex items-start gap-2">
                <span className="text-amber-600 font-bold">!</span>
                <span className="text-gray-700">Stockouts/shortages reported</span>
              </div>
            )}
            {eqBreakdowns && (
              <div className="flex items-start gap-2">
                <span className="text-amber-600 font-bold">!</span>
                <span className="text-gray-700">Equipment breakdowns reported</span>
              </div>
            )}
            {pendingComplaints !== null && pendingComplaints > 5 && (
              <div className="flex items-start gap-2">
                <span className="text-amber-600 font-bold">!</span>
                <span className="text-gray-700">{pendingComplaints} complaints pending</span>
              </div>
            )}
            {overduRCAs !== null && overduRCAs > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-red-600 font-bold">!</span>
                <span className="text-gray-700">{overduRCAs} overdue RCAs</span>
              </div>
            )}
            {!stockouts && !eqBreakdowns && (pendingComplaints === null || pendingComplaints <= 5) && (overduRCAs === null || overduRCAs === 0) && (
              <p className="text-gray-500 italic">No major operational issues</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
