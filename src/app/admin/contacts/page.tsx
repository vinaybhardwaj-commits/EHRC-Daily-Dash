'use client';

import { useState, useEffect, useCallback } from 'react';

interface Contact {
  id: number;
  department_slug: string;
  department_name: string;
  head_name: string;
  email: string;
  phone: string;
  google_sheet_url: string;
}

export default function AdminContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Contact>>({});
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/department-contacts');
      const data = await res.json();
      setContacts(data.contacts || []);
    } catch {
      setToast({ msg: 'Failed to load contacts', type: 'err' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const startEdit = (c: Contact) => {
    setEditRow(c.department_slug);
    setEditData({ head_name: c.head_name, email: c.email, phone: c.phone, google_sheet_url: c.google_sheet_url });
  };

  const cancelEdit = () => { setEditRow(null); setEditData({}); };

  const saveEdit = async (slug: string) => {
    setSaving(slug);
    try {
      const res = await fetch('/api/department-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department_slug: slug, ...editData }),
      });
      if (!res.ok) throw new Error('Save failed');
      setEditRow(null);
      setEditData({});
      await fetchContacts();
      setToast({ msg: 'Contact saved!', type: 'ok' });
    } catch {
      setToast({ msg: 'Failed to save', type: 'err' });
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold">EHRC</span>
          <span className="text-slate-400">|</span>
          <span className="text-sm text-slate-300">Admin — Department Contacts</span>
        </div>
        <a href="/" className="text-sm text-sky-400 hover:text-sky-300">Back to Dashboard</a>
      </nav>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-white text-sm ${toast.type === 'ok' ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Department Contacts</h1>
          <p className="text-slate-500 mt-1">Manage department head contact information for reminders and notifications.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Department</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Head Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Phone</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Google Sheet</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600 w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.department_slug} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-800">{c.department_name}</td>
                    {editRow === c.department_slug ? (
                      <>
                        <td className="px-4 py-2">
                          <input type="text" value={editData.head_name || ''} onChange={e => setEditData({...editData, head_name: e.target.value})}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500" placeholder="Dr. Name" />
                        </td>
                        <td className="px-4 py-2">
                          <input type="email" value={editData.email || ''} onChange={e => setEditData({...editData, email: e.target.value})}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500" placeholder="email@even.in" />
                        </td>
                        <td className="px-4 py-2">
                          <input type="tel" value={editData.phone || ''} onChange={e => setEditData({...editData, phone: e.target.value})}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500" placeholder="+91..." />
                        </td>
                        <td className="px-4 py-2">
                          <input type="url" value={editData.google_sheet_url || ''} onChange={e => setEditData({...editData, google_sheet_url: e.target.value})}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500" placeholder="https://docs.google.com/..." />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => saveEdit(c.department_slug)} disabled={saving === c.department_slug}
                              className="px-3 py-1.5 bg-emerald-500 text-white rounded text-xs font-medium hover:bg-emerald-600 disabled:opacity-50">
                              {saving === c.department_slug ? 'Saving...' : 'Save'}
                            </button>
                            <button onClick={cancelEdit}
                              className="px-3 py-1.5 bg-slate-200 text-slate-600 rounded text-xs font-medium hover:bg-slate-300">
                              Cancel
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-slate-600">{c.head_name || <span className="text-slate-300 italic">Not set</span>}</td>
                        <td className="px-4 py-3 text-slate-600">{c.email || <span className="text-slate-300 italic">Not set</span>}</td>
                        <td className="px-4 py-3 text-slate-600">{c.phone || <span className="text-slate-300 italic">Not set</span>}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {c.google_sheet_url ? (
                            <a href={c.google_sheet_url} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:text-sky-700 underline">Sheet</a>
                          ) : <span className="text-slate-300 italic">Not set</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => startEdit(c)}
                            className="px-3 py-1.5 bg-sky-500 text-white rounded text-xs font-medium hover:bg-sky-600">
                            Edit
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <strong>Note:</strong> Phone numbers must include country code (e.g., +919876543210) for WhatsApp reminders.
          Email addresses are used for Resend email reminders.
        </div>
      </div>
    </div>
  );
}
