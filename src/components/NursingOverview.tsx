'use client';

import React, { useEffect, useState } from 'react';

/* ── Types ────────────────────────────────────────────────────────── */

interface NursingDayData {
  date: string;
  patientCensus: number | null;
  staffCount: number | null;
  staffToPatientRatio: number | null;
  hasInfectionControl: boolean;
  infectionText: string | null;
  hasEscalation: boolean;
  escalationText: string | null;
  hasBioWaste: boolean;
  bioWasteText: string | null;
  hasComplaint: boolean;
  complaintText: string | null;
  hasHAI: boolean;
  haiText: string | null;
  hasDialysis: boolean;
  dialysisText: string | null;
}

interface NursingMonthSummary {
  month: string;
  label: string;
  daysReported: number;
  avgCensus: number;
  avgStaffing: number;
  avgRatio: number;
  complaintDays: number;
  escalationDays: number;
  infectionDays: number;
  haiDays: number;
  bioWasteDays: number;
  incidentFreeDays: number;
  incidentFreeRate: number;
}

interface NursingSummary {
  totalDaysReported: number;
  dateRange: { from: string; to: string } | null;
  avgCensus: number;
  avgStaffing: number;
  totalComplaintDays: number;
  totalEscalationDays: number;
  totalInfectionDays: number;
  totalHAIDays: number;
  totalBioWasteDays: number;
  incidentFreeDays: number;
  incidentFreeRate: number;
}

interface APIResponse {
  slug: string;
  department: string;
  summary: NursingSummary;
  months: NursingMonthSummary[];
  availableMonths: string[];
  allDays: NursingDayData[];
}

interface Props {
  embedded?: boolean;
  onBack?: () => void;
  onNavigateToDashboard?: (date: string, slug: string) => void;
}

/* ── Component ─────────────────────────────────────────────────────── */

