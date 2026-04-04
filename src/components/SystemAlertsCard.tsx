'use client';

import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ShieldAlert,
  Wrench,
  TrendingDown,
  Users,
  Loader2,
  ChevronDown,
  ChevronUp,
  Zap,
} from 'lucide-react';

interface MatchedSignal {
  department: string;
  label: string;
  matched_rule_ids: string[];
}

interface CorrelationResult {
  pattern_id: string;
  pattern_name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  matched_signals: MatchedSignal[];
  matched_count: number;
  total_signals: number;
  insight: string;
  recommendation: string;
}

const DEPT_NAMES: Record<string, string> = {
  'customer-care': 'Customer Care',
  'emergency': 'Emergency',
  'patient-safety': 'Patient Safety',
  'finance': 'Finance',
  'billing': 'Billing',
  'clinical-lab': 'Clinical Lab',
  'pharmacy': 'Pharmacy',
  'supply-chain': 'Supply Chain',
  'facility': 'Facility',
  'nursing': 'Nursing',
  'radiology': 'Radiology',
  'ot': 'OT',
  'hr-manpower': 'HR & Manpower',
  'diet': 'Diet',
  'training': 'Training',
  'biomedical': 'Biomedical',
  'it': 'IT',
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  staffing: <Users className="w-4 h-4" />,
  equipment: <Wrench className="w-4 h-4" />,
  revenue: <TrendingDown className="w-4 h-4" />,
  safety: <ShieldAlert className="w-4 h-4" />,
  operations: <Activity className="w-4 h-4" />,
};

const SEVERITY_STYLES: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  critical: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', badge: 'bg-red-100 text-red-700' },
  high: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700' },
  medium: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700' },
  low: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', badge: 'bg-gray-100 text-gray-600' },
};

interface SystemAlertsCardProps {
  date: string; // YYYY-MM-DD
}

export default function SystemAlertsCard({ date }: SystemAlertsCardProps) {
  const [results, setResults] = useState<CorrelationResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPattern, setExpandedPattern] = useState<string | null>(null);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai-questions/correlate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setResults(data.correlations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }

  const criticalCount = results?.filter(r => r.severity === 'critical').length ?? 0;
  const highCount = results?.filter(r => r.severity === 'high').length ?? 0;

  return (
    <div className="mb-6">
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl px-5 py-3">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-purple-600" />
          <span className="text-sm font-semibold text-gray-800">Cross-Department Analysis</span>
          {results !== null && results.length > 0 && (
            <>
              {criticalCount > 0 && (
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                  <AlertTriangle className="w-3 h-3" />
                  {criticalCount} critical
                </span>
              )}
              {highCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                  {highCount} high
                </span>
              )}
            </>
          )}
          {results !== null && results.length === 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
              No system-wide patterns
            </span>
          )}
        </div>

        <button
          onClick={runAnalysis}
          disabled={loading}
          className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Zap className="w-3 h-3" />
              {results !== null ? 'Re-run Analysis' : 'Run Analysis'}
            </>
          )}
        </button>
      </div>

      {/* ── Error state ── */}
      {error && (
        <div className="mt-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {error}
        </div>
      )}

      {/* ── Results ── */}
      {results !== null && results.length > 0 && (
        <div className="mt-2 bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
          {results.map(result => {
            const styles = SEVERITY_STYLES[result.severity] || SEVERITY_STYLES.medium;
            const isExpanded = expandedPattern === result.pattern_id;

            return (
              <div key={result.pattern_id}>
                {/* ── Pattern summary row ── */}
                <button
                  onClick={() => setExpandedPattern(isExpanded ? null : result.pattern_id)}
                  className={`w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left ${styles.bg}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={styles.text}>
                      {CATEGORY_ICONS[result.category] || <Activity className="w-4 h-4" />}
                    </span>
                    <div>
                      <p className={`text-sm font-medium ${styles.text}`}>
                        {result.pattern_name}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {result.matched_count} of {result.total_signals} departments affected
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${styles.badge}`}>
                      {result.severity}
                    </span>
                    <span className="text-xs text-gray-400 px-1 py-0.5 rounded bg-gray-100 font-medium">
                      {result.category}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* ── Expanded detail ── */}
                {isExpanded && (
                  <div className="px-5 py-4 bg-white border-t border-gray-100">
                    {/* Insight */}
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Insight</p>
                      <p className="text-sm text-gray-800 leading-relaxed">{result.insight}</p>
                    </div>

                    {/* Matched departments */}
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Departments Involved</p>
                      <div className="flex flex-wrap gap-1.5">
                        {result.matched_signals.map(signal => (
                          <span
                            key={signal.department}
                            className="inline-flex items-center text-xs px-2 py-1 rounded-md bg-purple-50 text-purple-700 border border-purple-100"
                          >
                            {DEPT_NAMES[signal.department] || signal.department}: {signal.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Recommendation */}
                    <div className={`p-3 rounded-lg ${styles.bg} border ${styles.border}`}>
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Recommended Action</p>
                      <p className={`text-sm ${styles.text} leading-relaxed`}>{result.recommendation}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
