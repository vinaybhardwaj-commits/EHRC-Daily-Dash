'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface TableInfo {
  table_name: string;
  row_count: number;
  size_pretty: string;
}

interface MigrationInfo {
  version: number;
  name: string;
  applied_at: string;
}

interface DeptContact {
  id: number;
  department_slug: string;
  department_name: string;
  head_name: string;
  email: string;
  phone: string;
  google_sheet_url: string;
}

export default function AdminPage() {
  const [key, setKey] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [activeTab, setActiveTab] = useState<'backup' | 'schema' | 'contacts' | 'sync'>('backup');

  // Backup state
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupStatus, setBackupStatus] = useState('');

  // Schema state
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [migrations, setMigrations] = useState<MigrationInfo[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [dbSize, setDbSize] = useState('');

  // Contacts state
  const [contacts, setContacts] = useState<DeptContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ head_name: '', email: '', phone: '' });
  const [saveStatus, setSaveStatus] = useState('');

  // Sync state
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState('');

  // Read key from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlKey = params.get('key') || '';
    if (urlKey) {
      setKey(urlKey);
      validateKey(urlKey);
    }
  }, []);

  const validateKey = async (k: string) => {
    try {
      const res = await fetch(`/api/admin/validate?key=${encodeURIComponent(k)}`);
      if (res.ok) {
        setAuthenticated(true);
        setAuthError('');
      } else {
        setAuthError('Invalid admin key');
        setAuthenticated(false);
      }
    } catch {
      setAuthError('Connection error');
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    validateKey(key);
  };

  // ---- BACKUP ----
  const handleBackup = async () => {
    setBackupLoading(true);
    setBackupStatus('Generating backup...');
    try {
      const res = await fetch(`/api/db-backup?secret=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error(`Backup failed: ${res.status}`);
      const blob = await res.blob();
      const date = new Date().toISOString().split('T')[0];
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ehrc_db_backup_${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);
      setBackupStatus(`Backup downloaded (${sizeMB} MB)`);
    } catch (err) {
      setBackupStatus(`Error: ${err}`);
    } finally {
      setBackupLoading(false);
    }
  };

  // ---- SCHEMA ----
  const loadSchema = useCallback(async () => {
    setSchemaLoading(true);
    try {
      const res = await fetch(`/api/admin/schema?key=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error('Failed to load schema');
      const data = await res.json();
      setTables(data.tables || []);
      setMigrations(data.migrations || []);
      setDbSize(data.db_size || '');
    } catch (err) {
      console.error(err);
    } finally {
      setSchemaLoading(false);
    }
  }, [key]);

  // ---- CONTACTS ----
  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const res = await fetch('/api/department-contacts');
      if (!res.ok) throw new Error('Failed to load contacts');
      const data = await res.json();
      setContacts(data.contacts || data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setContactsLoading(false);
    }
  }, []);

  // ---- SYNC ----
  const handleSync = async () => {
    setSyncLoading(true);
    setSyncResult('Syncing all departments from Google Sheets...');
    try {
      const res = await fetch('/api/sheets-sync');
      const data = await res.json();
      if (res.ok) {
        const synced = data.synced || 0;
        const failed = data.failed || 0;
        setSyncResult(`Sync complete: ${synced} departments synced, ${failed} failed. ${data.message || ''}`);
      } else {
        setSyncResult(`Sync error: ${data.error || res.status}`);
      }
    } catch (err) {
      setSyncResult(`Sync failed: ${err}`);
    } finally {
      setSyncLoading(false);
    }
  };

  // Load data when tab changes
  useEffect(() => {
    if (!authenticated) return;
    if (activeTab === 'schema') loadSchema();
    if (activeTab === 'contacts') loadContacts();
  }, [activeTab, authenticated, loadSchema, loadContacts]);

  const startEdit = (c: DeptContact) => {
    setEditingId(c.id);
    setEditForm({ head_name: c.head_name || '', email: c.email || '', phone: c.phone || '' });
    setSaveStatus('');
  };

  const saveContact = async (slug: string) => {
    setSaveStatus('Saving...');
    try {
      const res = await fetch('/api/department-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ...editForm }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaveStatus('Saved!');
      setEditingId(null);
      loadContacts();
    } catch (err) {
      setSaveStatus(`Error: ${err}`);
    }
  };

  // ---- AUTH SCREEN ----
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-blue-900 rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900">EHRC Admin</h1>
            <p className="text-sm text-slate-500 mt-1">Enter your admin key to continue</p>
          </div>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="Admin key"
              className="w-full px-4 py-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
            {authError && <p className="text-red-500 text-xs mt-2">{authError}</p>}
            <button
              type="submit"
              className="w-full mt-4 px-4 py-3 bg-blue-900 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
            >
              Access Admin Panel
            </button>
          </form>
          <Link href="/" className="block text-center text-xs text-slate-400 mt-4 hover:text-slate-600">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // ---- MAIN ADMIN PANEL ----
  const tabs = [
    { id: 'backup' as const, label: 'Backup', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4' },
    { id: 'schema' as const, label: 'Schema', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4' },
    { id: 'contacts' as const, label: 'Contacts', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
    { id: 'sync' as const, label: 'Sync', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <nav className="bg-gradient-to-r from-blue-900 to-blue-950 text-white sticky top-0 z-50 shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-blue-300 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="text-xs font-medium hidden sm:inline">Dashboard</span>
            </Link>
            <div className="h-4 w-px bg-blue-700" />
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <h1 className="font-bold text-sm sm:text-base">Admin Panel</h1>
            </div>
          </div>
          <span className="text-xs text-blue-300">Even Hospital, Race Course Road</span>
        </div>
      </nav>

      {/* Tab Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-[52px] z-40">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-1 py-2">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-blue-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* BACKUP TAB */}
        {activeTab === 'backup' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Database Backup</h2>
              <p className="text-sm text-slate-500 mb-6">Download a complete JSON backup of all database tables, schema definitions, and indexes.</p>
              <button
                onClick={handleBackup}
                disabled={backupLoading}
                className={`px-6 py-3 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  backupLoading
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-blue-900 text-white hover:bg-blue-800 shadow-sm'
                }`}
              >
                {backupLoading ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
                {backupLoading ? 'Generating...' : 'Download Full Backup'}
              </button>
              {backupStatus && (
                <p className={`mt-3 text-sm ${backupStatus.includes('Error') ? 'text-red-600' : 'text-emerald-600'}`}>
                  {backupStatus}
                </p>
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex gap-2">
                <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-amber-800">Automated backups are also running daily at 6 AM IST.</p>
                  <p className="text-xs text-amber-600 mt-1">Backups are saved to the Daily Dash EHRC/backups folder. This manual download is an additional safety measure.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SCHEMA TAB */}
        {activeTab === 'schema' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Database Schema</h2>
                  {dbSize && <p className="text-sm text-slate-500">Total size: {dbSize}</p>}
                </div>
                <button
                  onClick={loadSchema}
                  disabled={schemaLoading}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium text-slate-600 transition-colors"
                >
                  {schemaLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              {tables.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 px-3 font-semibold text-slate-600">Table</th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-600">Rows</th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-600">Size</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tables.map((t, i) => (
                        <tr key={t.table_name} className={i % 2 === 0 ? 'bg-slate-50' : ''}>
                          <td className="py-2 px-3 font-mono text-xs text-blue-900">{t.table_name}</td>
                          <td className="py-2 px-3 text-right text-slate-700">{t.row_count.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-slate-500">{t.size_pretty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {migrations.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-4">Applied Migrations</h2>
                <div className="space-y-2">
                  {migrations.map(m => (
                    <div key={m.version} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-emerald-50 border border-emerald-100">
                      <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-slate-900">v{m.version}: {m.name}</span>
                      </div>
                      <span className="text-xs text-slate-500 flex-shrink-0">
                        {new Date(m.applied_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CONTACTS TAB */}
        {activeTab === 'contacts' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Department Contacts</h2>
                <p className="text-sm text-slate-500">Edit department head names, emails, and phone numbers</p>
              </div>
              <button
                onClick={loadContacts}
                disabled={contactsLoading}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium text-slate-600 transition-colors"
              >
                {contactsLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {saveStatus && (
              <p className={`mb-3 text-xs ${saveStatus.includes('Error') ? 'text-red-600' : 'text-emerald-600'}`}>{saveStatus}</p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 font-semibold text-slate-600">Department</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-600">Head</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-600">Email</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-600">Phone</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-600">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c, i) => (
                    <tr key={c.id} className={i % 2 === 0 ? 'bg-slate-50' : ''}>
                      <td className="py-2 px-3 font-medium text-slate-900">{c.department_name}</td>
                      {editingId === c.id ? (
                        <>
                          <td className="py-1 px-2">
                            <input
                              value={editForm.head_name}
                              onChange={e => setEditForm({ ...editForm, head_name: e.target.value })}
                              className="w-full px-2 py-1 border rounded text-xs"
                            />
                          </td>
                          <td className="py-1 px-2">
                            <input
                              value={editForm.email}
                              onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                              className="w-full px-2 py-1 border rounded text-xs"
                            />
                          </td>
                          <td className="py-1 px-2">
                            <input
                              value={editForm.phone}
                              onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                              className="w-full px-2 py-1 border rounded text-xs"
                            />
                          </td>
                          <td className="py-1 px-2 text-right space-x-1">
                            <button onClick={() => saveContact(c.department_slug)} className="px-2 py-1 bg-emerald-500 text-white rounded text-xs hover:bg-emerald-600">Save</button>
                            <button onClick={() => setEditingId(null)} className="px-2 py-1 bg-slate-200 text-slate-600 rounded text-xs hover:bg-slate-300">Cancel</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 px-3 text-slate-700">{c.head_name || <span className="text-slate-300 italic">Not set</span>}</td>
                          <td className="py-2 px-3 text-slate-700 text-xs">{c.email || <span className="text-slate-300 italic">Not set</span>}</td>
                          <td className="py-2 px-3 text-slate-700 text-xs">{c.phone || <span className="text-slate-300 italic">Not set</span>}</td>
                          <td className="py-2 px-3 text-right">
                            <button onClick={() => startEdit(c)} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100">Edit</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SYNC TAB */}
        {activeTab === 'sync' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Google Sheets Sync</h2>
              <p className="text-sm text-slate-500 mb-6">
                Manually trigger a sync of all 17 department Google Sheets. This pulls the latest data and upserts it into the database.
                The automatic sync runs on a cron schedule, but you can trigger it here if you need data updated immediately.
              </p>
              <button
                onClick={handleSync}
                disabled={syncLoading}
                className={`px-6 py-3 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  syncLoading
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-teal-600 text-white hover:bg-teal-500 shadow-sm'
                }`}
              >
                {syncLoading ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                {syncLoading ? 'Syncing...' : 'Sync All Departments Now'}
              </button>
              {syncResult && (
                <p className={`mt-3 text-sm ${syncResult.includes('error') || syncResult.includes('failed') ? 'text-red-600' : 'text-emerald-600'}`}>
                  {syncResult}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
