'use client';

import { useState, useEffect, useCallback } from 'react';
import { HKProgressBar } from '@/components/HKComponents';

interface ShiftSummary {
  shiftId: number;
  date: string;
  shiftType: string;
  supervisorName: string | null;
  staffCount: number | null;
  maleCount: number | null;
  femaleCount: number | null;
  ipCensus: number | null;
  totalTasks: number;
  doneTasks: number;
  pendingTasks: number;
  skippedTasks: number;
  overdueTasks: number;
  completionPct: number;
}

interface HeatmapCell {
  floor: string;
  areaType: string;
  total: number;
  done: number;
  pct: number;
}

interface OverdueItem {
  id: number;
  task_name: string;
  area_name: string;
  floor: string;
  source: string;
  sewa_request_id: string | null;
  status: string;
  created_at: string;
  priority: number;
  skip_reason: string | null;
}

const SHIFT_LABELS: Record<string, string> = {
  AM: 'Morning (8 AM – 2 PM)',
  PM: 'Evening (2 PM – 8 PM)',
  NIGHT: 'Night (8 PM – 8 AM)',
};

const AREA_TYPE_LABELS: Record<string, string> = {
  patient_room: 'Patient Rooms',
  icu: 'ICU',
  ot: 'OT',
  er: 'ER',
  washroom_common: 'Washrooms',
  washroom_staff: 'Staff WR',
  corridor: 'Corridors',
  nursing_station: 'Nursing Stn',
  opd_room: 'OPD',
  lift: 'Lifts',
  staircase: 'Staircases',
  sluice: 'Sluice',
  cafeteria: 'Cafeteria',
  kitchen: 'Kitchen',
  pharmacy: 'Pharmacy',
  lab: 'Lab',
  scrub_area: 'Scrub Area',
  opd_waiting: 'OPD Waiting',
  reception: 'Reception',
  entrance: 'Entrance',
  cssd: 'CSSD',
  store: 'Store',
  admin_office: 'Admin',
  changing_room: 'Changing Rm',
  duty_room: 'Duty Rm',
  parking: 'Parking',
  ramp: 'Ramp',
  billing: 'Billing',
  pre_post_op: 'Pre/Post-Op',
  recovery: 'Recovery',
  endoscopy: 'Endoscopy',
};

function heatColor(pct: number): string {
  if (pct >= 80) return 'bg-green-500 text-white';
  if (pct >= 50) return 'bg-yellow-400 text-gray-900';
  if (pct > 0) return 'bg-red-500 text-white';
  return 'bg-red-600 text-white';
}

