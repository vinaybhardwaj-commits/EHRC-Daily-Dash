'use client';

/**
 * /admin/surgical-risk — SPAS admin UI (Surgical Prompt Admin System).
 *
 * SPAS.3 scope (per PRD_SPAS_v1):
 *   - Auth gate (reuses /api/admin/validate; same ADMIN_KEY pattern as /admin)
 *   - 2-pane layout: config list left rail + tabbed editor right pane
 *   - 4 editor tabs:
 *       Overview      — metadata, status, audit history
 *       Prompt        — system_prompt textarea (PRD #6: plain, no Monaco)
 *       Rubric        — composite_weights, tier_thresholds, sub_score_cap,
 *                       divergence_threshold (numeric inputs)
 *       Factor Points — patient_config, procedure_config, system_config
 *                       (Record<string,number> + array editors)
 *   - 1 review tab: Diff vs Active (calls /dry-run)
 *   - Actions: Edit / Save Draft / Activate / Archive / Delete
 *
 * NOT in SPAS.3 (planned for SPAS.4):
 *   - Keyword Lists editor (detect_lists JSON)
 *   - Override Rules editor (params + forceTier + enabled)
 *   - Full Dry-Run panel with per-case scoring (deferred to SPAS.5)
 *   - Tiered activation warning (25%/50% thresholds — needs SPAS.5 scoring)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

// ─────────────────────────────────────────────────────────────────────────
// Types (mirror src/lib/surgical-risk/config-types.ts + API responses)
// ─────────────────────────────────────────────────────────────────────────

type ConfigStatus = 'active' | 'draft' | 'archived';

interface ConfigSummary {
  id: string;            // BIGSERIAL comes back as string
  version: string;
  status: ConfigStatus;
  prompt_chars: number;
  changelog: string | null;
  created_by: string | null;
  created_at: string;
  activated_at: string | null;
  activated_by: string | null;
  archived_at: string | null;
  override_rule_count: number;
}

interface AgeBand { min: number | null; max: number | null; points: number; label: string }
interface TimingGapBand { min_hours: number | null; max_hours: number | null; points: number; label: string }
interface SchedulingFlag { matches: string[]; points: number; label: string }

interface PatientConfig {
  age_bands: AgeBand[];
  comorbidity_points: Record<string, number>;
  non_standard_comorbidity_points: number;
  habit_points: Record<string, number>;
  transfer_patient_points: number;
  complexity_multiplier_threshold: number;
  complexity_multiplier_points: number;
}
interface ProcedureConfig {
  anaesthesia_points: Record<string, number>;
  procedure_tier_points: Record<string, number>;
  urgency_points: Record<string, number>;
  laterality_bilateral_points: number;
  special_requirement_points: number;
  infection_points: number;
}
interface SystemConfigBlock {
  pac_status_points: Record<string, number>;
  pac_advice_points: Record<string, number>;
  timing_gap_bands: TimingGapBand[];
  scheduling_flags: SchedulingFlag[];
  info_completeness: {
    blank_clinical_justification_points: number;
    blank_insurance_when_payer_is_insurance_points: number;
    blank_remarks_on_non_elective_points: number;
  };
  transfer_logistics_points: number;
}

interface DetectGroup { key: string; matches: string[] }
interface ProcedureDetectGroup { tier: 'MINOR' | 'INTERMEDIATE' | 'MAJOR' | 'COMPLEX'; matches: string[] }
interface DetectLists {
  comorbidity_detect: DetectGroup[];
  habit_detect: DetectGroup[];
  anaesthesia_detect: DetectGroup[];
  procedure_complexity_detect: ProcedureDetectGroup[];
  non_surgical_detect: string[];
  urgency_detect: DetectGroup[];
  special_requirement_detect: string[];
  infection_keywords: string[];
  pac_status_detect: DetectGroup[];
  pac_advice_detect: DetectGroup[];
}

type OverrideRuleKind =
  | 'sub_score_threshold'
  | 'age_and_anaesthesia'
  | 'infection_and_anaesthesia'
  | 'comorbidity_and_procedure_tier'
  | 'urgency_and_pac_pending'
  | 'sub_score_exact'
  | 'legal_factor_present';
type RiskTier = 'GREEN' | 'AMBER' | 'RED' | 'CRITICAL';
interface OverrideRuleConfig {
  id: string;
  enabled: boolean;
  kind: OverrideRuleKind;
  params: Record<string, string | number>;
  forceTier: RiskTier;
  description: string;
}

interface ConfigDetail {
  id: string;
  version: string;
  status: ConfigStatus;
  system_prompt: string;
  composite_weights: { patient: number; procedure: number; system: number };
  tier_thresholds: { green_max: number; amber_max: number; red_max: number };
  sub_score_cap: number | string;        // numeric arrives as string from @vercel/postgres
  divergence_threshold: number | string;
  patient_config: PatientConfig;
  procedure_config: ProcedureConfig;
  system_config: SystemConfigBlock;
  override_rules: OverrideRuleConfig[];
  detect_lists: DetectLists;
  changelog: string | null;
  created_by: string | null;
  created_at: string;
  activated_at: string | null;
  activated_by: string | null;
  archived_at: string | null;
}

interface AuditRow {
  id: number;
  action: string;
  actor: string | null;
  from_version: string | null;
  to_version: string | null;
  diff: unknown;
  impact: unknown;
  notes: string | null;
  created_at: string;
}

interface DiffEntry {
  field: string;
  classification: 'wired_in_spas_1' | 'wired_in_spas_5';
  description: string;
  changed: boolean;
}
interface DryRunResult {
  ok: boolean;
  proposed?: { id: string; version: string; status: ConfigStatus };
  active?: { id: string; version: string } | null;
  dry_run_supported?: string;
  dry_run_note?: string;
  summary?: { total_diffs: number; wired_now: number; wired_later_spas_5: number };
  diffs?: DiffEntry[];
  error?: string;
}

type TabKey = 'overview' | 'prompt' | 'rubric' | 'factor_points' | 'keywords' | 'overrides' | 'diff';

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

const STATUS_STYLES: Record<ConfigStatus, string> = {
  active:   'bg-emerald-100 text-emerald-800 border-emerald-200',
  draft:    'bg-amber-100 text-amber-800 border-amber-200',
  archived: 'bg-slate-200 text-slate-600 border-slate-300',
};

function n(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'string' ? parseFloat(v) : v;
}

// ─────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────

export default function SurgicalRiskAdminPage() {
  // Auth
  const [key, setKey] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authChecking, setAuthChecking] = useState(false);

  // Data
  const [configs, setConfigs] = useState<ConfigSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConfigDetail | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ConfigDetail | null>(null);
  const [changelog, setChangelog] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // Dry-run
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);

  // Activate / archive
  const [actionLoading, setActionLoading] = useState(false);
  const [actionStatus, setActionStatus] = useState('');

  // ─── Auth flow ────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('key') || '';
    if (fromUrl) {
      setKey(fromUrl);
      validateKey(fromUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function validateKey(k: string) {
    setAuthChecking(true);
    setAuthError('');
    try {
      const res = await fetch(`/api/admin/validate?key=${encodeURIComponent(k)}`);
      if (res.ok) {
        setAuthed(true);
      } else {
        setAuthError('Invalid admin key');
      }
    } catch (e) {
      setAuthError(`Network error: ${String(e)}`);
    } finally {
      setAuthChecking(false);
    }
  }

  // ─── Data loading ─────────────────────────────────────────────────────
  const loadConfigs = useCallback(async () => {
    if (!authed) return;
    setLoadingList(true);
    setError(null);
    try {
      const res = await fetch(`/api/surgical-risk/admin/configs?key=${encodeURIComponent(key)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Load failed');
      setConfigs(data.configs as ConfigSummary[]);
      if (!selectedId && data.configs.length > 0) {
        setSelectedId(data.configs[0].id);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingList(false);
    }
  }, [authed, key, selectedId]);

  const loadDetail = useCallback(async (id: string) => {
    if (!authed) return;
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/surgical-risk/admin/configs/${id}?key=${encodeURIComponent(key)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Load failed');
      setDetail(data.config as ConfigDetail);
      setAudit(data.audit as AuditRow[]);
      // Reset edit state when switching configs
      setEditing(false);
      setDraft(null);
      setDryRun(null);
      setSaveStatus('');
      setActionStatus('');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingDetail(false);
    }
  }, [authed, key]);

  useEffect(() => { if (authed) loadConfigs(); }, [authed, loadConfigs]);
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId, loadDetail]);

  // ─── Edit actions ─────────────────────────────────────────────────────
  function startEdit() {
    if (!detail) return;
    setDraft(JSON.parse(JSON.stringify(detail)));
    setEditing(true);
    setChangelog('');
    setSaveStatus('');
  }
  function cancelEdit() {
    setEditing(false);
    setDraft(null);
    setChangelog('');
  }

  async function saveDraft() {
    if (!draft || !detail) return;
    setSaving(true);
    setSaveStatus('');
    try {
      const body = {
        from_config_id: parseInt(detail.id, 10),
        system_prompt: draft.system_prompt,
        composite_weights: draft.composite_weights,
        tier_thresholds: draft.tier_thresholds,
        sub_score_cap: n(draft.sub_score_cap),
        divergence_threshold: n(draft.divergence_threshold),
        patient_config: draft.patient_config,
        procedure_config: draft.procedure_config,
        system_config: draft.system_config,
        override_rules: draft.override_rules,
        detect_lists: draft.detect_lists,
        changelog: changelog || `Edited from v${detail.version}`,
        created_by: 'admin-ui',
      };
      const res = await fetch(`/api/surgical-risk/admin/configs?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Save failed');
      setSaveStatus(`Saved as draft v${data.config.version} (id=${data.config.id})`);
      // Refresh list + select the new draft
      await loadConfigs();
      setSelectedId(String(data.config.id));
      setEditing(false);
      setDraft(null);
      setChangelog('');
    } catch (e) {
      setSaveStatus(`Error: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function runDryRun() {
    if (!detail) return;
    setDryRunLoading(true);
    try {
      const res = await fetch(`/api/surgical-risk/admin/configs/${detail.id}/dry-run?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'admin-ui' }),
      });
      const data = await res.json();
      setDryRun(data as DryRunResult);
    } catch (e) {
      setDryRun({ ok: false, error: String(e) });
    } finally {
      setDryRunLoading(false);
    }
  }

  async function activate() {
    if (!detail) return;
    const ok = window.confirm(
      `Activate config v${detail.version}?\n\n` +
      `This will:\n` +
      `  • Archive the currently-active config\n` +
      `  • Make v${detail.version} the new active config\n` +
      `  • Take effect on the NEXT new booking (forward-only)\n\n` +
      `Note: SPAS.5 will add live rubric-changes effect. Until then, only system_prompt + version take live effect.\n\n` +
      `Proceed?`
    );
    if (!ok) return;
    setActionLoading(true);
    setActionStatus('');
    try {
      const res = await fetch(`/api/surgical-risk/admin/configs/${detail.id}/activate?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: 'admin-ui',
          acknowledged_impact: { pct_changed: 0, severity: 'green' as const },
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Activate failed');
      setActionStatus(`Activated v${data.activated.version}. Previous: ${data.previous_active ? `v${data.previous_active.version}` : '(none)'}`);
      await loadConfigs();
      await loadDetail(detail.id);
    } catch (e) {
      setActionStatus(`Error: ${String(e)}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function archive() {
    if (!detail) return;
    if (!window.confirm(`Archive config v${detail.version}? It will no longer appear in the drafts list.`)) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/surgical-risk/admin/configs/${detail.id}/archive?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'admin-ui' }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Archive failed');
      setActionStatus(`Archived v${detail.version}.`);
      await loadConfigs();
      await loadDetail(detail.id);
    } catch (e) {
      setActionStatus(`Error: ${String(e)}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function deleteDraft() {
    if (!detail) return;
    if (!window.confirm(`Permanently delete draft v${detail.version}? This cannot be undone.`)) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/surgical-risk/admin/configs/${detail.id}?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Delete failed');
      setActionStatus(`Deleted v${detail.version}.`);
      setSelectedId(null);
      setDetail(null);
      await loadConfigs();
    } catch (e) {
      setActionStatus(`Error: ${String(e)}`);
    } finally {
      setActionLoading(false);
    }
  }

  // Derived
  const displayed = editing && draft ? draft : detail;
  const isDirty = useMemo(() => {
    if (!editing || !draft || !detail) return false;
    return JSON.stringify(draft) !== JSON.stringify(detail);
  }, [editing, draft, detail]);

  // ─── Render ───────────────────────────────────────────────────────────

  // Auth gate
  if (!authed) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-sm p-8">
          <h1 className="text-2xl font-bold text-slate-800 mb-1">Surgical Risk Config Admin</h1>
          <p className="text-sm text-slate-600 mb-6">SPAS — Surgical Prompt Admin System</p>
          <form
            onSubmit={(e) => { e.preventDefault(); validateKey(key); }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Admin key</label>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter ADMIN_KEY"
                autoFocus
              />
            </div>
            {authError && <div className="text-sm text-rose-600">{authError}</div>}
            <button
              type="submit"
              disabled={authChecking || !key}
              className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {authChecking ? 'Validating…' : 'Unlock'}
            </button>
            <div className="text-xs text-slate-500 pt-2 border-t border-slate-100">
              <Link href="/admin" className="hover:underline">← Back to /admin</Link>
            </div>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-sm text-slate-600 hover:text-slate-900">← /admin</Link>
          <h1 className="text-xl font-bold text-slate-800">Surgical Risk Config</h1>
          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded">SPAS</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/surgical-risk" className="text-blue-600 hover:underline">↗ /surgical-risk</Link>
          <button onClick={() => { setKey(''); setAuthed(false); }} className="text-slate-500 hover:text-slate-700">Lock</button>
        </div>
      </div>

      <div className="flex" style={{ minHeight: 'calc(100vh - 56px)' }}>
        {/* Left rail: config list */}
        <aside className="w-80 border-r border-slate-200 bg-white">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-700">Configs ({configs.length})</h2>
            <button
              onClick={loadConfigs}
              disabled={loadingList}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              {loadingList ? '…' : 'Refresh'}
            </button>
          </div>
          {error && <div className="px-4 py-2 text-xs text-rose-600">{error}</div>}
          <ul className="overflow-y-auto">
            {configs.map((c) => (
              <li
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`px-4 py-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${selectedId === c.id ? 'bg-blue-50' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-sm font-semibold text-slate-800">v{c.version}</span>
                  <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_STYLES[c.status]}`}>{c.status}</span>
                </div>
                <div className="text-xs text-slate-500 mb-1">{c.prompt_chars} chars · {c.override_rule_count} rules</div>
                <div className="text-xs text-slate-400">
                  {c.status === 'active' && c.activated_at && `activated ${fmtTime(c.activated_at)}`}
                  {c.status === 'draft' && c.created_at && `saved ${fmtTime(c.created_at)}`}
                  {c.status === 'archived' && c.archived_at && `archived ${fmtTime(c.archived_at)}`}
                </div>
                {c.changelog && (
                  <div className="text-xs text-slate-600 mt-1 line-clamp-2">{c.changelog}</div>
                )}
              </li>
            ))}
          </ul>
        </aside>

        {/* Right pane: detail + tabs */}
        <section className="flex-1 p-6">
          {loadingDetail && <div className="text-sm text-slate-500">Loading…</div>}
          {!loadingDetail && !displayed && (
            <div className="text-sm text-slate-500">Select a config from the left.</div>
          )}
          {displayed && (
            <>
              {/* Header + actions */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-slate-800 font-mono">v{displayed.version}</h2>
                  <span className={`text-xs px-2 py-1 rounded border ${STATUS_STYLES[displayed.status]}`}>{displayed.status}</span>
                  {editing && <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-800 border border-amber-200">editing</span>}
                  {isDirty && <span className="text-xs text-amber-700">• unsaved changes</span>}
                </div>
                <div className="flex items-center gap-2">
                  {!editing && (
                    <button
                      onClick={startEdit}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Edit (creates new draft)
                    </button>
                  )}
                  {editing && (
                    <>
                      <button onClick={cancelEdit} className="px-3 py-1.5 text-sm bg-slate-200 rounded hover:bg-slate-300">Cancel</button>
                      <button
                        onClick={saveDraft}
                        disabled={saving || !isDirty}
                        className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                      >{saving ? 'Saving…' : 'Save Draft'}</button>
                    </>
                  )}
                  {!editing && displayed.status === 'draft' && (
                    <>
                      <button
                        onClick={activate}
                        disabled={actionLoading}
                        className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                      >Activate</button>
                      <button
                        onClick={archive}
                        disabled={actionLoading}
                        className="px-3 py-1.5 text-sm bg-slate-200 rounded hover:bg-slate-300 disabled:opacity-50"
                      >Archive</button>
                      <button
                        onClick={deleteDraft}
                        disabled={actionLoading}
                        className="px-3 py-1.5 text-sm bg-rose-100 text-rose-700 rounded hover:bg-rose-200 disabled:opacity-50"
                      >Delete</button>
                    </>
                  )}
                </div>
              </div>

              {saveStatus && <div className="mb-3 text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded">{saveStatus}</div>}
              {actionStatus && <div className="mb-3 text-sm text-slate-700 bg-slate-100 px-3 py-2 rounded">{actionStatus}</div>}

              {/* Tabs */}
              <div className="flex border-b border-slate-200 mb-4 gap-1">
                {(['overview', 'prompt', 'rubric', 'factor_points', 'keywords', 'overrides', 'diff'] as TabKey[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={`px-4 py-2 text-sm border-b-2 transition-colors ${activeTab === t ? 'border-blue-600 text-blue-700 font-semibold' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
                  >
                    {t === 'overview' && 'Overview'}
                    {t === 'prompt' && 'Prompt'}
                    {t === 'rubric' && 'Rubric'}
                    {t === 'factor_points' && 'Factor Points'}
                    {t === 'keywords' && 'Keywords'}
                    {t === 'overrides' && 'Override Rules'}
                    {t === 'diff' && 'Diff vs Active'}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {activeTab === 'overview' && <OverviewTab detail={displayed} audit={audit} />}
              {activeTab === 'prompt' && <PromptTab detail={displayed} draft={draft} setDraft={setDraft} editing={editing} />}
              {activeTab === 'rubric' && <RubricTab detail={displayed} draft={draft} setDraft={setDraft} editing={editing} />}
              {activeTab === 'factor_points' && <FactorPointsTab detail={displayed} draft={draft} setDraft={setDraft} editing={editing} />}
              {activeTab === 'keywords' && <KeywordListsTab detail={displayed} draft={draft} setDraft={setDraft} editing={editing} />}
              {activeTab === 'overrides' && <OverrideRulesTab detail={displayed} draft={draft} setDraft={setDraft} editing={editing} />}
              {activeTab === 'diff' && <DiffTab detail={displayed} dryRun={dryRun} runDryRun={runDryRun} dryRunLoading={dryRunLoading} />}

              {editing && (
                <div className="mt-6 pt-4 border-t border-slate-200">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Changelog (optional)</label>
                  <input
                    type="text"
                    value={changelog}
                    onChange={(e) => setChangelog(e.target.value)}
                    placeholder="e.g. Tightened PAC status keywords; bumped age 75 weight"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  />
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tab components
// ─────────────────────────────────────────────────────────────────────────

function OverviewTab({ detail, audit }: { detail: ConfigDetail; audit: AuditRow[] }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-semibold text-slate-800 mb-2">Metadata</h3>
        <dl className="grid grid-cols-2 gap-y-2 gap-x-6 text-sm">
          <DD label="Version">{detail.version}</DD>
          <DD label="Status">{detail.status}</DD>
          <DD label="Created">{fmtTime(detail.created_at)} {detail.created_by && `by ${detail.created_by}`}</DD>
          <DD label="Activated">{fmtTime(detail.activated_at)} {detail.activated_by && `by ${detail.activated_by}`}</DD>
          <DD label="Archived">{fmtTime(detail.archived_at)}</DD>
          <DD label="Prompt length">{detail.system_prompt.length.toLocaleString()} chars</DD>
          <DD label="Override rules">{detail.override_rules.length}</DD>
          <DD label="Sub-score cap">{n(detail.sub_score_cap)}</DD>
        </dl>
        {detail.changelog && (
          <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded text-sm text-slate-700">
            <span className="font-semibold">Changelog:</span> {detail.changelog}
          </div>
        )}
      </section>
      <section>
        <h3 className="font-semibold text-slate-800 mb-2">Audit history (last 20)</h3>
        <table className="w-full text-xs">
          <thead className="text-left text-slate-500 border-b border-slate-200">
            <tr>
              <th className="py-1.5 pr-3">When</th>
              <th className="py-1.5 pr-3">Action</th>
              <th className="py-1.5 pr-3">Actor</th>
              <th className="py-1.5 pr-3">From → To</th>
              <th className="py-1.5">Notes</th>
            </tr>
          </thead>
          <tbody>
            {audit.length === 0 && (
              <tr><td colSpan={5} className="py-2 text-slate-400">no audit rows</td></tr>
            )}
            {audit.map((a) => (
              <tr key={a.id} className="border-b border-slate-100">
                <td className="py-1.5 pr-3 text-slate-600 whitespace-nowrap">{fmtTime(a.created_at)}</td>
                <td className="py-1.5 pr-3 font-mono">{a.action}</td>
                <td className="py-1.5 pr-3 text-slate-600">{a.actor || '—'}</td>
                <td className="py-1.5 pr-3 text-slate-600 font-mono">{a.from_version ?? '—'} → {a.to_version ?? '—'}</td>
                <td className="py-1.5 text-slate-600">{a.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function PromptTab({ detail, draft, setDraft, editing }: {
  detail: ConfigDetail; draft: ConfigDetail | null;
  setDraft: (d: ConfigDetail | null) => void; editing: boolean;
}) {
  const value = (editing && draft) ? draft.system_prompt : detail.system_prompt;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-slate-800">LLM System Prompt</h3>
        <span className="text-xs text-slate-500">{value.length.toLocaleString()} chars · wired_in_spas_1 (live on activation)</span>
      </div>
      <textarea
        value={value}
        readOnly={!editing}
        onChange={(e) => editing && draft && setDraft({ ...draft, system_prompt: e.target.value })}
        className={`w-full font-mono text-xs border border-slate-300 rounded p-3 ${editing ? 'bg-white' : 'bg-slate-50'}`}
        style={{ minHeight: '500px' }}
      />
    </div>
  );
}

function RubricTab({ detail, draft, setDraft, editing }: {
  detail: ConfigDetail; draft: ConfigDetail | null;
  setDraft: (d: ConfigDetail | null) => void; editing: boolean;
}) {
  const v = (editing && draft) ? draft : detail;
  const update = (patch: Partial<ConfigDetail>) => editing && draft && setDraft({ ...draft, ...patch });
  return (
    <div className="space-y-6 max-w-2xl">
      <DeferredBanner />
      <section>
        <h3 className="font-semibold text-slate-800 mb-3">Composite weights</h3>
        <p className="text-xs text-slate-500 mb-2">Must sum to 1.0. Patient + Procedure + System.</p>
        <div className="grid grid-cols-3 gap-3">
          <NumInput label="Patient" value={v.composite_weights.patient} step={0.05}
            disabled={!editing}
            onChange={(x) => update({ composite_weights: { ...v.composite_weights, patient: x } })} />
          <NumInput label="Procedure" value={v.composite_weights.procedure} step={0.05}
            disabled={!editing}
            onChange={(x) => update({ composite_weights: { ...v.composite_weights, procedure: x } })} />
          <NumInput label="System" value={v.composite_weights.system} step={0.05}
            disabled={!editing}
            onChange={(x) => update({ composite_weights: { ...v.composite_weights, system: x } })} />
        </div>
        <div className="text-xs mt-1 text-slate-500">
          Sum: {(v.composite_weights.patient + v.composite_weights.procedure + v.composite_weights.system).toFixed(2)}
        </div>
      </section>
      <section>
        <h3 className="font-semibold text-slate-800 mb-3">Tier thresholds (composite score)</h3>
        <p className="text-xs text-slate-500 mb-2">GREEN if score &lt; green_max; AMBER if score &lt; amber_max; RED if score &lt; red_max; else CRITICAL.</p>
        <div className="grid grid-cols-3 gap-3">
          <NumInput label="GREEN max" value={v.tier_thresholds.green_max} step={0.1}
            disabled={!editing}
            onChange={(x) => update({ tier_thresholds: { ...v.tier_thresholds, green_max: x } })} />
          <NumInput label="AMBER max" value={v.tier_thresholds.amber_max} step={0.1}
            disabled={!editing}
            onChange={(x) => update({ tier_thresholds: { ...v.tier_thresholds, amber_max: x } })} />
          <NumInput label="RED max" value={v.tier_thresholds.red_max} step={0.1}
            disabled={!editing}
            onChange={(x) => update({ tier_thresholds: { ...v.tier_thresholds, red_max: x } })} />
        </div>
      </section>
      <section className="grid grid-cols-2 gap-4">
        <NumInput label="Sub-score cap" value={n(v.sub_score_cap)} step={0.5}
          disabled={!editing}
          onChange={(x) => update({ sub_score_cap: x })} />
        <NumInput label="Divergence flag threshold" value={n(v.divergence_threshold)} step={0.1}
          disabled={!editing}
          onChange={(x) => update({ divergence_threshold: x })} />
      </section>
    </div>
  );
}

function FactorPointsTab({ detail, draft, setDraft, editing }: {
  detail: ConfigDetail; draft: ConfigDetail | null;
  setDraft: (d: ConfigDetail | null) => void; editing: boolean;
}) {
  const v = (editing && draft) ? draft : detail;
  return (
    <div className="space-y-8">
      <DeferredBanner />
      {/* Patient */}
      <section>
        <h3 className="font-semibold text-slate-800 mb-2">Patient — comorbidity points</h3>
        <RecordEditor
          rec={v.patient_config.comorbidity_points}
          disabled={!editing}
          onChange={(rec) => editing && draft && setDraft({ ...draft, patient_config: { ...draft.patient_config, comorbidity_points: rec } })}
        />
      </section>
      <section>
        <h3 className="font-semibold text-slate-800 mb-2">Patient — habit points</h3>
        <RecordEditor
          rec={v.patient_config.habit_points}
          disabled={!editing}
          onChange={(rec) => editing && draft && setDraft({ ...draft, patient_config: { ...draft.patient_config, habit_points: rec } })}
        />
      </section>
      <section>
        <h3 className="font-semibold text-slate-800 mb-2">Patient — modifiers</h3>
        <div className="grid grid-cols-3 gap-3 max-w-2xl">
          <NumInput label="Non-std comorb pts" value={v.patient_config.non_standard_comorbidity_points} step={0.5}
            disabled={!editing}
            onChange={(x) => editing && draft && setDraft({ ...draft, patient_config: { ...draft.patient_config, non_standard_comorbidity_points: x } })} />
          <NumInput label="Transfer patient pts" value={v.patient_config.transfer_patient_points} step={0.5}
            disabled={!editing}
            onChange={(x) => editing && draft && setDraft({ ...draft, patient_config: { ...draft.patient_config, transfer_patient_points: x } })} />
          <NumInput label="Complexity multi pts" value={v.patient_config.complexity_multiplier_points} step={0.5}
            disabled={!editing}
            onChange={(x) => editing && draft && setDraft({ ...draft, patient_config: { ...draft.patient_config, complexity_multiplier_points: x } })} />
        </div>
      </section>

      {/* Procedure */}
      <section>
        <h3 className="font-semibold text-slate-800 mb-2">Procedure — anaesthesia points</h3>
        <RecordEditor
          rec={v.procedure_config.anaesthesia_points}
          disabled={!editing}
          onChange={(rec) => editing && draft && setDraft({ ...draft, procedure_config: { ...draft.procedure_config, anaesthesia_points: rec } })}
        />
      </section>
      <section>
        <h3 className="font-semibold text-slate-800 mb-2">Procedure — tier points</h3>
        <RecordEditor
          rec={v.procedure_config.procedure_tier_points}
          disabled={!editing}
          onChange={(rec) => editing && draft && setDraft({ ...draft, procedure_config: { ...draft.procedure_config, procedure_tier_points: rec } })}
        />
      </section>
      <section>
        <h3 className="font-semibold text-slate-800 mb-2">Procedure — urgency points</h3>
        <RecordEditor
          rec={v.procedure_config.urgency_points}
          disabled={!editing}
          onChange={(rec) => editing && draft && setDraft({ ...draft, procedure_config: { ...draft.procedure_config, urgency_points: rec } })}
        />
      </section>
      <section>
        <h3 className="font-semibold text-slate-800 mb-2">Procedure — modifiers</h3>
        <div className="grid grid-cols-3 gap-3 max-w-2xl">
          <NumInput label="Bilateral pts" value={v.procedure_config.laterality_bilateral_points} step={0.5}
            disabled={!editing}
            onChange={(x) => editing && draft && setDraft({ ...draft, procedure_config: { ...draft.procedure_config, laterality_bilateral_points: x } })} />
          <NumInput label="Special req pts" value={v.procedure_config.special_requirement_points} step={0.5}
            disabled={!editing}
            onChange={(x) => editing && draft && setDraft({ ...draft, procedure_config: { ...draft.procedure_config, special_requirement_points: x } })} />
          <NumInput label="Infection pts" value={v.procedure_config.infection_points} step={0.5}
            disabled={!editing}
            onChange={(x) => editing && draft && setDraft({ ...draft, procedure_config: { ...draft.procedure_config, infection_points: x } })} />
        </div>
      </section>

      {/* System */}
      <section>
        <h3 className="font-semibold text-slate-800 mb-2">System — PAC status points</h3>
        <RecordEditor
          rec={v.system_config.pac_status_points}
          disabled={!editing}
          onChange={(rec) => editing && draft && setDraft({ ...draft, system_config: { ...draft.system_config, pac_status_points: rec } })}
        />
      </section>
      <section>
        <h3 className="font-semibold text-slate-800 mb-2">System — PAC advice points</h3>
        <RecordEditor
          rec={v.system_config.pac_advice_points}
          disabled={!editing}
          onChange={(rec) => editing && draft && setDraft({ ...draft, system_config: { ...draft.system_config, pac_advice_points: rec } })}
        />
      </section>
      <section>
        <h3 className="font-semibold text-slate-800 mb-2">System — info completeness</h3>
        <div className="grid grid-cols-3 gap-3 max-w-2xl">
          <NumInput label="Blank clinical justification" value={v.system_config.info_completeness.blank_clinical_justification_points} step={0.5}
            disabled={!editing}
            onChange={(x) => editing && draft && setDraft({ ...draft, system_config: { ...draft.system_config, info_completeness: { ...draft.system_config.info_completeness, blank_clinical_justification_points: x } } })} />
          <NumInput label="Blank insurance (when insured)" value={v.system_config.info_completeness.blank_insurance_when_payer_is_insurance_points} step={0.5}
            disabled={!editing}
            onChange={(x) => editing && draft && setDraft({ ...draft, system_config: { ...draft.system_config, info_completeness: { ...draft.system_config.info_completeness, blank_insurance_when_payer_is_insurance_points: x } } })} />
          <NumInput label="Blank remarks (non-elective)" value={v.system_config.info_completeness.blank_remarks_on_non_elective_points} step={0.5}
            disabled={!editing}
            onChange={(x) => editing && draft && setDraft({ ...draft, system_config: { ...draft.system_config, info_completeness: { ...draft.system_config.info_completeness, blank_remarks_on_non_elective_points: x } } })} />
        </div>
        <div className="mt-3 max-w-md">
          <NumInput label="Transfer logistics (missing referring hospital)" value={v.system_config.transfer_logistics_points} step={0.5}
            disabled={!editing}
            onChange={(x) => editing && draft && setDraft({ ...draft, system_config: { ...draft.system_config, transfer_logistics_points: x } })} />
        </div>
      </section>

      {/* Patient — age bands array editor */}
      <section>
        <h3 className="font-semibold text-slate-800 mb-2">Patient — age bands</h3>
        <p className="text-xs text-slate-500 mb-2">Use <code>null</code> for open-ended min/max. Bands evaluated in order, first match wins.</p>
        <BandArrayEditor
          bands={v.patient_config.age_bands as unknown as { points: number; label: string; [k: string]: unknown }[]}
          unit="y"
          minKey="min"
          maxKey="max"
          disabled={!editing}
          onChange={(arr) => editing && draft && setDraft({ ...draft, patient_config: { ...draft.patient_config, age_bands: arr as unknown as AgeBand[] } })}
        />
      </section>

      {/* System — timing gap bands */}
      <section>
        <h3 className="font-semibold text-slate-800 mb-2">System — timing gap bands</h3>
        <p className="text-xs text-slate-500 mb-2">Hours between admission and surgery. <code>null</code> = open-ended.</p>
        <BandArrayEditor
          bands={v.system_config.timing_gap_bands as unknown as { min: number | null; max: number | null; points: number; label: string }[]}
          unit="h"
          minKey="min_hours"
          maxKey="max_hours"
          disabled={!editing}
          onChange={(arr) => editing && draft && setDraft({ ...draft, system_config: { ...draft.system_config, timing_gap_bands: arr as unknown as TimingGapBand[] } })}
        />
      </section>

      {/* System — scheduling flags */}
      <section>
        <h3 className="font-semibold text-slate-800 mb-2">System — scheduling flags</h3>
        <p className="text-xs text-slate-500 mb-2">Each flag triggers when ANY of its keywords match anywhere in the form.</p>
        <SchedulingFlagsEditor
          flags={v.system_config.scheduling_flags}
          disabled={!editing}
          onChange={(arr) => editing && draft && setDraft({ ...draft, system_config: { ...draft.system_config, scheduling_flags: arr } })}
        />
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SPAS.4 — Keyword Lists tab
// ─────────────────────────────────────────────────────────────────────────

function KeywordListsTab({ detail, draft, setDraft, editing }: {
  detail: ConfigDetail; draft: ConfigDetail | null;
  setDraft: (d: ConfigDetail | null) => void; editing: boolean;
}) {
  const v = (editing && draft) ? draft : detail;
  const update = (patch: Partial<DetectLists>) => editing && draft && setDraft({ ...draft, detect_lists: { ...draft.detect_lists, ...patch } });

  return (
    <div className="space-y-8">
      <DeferredBanner />
      <p className="text-xs text-slate-500">
        Keywords drive how the deterministic-fallback scorer detects values from free-text fields (comorbidities, procedure, urgency, etc.). The LLM also sees these as guidance in the system prompt. Match keywords are <strong>case-insensitive substring</strong>; SELECT-options exact-match first then substring fallback.
      </p>

      <DetectListEditor
        title="Comorbidities"
        helper="Maps free-text mentions to the standard comorbidity keys used in scoring. Keys map to point values in Factor Points → Patient → comorbidity_points."
        items={v.detect_lists.comorbidity_detect}
        disabled={!editing}
        onChange={(arr) => update({ comorbidity_detect: arr })}
      />

      <DetectListEditor
        title="Habits"
        helper="e.g. smoking, alcohol, recreational drugs."
        items={v.detect_lists.habit_detect}
        disabled={!editing}
        onChange={(arr) => update({ habit_detect: arr })}
      />

      <DetectListEditor
        title="Anaesthesia"
        helper="GA / Regional / Spinal / Local detection. SELECT-option exact-match first, then substring."
        items={v.detect_lists.anaesthesia_detect}
        disabled={!editing}
        onChange={(arr) => update({ anaesthesia_detect: arr })}
      />

      <ProcedureDetectListEditor
        items={v.detect_lists.procedure_complexity_detect}
        disabled={!editing}
        onChange={(arr) => update({ procedure_complexity_detect: arr })}
      />

      <StringListEditor
        title="Non-surgical procedure detection"
        helper="Procedure text matching ANY of these phrases gets 0 procedure-complexity points (e.g. 'medical management', 'observation')."
        items={v.detect_lists.non_surgical_detect}
        disabled={!editing}
        onChange={(arr) => update({ non_surgical_detect: arr })}
      />

      <DetectListEditor
        title="Urgency"
        helper="Maps urgency-field free text to ELECTIVE / SEMI_EMERGENCY / URGENT_IMMEDIATE."
        items={v.detect_lists.urgency_detect}
        disabled={!editing}
        onChange={(arr) => update({ urgency_detect: arr })}
      />

      <StringListEditor
        title="Special requirement keywords"
        helper="Procedure text mentioning ANY of these adds the procedure → special_requirement_points modifier (e.g. 'implant', 'prosthetic')."
        items={v.detect_lists.special_requirement_detect}
        disabled={!editing}
        onChange={(arr) => update({ special_requirement_detect: arr })}
      />

      <StringListEditor
        title="Infection keywords"
        helper="Procedure text mentioning ANY of these adds the procedure → infection_points modifier and triggers the infection+GA override rule."
        items={v.detect_lists.infection_keywords}
        disabled={!editing}
        onChange={(arr) => update({ infection_keywords: arr })}
      />

      <DetectListEditor
        title="PAC status"
        helper="Maps PAC-status field text to standard keys (e.g. WILL_DO_WITHOUT_ANY_REPORTS)."
        items={v.detect_lists.pac_status_detect}
        disabled={!editing}
        onChange={(arr) => update({ pac_status_detect: arr })}
      />

      <DetectListEditor
        title="PAC advice"
        helper="Maps PAC-advice field text to standard keys (FIT / PROVISIONALLY_FIT / NEEDS_WORK_UP / etc)."
        items={v.detect_lists.pac_advice_detect}
        disabled={!editing}
        onChange={(arr) => update({ pac_advice_detect: arr })}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SPAS.4 — Override Rules tab
// ─────────────────────────────────────────────────────────────────────────

const RULE_KIND_SCHEMA: Record<OverrideRuleKind, { params: Array<{ key: string; label: string; type: 'number' | 'string' }>; description: string }> = {
  sub_score_threshold: {
    params: [{ key: 'threshold', label: 'Threshold (N)', type: 'number' }],
    description: 'Any single sub-score ≥ threshold forces the rule\'s tier.',
  },
  age_and_anaesthesia: {
    params: [
      { key: 'min_age', label: 'Minimum age (years)', type: 'number' },
      { key: 'anaesthesia_pattern', label: 'Anaesthesia regex pattern', type: 'string' },
    ],
    description: 'Patient age ≥ min_age AND anaesthesia matches pattern.',
  },
  infection_and_anaesthesia: {
    params: [{ key: 'anaesthesia_pattern', label: 'Anaesthesia regex pattern', type: 'string' }],
    description: 'Infection keywords detected AND anaesthesia matches pattern.',
  },
  comorbidity_and_procedure_tier: {
    params: [
      { key: 'comorbidity_pattern', label: 'Comorbidity regex pattern', type: 'string' },
      { key: 'min_procedure_score', label: 'Min procedure sub-score', type: 'number' },
    ],
    description: 'Comorbidity matches pattern AND procedure sub-score ≥ minimum.',
  },
  urgency_and_pac_pending: {
    params: [
      { key: 'urgency_pattern', label: 'Urgency regex pattern', type: 'string' },
      { key: 'pac_status_pending_pattern', label: 'PAC-status pending pattern', type: 'string' },
    ],
    description: 'Urgency matches pattern AND PAC status matches pending pattern.',
  },
  sub_score_exact: {
    params: [{ key: 'value', label: 'Exact value (N)', type: 'number' }],
    description: 'Any single sub-score == value forces the rule\'s tier.',
  },
  legal_factor_present: {
    params: [],
    description: 'Any factor with name starting "Legal:" (e.g. MLC, PNDT, MTP, THOTA, Surrogacy, Sterilization, Minor consent) forces the rule\'s tier. Built per PRD_LEGAL_RISK_AXIS_v1.',
  },
};

function OverrideRulesTab({ detail, draft, setDraft, editing }: {
  detail: ConfigDetail; draft: ConfigDetail | null;
  setDraft: (d: ConfigDetail | null) => void; editing: boolean;
}) {
  const v = (editing && draft) ? draft : detail;
  return (
    <div className="space-y-4 max-w-3xl">
      <DeferredBanner />
      <p className="text-xs text-slate-500">
        Override rules can only RAISE a tier, never lower it. They fire after the composite-score tier is computed. <strong>Rule KINDS are fixed at deploy time</strong> — admin can tune params / forceTier / description / enabled, but new kinds need a code change (see SPAS.0 design note in memory).
      </p>
      {v.override_rules.map((rule, idx) => (
        <OverrideRuleEditor
          key={rule.id || idx}
          rule={rule}
          disabled={!editing}
          onChange={(patched) => {
            if (!editing || !draft) return;
            const next = [...draft.override_rules];
            next[idx] = patched;
            setDraft({ ...draft, override_rules: next });
          }}
        />
      ))}
    </div>
  );
}

function OverrideRuleEditor({ rule, disabled, onChange }: {
  rule: OverrideRuleConfig; disabled: boolean; onChange: (r: OverrideRuleConfig) => void;
}) {
  const schema = RULE_KIND_SCHEMA[rule.kind];
  return (
    <div className={`border border-slate-200 rounded p-3 ${rule.enabled ? 'bg-white' : 'bg-slate-50'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rule.enabled}
              disabled={disabled}
              onChange={(e) => onChange({ ...rule, enabled: e.target.checked })}
            />
            <span className={rule.enabled ? '' : 'text-slate-400'}>enabled</span>
          </label>
          <span className="font-mono text-xs text-slate-500">{rule.id}</span>
          <span className="text-xs text-slate-400">kind: <span className="font-mono">{rule.kind}</span></span>
        </div>
        <select
          value={rule.forceTier}
          disabled={disabled}
          onChange={(e) => onChange({ ...rule, forceTier: e.target.value as RiskTier })}
          className="text-xs border border-slate-300 rounded px-2 py-1"
        >
          <option value="GREEN">→ GREEN</option>
          <option value="AMBER">→ AMBER</option>
          <option value="RED">→ RED</option>
          <option value="CRITICAL">→ CRITICAL</option>
        </select>
      </div>
      <p className="text-xs text-slate-500 mb-2">{schema?.description || '(unknown kind — params editor disabled)'}</p>
      <div className="space-y-2 mb-2">
        {schema?.params.map((p) => (
          <div key={p.key} className="flex items-center gap-2">
            <label className="text-xs text-slate-700 w-48">{p.label}</label>
            <input
              type={p.type === 'number' ? 'number' : 'text'}
              value={String(rule.params?.[p.key] ?? '')}
              readOnly={disabled}
              onChange={(e) => {
                const val = p.type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value;
                onChange({ ...rule, params: { ...rule.params, [p.key]: val } });
              }}
              className={`flex-1 px-2 py-1 border border-slate-300 rounded text-sm ${disabled ? 'bg-slate-50' : 'bg-white'}`}
            />
          </div>
        ))}
      </div>
      <div>
        <label className="block text-xs text-slate-600 mb-1">Description</label>
        <input
          type="text"
          value={rule.description}
          readOnly={disabled}
          onChange={(e) => onChange({ ...rule, description: e.target.value })}
          className={`w-full px-2 py-1 border border-slate-300 rounded text-xs ${disabled ? 'bg-slate-50' : 'bg-white'}`}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SPAS.4 — Array + List editors
// ─────────────────────────────────────────────────────────────────────────

function DetectListEditor({ title, helper, items, disabled, onChange }: {
  title: string; helper?: string;
  items: DetectGroup[]; disabled?: boolean;
  onChange: (items: DetectGroup[]) => void;
}) {
  function setItem(i: number, item: DetectGroup) {
    const next = [...items]; next[i] = item; onChange(next);
  }
  function addItem() { onChange([...items, { key: 'NEW_KEY', matches: [] }]); }
  function removeItem(i: number) { onChange(items.filter((_, idx) => idx !== i)); }

  return (
    <section>
      <h3 className="font-semibold text-slate-800 mb-1">{title}</h3>
      {helper && <p className="text-xs text-slate-500 mb-2">{helper}</p>}
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="border border-slate-200 rounded p-2 bg-white">
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={item.key}
                readOnly={disabled}
                onChange={(e) => setItem(i, { ...item, key: e.target.value })}
                className={`flex-1 font-mono text-sm px-2 py-1 border border-slate-300 rounded ${disabled ? 'bg-slate-50' : 'bg-white'}`}
                placeholder="STANDARD_KEY"
              />
              {!disabled && (
                <button onClick={() => removeItem(i)} className="text-xs text-rose-600 hover:text-rose-800 px-2">remove</button>
              )}
            </div>
            <CSVStringListEditor
              items={item.matches}
              disabled={disabled}
              onChange={(arr) => setItem(i, { ...item, matches: arr })}
            />
          </div>
        ))}
        {!disabled && (
          <button onClick={addItem} className="text-xs text-blue-700 hover:text-blue-900 px-2 py-1 border border-dashed border-slate-300 rounded">+ Add detection group</button>
        )}
      </div>
    </section>
  );
}

function ProcedureDetectListEditor({ items, disabled, onChange }: {
  items: ProcedureDetectGroup[]; disabled?: boolean;
  onChange: (items: ProcedureDetectGroup[]) => void;
}) {
  const TIERS: ProcedureDetectGroup['tier'][] = ['COMPLEX', 'MAJOR', 'INTERMEDIATE', 'MINOR'];
  function setItem(i: number, item: ProcedureDetectGroup) {
    const next = [...items]; next[i] = item; onChange(next);
  }
  function addItem() { onChange([...items, { tier: 'MINOR', matches: [] }]); }
  function removeItem(i: number) { onChange(items.filter((_, idx) => idx !== i)); }
  return (
    <section>
      <h3 className="font-semibold text-slate-800 mb-1">Procedure complexity</h3>
      <p className="text-xs text-slate-500 mb-2">First matching tier wins. List COMPLEX entries first so multi-keyword procedures like &quot;TKR for fracture&quot; don&apos;t fall to MAJOR.</p>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="border border-slate-200 rounded p-2 bg-white">
            <div className="flex items-center gap-2 mb-2">
              <select
                value={item.tier}
                disabled={disabled}
                onChange={(e) => setItem(i, { ...item, tier: e.target.value as ProcedureDetectGroup['tier'] })}
                className="text-xs border border-slate-300 rounded px-2 py-1"
              >{TIERS.map(t => <option key={t} value={t}>{t}</option>)}</select>
              {!disabled && (
                <button onClick={() => removeItem(i)} className="text-xs text-rose-600 hover:text-rose-800 px-2">remove</button>
              )}
            </div>
            <CSVStringListEditor
              items={item.matches}
              disabled={disabled}
              onChange={(arr) => setItem(i, { ...item, matches: arr })}
            />
          </div>
        ))}
        {!disabled && (
          <button onClick={addItem} className="text-xs text-blue-700 hover:text-blue-900 px-2 py-1 border border-dashed border-slate-300 rounded">+ Add tier group</button>
        )}
      </div>
    </section>
  );
}

function StringListEditor({ title, helper, items, disabled, onChange }: {
  title: string; helper?: string;
  items: string[]; disabled?: boolean;
  onChange: (items: string[]) => void;
}) {
  return (
    <section>
      <h3 className="font-semibold text-slate-800 mb-1">{title}</h3>
      {helper && <p className="text-xs text-slate-500 mb-2">{helper}</p>}
      <CSVStringListEditor items={items} disabled={disabled} onChange={onChange} />
    </section>
  );
}

function CSVStringListEditor({ items, disabled, onChange }: {
  items: string[]; disabled?: boolean; onChange: (items: string[]) => void;
}) {
  // Render as a textarea with newline-separated entries — simpler than chip UI for v1
  const value = items.join('\n');
  return (
    <textarea
      value={value}
      readOnly={disabled}
      onChange={(e) => onChange(e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
      className={`w-full font-mono text-xs border border-slate-300 rounded p-2 ${disabled ? 'bg-slate-50' : 'bg-white'}`}
      rows={Math.min(8, Math.max(3, items.length + 1))}
      placeholder="one match keyword per line"
    />
  );
}

function BandArrayEditor({ bands, unit, minKey, maxKey, disabled, onChange }: {
  bands: { points: number; label: string; [k: string]: unknown }[];
  unit: string;
  minKey: string;
  maxKey: string;
  disabled?: boolean;
  onChange: (arr: { points: number; label: string; [k: string]: unknown }[]) => void;
}) {
  function setBand(i: number, b: typeof bands[number]) {
    const next = [...bands]; next[i] = b; onChange(next);
  }
  function addBand() {
    const b: { points: number; label: string; [k: string]: unknown } = { points: 0, label: 'new band' };
    b[minKey] = null;
    b[maxKey] = null;
    onChange([...bands, b]);
  }
  function removeBand(i: number) { onChange(bands.filter((_, idx) => idx !== i)); }
  return (
    <div className="space-y-2 max-w-3xl">
      {bands.map((b, i) => {
        const minVal = (b[minKey] as number | null | undefined) ?? null;
        const maxVal = (b[maxKey] as number | null | undefined) ?? null;
        return (
          <div key={i} className="flex items-center gap-2 border border-slate-200 rounded p-2 bg-white">
            <div className="flex items-center gap-1 w-28">
              <input
                type="number"
                value={minVal === null ? '' : minVal}
                readOnly={disabled}
                placeholder="-∞"
                onChange={(e) => {
                  const next = { ...b };
                  next[minKey] = e.target.value === '' ? null : parseFloat(e.target.value);
                  setBand(i, next);
                }}
                className={`w-16 px-1 py-0.5 border border-slate-300 rounded text-sm ${disabled ? 'bg-slate-50' : 'bg-white'}`}
              />
              <span className="text-xs text-slate-500">{unit}</span>
            </div>
            <span className="text-slate-400">–</span>
            <div className="flex items-center gap-1 w-28">
              <input
                type="number"
                value={maxVal === null ? '' : maxVal}
                readOnly={disabled}
                placeholder="+∞"
                onChange={(e) => {
                  const next = { ...b };
                  next[maxKey] = e.target.value === '' ? null : parseFloat(e.target.value);
                  setBand(i, next);
                }}
                className={`w-16 px-1 py-0.5 border border-slate-300 rounded text-sm ${disabled ? 'bg-slate-50' : 'bg-white'}`}
              />
              <span className="text-xs text-slate-500">{unit}</span>
            </div>
            <input
              type="number"
              value={b.points}
              step={0.5}
              readOnly={disabled}
              onChange={(e) => setBand(i, { ...b, points: parseFloat(e.target.value) || 0 })}
              className={`w-16 px-1 py-0.5 border border-slate-300 rounded text-sm ${disabled ? 'bg-slate-50' : 'bg-white'}`}
            />
            <span className="text-xs text-slate-500">pts</span>
            <input
              type="text"
              value={b.label}
              readOnly={disabled}
              onChange={(e) => setBand(i, { ...b, label: e.target.value })}
              className={`flex-1 px-2 py-0.5 border border-slate-300 rounded text-sm ${disabled ? 'bg-slate-50' : 'bg-white'}`}
              placeholder="label"
            />
            {!disabled && (
              <button onClick={() => removeBand(i)} className="text-xs text-rose-600 hover:text-rose-800 px-2">×</button>
            )}
          </div>
        );
      })}
      {!disabled && (
        <button onClick={addBand} className="text-xs text-blue-700 hover:text-blue-900 px-2 py-1 border border-dashed border-slate-300 rounded">+ Add band</button>
      )}
    </div>
  );
}

function SchedulingFlagsEditor({ flags, disabled, onChange }: {
  flags: SchedulingFlag[]; disabled?: boolean;
  onChange: (arr: SchedulingFlag[]) => void;
}) {
  function setFlag(i: number, f: SchedulingFlag) {
    const next = [...flags]; next[i] = f; onChange(next);
  }
  function addFlag() { onChange([...flags, { matches: [], points: 1, label: 'new flag' }]); }
  function removeFlag(i: number) { onChange(flags.filter((_, idx) => idx !== i)); }
  return (
    <div className="space-y-2 max-w-3xl">
      {flags.map((f, i) => (
        <div key={i} className="border border-slate-200 rounded p-2 bg-white">
          <div className="flex items-center gap-2 mb-2">
            <input
              type="text"
              value={f.label}
              readOnly={disabled}
              onChange={(e) => setFlag(i, { ...f, label: e.target.value })}
              className={`flex-1 text-sm px-2 py-1 border border-slate-300 rounded ${disabled ? 'bg-slate-50' : 'bg-white'}`}
              placeholder="label"
            />
            <input
              type="number"
              value={f.points}
              step={0.5}
              readOnly={disabled}
              onChange={(e) => setFlag(i, { ...f, points: parseFloat(e.target.value) || 0 })}
              className={`w-20 px-2 py-1 border border-slate-300 rounded text-sm ${disabled ? 'bg-slate-50' : 'bg-white'}`}
            />
            <span className="text-xs text-slate-500">pts</span>
            {!disabled && (
              <button onClick={() => removeFlag(i)} className="text-xs text-rose-600 hover:text-rose-800 px-2">remove</button>
            )}
          </div>
          <CSVStringListEditor
            items={f.matches}
            disabled={disabled}
            onChange={(arr) => setFlag(i, { ...f, matches: arr })}
          />
        </div>
      ))}
      {!disabled && (
        <button onClick={addFlag} className="text-xs text-blue-700 hover:text-blue-900 px-2 py-1 border border-dashed border-slate-300 rounded">+ Add flag</button>
      )}
    </div>
  );
}

function DiffTab({ detail, dryRun, runDryRun, dryRunLoading }: {
  detail: ConfigDetail; dryRun: DryRunResult | null;
  runDryRun: () => void; dryRunLoading: boolean;
}) {
  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800">Diff vs Active Config</h3>
        <button
          onClick={runDryRun}
          disabled={dryRunLoading}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >{dryRunLoading ? 'Computing…' : 'Compute Diff'}</button>
      </div>
      {!dryRun && (
        <div className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded p-3">
          Press &quot;Compute Diff&quot; to see how this config differs from the currently-active config.
          {detail.status === 'active' && ' (This is the active config — diff will be empty.)'}
        </div>
      )}
      {dryRun && !dryRun.ok && (
        <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded p-3">
          Error: {dryRun.error || 'unknown'}
        </div>
      )}
      {dryRun?.ok && (
        <div className="space-y-4">
          {dryRun.dry_run_note && (
            <div className="text-xs italic text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
              {dryRun.dry_run_note}
            </div>
          )}
          <div className="text-sm text-slate-700">
            Total diffs: <strong>{dryRun.summary?.total_diffs ?? 0}</strong> · 
            wired now (SPAS.1): <strong>{dryRun.summary?.wired_now ?? 0}</strong> · 
            wired later (SPAS.5): <strong>{dryRun.summary?.wired_later_spas_5 ?? 0}</strong>
          </div>
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded">
            {(dryRun.diffs || []).map((d) => (
              <li key={d.field} className="px-3 py-2 text-sm flex items-start gap-3">
                <span className={`inline-block w-2 h-2 mt-1.5 rounded-full ${d.changed ? 'bg-amber-500' : 'bg-slate-200'}`}></span>
                <div className="flex-1">
                  <div className="font-mono text-xs">
                    {d.field}
                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${d.classification === 'wired_in_spas_1' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{d.classification}</span>
                  </div>
                  <div className="text-xs text-slate-500">{d.description}</div>
                </div>
                <span className={`text-xs ${d.changed ? 'text-amber-700' : 'text-slate-400'}`}>{d.changed ? 'CHANGED' : 'same'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Building blocks
// ─────────────────────────────────────────────────────────────────────────

function DD({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-slate-800">{children}</dd>
    </div>
  );
}

function NumInput({ label, value, onChange, step = 1, disabled }: {
  label: string; value: number; onChange: (x: number) => void;
  step?: number; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-600 mb-1">{label}</label>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        readOnly={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className={`w-full px-2 py-1 border border-slate-300 rounded text-sm ${disabled ? 'bg-slate-50' : 'bg-white'}`}
      />
    </div>
  );
}

function RecordEditor({ rec, onChange, disabled }: {
  rec: Record<string, number>; onChange: (r: Record<string, number>) => void; disabled?: boolean;
}) {
  const keys = Object.keys(rec);
  return (
    <div className="grid grid-cols-2 gap-2 max-w-2xl">
      {keys.map((k) => (
        <div key={k} className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-700 flex-1 truncate">{k}</span>
          <input
            type="number"
            value={rec[k]}
            step={0.5}
            readOnly={disabled}
            onChange={(e) => onChange({ ...rec, [k]: parseFloat(e.target.value) || 0 })}
            className={`w-20 px-2 py-1 border border-slate-300 rounded text-sm ${disabled ? 'bg-slate-50' : 'bg-white'}`}
          />
        </div>
      ))}
    </div>
  );
}

function DeferredBanner() {
  return (
    <div className="text-xs text-slate-700 bg-amber-50 border border-amber-200 rounded p-2">
      <strong>Note:</strong> Edits to rubric values save to DB but don&apos;t affect live scoring until SPAS.5 wires
      <span className="font-mono"> fallback.ts</span> and <span className="font-mono">recalculate.ts</span> through the active-config reader.
      Only the system prompt and version stamp take live effect today (SPAS.1).
    </div>
  );
}
