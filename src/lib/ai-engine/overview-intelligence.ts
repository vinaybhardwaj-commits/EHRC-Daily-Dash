/* ──────────────────────────────────────────────────────────────────
   Part B (B.1a) — Overview Intelligence
   Computes a rich, cached intelligence snapshot for the Daily Dash
   Overview: per-department AI narratives (utility tier → Flash) PLUS a
   cross-department synthesis + prescriptive exec summary (reasoning tier
   → Pro when GEMINI_REASONING is on, else Ollama). Cached per date in
   overview_intelligence so the Overview reads it instantly; a claim-lock
   prevents duplicate concurrent computes (hybrid stale-refresh).
   ────────────────────────────────────────────────────────────────── */

import { sql } from '@vercel/postgres';
import { routedChat, LLM_MODELS, isTierOnGemini } from '@/lib/llm';
import { analyzeAllTrends, type DepartmentTrendData } from './trend-analyzer';
import { generateAllNarratives, type TrendNarrative } from './trend-narrator';
import { runCorrelationAnalysis, type CorrelationResult } from './correlation-engine';

export interface CrossDeptPattern {
  title: string;
  departments: string[];
  mechanism: string;
  recommendation: string;
  severity: 'high' | 'medium' | 'low';
}
export interface CrossDeptSynthesis {
  day_status: 'green' | 'amber' | 'red';
  headline: string;
  patterns: CrossDeptPattern[];
  exec_summary: string;
  source: 'gemini' | 'fallback';
}
export interface OverviewSummary {
  concerns: number;
  warnings: number;
  positive: number;
  total_highlights: number;
}
export interface Forecast {
  metric: string;
  horizon: 'next_day' | 'next_week';
  current: string;
  projection: string;
  direction: 'up' | 'down' | 'flat';
  confidence: 'low' | 'medium' | 'high';
  driver: string;
}
export interface OverviewPayload {
  date: string;
  dept_narratives: TrendNarrative[];
  cross_dept: CrossDeptSynthesis;
  forecasts: Forecast[];
  summary: OverviewSummary;
  generated_at: string;
}

const SEV: ReadonlyArray<string> = ['high', 'medium', 'low'];

function normPattern(p: Record<string, unknown>): CrossDeptPattern | null {
  const title = String(p.title ?? '').trim();
  if (!title) return null;
  const sev = String(p.severity ?? '');
  return {
    title: title.slice(0, 160),
    departments: Array.isArray(p.departments) ? p.departments.map(String).slice(0, 6) : [],
    mechanism: String(p.mechanism ?? '').slice(0, 500),
    recommendation: String(p.recommendation ?? '').slice(0, 400),
    severity: (SEV.includes(sev) ? sev : 'medium') as CrossDeptPattern['severity'],
  };
}

const DIRS: ReadonlyArray<string> = ['up', 'down', 'flat'];
const CONFS: ReadonlyArray<string> = ['low', 'medium', 'high'];
const HORIZONS: ReadonlyArray<string> = ['next_day', 'next_week'];

function normForecast(f: Record<string, unknown>): Forecast | null {
  const metric = String(f.metric ?? '').trim();
  if (!metric) return null;
  const horizon = String(f.horizon ?? '');
  const direction = String(f.direction ?? '');
  const confidence = String(f.confidence ?? '');
  return {
    metric: metric.slice(0, 80),
    horizon: (HORIZONS.includes(horizon) ? horizon : 'next_day') as Forecast['horizon'],
    current: String(f.current ?? '').slice(0, 60),
    projection: String(f.projection ?? '').slice(0, 60),
    direction: (DIRS.includes(direction) ? direction : 'flat') as Forecast['direction'],
    confidence: (CONFS.includes(confidence) ? confidence : 'medium') as Forecast['confidence'],
    driver: String(f.driver ?? '').slice(0, 300),
  };
}

