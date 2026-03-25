'use client';

import React, { useEffect, useState } from 'react';

/* ── Types ────────────────────────────────────────────────────────── */

interface MonthSummary {
  month: string;
  label: string;
  daysReported: number;
  totalIPRevenue: number;
  totalOPRevenue: number;
  totalRevenue: number;
  avgRevenuePerDay: number;
  latestMTD: number | null;
  avgStockValue: number;
  stockoutDays: number;
  expiryAlertDays: number;
  stockoutFreeRate: number;
}

interface DayData {
  date: string;
  ipRevenueToday: number | null;
  opRevenueToday: number | null;
  totalRevenueToday: number | null;
  revenueMTD: number | null;
  ipStockValue: number | null;
  opStockValue: number | null;
  totalStockValue: number | null;
  hasStockout: boolean;
  stockoutText: string | null;
  hasExpiry: boolean;
  expiryText: string | null;
}

interface APIResponse {
  slug: string;
  department: string;
  summary: {
    totalDaysReported: number;
    dateRange: { from: string; to: string } | null;
    totalRevenue: number;
    avgRevenuePerDay: number;
    latestMTD: number | null;
    totalIPRevenue: number;
    totalOPRevenue: number;
    avgStockValue: number;
    stockoutDays: number;
    expiryAlertDays: number;
    stockoutFreeRate: number;
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

function fmtCurrency(n: number): string {
  if (Math.abs(n) >= 10000000) return '₹' + (n / 10000000).toFixed(1) + ' Cr';
  if (Math.abs(n) >= 100000) return '₹' + (n / 100000).toFixed(1) + ' L';
  if (Math.abs(n) >= 1000) return '₹' + (n / 1000).toFixed(0) + 'K';
  return '₹' + n.toFixed(0);
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

export default function PharmacyOverview({ embedded, onBack, onNavigateToDashboard }: Props) {
  const [data, setData] = useState<APIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/department-overview?slug=pharmacy')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-3 border-green-200 border-t-green-600 rounded-full animate-spin" />
    </div>
  );
  if (error || !data) return (
    <div className="text-center py-12 text-red-500">Failed to load Pharmacy data</div>
  );

  const { summary, months, allDays } = data;
  const currentMonth = months[months.length - 1];
  const prevMonth = months.length > 1 ? months[months.length - 2] : null;

  // ── Hero Cards ──────────────────────────────────────────────────
  const heroCards = [
    {
      label: 'REVENUE MTD',
      value: currentMonth && currentMonth.latestMTD ? fmtCurrency(currentMonth.latestMTD) : '—',
      sub: `${currentMonth ? fmtCurrency(currentMonth.avgRevenuePerDay) : '—'} avg daily revenue`,
      delta: currentMonth && prevMonth ? currentMonth.avgRevenuePerDay - prevMonth.avgRevenuePerDay : null,
      deltaFmt: (d: number) => fmtCurrency(d),
      color: 'text-green-600',
    },
    {
      label: 'DAILY REVENUE',
      value: currentMonth ? fmtCurrency(currentMonth.avgRevenuePerDay) : '—',
      sub: `IP: ${currentMonth ? fmtCurrency(currentMonth.totalIPRevenue / currentMonth.daysReported) : '—'} | OP: ${currentMonth ? fmtCurrency(currentMonth.totalOPRevenue / currentMonth.daysReported) : '—'}`,
      delta: currentMonth && prevMonth ? currentMonth.avgRevenuePerDay - prevMonth.avgRevenuePerDay : null,
      deltaFmt: (d: number) => fmtCurrency(d),
      color: 'text-emerald-600',
    },
    {
      label: 'STOCK VALUE',
      value: currentMonth ? fmtCurrency(currentMonth.avgStockValue) : '—',
      sub: `${summary.totalDaysReported} days of stock data`,
      delta: currentMonth && prevMonth ? currentMonth.avgStockValue - prevMonth.avgStockValue : null,
      deltaFmt: (d: number) => fmtCurrency(d),
      color: 'text-teal-600',
    },
    {
      label: 'STOCKOUT-FREE',
      value: currentMonth ? `${currentMonth.stockoutFreeRate.toFixed(0)}%` : '—',
      sub: `${currentMonth ? currentMonth.daysReported - currentMonth.stockoutDays : 0}/${currentMonth ? currentMonth.daysReported : 0} clean days`,
      delta: currentMonth && prevMonth ? currentMonth.stockoutFreeRate - prevMonth.stockoutFreeRate : null,
      deltaFmt: (d: number) => `${d.toFixed(0)}pp`,
      color: 'text-lime-600',
    },
  ];

  // ── Chart dimensions ────────────────────────────────────────────
  const chartW = 900, chartH = 260, padL = 50, padR = 20, padT = 30, padB = 50;
  const drawW = chartW - padL - padR;
  const drawH = chartH - padT - padB;

  // ── Revenue Trend ───────────────────────────────────────────────
  const revenueMax = Math.max(...months.map(m => m.totalRevenue), 1);
  const avgMax = Math.max(...months.map(m => m.avgRevenuePerDay), 1);
  const dualMax = Math.ceil(Math.max(revenueMax, avgMax) / 100000) * 100000 + 100000;

  const revenuePts = months.map((m, i) => ({
    x: padL + (i / Math.max(months.length - 1, 1)) * drawW,
    y: padT + drawH - (m.totalRevenue / dualMax) * drawH,
  }));
  const avgRevenuePts = months.map((m, i) => ({
    x: padL + (i / Math.max(months.length - 1, 1)) * drawW,
    y: padT + drawH - (m.avgRevenuePerDay / dualMax) * drawH,
  }));

  // ── IP vs OP Revenue Split ──────────────────────────────────────
  const barMax = Math.max(...months.map(m => m.totalRevenue), 1);
  const barYMax = Math.ceil(barMax / 100000) * 100000 + 100000;
  const barW = Math.min(36, drawW / months.length - 8);

  // ── Stock Value Tracking (last 5 months) ────────────────────────
  const stockMonths = months.slice(-5);
  const stockMax = Math.max(...stockMonths.map(m => m.avgStockValue), 1);

  // ── Stockout & Expiry Calendar (last 3 months) ──────────────────
  const recentMonths = months.slice(-3);

  // ── Incident Log ────────────────────────────────────────────────
  const incidents = allDays.filter(d => d.hasStockout || d.hasExpiry);

  // ── Stockout-Free Streak ────────────────────────────────────────
  let currentStreak = 0;
  let bestStreak = 0;
  let tempStreak = 0;
  for (const d of allDays) {
    if (!d.hasStockout && !d.hasExpiry) {
      tempStreak++;
      if (tempStreak > bestStreak) bestStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  }
  for (let i = allDays.length - 1; i >= 0; i--) {
    if (!allDays[i].hasStockout && !allDays[i].hasExpiry) currentStreak++;
    else break;
  }

  return (
    <div className={embedded ? '' : 'max-w-5xl mx-auto px-4 py-8'}>
      {/* Header */}
      {embedded && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-slate-400">
            {summary.dateRange ? `${summary.dateRange.from} to ${summary.dateRange.to}` : ''} · {summary.totalDaysReported} days of pharmacy data analyzed
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
              {card.delta !== null && card.delta !== 0 && (
                <span className={`text-xs font-medium ${card.delta >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                  {card.delta >= 0 ? '↑' : '↓'} {card.deltaFmt(Math.abs(card.delta))}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Revenue Trend Chart */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Revenue Trend — Monthly</h3>
        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full">
          <defs>
            <linearGradient id="pharmacy-revenue-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="pharmacy-avg-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#059669" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = padT + drawH - frac * drawH;
            return (
              <g key={frac}>
                <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke="#e2e8f0" strokeDasharray="3,3" />
                <text x={padL - 6} y={y + 4} textAnchor="end" className="text-[10px] fill-slate-400">
                  {fmtCurrency(frac * dualMax)}
                </text>
              </g>
            );
          })}

          {revenuePts.length >= 2 && (
            <>
              <path d={smoothAreaPath(revenuePts, padT + drawH)} fill="url(#pharmacy-revenue-grad)" />
              <path d={smoothPath(revenuePts)} fill="none" stroke="#10b981" strokeWidth="2.5" />
            </>
          )}
          {avgRevenuePts.length >= 2 && (
            <>
              <path d={smoothAreaPath(avgRevenuePts, padT + drawH)} fill="url(#pharmacy-avg-grad)" />
              <path d={smoothPath(avgRevenuePts)} fill="none" stroke="#059669" strokeWidth="2.5" />
            </>
          )}

          {revenuePts.map((p, i) => (
            <g key={`r${i}`}>
              <circle cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#10b981" strokeWidth="2" />
              <text x={p.x} y={p.y - 10} textAnchor="middle" className="text-[9px] fill-emerald-600 font-medium">
                {fmtCurrency(months[i].totalRevenue).split(' ')[0]}
              </text>
            </g>
          ))}
          {avgRevenuePts.map((p, i) => (
            <g key={`a${i}`}>
              <circle cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#059669" strokeWidth="2" />
            </g>
          ))}

          {months.map((m, i) => (
            <text key={m.month} x={padL + (i / Math.max(months.length - 1, 1)) * drawW} y={chartH - 8} textAnchor="middle" className="text-[9px] fill-slate-400">
              {fmtMonth(m.month)}
            </text>
          ))}
        </svg>
        <div className="flex items-center gap-4 mt-2 justify-center">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded-full bg-emerald-500" /> Total Revenue
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded-full bg-emerald-700" /> Avg Daily Revenue
          </span>
        </div>
      </div>

      {/* IP vs OP Revenue Split */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">IP vs OP Revenue Split — Monthly</h3>
        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full">
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = padT + drawH - frac * drawH;
            return (
              <g key={frac}>
                <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke="#e2e8f0" strokeDasharray="3,3" />
                <text x={padL - 6} y={y + 4} textAnchor="end" className="text-[10px] fill-slate-400">
                  {fmtCurrency(frac * barYMax)}
                </text>
              </g>
            );
          })}

          {months.map((m, i) => {
            const cx = padL + (i / Math.max(months.length - 1, 1)) * drawW;
            const ipH = (m.totalIPRevenue / barYMax) * drawH;
            const opH = (m.totalOPRevenue / barYMax) * drawH;
            const baseY = padT + drawH;
            return (
              <g key={m.month}>
                <rect x={cx - barW / 2} y={baseY - ipH} width={barW} height={ipH} fill="#10b981" rx={2} opacity={0.8} />
                <rect x={cx - barW / 2} y={baseY - ipH - opH} width={barW} height={opH} fill="#34d399" rx={2} opacity={0.8} />
                {m.totalRevenue > 0 && (
                  <text x={cx} y={baseY - ipH - opH - 6} textAnchor="middle" className="text-[9px] fill-slate-600 font-medium">
                    {fmtCurrency(m.totalRevenue).split(' ')[0]}
                  </text>
                )}
              </g>
            );
          })}

          {months.map((m, i) => (
            <text key={m.month} x={padL + (i / Math.max(months.length - 1, 1)) * drawW} y={chartH - 8} textAnchor="middle" className="text-[9px] fill-slate-400">
              {fmtMonth(m.month)}
            </text>
          ))}
        </svg>
        <div className="flex items-center gap-4 mt-2 justify-center">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded bg-emerald-500 opacity-80" /> IP Revenue
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded bg-emerald-300 opacity-80" /> OP Revenue
          </span>
        </div>
      </div>

      {/* Monthly Progression Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 overflow-x-auto">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-base">💊</span>
          <h3 className="text-sm font-semibold text-slate-800">Monthly Progression</h3>
          <span className="text-[9px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Pharmacy Operations</span>
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
              { label: 'Revenue MTD', key: 'latestMTD', fmt: (v: number) => fmtCurrency(v) },
              { label: 'Avg Daily Revenue', key: 'avgRevenuePerDay', fmt: (v: number) => fmtCurrency(v) },
              { label: 'IP Revenue', key: 'totalIPRevenue', fmt: (v: number) => fmtCurrency(v) },
              { label: 'OP Revenue', key: 'totalOPRevenue', fmt: (v: number) => fmtCurrency(v) },
              { label: 'Avg Stock Value', key: 'avgStockValue', fmt: (v: number) => fmtCurrency(v) },
              { label: 'Stockout Days', key: 'stockoutDays', fmt: (v: number) => String(v) },
              { label: 'Expiry Alert Days', key: 'expiryAlertDays', fmt: (v: number) => String(v) },
              { label: 'Stockout-Free Rate', key: 'stockoutFreeRate', fmt: (v: number) => `${v.toFixed(0)}%` },
              { label: 'Days Reported', key: 'daysReported', fmt: (v: number) => String(v) },
            ].map(({ label, key, fmt }) => (
              <tr key={key} className="border-b border-slate-50">
                <td className="py-2.5 pr-4 text-slate-700 font-medium whitespace-nowrap">{label}</td>
                {months.map((m, i) => {
                  const val = (m as unknown as Record<string, number>)[key];
                  const prev = i > 0 ? (months[i - 1] as unknown as Record<string, number>)[key] : null;
                  const delta = prev !== null ? val - prev : null;
                  const isBadMetric = key === 'stockoutDays' || key === 'expiryAlertDays';
                  return (
                    <td key={m.month} className="text-center py-2.5 px-2">
                      <span className="text-slate-800 font-medium">{fmt(val)}</span>
                      {delta !== null && delta !== 0 && (
                        <div className={`text-[9px] ${
                          isBadMetric
                            ? delta > 0 ? 'text-red-400' : 'text-emerald-500'
                            : delta > 0 ? 'text-emerald-500' : 'text-red-400'
                        }`}>
                          {delta > 0 ? '+' : ''}{key.includes('Rate') ? `${delta.toFixed(0)}pp` : fmt(Math.abs(delta))}
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

      {/* Stock Value Tracking */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Stock Value Tracking — Last 5 Months</h3>
        <div className="space-y-2">
          {stockMonths.map(m => {
            const maxStock = Math.max(...stockMonths.map(mm => mm.avgStockValue), 1);
            return (
              <div key={m.month} className="flex items-center gap-3">
                <span className="text-[10px] text-slate-500 w-14">{fmtMonth(m.month)}</span>
                <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-500 flex items-center justify-end pr-2"
                    style={{ width: `${m.avgStockValue > 0 ? Math.max((m.avgStockValue / maxStock) * 100, 15) : 0}%` }}
                  >
                    {m.avgStockValue > 0 && <span className="text-[9px] text-white font-bold">{fmtCurrency(m.avgStockValue).split(' ')[0]}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stockout & Expiry Calendar + Incident Log */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Quality Calendar */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Pharmacy Quality Calendar</h3>
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
                    let bg = 'bg-emerald-200 text-emerald-700';
                    let symbol = '·';
                    if (dayData.hasStockout) {
                      bg = 'bg-red-200 text-red-700'; symbol = 'S';
                    } else if (dayData.hasExpiry) {
                      bg = 'bg-amber-200 text-amber-700'; symbol = 'E';
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
              { color: 'bg-red-200', label: 'Stockout' },
              { color: 'bg-amber-200', label: 'Expiry' },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1 text-[9px] text-slate-500">
                <span className={`w-3 h-3 rounded ${color}`} /> {label}
              </span>
            ))}
          </div>
        </div>

        {/* Incident Log */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Pharmacy Incidents — {incidents.length} Days</h3>
          <p className="text-[10px] text-slate-400 mb-3">Stockout and expiry management alerts</p>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
            {incidents.slice(-12).reverse().map((d) => {
              const texts: string[] = [];
              if (d.stockoutText) texts.push(`📦 ${d.stockoutText}`);
              if (d.expiryText) texts.push(`⏰ ${d.expiryText}`);
              const typeColor = d.hasStockout ? 'border-red-300' : 'border-amber-300';
              return (
                <div key={d.date} className="flex gap-2 items-start">
                  <span className="text-[9px] text-slate-500 font-mono whitespace-nowrap mt-0.5">
                    {d.date.substring(5).replace('-', '/')}
                  </span>
                  <div className={`border-l-2 ${typeColor} pl-2`}>
                    {texts.map((t, ti) => (
                      <p key={ti} className="text-[10px] text-slate-600 leading-tight">{t}</p>
                    ))}
                  </div>
                </div>
              );
            })}
            {incidents.length === 0 && (
              <p className="text-[10px] text-slate-400 text-center py-4">No pharmacy incidents recorded</p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom row: Streak + Expiry Management + All-Time Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Stockout-Free Streak */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-[10px] font-semibold tracking-wider text-slate-400 mb-1">STOCKOUT-FREE STREAK</p>
          <div className="flex items-end gap-1">
            <span className="text-3xl font-bold text-emerald-600">{currentStreak}</span>
            <span className="text-sm text-slate-400 mb-1">days</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Current (best: {bestStreak} days)</p>
          <span className="text-2xl mt-2 block">✅</span>
        </div>

        {/* Expiry Management Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-[10px] font-semibold tracking-wider text-slate-400 mb-1">EXPIRY MANAGEMENT</p>
          <div className="flex items-end gap-1">
            <span className="text-3xl font-bold text-amber-600">{summary.expiryAlertDays}</span>
            <span className="text-sm text-slate-400 mb-1">alert days</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Near-expiry item tracking</p>
          <div className="flex items-end gap-1.5 mt-3 h-10">
            {months.slice(-6).map(m => {
              const maxE = Math.max(...months.slice(-6).map(mm => mm.expiryAlertDays), 1);
              const h = m.expiryAlertDays > 0 ? Math.max((m.expiryAlertDays / maxE) * 36, 3) : 2;
              return (
                <div key={m.month} className="flex flex-col items-center gap-0.5 flex-1">
                  <div className="w-full max-w-[20px] rounded bg-amber-300" style={{ height: `${h}px` }} />
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
              { label: 'Total revenue', value: fmtCurrency(summary.totalRevenue) },
              { label: 'IP revenue', value: fmtCurrency(summary.totalIPRevenue) },
              { label: 'OP revenue', value: fmtCurrency(summary.totalOPRevenue) },
              { label: 'Avg stock value', value: fmtCurrency(summary.avgStockValue) },
              { label: 'Stockout-free rate', value: `${summary.stockoutFreeRate.toFixed(0)}%` },
              { label: 'Stockout days', value: summary.stockoutDays },
              { label: 'Expiry alert days', value: summary.expiryAlertDays },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-[10px]">
                <span className="text-slate-500">{label}</span>
                <span className="text-slate-800 font-semibold">{typeof value === 'number' ? value.toLocaleString() : value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
