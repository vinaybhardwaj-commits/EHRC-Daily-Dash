'use client';

import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Minus,
} from 'lucide-react';

interface TrendHighlight {
  field: string;
  label: string;
  direction: string;
  severity: 'good' | 'warning' | 'concern' | 'neutral';
  text: string;
}

interface TrendNarrative {
  slug: string;
  department_name: string;
  summary: string;
  highlights: TrendHighlight[];
  data_days: number;
  generated_by: 'qwen' | 'template';
}

interface TrendSummary {
  concerns: number;
  warnings: number;
  positive: number;
  total_highlights: number;
}

const SEVERITY_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  concern: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: <TrendingDown className="w-3.5 h-3.5 text-red-500" /> },
  warning: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: <Activity className="w-3.5 h-3.5 text-amber-500" /> },
  good: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', icon: <TrendingUp className="w-3.5 h-3.5 text-green-500" /> },
  neutral: { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-600', icon: <Minus className="w-3.5 h-3.5 text-gray-400" /> },
};

interface TrendInsightsCardProps {
  date: string;
}

export default function TrendInsightsCard({ date }: TrendInsightsCardProps) {
  const [narratives, setNarratives] = useState<TrendNarrative[] | null>(null);
  const [summary, setSummary] = useState<TrendSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDept, setExpandedDept] = useState<string | null>(null);

  async function runAnalysis(useAI = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai-questions/trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, lookbackDays: 14, useAI }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setNarratives(data.departments || []);
      setSummary(data.summary || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6">
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-xl px-5 py-3">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-teal-600" />
          <span className="text-sm font-semibold text-gray-800">Trend Intelligence</span>
          {summary && (
            <>
              {summary.concerns > 0 && (
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                  <AlertTriangle className="w-3 h-3" />
                  {summary.concerns} concern{summary.concerns !== 1 ? 's' : ''}
                </span>
              )}
              {summary.positive > 0 && (
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                  <CheckCircle className="w-3 h-3" />
                  {summary.positive} positive
                </span>
              )}
              {summary.warnings > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                  {summary.warnings} volatile
                </span>
              )}
            </>
          )}
          {narratives !== null && narratives.length === 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
              Insufficient data
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => runAnalysis(false)}
            disabled={loading}
            className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <BarChart3 className="w-3 h-3" />
                {narratives !== null ? 'Refresh' : 'Analyze Trends'}
              </>
            )}
          </button>
          {narratives !== null && !loading && (
            <button
              onClick={() => runAnalysis(true)}
              disabled={loading}
              className="flex items-center gap-2 text-[10px] font-medium px-2 py-1 rounded-md border border-teal-300 text-teal-700 hover:bg-teal-50 transition-colors"
              title="Re-run with Qwen AI narratives (slower)"
            >
              AI Enhance
            </button>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mt-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {error}
        </div>
      )}

      {/* ── Department trend cards ── */}
      {narratives !== null && narratives.length > 0 && (
        <div className="mt-2 bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
          {narratives.map(narrative => {
            const isExpanded = expandedDept === narrative.slug;
            const concernCount = narrative.highlights.filter(h => h.severity === 'concern').length;
            const goodCount = narrative.highlights.filter(h => h.severity === 'good').length;

            return (
              <div key={narrative.slug}>
                {/* ── Dept summary row ── */}
                <button
                  onClick={() => setExpandedDept(isExpanded ? null : narrative.slug)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">
                        {narrative.department_name}
                      </span>
                      {narrative.generated_by === 'qwen' && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-teal-50 text-teal-600 font-medium border border-teal-200">
                          AI
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate pr-4">
                      {narrative.summary}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {concernCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
                        {concernCount} concern{concernCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {goodCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">
                        {goodCount} positive
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400">
                      {narrative.data_days}d
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* ── Expanded highlights ── */}
                {isExpanded && narrative.highlights.length > 0 && (
                  <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 space-y-2">
                    {narrative.highlights.map((h, i) => {
                      const style = SEVERITY_STYLES[h.severity] || SEVERITY_STYLES.neutral;
                      return (
                        <div
                          key={i}
                          className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${style.bg}`}
                        >
                          <span className="mt-0.5 flex-shrink-0">{style.icon}</span>
                          <div className="min-w-0">
                            <span className={`text-xs font-semibold ${style.text}`}>
                              {h.label}
                            </span>
                            <p className="text-xs text-gray-600 mt-0.5">{h.text}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {isExpanded && narrative.highlights.length === 0 && (
                  <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
                    <p className="text-xs text-gray-400 italic">All metrics stable — no notable trends.</p>
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