function fallbackSynthesis(correlations: CorrelationResult[], summary: OverviewSummary): CrossDeptSynthesis {
  const patterns: CrossDeptPattern[] = correlations.slice(0, 4).map(c => ({
    title: c.pattern_name,
    departments: c.matched_signals.map(s => s.department),
    mechanism: c.insight || c.description,
    recommendation: c.recommendation || '',
    severity: c.severity === 'critical' || c.severity === 'high' ? 'high' : c.severity === 'medium' ? 'medium' : 'low',
  }));
  const day_status = summary.concerns >= 3 ? 'red' : summary.concerns >= 1 ? 'amber' : 'green';
  return {
    day_status,
    headline: patterns.length
      ? `${patterns.length} cross-department pattern${patterns.length !== 1 ? 's' : ''} flagged`
      : `${summary.concerns} concern${summary.concerns !== 1 ? 's' : ''}, ${summary.positive} positive across departments`,
    patterns,
    exec_summary: 'AI synthesis unavailable — showing rule-based signals.',
    source: 'fallback',
  };
}

async function synthesizeIntelligence(
  date: string,
  trendData: DepartmentTrendData[],
  correlations: CorrelationResult[],
  summary: OverviewSummary,
): Promise<{ cross_dept: CrossDeptSynthesis; forecasts: Forecast[] }> {
  const deptLines = trendData
    .map(d => {
      const notable = d.trends
        .filter(t => t.direction !== 'stable')
        .slice(0, 6)
        .map(t => `${t.label}: ${t.direction} ${t.change_pct > 0 ? '+' : ''}${t.change_pct}% (now ${t.current}, avg ${t.avg}, streak ${t.streak}d)`);
      return notable.length ? `${d.department_name}: ${notable.join('; ')}` : '';
    })
    .filter(Boolean)
    .join('\n');
  const corrLines = correlations.length
    ? correlations.map(c => `${c.pattern_name} [${c.severity}]: ${c.insight}`).join('\n')
    : '(deterministic engine found no preset patterns)';

  const prompt = `You are the chief operations analyst for EHRC (Even Hospital Race Course Road), briefing the GM for ${date}.
Below are the notable 14-day department trends and any preset cross-department flags. Reason ACROSS departments — find the real system-wide stories (cause→effect chains, shared drivers), not per-department restatements.

DEPARTMENT TRENDS:
${deptLines || '(no notable movements)'}

PRESET CROSS-DEPARTMENT FLAGS:
${corrLines}

Return STRICT JSON only (no prose, no code fences):
{
  "day_status": "green|amber|red",
  "headline": "the one line the GM should read first",
  "patterns": [
    { "title": "...", "departments": ["Finance","Emergency"], "mechanism": "the causal story linking these departments", "recommendation": "a specific action", "severity": "high|medium|low" }
  ],
  "exec_summary": "3-5 sentence prescriptive brief: what's happening, why, what to do, and the single missing signal that would sharpen the call",
  "forecasts": [
    { "metric": "Inpatient census", "horizon": "next_day", "current": "e.g. 142", "projection": "e.g. 150", "direction": "up|down|flat", "confidence": "low|medium|high", "driver": "the main reason, grounded in the trends" }
  ]
}
Rules: at most 4 patterns, only genuine CROSS-department stories. If nothing meaningfully connects departments, return an empty patterns array and say so in exec_summary. For "forecasts", give 3-6 of the most decision-relevant KPIs for the GM (e.g. inpatient census, length of stay, OT utilisation, no-shows, ED door-to-doctor, AR days, daily revenue): project realistically from the trends above, set horizon to next_day or next_week, and name the driver. Be specific with the numbers above.`;

  try {
    const resp = await routedChat('reasoning', {
      model: LLM_MODELS.PRIMARY,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1800,
    });
    let c = (resp.choices[0]?.message?.content || '')
      .replace(/^```json\n?/i, '').replace(/^```\n?/, '').replace(/\n?```$/, '').trim();
    const m = c.match(/\{[\s\S]*\}/);
    if (m) c = m[0];
    const p = JSON.parse(c) as Record<string, unknown>;
    const day = String(p.day_status ?? '');
    const patterns = Array.isArray(p.patterns)
      ? (p.patterns as Record<string, unknown>[]).slice(0, 4).map(normPattern).filter((x): x is CrossDeptPattern => x !== null)
      : [];
    const forecasts = Array.isArray(p.forecasts)
      ? (p.forecasts as Record<string, unknown>[]).slice(0, 6).map(normForecast).filter((x): x is Forecast => x !== null)
      : [];
    return {
      cross_dept: {
        day_status: (['green', 'amber', 'red'].includes(day) ? day : 'amber') as CrossDeptSynthesis['day_status'],
        headline: String(p.headline ?? '').slice(0, 240) || fallbackSynthesis(correlations, summary).headline,
        patterns,
        exec_summary: String(p.exec_summary ?? '').slice(0, 1200),
        source: 'gemini',
      },
      forecasts,
    };
  } catch {
    return { cross_dept: fallbackSynthesis(correlations, summary), forecasts: [] };
  }
}

/** Compute the full overview intelligence payload for a date. */
export async function computeOverviewIntelligence(date: string): Promise<OverviewPayload> {
  const trendData = await analyzeAllTrends(date, 14);
  const [narratives, correlations] = await Promise.all([
    generateAllNarratives(trendData),
    runCorrelationAnalysis(date),
  ]);
  const allHi = narratives.flatMap(n => n.highlights);
  const summary: OverviewSummary = {
    concerns: allHi.filter(h => h.severity === 'concern').length,
    warnings: allHi.filter(h => h.severity === 'warning').length,
    positive: allHi.filter(h => h.severity === 'good').length,
    total_highlights: allHi.length,
  };
  const { cross_dept, forecasts } = await synthesizeIntelligence(date, trendData, correlations, summary);
  return { date, dept_narratives: narratives, cross_dept, forecasts, summary, generated_at: new Date().toISOString() };
}

/* ── Cache ──────────────────────────────────────────────────────── */

export interface CachedOverview {
  payload: OverviewPayload | null;
  model: string | null;
  generated_at: string | null;
  computing: boolean;
}

export async function getCachedOverview(date: string): Promise<CachedOverview> {
  try {
    const res = await sql`SELECT payload, model, generated_at FROM overview_intelligence WHERE date = ${date}`;
    if (!res.rows.length) return { payload: null, model: null, generated_at: null, computing: false };
    const row = res.rows[0];
    const computing = row.model === 'computing';
    return {
      payload: computing ? null : (row.payload as OverviewPayload),
      model: (row.model as string) ?? null,
      generated_at: (row.generated_at as string) ?? null,
      computing,
    };
  } catch {
    return { payload: null, model: null, generated_at: null, computing: false };
  }
}

/** Atomic claim — true if this caller should compute (no fresh row, none computing). */
async function claim(date: string): Promise<boolean> {
  const res = await sql`
    INSERT INTO overview_intelligence (date, payload, model)
    VALUES (${date}, '{}'::jsonb, 'computing')
    ON CONFLICT (date) DO NOTHING
    RETURNING date`;
  return res.rowCount === 1;
}

async function saveOverview(date: string, payload: OverviewPayload, model: string): Promise<void> {
  await sql`
    INSERT INTO overview_intelligence (date, payload, model, generated_at)
    VALUES (${date}, ${JSON.stringify(payload)}::jsonb, ${model}, NOW())
    ON CONFLICT (date) DO UPDATE SET payload = EXCLUDED.payload, model = EXCLUDED.model, generated_at = NOW()`;
}

export interface EnsureResult {
  computed: boolean;
  reason?: string;
  payload?: OverviewPayload;
  model?: string;
}

/**
 * Ensure an overview snapshot exists for `date`.
 *  - force=true (cron / bearer): always recompute + overwrite.
 *  - force=false (client auto-refresh): claim-lock first; if a fresh row exists
 *    or another caller is computing, no-op (debounce — at most one compute/day).
 */
export async function ensureOverview(date: string, opts: { force?: boolean } = {}): Promise<EnsureResult> {
  if (!opts.force) {
    const claimed = await claim(date);
    if (!claimed) return { computed: false, reason: 'fresh_or_computing' };
  }
  try {
    const payload = await computeOverviewIntelligence(date);
    const model = payload.cross_dept.source === 'gemini'
      ? (isTierOnGemini('reasoning') ? 'gemini:pro' : 'ollama')
      : 'fallback';
    await saveOverview(date, payload, model);
    return { computed: true, payload, model };
  } catch (e) {
    // Release a placeholder claim so a later run can retry.
    try { await sql`DELETE FROM overview_intelligence WHERE date = ${date} AND model = 'computing'`; } catch { /* ignore */ }
    return { computed: false, reason: 'compute_failed: ' + String((e as Error).message).slice(0, 160) };
  }
}
