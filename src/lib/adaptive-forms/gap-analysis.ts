/* ──────────────────────────────────────────────────────────────────
   Adaptive Forms Intelligence — nightly gap-analysis (F.1)
   Reasons across every department's daily-form history + what each dept
   already collects, and proposes the highest-value MISSING signals as
   well-formed questions. Runs on the reasoning tier (Gemini 2.5-pro when
   GEMINI_REASONING is on, else Ollama). Fully guardrailed; only writes
   when the engine is enabled (the route gates on adaptiveFormsEnabled()).
   ────────────────────────────────────────────────────────────────── */

import { routedChat, LLM_MODELS } from '@/lib/llm';
import { getAllFormConfigs } from '@/lib/form-engine/registry';
import { loadHistoricalData } from '@/lib/ai-engine/historical-loader';
import type { SmartFormField, SmartFieldType, SmartFormConfig } from '@/lib/form-engine/types';
import {
  maxPerDept,
  insertQuestion,
  countOpenByDept,
  recentlyResolvedDedupeKeys,
  type AdaptiveRecurrence,
  type NewQuestion,
} from './store';

// The field types the generator may use. Excludes file/repeater/computed/
// person-picker — those need extra config a gap question shouldn't carry.
const ALLOWED_TYPES = new Set<SmartFieldType>([
  'text', 'number', 'paragraph', 'radio', 'dropdown', 'multi-select', 'toggle',
  'currency', 'rating', 'traffic-light', 'date', 'time',
]);
const CHOICE_TYPES = new Set<SmartFieldType>(['radio', 'dropdown', 'multi-select']);

function envInt(name: string, def: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : def;
}
const maxPerRun = () => envInt('ADAPTIVE_MAX_PER_RUN', 5);
const usefulnessMin = () => envInt('ADAPTIVE_USEFULNESS_MIN', 3);

const truncate = (v: unknown, n = 40) => {
  const s = String(v ?? '');
  return s.length > n ? s.slice(0, n) + '…' : s;
};
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);

/** Compact, bounded context block for one department. */
async function deptBlock(slug: string, config: SmartFormConfig, date: string): Promise<string> {
  const fields = config.sections.flatMap(s => s.fields).map(f => `${f.label} (${f.type})`).slice(0, 18);
  const recent = await loadHistoricalData(slug, date, 14);
  const latest = recent[0] || {};
  const vals = Object.entries(latest).slice(0, 8).map(([k, v]) => `${k}=${truncate(v)}`);
  return [
    `### ${config.title || slug}  [slug: ${slug}]`,
    `collects: ${fields.join('; ') || '(none)'}`,
    `days_of_data: ${recent.length}`,
    `latest: ${vals.join('; ') || '(no recent data)'}`,
  ].join('\n');
}

export interface GapCandidate {
  dept: string;
  label: string;
  type: string;
  rationale: string;
  priority: number;
  recurrence: string;
}
export interface GapRunResult {
  ok: boolean;
  generated: number;
  inserted: number;
  insertedIds: number[];
  candidates: GapCandidate[];   // every candidate that passed validation (preview, even on dry runs)
  skipped: { reason: string; dept?: string; key?: string }[];
  error?: string;
  sample?: string;
}

interface RawGap {
  dept_slug?: string;
  rationale?: string;
  priority?: number;
  recurrence?: string;
  dedupe_key?: string;
  usefulness?: number;
  field?: { id?: string; label?: string; type?: string; description?: string; options?: string[] };
}

/**
 * Run one gap-analysis pass for `date`. Pure read until the very end — only the
 * insert step mutates, and only valid, deduped, under-cap candidates are written.
 * dryRun=true validates + counts without inserting (used by the manual preview).
 */
