'use client';

/* G.3 — AI Health panel: live provider status (Pro/Flash/Ollama self-test) +
   Gemini cost/latency metrics (24h / 7d). Both endpoints are bearer-gated, so
   paste the admin key. Cost is a rough estimate — verify vs Vertex billing. */

import { useState } from 'react';

interface Ping { ok: boolean; model: string; ms: number; sample?: string; error?: string; }
interface SelfTest {
  ok: boolean; configured: boolean;
  flags: Record<string, boolean | string>;
  providers: Record<string, Ping>;
}
interface Agg { provider: string; calls: number; avg_ms: number; p95_ms: number; tokens: number; est_cost_usd: number; }
interface Metrics { rates: Record<string, number>; last_24h: Agg[]; last_7d: Agg[]; note?: string; }

export default function AiHealthPanel() {
  const [adminKey, setAdminKey] = useState('');
  const [selftest, setSelftest] = useState<SelfTest | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');

  const load = async () => {
    if (!adminKey) { setFlash('Enter the admin key first'); return; }
    setBusy(true); setFlash('');
    try {
      const h = { Authorization: `Bearer ${adminKey}` };
      const [s, m] = await Promise.all([
        fetch('/api/llm-selftest', { headers: h }).then(r => r.json()),
        fetch('/api/ai-intelligence/metrics', { headers: h }).then(r => r.json()),
      ]);
      setSelftest(s); setMetrics(m);
      if (s?.error || m?.error) setFlash('Auth failed — check the admin key');
    } catch { setFlash('Load failed'); }
    finally { setBusy(false); }
  };

  const pill = (ok: boolean) => ({
    padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#fff',
    background: ok ? '#16a34a' : '#b91c1c',
  });

  const table = (title: string, rows: Agg[]) => (
    <div style={{ marginBottom: 18 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 6px' }}>{title}</h3>
      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: '#6b7280' }}>No calls recorded in this window.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: 6 }}>Provider</th>
              <th style={{ padding: 6 }}>Calls</th>
              <th style={{ padding: 6 }}>Avg ms</th>
              <th style={{ padding: 6 }}>p95 ms</th>
              <th style={{ padding: 6 }}>Tokens</th>
              <th style={{ padding: 6 }}>Est cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.provider} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: 6, fontWeight: 600 }}>{r.provider}</td>
                <td style={{ padding: 6 }}>{r.calls}</td>
                <td style={{ padding: 6 }}>{r.avg_ms}</td>
                <td style={{ padding: 6 }}>{r.p95_ms}</td>
                <td style={{ padding: 6 }}>{r.tokens.toLocaleString()}</td>
                <td style={{ padding: 6 }}>${r.est_cost_usd.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px', fontFamily: 'system-ui, sans-serif', color: '#111' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>AI Health — Gemini / Vertex</h1>
      <p style={{ color: '#555', marginTop: 0, marginBottom: 18 }}>
        Live provider self-test + cost/latency from the routed LLM calls. Cost is a rough estimate from blended
        per-million-token rates — verify against Vertex billing.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <input type="password" placeholder="Admin key" value={adminKey} onChange={e => setAdminKey(e.target.value)}
          style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, width: 240 }} />
        <button onClick={load} disabled={busy}
          style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
          {busy ? 'Loading…' : 'Load'}
        </button>
        {flash && <span style={{ color: '#b91c1c', fontSize: 13 }}>{flash}</span>}
      </div>

      {selftest && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Provider status</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            {Object.entries(selftest.providers || {}).map(([name, p]) => (
              <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#f3f4f6', borderRadius: 8, fontSize: 13 }}>
                <span style={pill(p.ok)}>{p.ok ? 'OK' : 'DOWN'}</span>
                {name} · {p.ms}ms{p.error ? ` · ${p.error.slice(0, 40)}` : ''}
              </span>
            ))}
          </div>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            Flags: {Object.entries(selftest.flags || {}).map(([k, v]) => `${k}=${v}`).join(' · ')}
          </p>
        </div>
      )}

      {metrics && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Usage &amp; cost</h2>
          {table('Last 24 hours', metrics.last_24h)}
          {table('Last 7 days', metrics.last_7d)}
          <p style={{ fontSize: 12, color: '#9ca3af' }}>
            Rates ($/1M tokens): {Object.entries(metrics.rates || {}).map(([k, v]) => `${k}=$${v}`).join(' · ')}
            {metrics.note ? `  ·  (${metrics.note})` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
