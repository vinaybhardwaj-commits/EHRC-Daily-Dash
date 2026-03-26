'use client';

import { useState } from 'react';

interface DeptReminderPanelProps {
  deptSlug: string;
  deptName: string;
  date: string; // YYYY-MM-DD
  staleDate?: string | null;
  formUrl: string;
}

export default function DeptReminderPanel({ deptSlug, deptName, date, staleDate, formUrl }: DeptReminderPanelProps) {
  const [sending, setSending] = useState<'email' | 'whatsapp' | null>(null);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const sendReminder = async (channel: 'email' | 'whatsapp') => {
    setSending(channel);
    setResult(null);
    try {
      const res = await fetch('/api/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department_slug: deptSlug, channel, date }),
      });
      const data = await res.json();
      if (res.ok) {
        const dest = channel === 'email' ? data.to : data.to;
        setResult({ ok: true, msg: channel === 'email' ? `Email sent to ${dest}` : `WhatsApp sent to ${dest}` });
      } else {
        setResult({ ok: false, msg: data.error || 'Failed to send' });
      }
    } catch (err) {
      setResult({ ok: false, msg: 'Network error' });
    } finally {
      setSending(null);
    }
  };

  const fmtDate = (d: string) => {
    try {
      return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    } catch { return d; }
  };

  return (
    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-amber-600 text-base">&#9888;</span>
        <span className="text-sm font-medium text-amber-800">
          No submission for {fmtDate(date)}
        </span>
      </div>

      <p className="text-xs text-amber-700 mb-3">
        Send a reminder to the {deptName} department head to fill in today&apos;s data.
      </p>

      <div className="flex flex-wrap gap-2 mb-2">
        <button
          onClick={(e) => { e.stopPropagation(); sendReminder('email'); }}
          disabled={sending !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white text-xs font-medium rounded-md transition-colors"
        >
          {sending === 'email' ? (
            <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <span>&#9993;</span>
          )}
          {sending === 'email' ? 'Sending...' : 'Email Reminder'}
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); sendReminder('whatsapp'); }}
          disabled={sending !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white text-xs font-medium rounded-md transition-colors"
        >
          {sending === 'whatsapp' ? (
            <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <span>&#128172;</span>
          )}
          {sending === 'whatsapp' ? 'Sending...' : 'WhatsApp Reminder'}
        </button>
      </div>

      {result && (
        <div className={`text-xs px-2 py-1 rounded ${result.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
          {result.msg}
        </div>
      )}

      <div className="mt-2 pt-2 border-t border-amber-200">
        <p className="text-xs text-amber-600 mb-1">Or fill it in directly:</p>
        <div className="flex flex-wrap gap-2">
          <a
            href={`${formUrl}?dept=${deptSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-sky-600 hover:text-sky-800 underline"
          >
            Open Web Form
          </a>
        </div>
      </div>
    </div>
  );
}
