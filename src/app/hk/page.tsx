'use client';

import { useState, useEffect, useCallback } from 'react';
import { HKProgressBar, HKFloorFilter, HKTaskCard } from '@/components/HKComponents';

interface ShiftData {
  id: number;
  date: string;
  shift_type: string;
  supervisor_name: string | null;
  staff_count: number | null;
}

interface TaskItem {
  id: number;
  task_name: string;
  task_category: string;
  disinfectant: string | null;
  status: 'pending' | 'done' | 'skipped';
  source: string;
  sewa_request_id: string | null;
  area_name: string;
  floor: string;
  area_id: number;
  priority: number;
}

interface ShiftSummary {
  totalTasks: number;
  doneTasks: number;
  pendingTasks: number;
  skippedTasks: number;
  overdueTasks: number;
  completionPct: number;
}

const SHIFT_LABELS: Record<string, string> = {
  AM: 'Morning (8 AM – 2 PM)',
  PM: 'Evening (2 PM – 8 PM)',
  NIGHT: 'Night (8 PM – 8 AM)',
};

export default function HKSupervisorPage() {
  const [phase, setPhase] = useState<'loading' | 'start' | 'tasks' | 'summary'>('loading');
  const [shift, setShift] = useState<ShiftData | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [selectedFloor, setSelectedFloor] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState('');

  // Form state
  const [supervisorName, setSupervisorName] = useState('');
  const [staffCount, setStaffCount] = useState('');
  const [maleCount, setMaleCount] = useState('');
  const [femaleCount, setFemaleCount] = useState('');
  const [ipCensus, setIpCensus] = useState('');

  // Check for existing shift on load
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/hk/current-shift');
        const data = await res.json();
        if (data.shift && data.summary && data.summary.totalTasks > 0) {
          setShift(data.shift);
          setSummary(data.summary);
          setPhase('tasks');
          await loadTasks();
        } else {
          setPhase('start');
        }
      } catch {
        setPhase('start');
      }
    })();
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/hk/tasks');
      const data = await res.json();
      setTasks(data.tasks || []);

      // Also refresh summary
      const summRes = await fetch('/api/hk/current-shift');
      const summData = await summRes.json();
      if (summData.summary) setSummary(summData.summary);
      if (summData.shift) setShift(summData.shift);
    } catch (e) {
      console.error('Failed to load tasks:', e);
    }
  }, []);

  const startShift = async () => {
    if (!supervisorName.trim()) return;
    setLoading(true);
    setError('');
    setLoadingMsg('Generating tasks...');

    // Progress messages to keep supervisor informed
    const progressTimer = setTimeout(() => setLoadingMsg('Setting up shift tasks...'), 3000);
    const slowTimer = setTimeout(() => setLoadingMsg('Almost done, preparing your task list...'), 8000);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s hard timeout

      const res = await fetch('/api/hk/generate-shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supervisorName: supervisorName.trim(),
          staffCount: Number(staffCount) || 0,
          maleCount: Number(maleCount) || 0,
          femaleCount: Number(femaleCount) || 0,
          ipCensus: Number(ipCensus) || 0,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (data.success) {
        setLoadingMsg('Loading tasks...');
        setPhase('tasks');
        await loadTasks();
      } else {
        setError(data.error || 'Failed to generate shift. Please try again.');
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError('Request timed out. Please check your connection and try again.');
      } else {
        setError('Connection error. Please try again.');
      }
      console.error('Failed to start shift:', e);
    }
    clearTimeout(progressTimer);
    clearTimeout(slowTimer);
    setLoading(false);
    setLoadingMsg('');
  };

  const completeTask = async (taskId: number) => {
    try {
      await fetch('/api/hk/complete-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, completedBy: shift?.supervisor_name || supervisorName || 'Supervisor' }),
      });
      // Optimistic update
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'done' as const } : t));
      setSummary(prev => prev ? { ...prev, doneTasks: prev.doneTasks + 1, pendingTasks: prev.pendingTasks - 1, completionPct: Math.round(((prev.doneTasks + 1) / prev.totalTasks) * 100) } : prev);
    } catch (e) {
      console.error('Failed to complete task:', e);
      await loadTasks(); // Reload on error
    }
  };

  const completeRoom = async (areaId: number) => {
    try {
      const res = await fetch('/api/hk/complete-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ areaId, shiftId: shift?.id, completedBy: shift?.supervisor_name || 'Supervisor' }),
      });
      const data = await res.json();
      // Optimistic update
      setTasks(prev => prev.map(t => t.area_id === areaId && t.status === 'pending' ? { ...t, status: 'done' as const } : t));
      await loadTasks(); // Full reload for accurate counts
    } catch (e) {
      console.error('Failed to complete room:', e);
      await loadTasks();
    }
  };

  const skipTask = async (taskId: number) => {
    try {
      await fetch('/api/hk/skip-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, reason: 'Skipped by supervisor' }),
      });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'skipped' as const } : t));
      setSummary(prev => prev ? { ...prev, skippedTasks: prev.skippedTasks + 1, pendingTasks: prev.pendingTasks - 1 } : prev);
    } catch (e) {
      console.error('Failed to skip task:', e);
      await loadTasks();
    }
  };

  const endShift = async () => {
    try {
      const res = await fetch('/api/hk/end-shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId: shift?.id }),
      });
      const data = await res.json();
      if (data.summary) {
        setSummary(data.summary);
        setPhase('summary');
      }
    } catch (e) {
      console.error('Failed to end shift:', e);
    }
  };

  // Auto-refresh every 60s
  useEffect(() => {
    if (phase !== 'tasks') return;
    const interval = setInterval(loadTasks, 60000);
    return () => clearInterval(interval);
  }, [phase, loadTasks]);

  // Group tasks by area
  const filteredTasks = tasks.filter(t => {
    if (selectedFloor === 'ALL') return true;
    if (selectedFloor === 'OVERDUE') return t.source === 'carryover' && t.status === 'pending';
    return t.floor === selectedFloor;
  });

  const groupedByArea = filteredTasks.reduce<Record<string, TaskItem[]>>((acc, t) => {
    const key = t.area_id + '|' + t.area_name + '|' + t.floor;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  // Sort groups: carryover first, then sewa, then by priority
  const sortedGroups = Object.entries(groupedByArea).sort((a, b) => {
    const aMin = Math.min(...a[1].map(t => t.priority));
    const bMin = Math.min(...b[1].map(t => t.priority));
    return aMin - bMin;
  });

  const floors = [...new Set(tasks.map(t => t.floor))].sort();
  const overdueCount = tasks.filter(t => t.source === 'carryover' && t.status === 'pending').length;

  const todayStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  // ── SHIFT START SCREEN ──
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading shift data...</p>
        </div>
      </div>
    );
  }

  if (phase === 'start') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-6">
          <div className="text-center mb-6">
            <div className="text-3xl mb-2">🏥</div>
            <h1 className="text-lg font-bold text-gray-900">EHRC Housekeeping</h1>
            <p className="text-sm text-gray-500">{todayStr}</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Your Name</label>
              <input
                type="text"
                value={supervisorName}
                onChange={e => setSupervisorName(e.target.value)}
                placeholder="Supervisor name"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Staff</label>
                <input type="number" value={staffCount} onChange={e => setStaffCount(e.target.value)} placeholder="0" className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Male</label>
                <input type="number" value={maleCount} onChange={e => setMaleCount(e.target.value)} placeholder="0" className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Female</label>
                <input type="number" value={femaleCount} onChange={e => setFemaleCount(e.target.value)} placeholder="0" className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">IP Census</label>
              <input type="number" value={ipCensus} onChange={e => setIpCensus(e.target.value)} placeholder="Current inpatient count" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              onClick={startShift}
              disabled={!supervisorName.trim() || loading}
              className="w-full py-3 mt-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {loadingMsg || 'Starting...'}
                </span>
              ) : 'Start Shift \u25B6'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── SHIFT SUMMARY SCREEN ──
  if (phase === 'summary' && summary) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-6">
          <div className="text-center mb-4">
            <div className="text-3xl mb-2">✅</div>
            <h1 className="text-lg font-bold text-gray-900">Shift Complete</h1>
            <p className="text-sm text-gray-500">{shift?.date} | {shift?.shift_type}</p>
          </div>

          <div className="space-y-3">
            <HKProgressBar done={summary.doneTasks} total={summary.totalTasks} label="Final completion" />

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{summary.doneTasks}</p>
                <p className="text-xs text-green-600">Completed</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-gray-700">{summary.skippedTasks}</p>
                <p className="text-xs text-gray-500">Skipped</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-orange-700">{summary.pendingTasks}</p>
                <p className="text-xs text-orange-600">Will carry over</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-700">{summary.overdueTasks}</p>
                <p className="text-xs text-red-600">Were overdue</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── TASK LIST SCREEN ──
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-sm font-bold text-gray-900">🏥 EHRC Housekeeping</h1>
            <p className="text-xs text-gray-500">{shift?.supervisor_name} | {SHIFT_LABELS[shift?.shift_type || 'PM'] || shift?.shift_type}</p>
          </div>
          <button
            onClick={endShift}
            className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-700 font-semibold hover:bg-red-100 active:bg-red-200"
          >End Shift</button>
        </div>

        {summary && (
          <HKProgressBar done={summary.doneTasks} total={summary.totalTasks} />
        )}

        <div className="mt-2">
          <HKFloorFilter floors={floors} selected={selectedFloor} onSelect={setSelectedFloor} overdueCount={overdueCount} />
        </div>
      </div>

      {/* Task cards */}
      <div className="px-4 py-3">
        {sortedGroups.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-sm">
              {selectedFloor === 'OVERDUE' ? 'No overdue tasks' : 'No tasks for this filter'}
            </p>
          </div>
        ) : (
          sortedGroups.map(([key, groupTasks]) => {
            const [areaIdStr, areaName, floor] = key.split('|');
            return (
              <HKTaskCard
                key={key}
                areaName={areaName}
                floor={floor}
                areaId={Number(areaIdStr)}
                tasks={groupTasks}
                onCompleteTask={completeTask}
                onCompleteRoom={completeRoom}
                onSkipTask={skipTask}
              />
            );
          })
        )}
      </div>

      {/* Bottom stats bar */}
      {summary && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 flex justify-around text-center">
          <div><p className="text-lg font-bold text-green-600">{summary.doneTasks}</p><p className="text-[10px] text-gray-500">Done</p></div>
          <div><p className="text-lg font-bold text-orange-500">{summary.pendingTasks}</p><p className="text-[10px] text-gray-500">Pending</p></div>
          <div><p className="text-lg font-bold text-red-500">{overdueCount}</p><p className="text-[10px] text-gray-500">Overdue</p></div>
          <div><p className="text-lg font-bold text-gray-500">{summary.skippedTasks}</p><p className="text-[10px] text-gray-500">Skipped</p></div>
        </div>
      )}
    </div>
  );
}
