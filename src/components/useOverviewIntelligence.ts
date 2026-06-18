'use client';

/* B.1b — shared client hook for the cached Overview Intelligence (B.1a).
   Reads /api/ai-intelligence/overview instantly; if the snapshot is stale it
   fires a debounced background recompute (open ?auto=1 path) and polls until the
   payload lands. Both the Trend Intelligence and Cross-Department cards use it. */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface OvHighlight {
  field: string; label: string; direction: string;
  severity: 'good' | 'warning' | 'concern' | 'neutral'; text: string;
}
export interface OvNarrative {
  slug: string; department_name: string; summary: string;
  highlights: OvHighlight[]; data_days: number; generated_by: string;
}
export interface OvPattern {
  title: string; departments: string[]; mechanism: string;
  recommendation: string; severity: 'high' | 'medium' | 'low';
}
export interface OvCrossDept {
  day_status: 'green' | 'amber' | 'red'; headline: string;
  patterns: OvPattern[]; exec_summary: string; source: string;
}
export interface OvForecast {
  metric: string; horizon: 'next_day' | 'next_week'; current: string; projection: string;
  direction: 'up' | 'down' | 'flat'; confidence: 'low' | 'medium' | 'high'; driver: string;
}
export interface OvSummary { concerns: number; warnings: number; positive: number; total_highlights: number; }
export interface OverviewPayload {
  date: string; dept_narratives: OvNarrative[]; cross_dept: OvCrossDept;
  forecasts: OvForecast[]; summary: OvSummary; generated_at: string;
}

interface OverviewState {
  payload: OverviewPayload | null;
  loading: boolean;     // first fetch in flight
  computing: boolean;   // a snapshot is being generated (poll in progress)
  generatedAt: string | null;
  refresh: () => void;
}

export function useOverviewIntelligence(date: string): OverviewState {
  const [payload, setPayload] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggered = useRef(false);

  const fetchOnce = useCallback(async (allowTrigger: boolean): Promise<boolean> => {
    try {
      const r = await fetch(`/api/ai-intelligence/overview?date=${date}`);
      const d = await r.json();
      if (d?.payload) {
        setPayload(d.payload as OverviewPayload);
        setGeneratedAt(d.generated_at ?? null);
        setComputing(false);
        setLoading(false);
        return true; // done
      }
      if (d?.computing) {
        setComputing(true);
        setLoading(false);
        return false; // keep polling
      }
      // stale (no snapshot) — fire one debounced recompute, then poll
      if (d?.stale && allowTrigger && !triggered.current) {
        triggered.current = true;
        setComputing(true);
        fetch(`/api/ai-intelligence/overview?date=${date}&auto=1`, { method: 'POST' }).catch(() => {});
      }
      setLoading(false);
      return false;
    } catch {
      setLoading(false);
      return false;
    }
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const tick = async () => {
      const done = await fetchOnce(tries === 0);
      tries += 1;
      if (!cancelled && !done && tries < 30) {
        timer.current = setTimeout(tick, 5000); // poll ~5s, up to ~2.5 min while computing
      }
    };
    tick();
    return () => { cancelled = true; if (timer.current) clearTimeout(timer.current); };
  }, [fetchOnce]);

  const refresh = useCallback(() => {
    triggered.current = false;
    setLoading(true);
    fetchOnce(true);
  }, [fetchOnce]);

  return { payload, loading, computing, generatedAt, refresh };
}
