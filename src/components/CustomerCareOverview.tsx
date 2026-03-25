'use client';

import React, { useEffect, useState } from 'react';

/* ── Types ────────────────────────────────────────────────────────── */

interface MonthSummary {
  month: string;
  daysReported: number;
  opdTotalSum: number;
  opdInPersonSum: number;
  opdTeleSum: number;
  opdAvgPerDay: number;
  telePercentage: number;
  googleReviewsSum: number;
  customerFeedbackSum: number;
  videoTestimonialsSum: number;
  healthChecksSum: number;
  complaintDays: number;
  escalationDays: number;
  vipDays: number;
  doctorLateDays: number;
  patientWaitDays: number;
  patientWaitIncidentsSum: number;
  avgDischargeTAT: number | null;
  callCentreIssueDays: number;
  feedbackCollectionRate: number;
  doctorLateFrequency: Record<string, number>;
  doctorLeaveFrequency: Record<string, number>;
}

interface DayData {
  date: string;
  opdTotal: number | null;
  opdInPerson: number | null;
  opdTele: number | null;
  googleReviews: number | null;
  customerFeedback: number | null;
  videoTestimonials: number | null;
  healthChecks: number | null;
  hasComplaint: boolean;
  complaintText: string | null;
  hasEscalation: boolean;
  escalationText: string | null;
  hasVIP: boolean;
  doctorsOnLeave: string[];
  doctorsLate: string[];
  patientWaitIncidents: number;
  patientWaitText: string | null;
  dischargeTATHours: number | null;
  dischargeTATText: string | null;
  callCentreIssue: boolean;
  newDoctorScheduling: string | null;
}

