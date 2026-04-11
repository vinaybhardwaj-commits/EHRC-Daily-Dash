'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface UserRecord {
  id: number;
  email: string;
  display_name: string;
  role: string;
  department_slug: string | null;
  is_huddle_recorder: boolean;
  is_active: boolean;
  created_at: string;
}

export default function HuddleRecordersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);
  const [error, setError] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/huddle/recorders');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const toggleRecorder = async (userId: number, current: boolean) => {
    setToggling(userId);
    setError('');
    try {
      const res = await fetch('/api/huddle/recorders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, is_huddle_recorder: !current }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Toggle failed');
      }

      // Update local state
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, is_huddle_recorder: !current } : u
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed');
    } finally {
      setToggling(null);
    }
  };

  const recorderCount = users.filter((u) => u.is_huddle_recorder).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Huddle Recorders</h1>
            <p className="text-xs text-slate-500">
              {recorderCount} user{recorderCount !== 1 ? 's' : ''} can record huddles
            </p>
          </div>
          <Link href="/admin" className="text-sm text-blue-600 hover:text-blue-800">
            Admin
          </Link>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          {loading ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">
              No users found. Users are created when they first log in.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {users.map((user) => (
                <div key={user.id} className="px-5 py-3 flex items-center gap-3">
                  {/* User info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 flex items-center gap-2">
                      {user.display_name}
                      {user.role === 'super_admin' && (
                        <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
                          admin
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {user.email}
                      {user.department_slug && ` · ${user.department_slug}`}
                    </div>
                  </div>

                  {/* Toggle */}
                  <button
                    onClick={() => toggleRecorder(user.id, user.is_huddle_recorder)}
                    disabled={toggling === user.id}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      user.is_huddle_recorder ? 'bg-blue-500' : 'bg-slate-200'
                    } ${toggling === user.id ? 'opacity-50' : ''}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        user.is_huddle_recorder ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-slate-400 text-center">
          Toggle the switch to grant or revoke huddle recording permission. Changes are logged.
        </p>
      </div>
    </div>
  );
}
