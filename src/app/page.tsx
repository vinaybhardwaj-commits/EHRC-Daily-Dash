'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DaySnapshot } from '@/lib/types';
import { FORM_DEFINITIONS } from '@/lib/form-definitions';
import CalendarPicker from '@/components/CalendarPicker';
import DepartmentPanel from '@/components/DepartmentPanel';
import ExecutiveSummary from '@/components/ExecutiveSummary';
import FileUpload from '@/components/FileUpload';
import HuddleSummaryViewer from '@/components/HuddleSummaryViewer';
import SubmissionHeatmap from '@/components/SubmissionHeatmap';
import TrendCharts from '@/components/TrendCharts';
import DepartmentForms from '@/components/DepartmentForms';
import MonthlyOverview from '@/components/MonthlyOverview';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Home() {
  const [view, setView] = useState<'overview' | 'dashboard'>('overview');
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [snapshot, setSnapshot] = useState<DaySnapshot | null>(null);
  const [allSnapshots, setAllSnapshots] = useState<DaySnapshot[]>([]);
  const [activeDept, setActiveDept] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [activeTab, setActiveTab] = useState<'department' | 'trends' | 'heatmap' | 'forms'>('department');
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [mounted, setMounted] = useState(false);

  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;

  useEffect(() => { setMounted(true); }, []);

  const fetchDays = useCallback(async () => {
    const res = await fetch('/api/days');
    const data = await res.json();
    const days: string[] = data.days || [];
    setAvailableDays(days);
    if (days.length) {
      const today = todayStr();
      if (days.includes(today)) {
        setSelectedDate(today);
      } else if (!days.includes(selectedDateRef.current)) {
        setSelectedDate(days[0]);
      }
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

  const syncFromSheets = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch('/api/sheets-sync');
      if (res.ok) {
        const data = await res.json();
        setLastSync(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
        const daysRes = await fetch('/api/days');
        const daysData = await daysRes.json();
        setAvailableDays(daysData.days || []);

        const currentDate = selectedDateRef.current;
        const dayRes = await fetch(`/api/days?date=${currentDate}`);
        if (dayRes.ok) {
          setSnapshot(await dayRes.json());
        }

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
          setSyncError('No new data found');
        }
      } else {
        setSyncError('Sync failed');
      }
    } catch {
      setSyncError('Network error');
    }
    setSyncing(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (!selectedDate) setSelectedDate(todayStr()); }, []);
  useEffect(() => { fetchDays(); fetchAllSnapshots(); }, [fetchDays, fetchAllSnapshots]);
  useEffect(() => { if (selectedDate) fetchDay(selectedDate); }, [selectedDate, fetchDay]);
  useEffect(() => {
    syncFromSheets();
    const interval = setInterval(syncFromSheets, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [syncFromSheets]);

  const activeDeptData = snapshot?.departments.find(d => d.slug === activeDept);
  const activeFormDef = FORM_DEFINITIONS.find(d => d.slug === activeDept);
  const submittedCount = snapshot?.departments.length || 0;
  const totalDepts = FORM_DEFINITIONS.length;

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Navigation Bar */}
      <nav className="bg-gradient-to-r from-blue-900 to-blue-950 text-white sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <span className="font-bold text-sm sm:text-base tracking-tight">EHRC</span>
          </div>
          <div className="flex items-center gap-1 bg-white/10 rounded-lg p-0.5">
            <button
              onClick={() => setView('overview')}
              className={`px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                view === 'overview'
                  ? 'bg-white text-blue-900 shadow-sm'
                  : 'text-blue-200 hover:text-white hover:bg-white/10'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setView('dashboard')}
              className={`px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                view === 'dashboard'
                  ? 'bg-white text-blue-900 shadow-sm'
                  : 'text-blue-200 hover:text-white hover:bg-white/10'
              }`}
            >
              Daily Dashboard
            </button>
          </div>
          <div className="w-16 sm:w-20" /> {/* Spacer for balance */}
        </div>
      </nav>

      {/* Overview View */}
      {view === 'overview' && (
        <MonthlyOverview onNavigateToDashboard={() => setView('dashboard')} />
      )}

      {/* Dashboard View */}
      {view === 'dashboard' && (<>
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-800 to-blue-900 text-white sticky top-[44px] z-40 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3">
          {/* Top row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Mobile hamburger */}
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showSidebar ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
                </svg>
              </button>
              <div>
                <h1 className="text-lg sm:text-xl font-bold tracking-tight">EHRC Daily Dashboard</h1>
                <p className="text-blue-200 text-xs hidden sm:block">Even Hospital, Race Course Road</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Sync status */}
              {mounted && lastSync && (
                <span className="text-blue-200 text-xs hidden sm:inline">
                  Synced {lastSync}
                </span>
              )}
              {syncError && (
                <span className="text-amber-300 text-xs hidden sm:inline">{syncError}</span>
              )}
              {/* Sync button */}
              <button
                onClick={syncFromSheets}
                disabled={syncing}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5
                  ${syncing
                    ? 'bg-white/10 text-white/50 cursor-not-allowed'
                    : 'bg-teal-500 hover:bg-teal-400 text-white shadow-sm'
                  }`}
              >
                <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="hidden sm:inline">{syncing ? 'Syncing...' : 'Sync'}</span>
              </button>
              {/* Upload button */}
              <button
                onClick={() => setShowUpload(!showUpload)}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5
                  ${showUpload ? 'bg-white text-blue-800' : 'bg-white/15 hover:bg-white/25 text-white'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span className="hidden sm:inline">{showUpload ? 'Close' : 'Upload'}</span>
              </button>
            </div>
          </div>
          {/* Date bar */}
          <div className="mt-2 flex items-center gap-3 text-sm">
            <span className="bg-white/15 px-3 py-1 rounded-full text-xs font-medium">
              {formatDisplayDate(selectedDate)}
            </span>
            <span className="text-blue-200 text-xs">
              {submittedCount}/{totalDepts} departments reported
            </span>
          </div>
        </div>
      </header>

      {/* Upload Panel */}
      {showUpload && (
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <FileUpload selectedDate={selectedDate} onUploadComplete={() => { fetchDay(selectedDate); fetchDays(); fetchAllSnapshots(); }} />
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
        <div className="flex gap-6">
          {/* Sidebar â hidden on mobile, slide-in overlay */}
          {showSidebar && (
            <div className="fixed inset-0 bg-black/50 z-50 lg:hidden" onClick={() => setShowSidebar(false)}>
              <div className="w-72 h-full bg-white shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b bg-slate-50">
                  <h3 className="font-semibold text-slate-700 text-sm">Select Date & Department</h3>
                </div>
                <div className="p-3">
                  <CalendarPicker availableDays={availableDays} selectedDate={selectedDate} onSelect={(d) => { setSelectedDate(d); setShowSidebar(false); }} />
                </div>
                <div className="border-t">
                  <div className="p-3 bg-slate-50">
                    <h4 className="font-semibold text-slate-600 text-xs uppercase tracking-wider">Departments</h4>
                  </div>
                  {FORM_DEFINITIONS.map(dept => {
                    const hasData = snapshot?.departments.some(d => d.slug === dept.slug);
                    return (
                      <button
                        key={dept.slug}
                        onClick={() => { setActiveDept(dept.slug); setActiveTab('department'); setShowSidebar(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm border-b border-slate-100 transition-colors flex items-center gap-2.5
                          ${activeDept === dept.slug ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'}
                        `}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasData ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        <span className="truncate">{dept.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Desktop sidebar */}
          <div className="hidden lg:block w-64 flex-shrink-0 space-y-4">
            <CalendarPicker availableDays={availableDays} selectedDate={selectedDate} onSelect={setSelectedDate} />

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-3 border-b bg-slate-50">
                <h3 className="font-semibold text-slate-600 text-xs uppercase tracking-wider">Departments</h3>
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                {FORM_DEFINITIONS.map(dept => {
                  const hasData = snapshot?.departments.some(d => d.slug === dept.slug);
                  return (
                    <button
                      key={dept.slug}
                      onClick={() => { setActiveDept(dept.slug); setActiveTab('department'); }}
                      className={`w-full text-left px-3.5 py-2.5 text-sm border-b border-slate-100 last:border-0 transition-all flex items-center gap-2.5
                        ${activeDept === dept.slug && activeTab === 'department'
                          ? 'bg-blue-50 text-blue-700 font-semibold border-l-3 border-l-blue-600'
                          : 'text-slate-700 hover:bg-slate-50'}
                      `}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${hasData ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <span className="truncate">{dept.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0 space-y-5">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                  <svg className="w-8 h-8 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-slate-400 text-sm">Loading dashboard...</p>
                </div>
              </div>
            ) : (
              <>
                {snapshot && <ExecutiveSummary snapshot={snapshot} />}

                {/* Tab Bar */}
                <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                  {([
                    { key: 'department' as const, label: activeFormDef?.name || 'Department', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
                    { key: 'trends' as const, label: 'Trends', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
                    { key: 'heatmap' as const, label: 'Heatmap', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
                    { key: 'forms' as const, label: 'Forms', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
                  ]).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all
                        ${activeTab === tab.key
                          ? 'bg-white text-blue-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                      <svg className="w-4 h-4 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={tab.icon} />
                      </svg>
                      <span className="truncate">{tab.label}</span>
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                {activeTab === 'department' && (
                  <>
                    {activeDeptData ? (
                      <div>
                        <div className="flex items-center gap-3 mb-4">
                          <h2 className="text-lg sm:text-xl font-bold text-slate-900">{activeDeptData.name}</h2>
                          {activeFormDef?.description && (
                            <span className="text-xs text-slate-400 hidden sm:inline">{activeFormDef.description}</span>
                          )}
                        </div>
                        <DepartmentPanel dept={activeDeptData} />
                      </div>
                    ) : activeDept && activeFormDef ? (
                      <div>
                        <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-4">{activeFormDef.name || activeFormDef.department}</h2>
                        <DepartmentPanel dept={{ name: activeFormDef.name || activeFormDef.department, slug: activeFormDef.slug, tab: activeFormDef.tab || '', entries: [] }} />
                      </div>
                    ) : null}
                  </>
                )}

                {activeTab === 'trends' && <TrendCharts snapshots={allSnapshots} />}
                {activeTab === 'heatmap' && <SubmissionHeatmap snapshots={allSnapshots} currentMonth={selectedDate.substring(0, 7)} />}
                {activeTab === 'forms' && (
                  <DepartmentForms submittedSlugs={snapshot?.departments.map(d => d.slug) || []} />
                )}

                {snapshot?.huddleSummaries && snapshot.huddleSummaries.length > 0 && (
                  <HuddleSummaryViewer summaries={snapshot.huddleSummaries} />
                )}

                {!snapshot && (
                  <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
                    <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-slate-500 text-lg font-medium">No data for {formatDisplayDate(selectedDate)}</p>
                    <p className="text-slate-400 text-sm mt-1">Click Sync or upload department data to get started.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      </>)}
    </div>
  );
}
