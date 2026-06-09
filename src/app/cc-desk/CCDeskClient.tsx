'use client';

import { useMemo, useState, useCallback } from 'react';
import type { CcDto } from '@/lib/surgical-risk/booking-db';

const CC_STATUSES = ['New', 'Counselled', 'Admitted', 'Cancelled'] as const;
const DOC_LINKS: { t: string; label: string }[] = [
  { t: 'fc', label: 'Financial' },
  { t: 'info', label: 'Info' },
  { t: 'adm', label: 'Admission' },
];

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
function fmtMoney(paise: number | null): string {
  if (paise === null || paise === undefined) return '—';
  return 'Rs. ' + Math.round(paise / 100).toLocaleString('en-IN');
}
function flagStyle(flag: string | null): string {
  if (!flag) return 'bg-gray-100 text-gray-500';
  return /ok\b/i.test(flag) ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800';
}
function tierStyle(tier: string | null): string {
  switch ((tier || '').toUpperCase()) {
    case 'CRITICAL': return 'bg-red-200 text-red-900';
    case 'RED': return 'bg-red-100 text-red-700';
    case 'AMBER': return 'bg-amber-100 text-amber-800';
    case 'GREEN': return 'bg-green-100 text-green-700';
    default: return 'bg-gray-100 text-gray-400';
  }
}
function statusStyle(s: string): string {
  switch (s) {
    case 'Counselled': return 'border-blue-300 bg-blue-50 text-blue-700';
    case 'Admitted': return 'border-green-300 bg-green-50 text-green-700';
    case 'Cancelled': return 'border-gray-300 bg-gray-50 text-gray-400 line-through';
    default: return 'border-amber-300 bg-amber-50 text-amber-800';
  }
}

