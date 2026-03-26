'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { DaySnapshot } from '@/lib/types';
import { FORM_DEFINITIONS } from '@/lib/form-definitions';
import CalendarPicker from '@/components/CalendarPicker';
import DepartmentPanel from '@/components/DepartmentPanel';
import ExecutiveSummary from '@/components/ExecutiveSummary';
import FileUpload from '@/components/FileUpload';
import HuddleSummaryViewer from '@/components/HuddleSummaryViewer';
import SubmissionHeatmap from '@/components/SubmissionHeatmap';
import TrendCharts from '@/components/TrendCharts';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Home() {
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [snapshot, setSnapshot] = useState<DaySnapshot | null>(null);
  const [allSnapshots, setAllSnapshots] = useState<DaySnapshot[]>([]);
  const [activeDept, setActiveDept] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [activeTab, setActiveTab] = useState<'department' | 'trends' | 'heatmap'>('department');
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const fetchDays = useCallback(async () => {
    const res = await fetch('/api/days');
    const data = await res.json();
    setAvailableDays(data.days || []);
    if (data.days?.length && !data.days.includes(selectedDate)) {
      setSelectedDate(data.days[0]);
    }
  }, []);

  const fetchDay = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/days?date=${date}`);
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data);
        if (!activeDept) {
          setActiveDept(FORM_DEFINITIONS[0].slug);
        }
      } else {
        setSnapshot(null);
      }
    } catch {
      setSnapshot(null);
    }
    setLoading(false);
  }, [activeDept]);

  // Fetch all snapshots for trends and heatmap
  const fetchAllSnapshots = useCallback(async () => {
    const res = await fetch('/api/days');
    const data = await res.json();
    const days: string[] = data.days || [];
    const snapshots: DaySnapshot[] = [];
    for (const day of days) {
      try {
        const r = await fetch(`/api/days?date=${day}`);
        if (r.ok) snapshots.push(await r.json());
      } catch { /* skip */ }
    }
    snapshots.sort((a, b) => a.date.localeCompare(b.date));
    setAllSnapshots(snapshots);
  }, []);

  // Use refs to break the dependency cycle for sync
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;

  // Sync from Google Sheets — stable function that won't cause re-render loops
  const syncFromSheets = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch('/api/sheets-sync');
      if (res.ok) {
        const data = await res.json();
        setLastSync(new Date().toLocaleTimeString());
        // Refresh data after sync
        const daysRes = await fetch('/api/days');
        const daysData = await daysRes.json();
        setAvailableDays(daysData.days || []);

        const currentDate = selectedDateRef.current;
        const dayRes = await fetch(`/api/days?date=${currentDate}`);
        if (dayRes.ok) {
          const dayData = await dayRes.json();
          setSnapshot(dayData);
        }

        // Refresh all snapshots for trends/heatmap
        const allDays: string[] = daysData.days || [];
        const snaps: DaySnapshot[] = [];
        for (const day of allDays) {
          try {
            const r = await fetch(`/api/days?date=${day}`);
            if (r.ok) snaps.push(await r.json());
          } catch { /* skip */ }
        }
        snaps.sort((a, b) => a.date.localeCompare(b.date));
        setAllSnapshots(snaps);

        if (data.datesUpdated === 0) {
          setSyncError('Synced but no new data found');
        }
      } else {
        setSyncError('Sync failed');
      }
    } catch {
      setSyncError('Sync failed — check network');
    }
    setSyncing(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set initial date on client to avoid hydration mismatch
  useEffect(() => { if (!selectedDate) setSelectedDate(todayStr()); }, []);

  useEffect(() => { fetchDays(); fetchAllSnapshots(); }, [fetchDays, fetchAllSnapshots]);
  useEffect(() => { if (selectedDate) fetchDay(selectedDate); }, [selectedDate, fetchDay]);

  // Auto-sync from Google Sheets every 5 minutes — runs once on mount
  useEffect(() => {
    syncFromSheets();
    const interval = setInterval(syncFromSheets, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [syncFromSheets]);

  const activeDeptData = snapshot?.departments.find(d => d.slug === activeDept);
  const activeFormDef = FORM_DEFINITIONS.find(d => d.slug === activeDept);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">EHRC Daily Dashboard</h1>
            <p className="text-xs text-gray-500">Even Hospital, Race Course Road &middot; Morning Meeting Tracker</p>
          </div>
          <div className="flex items-center gap-3">
            {lastSync && (
              <span className="text-xs text-gray-400">Last sync: {lastSync}</span>
            )}
            {syncError && (
              <span className="text-xs text-amber-500">{syncError}</span>
            )}
            <button
              onClick={syncFromSheets}
              disabled={syncing}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5
                ${syncing
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
                }`}
            >
              <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <Link
              href="/sewa"
              className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Sewa
            </Link>
            <span className="text-sm font-medium text-gray-600">{selectedDate}</span>
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              {showUpload ? 'Close Upload' : 'Upload Data'}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Upload Panel */}
        {showUpload && (
          <div className="mb-6">
            <FileUpload selectedDate={selectedDate} onUploadComplete={() => { fetchDay(selectedDate); fetchDays(); fetchAllSnapshots(); }} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            <CalendarPicker availableDays={availableDays} selectedDate={selectedDate} onSelect={setSelectedDate} />

            {/* Department Nav */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-3 border-b bg-gray-50">
                <h3 className="font-semibold text-gray-700 text-sm">Departments</h3>
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                {FORM_DEFINITIONS.map(dept => {
                  const hasData = snapshot?.departments.some(d => d.slug === dept.slug);
                  return (
                    <button
                      key={dept.slug}
                      onClick={() => { setActiveDept(dept.slug); setActiveTab('department'); }}
                      className={`w-full text-left px-3 py-2 text-sm border-b last:border-0 transition-colors flex items-center gap-2
                        ${activeDept === dept.slug && activeTab === 'department' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}
                      `}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasData ? 'bg-green-400' : 'bg-red-300'}`} />
                      <span className="truncate">{dept.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {loading ? (
              <div className="text-center py-20 text-gray-400">Loading...</div>
            ) : (
              <>
                {/* Executive Summary (always show if snapshot exists) */}
                {snapshot && <ExecutiveSummary snapshot={snapshot} />}

                {/* Tab Bar */}
                <div className="flex gap-2 border-b border-gray-200 pb-0">
                  <button
                    onClick={() => setActiveTab('department')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'department' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {activeFormDef?.name || 'Department'}
                  </button>
                  <button
                    onClick={() => setActiveTab('trends')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'trends' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Trends
                  </button>
                  <button
                    onClick={() => setActiveTab('heatmap')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'heatmap' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Submission Heatmap
                  </button>
                </div>

                {/* Tab Content */}
                {activeTab === 'department' && (
                  <>
                    {activeDeptData ? (
                      <div>
                        <div className="flex items-center gap-3 mb-3">
                          <h2 className="text-lg font-bold text-gray-900">{activeDeptData.name}</h2>
                          {activeFormDef?.description && (
                            <span className="text-xs text-gray-500">{activeFormDef.description}</span>
                          )}
                        </div>
                        <DepartmentPanel dept={activeDeptData} />
                      </div>
                    ) : activeDept && activeFormDef ? (
                      <div>
                        <h2 className="text-lg font-bold text-gray-900 mb-3">{activeFormDef.name || activeFormDef.department}</h2>
                        <DepartmentPanel dept={{ name: activeFormDef.name || activeFormDef.department, slug: activeFormDef.slug, tab: activeFormDef.tab || '', entries: [] }} />
                      </div>
                    ) : null}
                  </>
                )}

                {activeTab === 'trends' && (
                  <TrendCharts snapshots={allSnapshots} />
                )}

                {activeTab === 'heatmap' && (
                  <SubmissionHeatmap snapshots={allSnapshots} currentMonth={selectedDate.substring(0, 7)} />
                )}

                {/* Huddle Summaries (always show below active tab if they exist) */}
                {snapshot?.huddleSummaries && snapshot.huddleSummaries.length > 0 && (
                  <HuddleSummaryViewer summaries={snapshot.huddleSummaries} />
                )}

                {/* No data at all message */}
                {!snapshot && (
                  <div className="text-center py-20">
                    <p className="text-gray-500 text-lg">No data for {selectedDate}</p>
                    <p className="text-gray-400 text-sm mt-2">Upload department CSV/Excel files to get started.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