export async function runGapAnalysis(date: string, opts: { dryRun?: boolean } = {}): Promise<GapRunResult> {
  const configs = getAllFormConfigs();
  const slugs = Object.keys(configs);
  const validSlugs = new Set(slugs);

  // 1. System-wide context (bounded per department).
  const blocks = await Promise.all(slugs.map(s => deptBlock(s, configs[s], date)));
  const context = blocks.join('\n\n');
  const limit = maxPerRun();

  const prompt = `You are the operations-intelligence engine for EHRC (Even Hospital Race Course Road).
Each department submits a daily operations form. Below, per department, are the fields it ALREADY collects plus its most recent values.

Find the highest-value INFORMATION GAPS — signals the hospital does NOT currently capture — that would most improve next-day / next-week prediction and cross-department correlation. Reason ACROSS departments (e.g. an admissions signal that would explain ward length-of-stay, or a staffing signal that predicts safety events).

Return STRICT JSON only (no prose, no code fences):
{
  "gaps": [
    {
      "dept_slug": "<one of the slugs shown below>",
      "rationale": "why this gap matters / which prediction it unlocks (1-2 sentences)",
      "priority": 1,
      "usefulness": 5,
      "recurrence": "until_answered",
      "dedupe_key": "short_stable_snake_case_id",
      "field": {
        "id": "snake_case_field_id",
        "label": "The exact question the HOD will see on their form",
        "type": "toggle",
        "options": ["A","B"]
      }
    }
  ]
}
Rules:
- At most ${limit} gaps total — only genuinely high-value ones.
- type is one of: text, number, paragraph, radio, dropdown, multi-select, toggle, currency, rating, traffic-light, date, time. Pick the LIGHTEST type that captures the signal (prefer toggle/number/dropdown over free text). "options" is required only for radio/dropdown/multi-select.
- Do NOT ask for data a department already collects (see its 'collects' list).
- Keep each question answerable in seconds. priority 1=highest..5; usefulness 1..5 = your confidence it materially improves prediction.

DEPARTMENTS:
${context}`;

  // 2. Reasoning-tier call (Gemini Pro when GEMINI_REASONING is on, else Ollama).
  let content = '';
  try {
    const resp = await routedChat('reasoning', {
      model: LLM_MODELS.PRIMARY,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1800,
    });
    content = resp.choices[0]?.message?.content || '';
  } catch (e) {
    return { ok: false, generated: 0, inserted: 0, insertedIds: [], candidates: [], skipped: [], error: 'llm_failed: ' + String((e as Error).message).slice(0, 160) };
  }

  // 3. Parse strict JSON.
  let gaps: RawGap[] = [];
  try {
    let cleaned = content.replace(/^```json\n?/i, '').replace(/^```\n?/, '').replace(/\n?```$/, '').trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) cleaned = m[0];
    const parsed = JSON.parse(cleaned) as { gaps?: RawGap[] };
    gaps = Array.isArray(parsed?.gaps) ? parsed.gaps : [];
  } catch {
    return { ok: false, generated: 0, inserted: 0, insertedIds: [], candidates: [], skipped: [], error: 'parse_failed', sample: content.slice(0, 200) };
  }

  // 4. Validate → guardrail → insert.
  const skipped: GapRunResult['skipped'] = [];
  const insertedIds: number[] = [];
  const candidates: GapCandidate[] = [];
  const perDeptThisRun: Record<string, number> = {};
  const resolvedCache: Record<string, Set<string>> = {};

  for (const g of gaps) {
    if (insertedIds.length >= limit) { skipped.push({ reason: 'run_cap_reached' }); break; }

    const slug = String(g.dept_slug || '');
    if (!validSlugs.has(slug)) { skipped.push({ reason: 'unknown_dept', dept: slug }); continue; }

    const f = g.field || {};
    const type = String(f.type || '') as SmartFieldType;
    if (!ALLOWED_TYPES.has(type)) { skipped.push({ reason: 'bad_type', dept: slug }); continue; }

    const label = String(f.label || '').trim();
    const id = slugify(String(f.id || label));
    if (!label || !id) { skipped.push({ reason: 'missing_label_or_id', dept: slug }); continue; }

    const options = Array.isArray(f.options) ? f.options.map(String).map(s => s.trim()).filter(Boolean) : [];
    if (CHOICE_TYPES.has(type) && options.length < 2) { skipped.push({ reason: 'choice_needs_options', dept: slug }); continue; }

    if ((Number(g.usefulness) || 0) < usefulnessMin()) { skipped.push({ reason: 'below_usefulness', dept: slug }); continue; }

    const dedupe_key = slugify(String(g.dedupe_key || id));
    if (!resolvedCache[slug]) resolvedCache[slug] = await recentlyResolvedDedupeKeys(slug, 14);
    if (resolvedCache[slug].has(dedupe_key)) { skipped.push({ reason: 'recently_resolved', dept: slug, key: dedupe_key }); continue; }

    const openNow = await countOpenByDept(slug);
    const thisRun = perDeptThisRun[slug] || 0;
    if (openNow + thisRun >= maxPerDept()) { skipped.push({ reason: 'dept_cap', dept: slug }); continue; }

    const field_spec: SmartFormField = {
      id, label, type, required: false,
      ...(CHOICE_TYPES.has(type) ? { options } : {}),
      ...(f.description ? { description: String(f.description) } : {}),
    };
    const recurrence: AdaptiveRecurrence = g.recurrence === 'once' ? 'once' : 'until_answered';
    const priority = Math.min(5, Math.max(1, Math.round(Number(g.priority) || 3)));

    candidates.push({ dept: slug, label, type, rationale: String(g.rationale || '').slice(0, 300), priority, recurrence });

    if (opts.dryRun) {
      insertedIds.push(-1);
      perDeptThisRun[slug] = thisRun + 1;
      continue;
    }

    const q: NewQuestion = {
      dept_slug: slug, field_spec, rationale: String(g.rationale || '').slice(0, 600),
      priority, recurrence, dedupe_key,
    };
    const newId = await insertQuestion(q);
    if (newId) { insertedIds.push(newId); perDeptThisRun[slug] = thisRun + 1; }
    else skipped.push({ reason: 'already_open', dept: slug, key: dedupe_key });
  }

  return { ok: true, generated: gaps.length, inserted: insertedIds.length, insertedIds, candidates, skipped };
}
