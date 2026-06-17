'use client';

import { useEffect, useState, useCallback } from 'react';

interface Recipient {
  id: number; role: string; dept_slug: string | null; name: string;
  whatsapp_e164: string; email: string; verified: boolean; active: boolean; channel_pref: string;
}
interface Template { key: string; channel: string; subject: string; body: string; active: boolean; }
interface LogRow { event_type: string; channel: string; status: string; provider_msg_id?: string | null; detail?: string | null; at: string; }

const SCHEDULE = [
  ['Morning link', '07:30', 'Form link to HODs who haven’t submitted yet'],
  ['Nudge', '09:00', 'Reminder to still-pending HODs (stronger if 2+ days behind)'],
  ['Escalation', '09:45', 'Missing-list + day counts to admins'],
];

export default function MessagingAdmin() {
  const [adminKey, setAdminKey] = useState('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [byStatus, setByStatus] = useState<{ status: string; n: number }[]>([]);
  const [flash, setFlash] = useState('');
  const [testTo, setTestTo] = useState('');

  const authHeaders = () => ({ Authorization: `Bearer ${adminKey}`, 'Content-Type': 'application/json' });
  const say = (m: string) => { setFlash(m); setTimeout(() => setFlash(''), 4000); };

  const loadAll = useCallback(async () => {
    try {
      const r = await (await fetch('/api/messaging/recipients')).json(); setRecipients(r.recipients || []);
      const t = await (await fetch('/api/messaging/templates')).json(); setTemplates(t.templates || []);
      const s = await (await fetch('/api/notifications/status')).json(); setLog(s.recentLog || []); setByStatus(s.byStatus || []);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  const updR = (id: number, patch: Partial<Recipient>) => setRecipients(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  const updT = (key: string, body: string) => setTemplates(ts => ts.map(t => t.key === key ? { ...t, body } : t));

  const saveRecipient = async (r: Recipient) => {
    if (!adminKey) return say('Enter the admin key first');
    const res = await fetch('/api/messaging/recipients', { method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ id: r.id, whatsapp_e164: r.whatsapp_e164, name: r.name, active: r.active, verified: r.verified }) });
    say(res.ok ? `Saved ${r.name || r.dept_slug}` : `Failed (${res.status}) — check admin key`);
    if (res.ok) loadAll();
  };
  const saveTemplate = async (t: Template) => {
    if (!adminKey) return say('Enter the admin key first');
    const res = await fetch('/api/messaging/templates', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ key: t.key, body: t.body }) });
    say(res.ok ? `Saved template "${t.key}"` : `Failed (${res.status})`);
  };
  const testSend = async () => {
    if (!adminKey) return say('Enter the admin key first');
    if (!testTo) return say('Enter a number (+91…)');
    const u = new URL('/api/whatsapp/test', window.location.origin);
    u.searchParams.set('to', testTo); u.searchParams.set('msg', 'EHRC messaging console — test ✅');
    const res = await fetch(u, { headers: { Authorization: `Bearer ${adminKey}` } });
    const j = await res.json().catch(() => ({}));
    say(res.ok && j.success ? `Test sent to ${testTo}` : `Failed: ${j.error || res.status}`);
    loadAll();
  };

  const hods = recipients.filter(r => r.role === 'hod');
  const verified = hods.filter(r => r.verified && r.whatsapp_e164).length;
  const others = recipients.filter(r => r.role !== 'hod');

  const Row = ({ r }: { r: Recipient }) => (
    <tr className="border-b border-slate-100">
      <td className="px-2 py-1.5 text-xs text-slate-500">{r.dept_slug || r.role}</td>
      <td className="px-2 py-1.5"><input className="w-40 border rounded px-2 py-1 text-sm" value={r.name} onChange={e => updR(r.id, { name: e.target.value })} /></td>
      <td className="px-2 py-1.5"><input className="w-44 border rounded px-2 py-1 text-sm font-mono" placeholder="+91…" value={r.whatsapp_e164} onChange={e => updR(r.id, { whatsapp_e164: e.target.value })} /></td>
      <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={r.verified} onChange={e => updR(r.id, { verified: e.target.checked })} /></td>
      <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={r.active} onChange={e => updR(r.id, { active: e.target.checked })} /></td>
      <td className="px-2 py-1.5"><button onClick={() => saveRecipient(r)} className="text-xs bg-blue-600 text-white rounded px-3 py-1 hover:bg-blue-700">Save</button></td>
    </tr>
  );

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Messaging &amp; Notifications</h1>
        <p className="text-sm text-slate-500">Manage WhatsApp reminder recipients, message wording, and delivery.</p>
      </div>

      <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <span className="text-sm font-medium text-amber-800">Admin key</span>
        <input type="password" value={adminKey} onChange={e => setAdminKey(e.target.value)} placeholder="paste SERVICE_OBSERVATIONS_SECRET to enable saving"
          className="flex-1 border rounded px-2 py-1 text-sm" />
        <span className="text-xs text-amber-700">Required to save changes</span>
      </div>
      {flash && <div className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2">{flash}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border rounded-lg p-3"><div className="text-2xl font-bold text-emerald-600">{verified}/{hods.length}</div><div className="text-xs text-slate-500">HODs with verified number</div></div>
        {byStatus.map(s => <div key={s.status} className="bg-white border rounded-lg p-3"><div className="text-2xl font-bold text-slate-800">{s.n}</div><div className="text-xs text-slate-500 capitalize">{s.status}</div></div>)}
      </div>

      <section>
        <h2 className="font-semibold text-slate-800 mb-2">Schedule (Mon–Sat, IST)</h2>
        <div className="bg-white border rounded-lg divide-y text-sm">
          {SCHEDULE.map(([n, t, d]) => <div key={n} className="flex gap-3 px-3 py-2"><span className="font-mono text-slate-500 w-12">{t}</span><span className="font-medium w-28">{n}</span><span className="text-slate-500">{d}</span></div>)}
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-slate-800 mb-2">Department HODs</h2>
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>
            <th className="px-2 py-2 text-left">Dept</th><th className="px-2 py-2 text-left">Name</th><th className="px-2 py-2 text-left">WhatsApp</th><th className="px-2 py-2">Verified</th><th className="px-2 py-2">Active</th><th className="px-2 py-2"></th>
          </tr></thead><tbody>{hods.map(r => <Row key={r.id} r={r} />)}</tbody></table>
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-slate-800 mb-2">Admins / Escalation</h2>
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>
            <th className="px-2 py-2 text-left">Role</th><th className="px-2 py-2 text-left">Name</th><th className="px-2 py-2 text-left">WhatsApp</th><th className="px-2 py-2">Verified</th><th className="px-2 py-2">Active</th><th className="px-2 py-2"></th>
          </tr></thead><tbody>{others.map(r => <Row key={r.id} r={r} />)}</tbody></table>
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-slate-800 mb-2">Message templates</h2>
        <p className="text-xs text-slate-500 mb-2">Variables: {'{{name}}'} {'{{department}}'} {'{{date}}'} {'{{link}}'} {'{{days}}'} (and {'{{missing_list}}'} {'{{n}}'} {'{{total}}'} for the escalation). *text* = bold in WhatsApp.</p>
        <div className="space-y-3">{templates.map(t => (
          <div key={t.key} className="bg-white border rounded-lg p-3">
            <div className="flex items-center justify-between mb-1"><span className="font-mono text-sm font-medium">{t.key}</span>
              <button onClick={() => saveTemplate(t)} className="text-xs bg-blue-600 text-white rounded px-3 py-1 hover:bg-blue-700">Save</button></div>
            <textarea className="w-full border rounded p-2 text-sm font-mono" rows={3} value={t.body} onChange={e => updT(t.key, e.target.value)} />
          </div>
        ))}</div>
      </section>

      <section>
        <h2 className="font-semibold text-slate-800 mb-2">Test send</h2>
        <div className="flex gap-2 items-center">
          <input className="border rounded px-2 py-1 text-sm font-mono w-48" placeholder="+919663898534" value={testTo} onChange={e => setTestTo(e.target.value)} />
          <button onClick={testSend} className="text-sm bg-emerald-600 text-white rounded px-3 py-1.5 hover:bg-emerald-700">Send test</button>
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-slate-800 mb-2">Recent delivery log</h2>
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>
            <th className="px-2 py-2 text-left">When</th><th className="px-2 py-2 text-left">Event</th><th className="px-2 py-2 text-left">Status</th><th className="px-2 py-2 text-left">Detail</th>
          </tr></thead><tbody>{log.map((l, i) => (
            <tr key={i} className="border-b border-slate-100"><td className="px-2 py-1 text-xs text-slate-500">{new Date(l.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
            <td className="px-2 py-1 text-xs">{l.event_type}</td><td className="px-2 py-1 text-xs font-medium">{l.status}</td><td className="px-2 py-1 text-xs text-slate-400 truncate max-w-xs">{l.detail || l.provider_msg_id || ''}</td></tr>
          ))}{log.length === 0 && <tr><td colSpan={4} className="px-2 py-3 text-center text-slate-400 text-sm">No sends yet</td></tr>}</tbody></table>
        </div>
      </section>
    </div>
  );
}