interface APIResponse {
  slug: string;
  department: string;
  summary: {
    totalDaysReported: number;
    dateRange: { from: string; to: string } | null;
    totalOPDAppointments: number;
    avgOPDPerDay: number;
    overallTelePercentage: number;
    totalGoogleReviews: number;
    totalFeedback: number;
    totalVideoTestimonials: number;
    complaintDays: number;
    escalationDays: number;
    doctorLateDays: number;
    patientWaitDays: number;
    totalPatientWaitIncidents: number;
    doctorLateFrequency: Record<string, number>;
    doctorLeaveFrequency: Record<string, number>;
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

export default function CustomerCareOverview({ embedded, onBack, onNavigateToDashboard }: Props) {
  const [data, setData] = useState<APIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/department-overview?slug=customer-care')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
  if (error || !data) return (
    <div className="text-center py-12 text-red-500">Failed to load Customer Care data</div>
  );

  const { summary, months, allDays } = data;
  const currentMonth = months[months.length - 1];
  const prevMonth = months.length > 1 ? months[months.length - 2] : null;

  // ── Hero Cards ──────────────────────────────────────────────────
  const heroCards = [
    {
      label: 'OPD AVG/DAY',
      value: currentMonth ? currentMonth.opdAvgPerDay.toFixed(0) : '—',
      sub: currentMonth ? `${currentMonth.opdTotalSum} total this month` : '',
      delta: currentMonth && prevMonth
        ? currentMonth.opdAvgPerDay - prevMonth.opdAvgPerDay
        : null,
      deltaLabel: 'vs last month',
      color: 'text-blue-600',
    },
    {
      label: 'TELE %',
      value: currentMonth ? `${currentMonth.telePercentage.toFixed(0)}%` : '—',
      sub: `${currentMonth ? currentMonth.opdTeleSum : 0} tele / ${currentMonth ? currentMonth.opdInPersonSum : 0} in-person`,
      delta: currentMonth && prevMonth
        ? currentMonth.telePercentage - prevMonth.telePercentage
        : null,
      deltaLabel: 'pp',
      color: 'text-violet-600',
    },
    {
      label: 'GOOGLE REVIEWS',
      value: currentMonth ? String(currentMonth.googleReviewsSum) : '—',
      sub: `${summary.totalGoogleReviews} all-time`,
      delta: currentMonth && prevMonth
        ? currentMonth.googleReviewsSum - prevMonth.googleReviewsSum
        : null,
      deltaLabel: 'vs last month',
      color: 'text-amber-600',
    },
    {
      label: 'FEEDBACK RATE',
      value: currentMonth ? `${currentMonth.feedbackCollectionRate.toFixed(0)}%` : '—',
      sub: `${currentMonth ? currentMonth.customerFeedbackSum : 0} collected this month`,
      delta: currentMonth && prevMonth
        ? currentMonth.feedbackCollectionRate - prevMonth.feedbackCollectionRate
        : null,
      deltaLabel: 'pp',
      color: 'text-emerald-600',
    },
  ];

  // ── OPD Volume Chart ────────────────────────────────────────────
  const chartW = 900, chartH = 260, padL = 50, padR = 20, padT = 30, padB = 50;
  const drawW = chartW - padL - padR;
  const drawH = chartH - padT - padB;
  const opdMonths = months.filter(m => m.opdTotalSum > 0);

  const maxOPD = Math.max(...opdMonths.map(m => m.opdAvgPerDay), 1);
  const yMax = Math.ceil(maxOPD / 10) * 10 + 10;

  const opdInPersonPts = opdMonths.map((m, i) => ({
    x: padL + (i / Math.max(opdMonths.length - 1, 1)) * drawW,
    y: padT + drawH - (m.opdAvgPerDay > 0 ? ((m.opdInPersonSum / m.daysReported) / yMax) * drawH : 0),
  }));
  const opdTelePts = opdMonths.map((m, i) => ({
    x: padL + (i / Math.max(opdMonths.length - 1, 1)) * drawW,
    y: padT + drawH - (m.opdAvgPerDay > 0 ? ((m.opdTeleSum / m.daysReported) / yMax) * drawH : 0),
  }));
  const opdTotalPts = opdMonths.map((m, i) => ({
    x: padL + (i / Math.max(opdMonths.length - 1, 1)) * drawW,
    y: padT + drawH - (m.opdAvgPerDay / yMax) * drawH,
  }));

  // ── Channel Mix (stacked bar) ──────────────────────────────────
  const barW = Math.min(40, drawW / opdMonths.length - 8);

  // ── Feedback Trend Chart ────────────────────────────────────────
  const fbMaxVal = Math.max(
    ...months.map(m => Math.max(m.googleReviewsSum, m.customerFeedbackSum, m.videoTestimonialsSum)),
    1
  );
  const fbYMax = Math.ceil(fbMaxVal / 10) * 10 + 5;

  const reviewPts = months.map((m, i) => ({
    x: padL + (i / Math.max(months.length - 1, 1)) * drawW,
    y: padT + drawH - (m.googleReviewsSum / fbYMax) * drawH,
  }));
  const feedbackPts = months.map((m, i) => ({
    x: padL + (i / Math.max(months.length - 1, 1)) * drawW,
    y: padT + drawH - (m.customerFeedbackSum / fbYMax) * drawH,
  }));
  const videoPts = months.map((m, i) => ({
    x: padL + (i / Math.max(months.length - 1, 1)) * drawW,
    y: padT + drawH - (m.videoTestimonialsSum / fbYMax) * drawH,
  }));

  // ── Doctor Punctuality ──────────────────────────────────────────
  const sortedDoctorLate = Object.entries(summary.doctorLateFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const maxLate = sortedDoctorLate.length > 0 ? sortedDoctorLate[0][1] : 1;

  // ── Service Discipline Calendar ─────────────────────────────────
  const recentMonths = months.slice(-3);

  // ── Wait Time Incidents ─────────────────────────────────────────
  const waitIncidents = allDays.filter(d => d.patientWaitText);

  // ── Complaint-Free Streak ───────────────────────────────────────
  let currentStreak = 0;
  let bestStreak = 0;
  let tempStreak = 0;
  for (const d of allDays) {
    if (!d.hasComplaint && !d.hasEscalation) {
      tempStreak++;
      if (tempStreak > bestStreak) bestStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  }
  // Current streak from end
  for (let i = allDays.length - 1; i >= 0; i--) {
    if (!allDays[i].hasComplaint && !allDays[i].hasEscalation) currentStreak++;
    else break;
  }

  return (
    <div className={embedded ? '' : 'max-w-5xl mx-auto px-4 py-8'}>
      {/* Header */}
      {embedded && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-slate-400">
            {summary.dateRange ? `${summary.dateRange.from} to ${summary.dateRange.to}` : ''} · {summary.totalDaysReported} days of customer care data analyzed
          </p>
        </div>
      )}

      {/* Hero Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {heroCards.map((card) => (
          <div key={card.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3.5">
            <p className="text-[10px] font-semibold tracking-wider text-slate-400 mb-1">{card.label}</p>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${card.color}`}>{card.value}</span>
              {card.delta !== null && (
                <span className={`text-xs font-medium ${card.delta >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                  {card.delta >= 0 ? '↑' : '↓'} {Math.abs(card.delta).toFixed(card.deltaLabel === 'pp' ? 0 : 1)}{card.deltaLabel === 'pp' ? 'pp' : ''}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* OPD Channel Mix — Stacked Bar Chart */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">OPD Volume & Channel Mix — Monthly</h3>
        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full">
          {/* Y-axis gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = padT + drawH - frac * drawH;
            return (
              <g key={frac}>
                <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke="#e2e8f0" strokeDasharray="3,3" />
                <text x={padL - 6} y={y + 4} textAnchor="end" className="text-[10px] fill-slate-400">
                  {Math.round(frac * yMax)}
                </text>
              </g>
            );
          })}

          {/* Stacked bars */}
          {opdMonths.map((m, i) => {
            const cx = padL + (i / Math.max(opdMonths.length - 1, 1)) * drawW;
            const inPersonH = m.daysReported > 0 ? ((m.opdInPersonSum / m.daysReported) / yMax) * drawH : 0;
            const teleH = m.daysReported > 0 ? ((m.opdTeleSum / m.daysReported) / yMax) * drawH : 0;
            const baseY = padT + drawH;
            return (
              <g key={m.month}>
                {/* In-person (bottom) */}
                <rect
                  x={cx - barW / 2} y={baseY - inPersonH}
                  width={barW} height={inPersonH}
                  fill="#3b82f6" rx={2} opacity={0.8}
                />
                {/* Tele (top) */}
                <rect
                  x={cx - barW / 2} y={baseY - inPersonH - teleH}
                  width={barW} height={teleH}
                  fill="#8b5cf6" rx={2} opacity={0.7}
                />
                {/* Total label */}
                <text x={cx} y={baseY - inPersonH - teleH - 6} textAnchor="middle" className="text-[9px] fill-slate-600 font-medium">
                  {m.opdAvgPerDay.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* X-axis labels */}
          {opdMonths.map((m, i) => {
            const cx = padL + (i / Math.max(opdMonths.length - 1, 1)) * drawW;
            return (
              <text key={m.month} x={cx} y={chartH - 8} textAnchor="middle" className="text-[9px] fill-slate-400">
                {fmtMonth(m.month)}
              </text>
            );
          })}
        </svg>
        <div className="flex items-center gap-4 mt-2 justify-center">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded bg-blue-500 opacity-80" /> In-Person (avg/day)
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded bg-violet-500 opacity-70" /> Teleconsultation (avg/day)
          </span>
        </div>
      </div>

      {/* Feedback & Reviews Trend */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Patient Feedback Collection — Monthly</h3>
        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full">
          <defs>
            <linearGradient id="cc-review-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="cc-fb-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Y-axis gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = padT + drawH - frac * drawH;
            return (
              <g key={frac}>
                <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke="#e2e8f0" strokeDasharray="3,3" />
                <text x={padL - 6} y={y + 4} textAnchor="end" className="text-[10px] fill-slate-400">
                  {Math.round(frac * fbYMax)}
                </text>
              </g>
            );
          })}

          {/* Area fills */}
          {reviewPts.length >= 2 && (
            <path d={smoothAreaPath(reviewPts, padT + drawH)} fill="url(#cc-review-grad)" />
          )}
          {feedbackPts.length >= 2 && (
            <path d={smoothAreaPath(feedbackPts, padT + drawH)} fill="url(#cc-fb-grad)" />
          )}

          {/* Lines */}
          {reviewPts.length >= 2 && (
            <path d={smoothPath(reviewPts)} fill="none" stroke="#f59e0b" strokeWidth="2.5" />
          )}
          {feedbackPts.length >= 2 && (
            <path d={smoothPath(feedbackPts)} fill="none" stroke="#10b981" strokeWidth="2.5" />
          )}
          {videoPts.length >= 2 && (
            <path d={smoothPath(videoPts)} fill="none" stroke="#ec4899" strokeWidth="2" strokeDasharray="5,4" />
          )}

          {/* Data dots */}
          {reviewPts.map((p, i) => (
            <circle key={`r${i}`} cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#f59e0b" strokeWidth="2" />
          ))}
          {feedbackPts.map((p, i) => (
            <circle key={`f${i}`} cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#10b981" strokeWidth="2" />
          ))}
          {videoPts.map((p, i) => (
            <circle key={`v${i}`} cx={p.x} cy={p.y} r={3} fill="#fff" stroke="#ec4899" strokeWidth="1.5" />
          ))}

          {/* X-axis labels */}
          {months.map((m, i) => (
            <text key={m.month} x={padL + (i / Math.max(months.length - 1, 1)) * drawW} y={chartH - 8} textAnchor="middle" className="text-[9px] fill-slate-400">
              {fmtMonth(m.month)}
            </text>
          ))}
        </svg>
        <div className="flex items-center gap-4 mt-2 justify-center">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded-full bg-amber-500" /> Google Reviews
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded-full bg-emerald-500" /> Feedback Collected
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-2.5 h-0.5 bg-pink-500" style={{ borderBottom: '2px dashed #ec4899' }} /> Video Testimonials
          </span>
        </div>
      </div>

      {/* Monthly Progression Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 overflow-x-auto">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-base">📊</span>
          <h3 className="text-sm font-semibold text-slate-800">Monthly Progression</h3>
          <span className="text-[9px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Patient Experience</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 pr-4 text-slate-500 font-medium">Metric</th>
              {months.map(m => (
                <th key={m.month} className="text-center py-2 px-2 text-slate-500 font-medium">{fmtMonth(m.month)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'OPD Avg/Day', key: 'opdAvgPerDay', fmt: (v: number) => v.toFixed(0) },
              { label: 'Tele %', key: 'telePercentage', fmt: (v: number) => `${v.toFixed(0)}%` },
              { label: 'Google Reviews', key: 'googleReviewsSum', fmt: (v: number) => String(v) },
              { label: 'Feedback Collected', key: 'customerFeedbackSum', fmt: (v: number) => String(v) },
              { label: 'Video Testimonials', key: 'videoTestimonialsSum', fmt: (v: number) => String(v) },
              { label: 'Doctor Late Days', key: 'doctorLateDays', fmt: (v: number) => String(v) },
              { label: 'Patient Wait Days', key: 'patientWaitDays', fmt: (v: number) => String(v) },
              { label: 'Complaint Days', key: 'complaintDays', fmt: (v: number) => String(v) },
              { label: 'Days Reported', key: 'daysReported', fmt: (v: number) => String(v) },
            ].map(({ label, key, fmt }) => (
              <tr key={key} className="border-b border-slate-50">
                <td className="py-2.5 pr-4 text-slate-700 font-medium whitespace-nowrap">{label}</td>
                {months.map((m, i) => {
                  const val = (m as unknown as Record<string, number>)[key];
                  const prev = i > 0 ? (months[i - 1] as unknown as Record<string, number>)[key] : null;
                  const delta = prev !== null ? val - prev : null;
                  // For "bad" metrics (late, wait, complaint), positive delta is bad
                  const isBadMetric = ['doctorLateDays', 'patientWaitDays', 'complaintDays'].includes(key);
                  return (
                    <td key={m.month} className="text-center py-2.5 px-2">
                      <span className="text-slate-800 font-medium">{fmt(val)}</span>
                      {delta !== null && delta !== 0 && (
                        <div className={`text-[9px] ${
                          isBadMetric
                            ? delta > 0 ? 'text-red-400' : 'text-emerald-500'
                            : delta > 0 ? 'text-emerald-500' : 'text-red-400'
                        }`}>
                          {delta > 0 ? '+' : ''}{key === 'telePercentage' ? `${delta.toFixed(0)}pp` : delta.toFixed(key === 'opdAvgPerDay' ? 1 : 0)}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Doctor Punctuality Chart */}
      {sortedDoctorLate.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Doctor Punctuality — Late {'>'} 10 Minutes</h3>
          <p className="text-[10px] text-slate-400 mb-4">Aggregate across {summary.totalDaysReported} reporting days</p>
          <div className="space-y-2.5">
            {sortedDoctorLate.map(([name, count]) => (
              <div key={name} className="flex items-center gap-3">
                <span className="text-xs text-slate-600 w-32 truncate font-medium">{name}</span>
                <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-400 to-red-400 flex items-center justify-end pr-2"
                    style={{ width: `${Math.max((count / maxLate) * 100, 12)}%` }}
                  >
                    <span className="text-[9px] text-white font-bold">{count}d</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Service Discipline Calendar + Wait Incidents */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Service Calendar */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Service Discipline Calendar</h3>
          {recentMonths.map((m) => {
            const mDays = allDays.filter(d => d.date.startsWith(m.month));
            const daysInMonth = new Date(parseInt(m.month.split('-')[0]), parseInt(m.month.split('-')[1]), 0).getDate();
            return (
              <div key={m.month} className="mb-3">
                <p className="text-[10px] text-slate-500 font-medium mb-1">{fmtMonth(m.month).replace("'", ' 20')}</p>
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const dayNum = String(i + 1).padStart(2, '0');
                    const dateStr = `${m.month}-${dayNum}`;
                    const dayData = mDays.find(d => d.date === dateStr);
                    if (!dayData) return (
                      <div key={i} className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center text-[7px] text-slate-300">·</div>
                    );
                    // Color code: green=clean, yellow=late, orange=wait, red=complaint
                    let bg = 'bg-emerald-200 text-emerald-700';
                    let symbol = '·';
                    if (dayData.hasComplaint || dayData.hasEscalation) {
                      bg = 'bg-red-200 text-red-700'; symbol = '!';
                    } else if (dayData.patientWaitIncidents > 0) {
                      bg = 'bg-orange-200 text-orange-700'; symbol = 'W';
                    } else if (dayData.doctorsLate.length > 0) {
                      bg = 'bg-amber-200 text-amber-700'; symbol = 'L';
                    }
                    return (
                      <div key={i} className={`w-5 h-5 rounded ${bg} flex items-center justify-center text-[7px] font-bold`}>
                        {symbol}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {[
              { color: 'bg-emerald-200', label: 'Clean' },
              { color: 'bg-amber-200', label: 'Late' },
              { color: 'bg-orange-200', label: 'Wait' },
              { color: 'bg-red-200', label: 'Complaint' },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1 text-[9px] text-slate-500">
                <span className={`w-3 h-3 rounded ${color}`} /> {label}
              </span>
            ))}
          </div>
        </div>

        {/* Patient Wait Incidents Log */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Patient Wait Incidents — {waitIncidents.length} Days</h3>
          <p className="text-[10px] text-slate-400 mb-3">{summary.totalPatientWaitIncidents} total patients affected</p>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
            {waitIncidents.slice(-15).reverse().map((d) => (
              <div key={d.date} className="flex gap-2 items-start">
                <span className="text-[9px] text-orange-500 font-mono whitespace-nowrap mt-0.5">
                  {d.date.split('-').slice(1).join(' ').replace(/^0/, '')}
                </span>
                <div className="border-l-2 border-orange-300 pl-2">
                  <p className="text-[10px] text-slate-600 leading-tight">{d.patientWaitText}</p>
                </div>
              </div>
            ))}
            {waitIncidents.length === 0 && (
              <p className="text-[10px] text-slate-400 text-center py-4">No patient wait incidents recorded</p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom row: Streak + Testimonials + All-Time Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Complaint-Free Streak */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-[10px] font-semibold tracking-wider text-slate-400 mb-1">COMPLAINT-FREE STREAK</p>
          <div className="flex items-end gap-1">
            <span className="text-3xl font-bold text-emerald-600">{currentStreak}</span>
            <span className="text-sm text-slate-400 mb-1">days</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Current (best: {bestStreak} days)</p>
          <span className="text-2xl mt-2 block">🎯</span>
        </div>

        {/* Video Testimonials Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-[10px] font-semibold tracking-wider text-slate-400 mb-1">VIDEO TESTIMONIALS</p>
          <div className="flex items-end gap-1">
            <span className="text-3xl font-bold text-pink-600">{summary.totalVideoTestimonials}</span>
            <span className="text-sm text-slate-400 mb-1">collected</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">{summary.totalGoogleReviews} Google reviews all-time</p>
          {/* Mini monthly sparkline */}
          <div className="flex items-end gap-1.5 mt-3 h-10">
            {months.slice(-6).map(m => {
              const maxV = Math.max(...months.slice(-6).map(mm => mm.videoTestimonialsSum), 1);
              const h = m.videoTestimonialsSum > 0 ? Math.max((m.videoTestimonialsSum / maxV) * 36, 3) : 2;
              return (
                <div key={m.month} className="flex flex-col items-center gap-0.5 flex-1">
                  <div className="w-full max-w-[20px] rounded bg-pink-300" style={{ height: `${h}px` }} />
                  <span className="text-[7px] text-slate-400">{fmtMonth(m.month).split(' ')[0]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* All-Time Summary */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-[10px] font-semibold tracking-wider text-slate-400 mb-3">ALL-TIME SUMMARY</p>
          <div className="space-y-1.5">
            {[
              { label: 'Total days analyzed', value: summary.totalDaysReported },
              { label: 'Total OPD appointments', value: summary.totalOPDAppointments.toLocaleString() },
              { label: 'Google reviews collected', value: summary.totalGoogleReviews },
              { label: 'Feedback collected', value: summary.totalFeedback },
              { label: 'Video testimonials', value: summary.totalVideoTestimonials },
              { label: 'Doctor late days', value: summary.doctorLateDays },
              { label: 'Patient wait incidents', value: summary.totalPatientWaitIncidents },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-[10px]">
                <span className="text-slate-500">{label}</span>
                <span className="text-slate-800 font-semibold">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