const NursingOverview: React.FC<Props> = ({ embedded = false, onBack, onNavigateToDashboard }) => {
  const [data, setData] = useState<APIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/department-overview?slug=nursing');
        if (!response.ok) throw new Error('Failed to fetch nursing data');
        const json = await response.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-400">Loading nursing overview...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-500">{error || 'No data available'}</div>
      </div>
    );
  }

  const { summary, months, allDays } = data;

  // ── Chart: Census & Staffing Trend ──────────────────────────────────

  const chartW = 900, chartH = 260, padL = 50, padR = 20, padT = 30, padB = 50;
  const drawW = chartW - padL - padR;
  const drawH = chartH - padT - padB;

  const censusDays = months.filter(m => m.avgCensus > 0);
  const staffDays = months.filter(m => m.avgStaffing > 0);

  const maxCensus = Math.max(...censusDays.map(m => m.avgCensus), 1);
  const maxStaff = Math.max(...staffDays.map(m => m.avgStaffing), 1);
  const dualMax = Math.max(maxCensus, maxStaff);

  const censusPoints = months.map((m, i) => ({
    x: padL + (i / Math.max(months.length - 1, 1)) * drawW,
    y: padT + drawH - (m.avgCensus / dualMax) * drawH,
  }));

  const staffPoints = months.map((m, i) => ({
    x: padL + (i / Math.max(months.length - 1, 1)) * drawW,
    y: padT + drawH - (m.avgStaffing / dualMax) * drawH,
  }));

  // ── Chart: Incidents by Type (Stacked Bar) ──────────────────────────

  const incidentW = 900, incidentH = 260, incPadL = 50, incPadR = 20, incPadT = 30, incPadB = 50;
  const incDrawW = incidentW - incPadL - incPadR;
  const incDrawH = incidentH - incPadT - incPadB;
  const maxIncidents = Math.max(
    ...months.map(m => m.complaintDays + m.escalationDays + m.infectionDays + m.haiDays),
    1
  );

  // Get calendar data (last 90 days)
  const calendarDays = allDays.slice(-90);

  // Get incidents log
  const incidentLog = allDays
    .filter(d => d.hasComplaint || d.hasEscalation)
    .slice(-20)
    .reverse();

  // Calculate incident-free streak
  let streakDays = 0;
  for (let i = allDays.length - 1; i >= 0; i--) {
    const d = allDays[i];
    if (d.hasComplaint || d.hasEscalation || d.hasInfectionControl || d.hasHAI || d.hasBioWaste) {
      break;
    }
    streakDays++;
  }

  return (
    <div className={`space-y-6 ${embedded ? 'max-w-full' : ''}`}>
      {/* Back button */}
      {!embedded && onBack && (
        <button
          onClick={onBack}
          className="text-sm text-pink-600 hover:text-pink-700 font-medium flex items-center gap-1 mb-4"
        >
          ← Back to Dashboard
        </button>
      )}

      {/* Hero Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Patient Census */}
        <div className="bg-white rounded-lg border border-pink-100 p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-semibold tracking-wide mb-1 uppercase">
            Patient Census
          </div>
          <div className="text-3xl font-bold text-pink-600 mb-1">
            {Math.round(summary.avgCensus)}
          </div>
          <div className="text-xs text-slate-400">avg per day</div>
        </div>

        {/* Staff on Duty */}
        <div className="bg-white rounded-lg border border-pink-100 p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-semibold tracking-wide mb-1 uppercase">
            Staff on Duty
          </div>
          <div className="text-3xl font-bold text-pink-600 mb-1">
            {Math.round(summary.avgStaffing)}
          </div>
          <div className="text-xs text-slate-400">avg per day</div>
        </div>

        {/* Staff:Patient Ratio */}
        <div className="bg-white rounded-lg border border-pink-100 p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-semibold tracking-wide mb-1 uppercase">
            Staff:Patient Ratio
          </div>
          <div className="text-3xl font-bold text-pink-600 mb-1">
            {(summary.avgCensus > 0 && summary.avgStaffing > 0)
              ? (summary.avgCensus / summary.avgStaffing).toFixed(1)
              : '—'}
          </div>
          <div className="text-xs text-slate-400">patients per staff</div>
        </div>

        {/* Incident-Free Rate */}
        <div className="bg-white rounded-lg border border-pink-100 p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-semibold tracking-wide mb-1 uppercase">
            Incident-Free Rate
          </div>
          <div className="text-3xl font-bold text-pink-600 mb-1">
            {Math.round(summary.incidentFreeRate)}%
          </div>
          <div className="text-xs text-slate-400">complaint & incident free</div>
        </div>
      </div>

      {/* Census & Staffing Trend Chart */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm overflow-x-auto">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Census & Staffing Trend</h3>
        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full min-w-max">
          {/* Grid lines */}
          {[...Array(5)].map((_, i) => {
            const y = padT + (i / 4) * drawH;
            return (
              <line
                key={`grid-${i}`}
                x1={padL}
                y1={y}
                x2={chartW - padR}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray="3,3"
              />
            );
          })}

          {/* X axis labels */}
          {months.map((m, i) => (
            <text
              key={`month-${i}`}
              x={padL + (i / Math.max(months.length - 1, 1)) * drawW}
              y={chartH - 8}
              textAnchor="middle"
              className="text-[9px] fill-slate-400"
            >
              {m.label.split(' ')[0].substring(0, 3)}
            </text>
          ))}

          {/* Y axis label (left) */}
          <text x="10" y="20" className="text-[9px] fill-slate-400">
            {Math.round(dualMax)}
          </text>
          <text x="10" y={padT + drawH} className="text-[9px] fill-slate-400">
            0
          </text>

          {/* Axes */}
          <line x1={padL} y1={padT} x2={padL} y2={chartH - padB} stroke="#cbd5e1" strokeWidth="1" />
          <line x1={padL} y1={chartH - padB} x2={chartW - padR} y2={chartH - padB} stroke="#cbd5e1" strokeWidth="1" />

          {/* Census line */}
          <polyline
            points={censusPoints.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
          />

          {/* Census dots */}
          {censusPoints.map((p, i) => (
            <circle key={`census-dot-${i}`} cx={p.x} cy={p.y} r="3" fill="#3b82f6" />
          ))}

          {/* Staff line */}
          <polyline
            points={staffPoints.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#ec4899"
            strokeWidth="2"
          />

          {/* Staff dots */}
          {staffPoints.map((p, i) => (
            <circle key={`staff-dot-${i}`} cx={p.x} cy={p.y} r="3" fill="#ec4899" />
          ))}
        </svg>

        {/* Legend */}
        <div className="flex gap-4 mt-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-blue-500" />
            <span className="text-slate-600">Avg Census</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-pink-500" />
            <span className="text-slate-600">Avg Staffing</span>
          </div>
        </div>
      </div>

      {/* Incidents by Type Chart */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm overflow-x-auto">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Incidents by Type</h3>
        <svg viewBox={`0 0 ${incidentW} ${incidentH}`} className="w-full min-w-max">
          {/* Grid lines */}
          {[...Array(5)].map((_, i) => {
            const y = incPadT + (i / 4) * incDrawH;
            return (
              <line
                key={`inc-grid-${i}`}
                x1={incPadL}
                y1={y}
                x2={incidentW - incPadR}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray="3,3"
              />
            );
          })}

          {/* X axis labels */}
          {months.map((m, i) => (
            <text
              key={`inc-month-${i}`}
              x={incPadL + (i / Math.max(months.length - 1, 1)) * incDrawW}
              y={incidentH - 8}
              textAnchor="middle"
              className="text-[9px] fill-slate-400"
            >
              {m.label.split(' ')[0].substring(0, 3)}
            </text>
          ))}

          {/* Y axis label */}
          <text x="10" y="20" className="text-[9px] fill-slate-400">
            {Math.round(maxIncidents)}
          </text>

          {/* Axes */}
          <line x1={incPadL} y1={incPadT} x2={incPadL} y2={incidentH - incPadB} stroke="#cbd5e1" strokeWidth="1" />
          <line
            x1={incPadL}
            y1={incidentH - incPadB}
            x2={incidentW - incPadR}
            y2={incidentH - incPadB}
            stroke="#cbd5e1"
            strokeWidth="1"
          />

          {/* Stacked bars */}
          {months.map((m, i) => {
            const x = incPadL + (i / Math.max(months.length - 1, 1)) * incDrawW;
            const barW = Math.max(incDrawW / months.length - 2, 4);
            const barBottomY = incidentH - incPadB;

            const total = m.complaintDays + m.escalationDays + m.infectionDays + m.haiDays;
            if (total === 0) return null;

            const h = (total / maxIncidents) * incDrawH;

            let yOffset = 0;

            // Complaints (red)
            const complaintH = (m.complaintDays / maxIncidents) * incDrawH;
            if (complaintH > 0) {
              return (
                <g key={`bar-${i}`}>
                  <rect
                    x={x - barW / 2}
                    y={barBottomY - yOffset - complaintH}
                    width={barW}
                    height={complaintH}
                    fill="#f97316"
                  />
                  {((yOffset += complaintH), false)}
                  {/* Escalations (amber) */}
                  {m.escalationDays > 0 && (
                    <>
                      <rect
                        x={x - barW / 2}
                        y={barBottomY - yOffset - (m.escalationDays / maxIncidents) * incDrawH}
                        width={barW}
                        height={(m.escalationDays / maxIncidents) * incDrawH}
                        fill="#f59e0b"
                      />
                      {((yOffset += (m.escalationDays / maxIncidents) * incDrawH), null)}
                    </>
                  )}
                  {/* Infections (blue) */}
                  {m.infectionDays > 0 && (
                    <>
                      <rect
                        x={x - barW / 2}
                        y={barBottomY - yOffset - (m.infectionDays / maxIncidents) * incDrawH}
                        width={barW}
                        height={(m.infectionDays / maxIncidents) * incDrawH}
                        fill="#06b6d4"
                      />
                      {((yOffset += (m.infectionDays / maxIncidents) * incDrawH), null)}
                    </>
                  )}
                  {/* HAI (purple) */}
                  {m.haiDays > 0 && (
                    <rect
                      x={x - barW / 2}
                      y={barBottomY - yOffset - (m.haiDays / maxIncidents) * incDrawH}
                      width={barW}
                      height={(m.haiDays / maxIncidents) * incDrawH}
                      fill="#a855f7"
                    />
                  )}
                </g>
              );
            }
            return null;
          })}
        </svg>

        {/* Legend */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-orange-500" />
            <span className="text-slate-600">Complaints</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-amber-500" />
            <span className="text-slate-600">Escalations</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-cyan-500" />
            <span className="text-slate-600">Infections</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-purple-500" />
            <span className="text-slate-600">HAI Events</span>
          </div>
        </div>
      </div>

      {/* Monthly Progression Table */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm overflow-x-auto">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Monthly Progression</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-2 text-slate-600 font-semibold">Month</th>
              <th className="text-center py-2 px-2 text-slate-600 font-semibold">Census</th>
              <th className="text-center py-2 px-2 text-slate-600 font-semibold">Staff</th>
              <th className="text-center py-2 px-2 text-slate-600 font-semibold">Ratio</th>
              <th className="text-center py-2 px-2 text-slate-600 font-semibold">Complaints</th>
              <th className="text-center py-2 px-2 text-slate-600 font-semibold">Escalations</th>
              <th className="text-center py-2 px-2 text-slate-600 font-semibold">Infections</th>
              <th className="text-center py-2 px-2 text-slate-600 font-semibold">HAI</th>
              <th className="text-center py-2 px-2 text-slate-600 font-semibold">Bio Waste</th>
              <th className="text-right py-2 px-2 text-slate-600 font-semibold">Incident-Free %</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                <td className="py-2 px-2 text-slate-900 font-medium">{m.label}</td>
                <td className="text-center py-2 px-2 text-slate-700">{Math.round(m.avgCensus)}</td>
                <td className="text-center py-2 px-2 text-slate-700">{Math.round(m.avgStaffing)}</td>
                <td className="text-center py-2 px-2 text-slate-700">{m.avgRatio.toFixed(2)}</td>
                <td className="text-center py-2 px-2">
                  <span className={m.complaintDays > 0 ? 'text-red-600 font-semibold' : 'text-slate-400'}>
                    {m.complaintDays}
                  </span>
                </td>
                <td className="text-center py-2 px-2">
                  <span className={m.escalationDays > 0 ? 'text-amber-600 font-semibold' : 'text-slate-400'}>
                    {m.escalationDays}
                  </span>
                </td>
                <td className="text-center py-2 px-2">
                  <span className={m.infectionDays > 0 ? 'text-blue-600 font-semibold' : 'text-slate-400'}>
                    {m.infectionDays}
                  </span>
                </td>
                <td className="text-center py-2 px-2">
                  <span className={m.haiDays > 0 ? 'text-purple-600 font-semibold' : 'text-slate-400'}>
                    {m.haiDays}
                  </span>
                </td>
                <td className="text-center py-2 px-2">
                  <span className={m.bioWasteDays > 0 ? 'text-orange-600 font-semibold' : 'text-slate-400'}>
                    {m.bioWasteDays}
                  </span>
                </td>
                <td className="text-right py-2 px-2 font-semibold text-slate-900">
                  {Math.round(m.incidentFreeRate)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Quality Calendar */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Quality Calendar (Last 90 Days)</h3>
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, idx) => {
            let bgColor = 'bg-emerald-100';
            let borderColor = 'border-emerald-300';

            if (day.hasComplaint) bgColor = 'bg-red-100';
            else if (day.hasEscalation) bgColor = 'bg-amber-100';
            else if (day.hasInfectionControl) bgColor = 'bg-blue-100';
            else if (day.hasHAI) bgColor = 'bg-purple-100';

            return (
              <div
                key={idx}
                className={`aspect-square rounded border ${bgColor} ${borderColor} border-2 flex items-center justify-center text-[10px] font-bold text-slate-600`}
                title={day.date}
              >
                {day.date.split('-')[2]}
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border-2 border-emerald-300 bg-emerald-100" />
            <span className="text-slate-600">Clean</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border-2 border-red-300 bg-red-100" />
            <span className="text-slate-600">Complaint</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border-2 border-amber-300 bg-amber-100" />
            <span className="text-slate-600">Escalation</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border-2 border-blue-300 bg-blue-100" />
            <span className="text-slate-600">Infection</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border-2 border-purple-300 bg-purple-100" />
            <span className="text-slate-600">HAI</span>
          </div>
        </div>
      </div>

      {/* Incident Log */}
      {incidentLog.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Recent Incidents</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {incidentLog.map((day, idx) => (
              <div key={idx} className="border-l-4 border-pink-300 bg-pink-50 p-2.5 rounded text-xs">
                <div className="font-semibold text-slate-900">{day.date}</div>
                {day.hasComplaint && day.complaintText && (
                  <div className="text-red-700 mt-1">
                    <span className="font-semibold">Complaint:</span> {day.complaintText}
                  </div>
                )}
                {day.hasEscalation && day.escalationText && (
                  <div className="text-amber-700 mt-1">
                    <span className="font-semibold">Escalation:</span> {day.escalationText}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Row: Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Incident-Free Streak */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">
            Incident-Free Streak
          </div>
          <div className="text-4xl font-bold text-pink-600 mb-1">{streakDays}</div>
          <div className="text-xs text-slate-400">consecutive days</div>
        </div>

        {/* Infection Control Summary */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">
            Infection Control
          </div>
          <div className="text-2xl font-bold text-blue-600 mb-1">{summary.totalInfectionDays}</div>
          <div className="text-xs text-slate-400">days with issues</div>
        </div>

        {/* All-Time Summary */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">
            All-Time Summary
          </div>
          <div className="text-sm text-slate-700 space-y-1">
            <div>{summary.totalDaysReported} days reported</div>
            <div className="text-pink-600 font-semibold">{summary.incidentFreeDays} incident-free days</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NursingOverview;