export default function CCDeskClient({ initial }: { initial: CcDto[] }) {
  const [rows, setRows] = useState<CcDto[]>(initial);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [tierFilter, setTierFilter] = useState<string>('All');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setErr(null);
    try {
      const r = await fetch('/api/surgical-risk/booking/list', { cache: 'no-store' });
      const data = await r.json();
      if (data.ok) setRows(data.bookings as CcDto[]);
      else setErr(data.error || 'Failed to refresh');
    } catch {
      setErr('Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const patch = useCallback(async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    setErr(null);
    try {
      const r = await fetch(`/api/surgical-risk/booking/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!data.ok) { setErr(data.error || 'Update failed'); return false; }
      return true;
    } catch {
      setErr('Update failed');
      return false;
    } finally {
      setBusyId(null);
    }
  }, []);

  const changeStatus = async (id: string, status: string) => {
    setRows((rs) => rs.map((x) => (x.id === id ? { ...x, cc_status: status } : x)));
    const ok = await patch(id, { action: 'status', status, actor: 'CC desk' });
    if (!ok) refresh();
  };
  const toggleRevoke = async (id: string, revoked: boolean) => {
    setRows((rs) => rs.map((x) => (x.id === id ? { ...x, revoked } : x)));
    const ok = await patch(id, { action: 'revoke', revoked, actor: 'CC desk' });
    if (!ok) refresh();
  };
  const copyLink = async (id: string, token: string) => {
    const url = `${window.location.origin}/booking/${token}`;
    try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked */ }
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { Total: rows.length, New: 0, Counselled: 0, Admitted: 0, Cancelled: 0 };
    for (const r of rows) c[r.cc_status] = (c[r.cc_status] || 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'All' && r.cc_status !== statusFilter) return false;
      if (tierFilter !== 'All') {
        const t = (r.risk_tier || 'Unscored').toUpperCase();
        if (tierFilter === 'Unscored' ? r.risk_tier : t !== tierFilter) return false;
      }
      if (needle) {
        const hay = `${r.patient_name} ${r.uhid} ${r.proposed_procedure || ''} ${r.surgeon_name || ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, tierFilter, q]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1f3a63] text-white">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-baseline gap-3">
            <span className="font-bold text-lg">EHRC</span>
            <span className="text-blue-200">|</span>
            <span className="text-sm font-medium">CC Desk — Counselling &amp; Admission Queue</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a href="/surgery-booking" className="text-blue-100 hover:text-white hover:underline">+ New booking</a>
            <a href="/surgical-risk" className="text-blue-100 hover:text-white hover:underline">SREWS dashboard</a>
            <button onClick={refresh} disabled={refreshing} className="rounded-md bg-white/15 hover:bg-white/25 px-3 py-1 disabled:opacity-50">
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-5">
        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          {(['Total', 'New', 'Counselled', 'Admitted', 'Cancelled'] as const).map((k) => (
            <div key={k} className="bg-white rounded-lg border border-gray-200 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-gray-400">{k}</div>
              <div className="text-2xl font-semibold text-gray-800">{counts[k] || 0}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white">
            <option value="All">All statuses</option>
            {CC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white">
            <option value="All">All risk tiers</option>
            <option value="CRITICAL">Critical</option>
            <option value="RED">Red</option>
            <option value="AMBER">Amber</option>
            <option value="GREEN">Green</option>
            <option value="Unscored">Unscored</option>
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, UHID, procedure, surgeon"
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white flex-1 min-w-[200px]" />
          <span className="text-xs text-gray-400">{filtered.length} shown</span>
        </div>

        {err && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</div>}

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-200">
                <th className="px-3 py-2 font-medium">Patient</th>
                <th className="px-3 py-2 font-medium">Procedure</th>
                <th className="px-3 py-2 font-medium">Surgery / Admit</th>
                <th className="px-3 py-2 font-medium">Estimate</th>
                <th className="px-3 py-2 font-medium">Flag</th>
                <th className="px-3 py-2 font-medium">Risk</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Documents</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className={`border-b border-gray-100 align-top ${busyId === r.id ? 'opacity-60' : ''}`}>
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-gray-900">{r.patient_name}</div>
                    <div className="text-xs text-gray-500">{r.uhid}{r.age != null ? ` · ${r.age}${r.sex ? '/' + r.sex[0] : ''}` : ''}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="text-gray-800">{r.proposed_procedure || '—'}{r.laterality && r.laterality !== 'N/A' ? ` (${r.laterality})` : ''}</div>
                    <div className="text-xs text-gray-500">{[r.surgical_specialty, r.surgeon_name].filter(Boolean).join(' · ') || '—'}</div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="text-gray-800">{fmtDate(r.surgery_date)}{r.surgery_time ? ` ${r.surgery_time}` : ''}</div>
                    <div className="text-xs text-gray-500">adm {fmtDate(r.admission_date)}{r.admission_time ? ` ${r.admission_time}` : ''}</div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="text-gray-800">{fmtMoney(r.package_amount_paise)}</div>
                    <div className="text-xs text-gray-500">{r.payer || '—'}{r.advance_paise ? ` · adv ${fmtMoney(r.advance_paise)}` : ''}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${flagStyle(r.flag)}`} title={r.flag || ''}>
                      {r.flag ? (/ok\b/i.test(r.flag) ? 'OK' : 'Check') : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tierStyle(r.risk_tier)}`}>
                      {r.risk_tier || 'Unscored'}{r.composite_risk_score != null ? ` ${r.composite_risk_score}` : ''}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <select value={r.cc_status} onChange={(e) => changeStatus(r.id, e.target.value)} disabled={busyId === r.id}
                      className={`text-xs border rounded-md px-2 py-1 ${statusStyle(r.cc_status)}`}>
                      {CC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    {r.revoked ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-600 font-medium">Link revoked</span>
                        <button onClick={() => toggleRevoke(r.id, false)} disabled={busyId === r.id}
                          className="text-xs text-blue-600 hover:underline">Restore</button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {DOC_LINKS.map((d) => (
                          <a key={d.t} href={`/api/surgical-risk/booking/pdf/${r.portal_token}/${d.t}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline">{d.label}</a>
                        ))}
                        <span className="text-gray-300">·</span>
                        <button onClick={() => copyLink(r.id, r.portal_token)} className="text-xs text-gray-600 hover:text-gray-900">
                          {copiedId === r.id ? 'Copied!' : 'Copy link'}
                        </button>
                        <button onClick={() => toggleRevoke(r.id, true)} disabled={busyId === r.id}
                          className="text-xs text-red-500 hover:text-red-700">Revoke</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-400 text-sm">No bookings match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400 mt-4">
          The risk tier is the live SREWS score computed from each booking. Use the status to track New → Counselled → Admitted.
          Revoking a link disables the patient&apos;s portal and PDFs immediately.
        </p>
      </div>
    </div>
  );
}