export default function HKDashboardPage() {
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [overdue, setOverdue] = useState<OverdueItem[]>([]);
  const [history, setHistory] = useState<ShiftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedHistory, setExpandedHistory] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [dashRes, histRes] = await Promise.all([
        fetch('/api/hk/dashboard'),
        fetch('/api/hk/shift-history?days=7'),
      ]);
      const dash = await dashRes.json();
      const hist = await histRes.json();

      setSummary(dash.currentShift);
      setHeatmap(dash.floorHeatmap || []);
      setOverdue(dash.overdueItems || []);
      setHistory(hist.history || []);
    } catch (e) {
      console.error('Dashboard load error:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Build heatmap grid
  const floors = [...new Set(heatmap.map(h => h.floor))].sort();
  const areaTypes = [...new Set(heatmap.map(h => h.areaType))];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading HK dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">🧹 HK Dashboard</h1>
            <p className="text-sm text-gray-500">SanitizeTrack — EHRC Housekeeping Operations</p>
          </div>
          <a href="/hk" className="text-sm px-4 py-2 rounded-lg bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100">
            Supervisor View →
          </a>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {/* Current Shift Panel */}
        {summary ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  🏥 Current Shift — {SHIFT_LABELS[summary.shiftType] || summary.shiftType}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Supervisor: {summary.supervisorName || '—'} | Staff: {summary.staffCount || 0}
                  {summary.maleCount != null ? ` (M:${summary.maleCount} F:${summary.femaleCount})` : ''}
                  {summary.ipCensus ? ` | IP Census: ${summary.ipCensus}` : ''}
                </p>
              </div>
              <span className={`text-2xl font-bold ${
                summary.completionPct >= 80 ? 'text-green-600' :
                summary.completionPct >= 50 ? 'text-yellow-600' : 'text-red-600'
              }`}>{summary.completionPct}%</span>
            </div>

            <HKProgressBar done={summary.doneTasks} total={summary.totalTasks} />

            <div className="grid grid-cols-4 gap-4 mt-4">
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-xl font-bold text-green-700">{summary.doneTasks}</p>
                <p className="text-xs text-green-600">Done</p>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <p className="text-xl font-bold text-orange-600">{summary.pendingTasks}</p>
                <p className="text-xs text-orange-500">Pending</p>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <p className="text-xl font-bold text-red-600">{summary.overdueTasks}</p>
                <p className="text-xs text-red-500">Overdue</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-xl font-bold text-gray-600">{summary.skippedTasks}</p>
                <p className="text-xs text-gray-500">Skipped</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <p className="text-gray-500">No active shift. The supervisor has not started a shift yet.</p>
          </div>
        )}

        {/* Floor Heatmap */}
        {heatmap.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-bold text-gray-900 mb-3">Floor Completion Heatmap</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">Floor</th>
                    {areaTypes.map(at => (
                      <th key={at} className="text-center py-2 px-1 text-gray-500 font-medium">
                        {AREA_TYPE_LABELS[at] || at}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {floors.map(floor => (
                    <tr key={floor} className="border-t border-gray-100">
                      <td className="py-2 px-2 font-semibold text-gray-700">{floor}</td>
                      {areaTypes.map(at => {
                        const cell = heatmap.find(h => h.floor === floor && h.areaType === at);
                        if (!cell) return <td key={at} className="text-center py-2 px-1"><span className="text-gray-300">—</span></td>;
                        return (
                          <td key={at} className="text-center py-2 px-1">
                            <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${heatColor(cell.pct)}`}>
                              {cell.pct}%
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 mt-3 text-[10px] text-gray-500">
              <span><span className="inline-block w-3 h-3 rounded bg-green-500 mr-1 align-middle" /> ≥80%</span>
              <span><span className="inline-block w-3 h-3 rounded bg-yellow-400 mr-1 align-middle" /> 50–79%</span>
              <span><span className="inline-block w-3 h-3 rounded bg-red-500 mr-1 align-middle" /> &lt;50%</span>
            </div>
          </div>
        )}

        {/* Overdue / Attention Items */}
        {overdue.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-bold text-gray-900 mb-3">Attention Required ({overdue.length})</h2>
            <div className="space-y-2">
              {overdue.map(item => (
                <div key={item.id} className={`flex items-start gap-3 p-3 rounded-lg border ${
                  item.source === 'carryover' ? 'bg-red-50 border-red-200' :
                  item.source === 'sewa' ? 'bg-orange-50 border-orange-200' :
                  'bg-gray-50 border-gray-200'
                }`}>
                  <span className="text-sm">
                    {item.source === 'carryover' ? '🔴' : item.source === 'sewa' ? '🟠' : '⏭️'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{item.floor} — {item.area_name}</p>
                    <p className="text-xs text-gray-600">{item.task_name}</p>
                    {item.sewa_request_id && (
                      <p className="text-xs text-orange-600 mt-0.5">Source: Sewa #{item.sewa_request_id}</p>
                    )}
                    {item.skip_reason && (
                      <p className="text-xs text-gray-500 mt-0.5">Skipped: {item.skip_reason}</p>
                    )}
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                    item.source === 'carryover' ? 'bg-red-100 text-red-700' :
                    item.source === 'sewa' ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {item.source === 'carryover' ? 'OVERDUE' : item.source.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Shift History */}
        {history.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <button
              onClick={() => setExpandedHistory(!expandedHistory)}
              className="w-full flex items-center justify-between"
            >
              <h2 className="text-base font-bold text-gray-900">Shift History (7 days)</h2>
              <span className="text-gray-400 text-sm">{expandedHistory ? '▲' : '▼'}</span>
            </button>
            {expandedHistory && (
              <div className="mt-3 space-y-2">
                {history.map(h => (
                  <div key={h.shiftId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{h.date} | {h.shiftType}</p>
                      <p className="text-xs text-gray-500">{h.supervisorName || 'No supervisor'} | Staff: {h.staffCount || 0}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${
                        h.completionPct >= 80 ? 'text-green-600' :
                        h.completionPct >= 50 ? 'text-yellow-600' : 'text-red-600'
                      }`}>{h.completionPct}%</p>
                      <p className="text-[10px] text-gray-500">{h.doneTasks}/{h.totalTasks} done</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Supervisor Link */}
        <SupervisorLinkCard />
      </div>
    </div>
  );
}

function SupervisorLinkCard() {
  const [copied, setCopied] = useState(false);
  const supervisorUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/hk`
    : 'https://ehrc-daily-dash.vercel.app/hk';

  const handleCopy = () => {
    navigator.clipboard.writeText(supervisorUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleWhatsApp = () => {
    const message = encodeURIComponent(
      `EHRC Housekeeping Shift\n\nOpen this link to start your shift and view today's task list:\n${supervisorUrl}\n\nFill in your name, staff count, and IP census, then tap "Start Shift".`
    );
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-teal-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">📱</span>
        <h2 className="text-base font-bold text-gray-900">Supervisor Shift Link</h2>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Share this link with the HK Supervisor to start their shift. They will fill in their name, staff headcount, and IP census, then see their task checklist for the current shift.
      </p>
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-3">
        <span className="text-xs text-gray-500 truncate flex-1 font-mono">{supervisorUrl}</span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white border border-teal-300 rounded-lg text-xs font-semibold text-teal-700 hover:bg-teal-50 active:bg-teal-100 transition-colors"
        >
          {copied ? (
            <><span>&#10003;</span> Copied!</>
          ) : (
            <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" strokeWidth="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth="2"/></svg> Copy Link</>
          )}
        </button>
        <button
          onClick={handleWhatsApp}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-green-600 rounded-lg text-xs font-semibold text-white hover:bg-green-700 active:bg-green-800 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Share via WhatsApp
        </button>
      </div>
    </div>
  );
}
