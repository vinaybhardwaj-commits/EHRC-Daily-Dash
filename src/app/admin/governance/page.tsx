'use client';

// GV.1 — Governance admin skeleton.
// Shows the OT case log for a date + manual sync trigger. Later sprints add:
// generated question sets, response counts, outbox status, unmatched-surgeon queue.

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface OtCaseRow {
  case_ref: string;
  ot_room: string | null;
  sl_no: string | null;
  scheduled_time: string | null;
  patient_name: string | null;
  uhid: string | null;
  procedure_name: string | null;
  surgeon_raw: string | null;
  surgeon_physician_id: string | null;
  anaesthetist_raw: string | null;
  anaesthesia: string | null;
  remarks: string | null;
  cancelled: boolean;
  source_tab: string | null;
  synced_at: string;
}

function yesterdayIST(): string {
  return new Date(Date.now() + 5.5 * 3600_000 - 86400_000).toISOString().slice(0, 10);
}

export default function GovernanceAdminPage() {
  const [date, setDate] = useState(yesterdayIST());
  const [cases, setCases] = useState<OtCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncKey, setSyncKey] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/governance/cases?date=${d}`);
      const data = await res.json();
      setCases(data.cases || []);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const syncNow = async () => {
    if (!syncKey) { setMessage('Enter the service secret to trigger a manual sync.'); return; }
    setSyncing(true); setMessage('');
    try {
      const res = await fetch(`/api/governance/sync-ot?date=${date}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${syncKey}` },
      });
      const data = await res.json();
      setMessage(res.ok
        ? (data.skipped ? `Skipped: ${data.skipped}` : `Synced tab "${data.tab}" (${data.format}) — ${data.inserted} cases${data.error ? ' — ' + data.error : ''}`)
        : `Failed: ${data.error || res.status}`);
      await load(date);
    } catch {
      setMessage('Sync request failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Governance — OT Case Log</h1>
            <p className="text-sm text-gray-500">GV.1 · synced from the OT schedule sheet · feeds daily HOD governance questions</p>
          </div>
          <Link href="/admin" className="text-sm text-blue-600 hover:underline">← Admin</Link>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap items-end gap-3">
          <label className="text-sm text-gray-600">
            Date
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="block mt-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          </label>
          <label className="text-sm text-gray-600 flex-1 min-w-[220px]">
            Service secret (manual sync)
            <input type="password" value={syncKey} onChange={e => setSyncKey(e.target.value)} placeholder="SERVICE_OBSERVATIONS_SECRET"
              className="block mt-1 w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          </label>
          <button onClick={syncNow} disabled={syncing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {syncing ? 'Syncing…' : 'Sync from sheet'}
          </button>
        </div>

        {message && <div className="mb-4 text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">{message}</div>}

        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : cases.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No synced cases for {date}. Use “Sync from sheet” or wait for the nightly cron.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-3 py-2">OT</th><th className="px-3 py-2">Time</th><th className="px-3 py-2">Patient</th>
                  <th className="px-3 py-2">Procedure</th><th className="px-3 py-2">Surgeon (raw)</th>
                  <th className="px-3 py-2">Matched</th><th className="px-3 py-2">Anaesthetist</th><th className="px-3 py-2">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {cases.map(c => (
                  <tr key={c.case_ref} className={`border-b border-gray-50 ${c.cancelled ? 'opacity-50 line-through' : ''}`}>
                    <td className="px-3 py-2 whitespace-nowrap">{c.ot_room || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.scheduled_time || '—'}</td>
                    <td className="px-3 py-2">{c.patient_name || '—'}</td>
                    <td className="px-3 py-2 max-w-[260px]">{c.procedure_name || '—'}</td>
                    <td className="px-3 py-2">{c.surgeon_raw || '—'}</td>
                    <td className="px-3 py-2">{c.surgeon_physician_id
                      ? <span className="text-green-700 text-xs font-medium">matched</span>
                      : <span className="text-amber-600 text-xs font-medium">pending</span>}</td>
                    <td className="px-3 py-2">{c.anaesthetist_raw || '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-500 max-w-[180px]">{c.remarks || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-3">Cancelled rows are struck through. “Matched” shows whether the surgeon resolved to an EPI roster physician (GV.2).</p>
      </div>
    </div>
  );
}
