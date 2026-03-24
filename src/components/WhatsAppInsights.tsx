'use client';

import { useState, useEffect, useCallback } from 'react';

interface WAEntry {
  date: string;
  slug: string;
  deptName: string;
  fieldLabel: string;
  value: string | number;
  sourceGroup: string;
  sourceSender: string;
  sourceTime: string;
  confidence: string;
  context: string;
}

interface WAGlobalIssue {
  date: string;
  issueId: string;
  issueLabel: string;
  details: string;
  slug: string;
  severity: string;
}

interface DeptGroup {
  slug: string;
  name: string;
  entries: WAEntry[];
  count: number;
}

interface InsightsData {
  month: string;
  availableMonths: string[];
  totalEntries: number;
  totalGlobalIssues: number;
  confidenceCounts: { high: number; medium: number; low: number };
  departments: DeptGroup[];
  globalIssues: WAGlobalIssue[];
  uniqueDates: string[];
  uniqueGroups: string[];
}

interface Props {
  onNavigateToDashboard: (date: string, slug: string) => void;
}

const confidenceColor: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  high: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  low: { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200', dot: 'bg-slate-400' },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export default function WhatsAppInsights({ onNavigateToDashboard }: Props) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [expandedIssues, setExpandedIssues] = useState(true);
  const [showLow, setShowLow] = useState(false);
  const [filterDept, setFilterDept] = useState<string>('all');

  const fetchData = useCallback(async (month?: string) => {
    setLoading(true);
    try {
      const url = month ? `/api/whatsapp-insights?month=${month}` : '/api/whatsapp-insights';
      const res = await fetch(url);
      if (res.ok) {
        const d = await res.json();
        setData(d);
        if (!selectedMonth && d.month) setSelectedMonth(d.month);
        // Auto-expand departments with data
        const deptSlugs = new Set<string>(d.departments.map((dept: DeptGroup) => dept.slug));
        setExpandedDepts(deptSlugs);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [selectedMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
    fetchData(month);
  };

  const toggleDept = (slug: string) => {
    setExpandedDepts(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 text-green-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-slate-400 text-sm">Loading WhatsApp insights...</p>
        </div>
      </div>
    );
  }

  if (!data || data.totalEntries === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-slate-500 text-lg font-medium">No WhatsApp chat data yet</p>
          <p className="text-slate-400 text-sm mt-2 max-w-md mx-auto">
            Export WhatsApp chats, analyze them using the EHRC rubric in a Claude thread, then upload the structured .md file via the Daily Dashboard upload panel.
          </p>
        </div>
      </div>
    );
  }

  const filteredDepts = filterDept === 'all'
    ? data.departments
    : data.departments.filter(d => d.slug === filterDept);

  // Split entries by confidence for grouping
  const getEntriesByConfidence = (entries: WAEntry[]) => ({
    high: entries.filter(e => e.confidence === 'high'),
    medium: entries.filter(e => e.confidence === 'medium'),
    low: entries.filter(e => e.confidence === 'low'),
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500" />
            WhatsApp Insights
          </h1>
          <p className="text-sm text-slate-500 mt-1">Operational data extracted from hospital WhatsApp groups</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Month selector */}
          <select
            value={selectedMonth}
            onChange={e => handleMonthChange(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {data.availableMonths.map(m => (
              <option key={m} value={m}>{formatMonthLabel(m)}</option>
            ))}
          </select>
          {/* Department filter */}
          <select
            value={filterDept}
            onChange={e => setFilterDept(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="all">All Departments</option>
            {data.departments.map(d => (
              <option key={d.slug} value={d.slug}>{d.name} ({d.count})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Total Entries" value={data.totalEntries} color="green" />
        <StatCard label="Global Issues" value={data.totalGlobalIssues} color="red" />
        <StatCard label="High Conf." value={data.confidenceCounts.high} color="emerald" />
        <StatCard label="Medium Conf." value={data.confidenceCounts.medium} color="amber" />
        <StatCard label="Low Conf." value={data.confidenceCounts.low} color="slate" />
      </div>

      {/* Source Groups */}
      {data.uniqueGroups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-slate-400 py-1">Sources:</span>
          {data.uniqueGroups.map(g => (
            <span key={g} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
              {g}
            </span>
          ))}
        </div>
      )}

      {/* Global Issues Section */}
      {data.globalIssues.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setExpandedIssues(!expandedIssues)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <h2 className="font-semibold text-slate-900">Global Issues Flagged</h2>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">{data.globalIssues.length}</span>
            </div>
            <svg className={`w-5 h-5 text-slate-400 transition-transform ${expandedIssues ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expandedIssues && (
            <div className="border-t border-slate-100 divide-y divide-slate-100">
              {data.globalIssues.map((issue, idx) => (
                <button
                  key={idx}
                  onClick={() => onNavigateToDashboard(issue.date, issue.slug)}
                  className="w-full text-left px-5 py-3 hover:bg-slate-50 transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${issue.severity === 'red' ? 'bg-red-500' : 'bg-amber-500'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-900">{issue.issueLabel}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          issue.severity === 'red' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                        }`}>{issue.severity}</span>
                        <span className="text-xs text-slate-400">{formatDate(issue.date)}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{issue.details}</p>
                    </div>
                    <svg className="w-4 h-4 text-slate-300 group-hover:text-blue-500 flex-shrink-0 mt-1 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Department Sections */}
      {filteredDepts.map(dept => {
        const isExpanded = expandedDepts.has(dept.slug);
        const byConf = getEntriesByConfidence(dept.entries);

        return (
          <div key={dept.slug} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Department Header */}
            <button
              onClick={() => toggleDept(dept.slug)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <h2 className="font-semibold text-slate-900">{dept.name}</h2>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">{dept.count} entries</span>
              </div>
              <svg className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isExpanded && (
              <div className="border-t border-slate-100">
                {/* High Confidence */}
                {byConf.high.length > 0 && (
                  <ConfidenceSection
                    level="high"
                    label="High Confidence"
                    entries={byConf.high}
                    defaultOpen={true}
                    onNavigate={onNavigateToDashboard}
                  />
                )}

                {/* Medium Confidence */}
                {byConf.medium.length > 0 && (
                  <ConfidenceSection
                    level="medium"
                    label="Medium Confidence"
                    entries={byConf.medium}
                    defaultOpen={true}
                    onNavigate={onNavigateToDashboard}
                  />
                )}

                {/* Low Confidence */}
                {byConf.low.length > 0 && (
                  <ConfidenceSection
                    level="low"
                    label="Low Confidence"
                    entries={byConf.low}
                    defaultOpen={showLow}
                    onNavigate={onNavigateToDashboard}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Low confidence toggle */}
      {data.confidenceCounts.low > 0 && (
        <div className="text-center">
          <button
            onClick={() => setShowLow(!showLow)}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showLow ? 'Collapse' : 'Expand'} low-confidence entries ({data.confidenceCounts.low} items)
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────── */

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    slate: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  return (
    <div className={`rounded-xl border p-3 text-center ${colorMap[color] || colorMap.slate}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wider mt-0.5 opacity-75">{label}</p>
    </div>
  );
}

function ConfidenceSection({
  level,
  label,
  entries,
  defaultOpen,
  onNavigate,
}: {
  level: string;
  label: string;
  entries: WAEntry[];
  defaultOpen: boolean;
  onNavigate: (date: string, slug: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const colors = confidenceColor[level] || confidenceColor.medium;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 px-5 py-2.5 text-xs font-medium uppercase tracking-wider ${colors.bg} ${colors.text} hover:opacity-80 transition-opacity`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
        {label} ({entries.length})
        <svg className={`w-3.5 h-3.5 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="divide-y divide-slate-100">
          {entries.map((entry, idx) => (
            <button
              key={idx}
              onClick={() => onNavigate(entry.date, entry.slug)}
              className="w-full text-left px-5 py-3 hover:bg-blue-50/50 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-slate-400">{formatDate(entry.date)}</span>
                    {entry.sourceTime && <span className="text-xs text-slate-300">{entry.sourceTime}</span>}
                  </div>
                  <p className="text-sm font-medium text-slate-800 mt-0.5">{entry.fieldLabel}</p>
                  <p className="text-sm text-slate-900 font-semibold">
                    {typeof entry.value === 'number' ? entry.value.toLocaleString('en-IN') : entry.value}
                  </p>
                  {entry.context && (
                    <p className="text-xs text-slate-400 mt-1 italic truncate">&ldquo;{entry.context}&rdquo;</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {entry.sourceSender && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{entry.sourceSender}</span>
                    )}
                    {entry.sourceGroup && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-200">{entry.sourceGroup}</span>
                    )}
                  </div>
                </div>
                <svg className="w-4 h-4 text-slate-300 group-hover:text-blue-500 flex-shrink-0 mt-2 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
