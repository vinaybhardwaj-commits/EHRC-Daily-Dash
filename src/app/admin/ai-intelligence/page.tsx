'use client';

/* Adaptive Forms Intelligence — admin console (F.0)
   Observability + post-hoc veto for the (fully autonomous) gap-question engine.
   No questions exist until the nightly gap-analysis job (F.1) ships. */

import { useEffect, useState, useCallback } from 'react';

interface FieldSpec {
  id?: string;
  label?: string;
  type?: string;
  options?: string[];
}
interface AdaptiveQuestion {
  id: number;
  dept_slug: string;
  field_spec: FieldSpec;
  rationale: string | null;
  priority: number;
  status: 'open' | 'answered' | 'expired' | 'retired';
  recurrence: 'once' | 'until_answered';
  days_shown: number;
  answer_value: unknown;
  created_at: string;
}
interface ApiResponse {
  enabled: boolean;
  maxPerDept: number;
  counts: Record<string, number>;
  questions: AdaptiveQuestion[];
  note?: string;
}

const STATUS_COLORS: Record<string, string> = {
  open: '#2563eb',
  answered: '#16a34a',
  expired: '#9ca3af',
  retired: '#b91c1c',
};

export default function AdaptiveIntelligenceAdmin() {
  const [adminKey, setAdminKey] = useState('');
  const [data, setData] = useState<ApiResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [flash, setFlash] = useState('');

  const say = (m: string) => { setFlash(m); setTimeout(() => setFlash(''), 4000); };

  const loadAll = useCallback(async () => {
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const r = (await (await fetch(`/api/ai-intelligence${qs}`)).json()) as ApiResponse;
      setData(r);
    } catch {
      say('Failed to load');
    }
  }, [statusFilter]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const retire = async (id: number) => {
    if (!adminKey) return say('Enter the admin key first');
    const res = await fetch('/api/ai-intelligence', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'retire', id }),
    });
    say(res.ok ? `Retired question #${id}` : `Failed (${res.status}) — check admin key`);
    if (res.ok) loadAll();
  };

  const enabled = data?.enabled ?? false;
  const counts = data?.counts ?? {};
  const questions = data?.questions ?? [];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px', fontFamily: 'system-ui, sans-serif', color: '#111' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Even AI — Adaptive Forms Intelligence</h1>
      <p style={{ color: '#555', marginTop: 0, marginBottom: 20 }}>
        The engine mines each department&apos;s history for the information gaps that block better
        predictions, then (fully autonomously) drops a targeted question onto the right HOD&apos;s daily form
        until it&apos;s answered. This console is your observability and your veto.
      </p>

      {/* Engine status */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <span style={{
          padding: '6px 12px', borderRadius: 6, fontWeight: 600, color: '#fff',
          background: enabled ? '#16a34a' : '#9ca3af',
        }}>
          Engine: {enabled ? 'ENABLED' : 'DISABLED'}
        </span>
        <span style={{ padding: '6px 12px', borderRadius: 6, background: '#f3f4f6' }}>
          Max open / department: <b>{data?.maxPerDept ?? '—'}</b>
        </span>
        {(['open', 'answered', 'expired', 'retired'] as const).map(s => (
          <span key={s} style={{ padding: '6px 12px', borderRadius: 6, background: '#f3f4f6' }}>
            <span style={{ color: STATUS_COLORS[s], fontWeight: 600 }}>{s}</span>: {counts[s] ?? 0}
          </span>
        ))}
      </div>

      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 14, color: '#7c2d12' }}>
        Kill switch: set <code>ADAPTIVE_FORMS_ENABLED=1</code> in Vercel env to turn the engine on, unset it to go dark.
        Flood guard: <code>ADAPTIVE_MAX_PER_DEPT</code> (default 2). The nightly gap-analysis (F.1) and form
        injection (F.2) are not live yet — this is the foundation + your control surface.
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          type="password"
          placeholder="Admin key (for retire)"
          value={adminKey}
          onChange={e => setAdminKey(e.target.value)}
          style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, width: 240 }}
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="answered">Answered</option>
          <option value="expired">Expired</option>
          <option value="retired">Retired</option>
        </select>
        <button onClick={loadAll} style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>Refresh</button>
        {flash && <span style={{ color: '#2563eb', fontSize: 14 }}>{flash}</span>}
      </div>

      {/* Questions table */}
      {questions.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#6b7280', background: '#f9fafb', borderRadius: 8 }}>
          No AI questions yet. Once the nightly gap-analysis (F.1) is live, generated questions will appear here
          before and after they reach HODs.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: 8 }}>Dept</th>
              <th style={{ padding: 8 }}>Question (field · type)</th>
              <th style={{ padding: 8 }}>Why (rationale)</th>
              <th style={{ padding: 8 }}>Pri</th>
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}>Days</th>
              <th style={{ padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {questions.map(q => (
              <tr key={q.id} style={{ borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' }}>
                <td style={{ padding: 8, fontWeight: 600 }}>{q.dept_slug}</td>
                <td style={{ padding: 8 }}>
                  {q.field_spec?.label || q.field_spec?.id || '—'}
                  <span style={{ color: '#6b7280' }}> · {q.field_spec?.type || '?'}</span>
                </td>
                <td style={{ padding: 8, color: '#444', maxWidth: 340 }}>{q.rationale || '—'}</td>
                <td style={{ padding: 8 }}>{q.priority}</td>
                <td style={{ padding: 8, color: STATUS_COLORS[q.status], fontWeight: 600 }}>{q.status}</td>
                <td style={{ padding: 8 }}>{q.days_shown}</td>
                <td style={{ padding: 8 }}>
                  {q.status === 'open' && (
                    <button
                      onClick={() => retire(q.id)}
                      style={{ padding: '4px 10px', border: '1px solid #fca5a5', color: '#b91c1c', background: '#fff', borderRadius: 6, cursor: 'pointer' }}
                    >
                      Retire
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
