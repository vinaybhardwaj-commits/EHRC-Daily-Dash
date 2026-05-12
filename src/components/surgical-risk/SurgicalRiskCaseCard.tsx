'use client';

/**
 * SurgicalRiskCaseCard — collapsed + expanded states for one assessment.
 * Per Mockup.jsx CaseCard + PRD v2 §14.4.3.
 *
 * Click anywhere on the collapsed card to expand. Expanded view shows summary
 * + 3-col factor breakdown + recommended actions (visual checkboxes, NOT
 * persisted in v1 per PRD §6.2 + decision visual-only) + override banner +
 * Mark Reviewed button (POSTs to /[id]/review) + Print link.
 */

import React, { useState } from 'react';
import type { SurgicalRiskAssessmentRow } from '@/lib/surgical-risk/types';
import { TIER_STYLES } from './tier-styles';
import ScoreGauge from './ScoreGauge';
import FactorTable from './FactorTable';

interface Props {
  row: SurgicalRiskAssessmentRow;
  onReviewed?: (id: number, reviewedBy: string, reviewedAt: string) => void;
  /** SPAS.5 — called after a successful reassess so parent can refresh the row */
  onReassessed?: (id: number) => void;
  /** DASH.1 — called after successful remove/restore */
  onRemoved?: (id: number) => void;
  onRestored?: (id: number) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function SurgicalRiskCaseCard({ row, onReviewed, onReassessed, onRemoved, onRestored }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [reviewerName, setReviewerName] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  // SPAS.5 — Re-assess state
  const [reassessing, setReassessing] = useState(false);
  const [reassessError, setReassessError] = useState<string | null>(null);
  const [reassessResult, setReassessResult] = useState<string | null>(null);
  // DASH.2 — View original submission toggle
  const [showOriginal, setShowOriginal] = useState(false);
  // DASH.1 — Remove/Restore state
  const [showRemoveForm, setShowRemoveForm] = useState(false);
  const [removerName, setRemoverName] = useState('');
  const [removeReason, setRemoveReason] = useState('');
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const s = TIER_STYLES[row.risk_tier];
  const a = row.assessment_json;
  const reviewed = !!row.reviewed_at;
  // LEGAL.4 — collect any Legal: factors so we can badge them prominently
  const legalFactors = (a?.system_risk?.factors || []).filter(f => /^Legal:/i.test(f.factor || ''));

  // DASH.1 — soft-remove
  async function submitRemove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!removerName.trim() || !removeReason.trim()) return;
    setRemoving(true); setRemoveError(null);
    try {
      const r = await fetch(`/api/surgical-risk/${row.id}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: removerName.trim(), reason: removeReason.trim() }),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'Remove failed');
      setShowRemoveForm(false);
      onRemoved?.(row.id);
    } catch (err) {
      setRemoveError(String(err instanceof Error ? err.message : err));
    } finally {
      setRemoving(false);
    }
  }

  async function handleRestore(e: React.MouseEvent) {
    e.stopPropagation();
    const actor = window.prompt('Your name (for the restore audit):') || '';
    if (!actor.trim()) return;
    setRemoving(true); setRemoveError(null);
    try {
      const r = await fetch(`/api/surgical-risk/${row.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: actor.trim() }),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'Restore failed');
      onRestored?.(row.id);
    } catch (err) {
      setRemoveError(String(err instanceof Error ? err.message : err));
    } finally {
      setRemoving(false);
    }
  }

  async function handleReassess(e: React.MouseEvent) {
    e.stopPropagation();
    // SPAS.5 — fetch admin key from URL or prompt + localStorage cache
    let key = '';
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      key = params.get('key') || localStorage.getItem('ehrc_admin_key') || '';
      if (!key) {
        const entered = window.prompt('Enter admin key to re-assess this case:') || '';
        if (!entered) return;
        key = entered;
        localStorage.setItem('ehrc_admin_key', key);
      }
    }
    if (!window.confirm(`Re-assess ${row.patient_name}?\n\nThe LLM will re-score this booking using the currently-active config. This takes 20-50 seconds.\n\nProceed?`)) return;
    setReassessing(true);
    setReassessError(null);
    setReassessResult(null);
    try {
      const r = await fetch(`/api/surgical-risk/${row.id}/reassess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Key': key },
        body: JSON.stringify({ actor: 'dashboard-ui' }),
      });
      const data = await r.json();
      if (!data.ok) {
        // Wrong key → clear cache so next attempt re-prompts
        if (r.status === 401) {
          localStorage.removeItem('ehrc_admin_key');
        }
        throw new Error(data.error || `HTTP ${r.status}`);
      }
      const ra = data.reassessment;
      setReassessResult(
        ra.tier_changed
          ? `Tier ${ra.from_tier} → ${ra.to_tier}; score ${ra.from_composite} → ${ra.to_composite} (${ra.llm_model}, ${(ra.llm_latency_ms / 1000).toFixed(1)}s)`
          : `Tier unchanged (${ra.to_tier}); score ${ra.from_composite} → ${ra.to_composite} (${ra.llm_model}, ${(ra.llm_latency_ms / 1000).toFixed(1)}s)`
      );
      onReassessed?.(row.id);
    } catch (err) {
      setReassessError(String(err instanceof Error ? err.message : err));
    } finally {
      setReassessing(false);
    }
  }

  async function handleSubmitReview(e: React.MouseEvent) {
    e.stopPropagation();
    if (!reviewerName.trim()) return;
    setReviewing(true);
    try {
      const r = await fetch(`/api/surgical-risk/${row.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer_name: reviewerName.trim(), notes: reviewNotes.trim() || undefined }),
      });
      const data = await r.json();
      if (data.ok) {
        onReviewed?.(row.id, reviewerName.trim(), data.review.reviewed_at);
        setShowReviewForm(false);
      } else {
        alert(`Review failed: ${data.error}`);
      }
    } catch (err) {
      alert(`Review failed: ${String(err)}`);
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div
      className={`rounded-xl border-2 ${s.border} ${s.glow} overflow-hidden transition-all duration-200 hover:shadow-lg cursor-pointer`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Main card row */}
      <div className="flex">
        {/* Left tier color bar (6px) */}
        <div className={`w-1.5 ${s.bar} flex-shrink-0`} />
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-semibold text-slate-900 truncate">{row.patient_name}</h3>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.badge}`}>{row.risk_tier}</span>
                {a?.composite?.override_applied && (
                  <span className="text-xs text-amber-600" title={a.composite.override_reason || undefined}>⚠ Override</span>
                )}
                {legalFactors.length > 0 && (
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300"
                    title={legalFactors.map(f => f.factor.replace(/^Legal:\s*/i,'') + ': ' + (f.detail||'')).join('\n')}
                  >
                    ⚖ {legalFactors.length === 1 ? 'Legal flag' : `${legalFactors.length} legal flags`}
                  </span>
                )}
                {reviewed && (
                  <span className="text-xs text-emerald-600" title={`Reviewed by ${row.reviewed_by} at ${formatDateTime(row.reviewed_at)}`}>
                    ✓ Reviewed
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-600 truncate">{row.proposed_procedure || '—'}</p>
              <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400 flex-wrap">
                {row.age && row.sex && <span>{row.age}/{row.sex[0]}</span>}
                {row.surgeon_name && <><span>·</span><span>{row.surgeon_name}</span></>}
                {row.surgical_specialty && <><span>·</span><span>{row.surgical_specialty}</span></>}
                {a?.recommended_actions && a.recommended_actions.length > 0 && (
                  <><span>·</span><span>{a.recommended_actions.length} action{a.recommended_actions.length > 1 ? 's' : ''}</span></>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`text-2xl font-bold ${s.text}`}>{Number(row.composite_risk_score).toFixed(1)}</div>
              <div className="text-xs text-slate-400">/ 10</div>
              <div className="text-xs text-slate-500 mt-1">{formatDate(row.surgery_date)}</div>
            </div>
          </div>

          {/* Inline gauge strip */}
          <div className="flex gap-4 mt-3">
            <ScoreGauge label="Patient" score={Number(row.patient_risk_score)} />
            <ScoreGauge label="Procedure" score={Number(row.procedure_risk_score)} />
            <ScoreGauge label="System" score={Number(row.system_risk_score)} />
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className={`border-t ${s.border} ${s.bg} px-5 py-4`} onClick={(e) => e.stopPropagation()}>
          {/* Summary */}
          {a?.summary && (
            <p className="text-sm text-slate-700 mb-4 leading-relaxed">{a.summary}</p>
          )}

          {/* Three-column factor breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Patient ({Number(row.patient_risk_score).toFixed(1)})
              </h4>
              <FactorTable factors={a?.patient_risk?.factors || []} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Procedure ({Number(row.procedure_risk_score).toFixed(1)})
              </h4>
              <FactorTable factors={a?.procedure_risk?.factors || []} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                System ({Number(row.system_risk_score).toFixed(1)})
              </h4>
              <FactorTable factors={a?.system_risk?.factors || []} />
            </div>
          </div>

          {/* Recommended actions (visual checkboxes only, not persisted in v1) */}
          {a?.recommended_actions && a.recommended_actions.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Recommended Actions
              </h4>
              <div className="space-y-1.5">
                {a.recommended_actions.map((action: string, i: number) => (
                  <label key={i} className="flex items-start gap-2 text-sm cursor-pointer group">
                    <input
                      type="checkbox"
                      className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="text-slate-700 group-hover:text-slate-900">{action}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Override banner */}
          {a?.composite?.override_applied && a.composite.override_reason && (
            <div className="bg-amber-100 border border-amber-300 rounded-lg px-3 py-2 text-sm text-amber-800 mb-3">
              <span className="font-semibold">Override applied:</span> {a.composite.override_reason}
            </div>
          )}

          {/* Divergence indicator (transparency: show if LLM was significantly corrected) */}
          {false /* HIDDEN per V 2026-05-11; restore when SPAS admin ships */ && row.llm_divergence_logged && (
            <div className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 mb-3">
              <span className="font-semibold">Note:</span> server-side recalc differed from LLM by &gt;2.0 on at least one sub-score.
              The displayed scores are server-corrected per PRD §13.3.
            </div>
          )}

          {/* Review section */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200 flex-wrap gap-2">
            {reviewed ? (
              <div className="text-xs text-slate-500">
                Reviewed by <span className="font-medium text-slate-700">{row.reviewed_by}</span> at {formatDateTime(row.reviewed_at)}
                {row.review_notes && <div className="mt-1 text-slate-600 italic">&quot;{row.review_notes}&quot;</div>}
              </div>
            ) : showReviewForm ? (
              <div className="flex flex-col gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  placeholder="Your name (e.g., Dr Bhardwaj)"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-full"
                />
                <textarea
                  placeholder="Optional notes…"
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={2}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-full resize-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSubmitReview}
                    disabled={!reviewerName.trim() || reviewing}
                    className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
                  >
                    {reviewing ? 'Submitting…' : 'Submit review'}
                  </button>
                  <button
                    onClick={() => setShowReviewForm(false)}
                    className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setShowReviewForm(true); }}
                className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Mark as Reviewed
              </button>
            )}
            <div className="flex items-center gap-3 print:hidden">
              {/* SPAS.5 — Re-assess */}
              <button
                onClick={handleReassess}
                disabled={reassessing}
                className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
                title="Re-run LLM scoring using the currently-active SREWS config"
              >
                {reassessing ? 'Re-assessing… (20-50s)' : 'Re-assess'}
              </button>
              {/* DASH.2 — View original Google Form submission */}
              <button
                onClick={(e) => { e.stopPropagation(); setShowOriginal(v => !v); }}
                className="text-xs text-slate-600 hover:text-slate-900 underline"
                title="Show the original Google Form submission that produced this assessment"
              >
                {showOriginal ? 'Hide original submission' : 'View original submission'}
              </button>
              {row.removed_at ? (
                <button
                  onClick={handleRestore}
                  disabled={removing}
                  className="text-xs text-emerald-600 hover:text-emerald-800 underline disabled:opacity-50"
                  title="Restore this case back to the active dashboard"
                >
                  {removing ? 'Restoring…' : 'Restore'}
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowRemoveForm(true); setRemoveError(null); }}
                  className="text-xs text-slate-500 hover:text-rose-700 underline"
                  title="Soft-remove this case from the main list (kept in Removed group)"
                >
                  Remove from dashboard
                </button>
              )}
            </div>
          </div>
          {/* SPAS.5 — Re-assess feedback */}
          {(reassessResult || reassessError) && (
            <div className={`mt-2 px-3 py-2 rounded text-xs ${reassessError ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
              {reassessError ? `Re-assess failed: ${reassessError}` : `Re-assessed: ${reassessResult}. Refresh to see updated card.`}
            </div>
          )}
          {/* DASH.1 — remove form */}
          {showRemoveForm && (
            <div className="mt-3 p-3 border border-slate-200 rounded bg-slate-50" onClick={(e) => e.stopPropagation()}>
              <h4 className="text-sm font-semibold text-slate-800 mb-2">Remove this case from the dashboard</h4>
              <p className="text-xs text-slate-500 mb-2">The case is hidden from the main list but stays in the DB and can be restored from the Removed group.</p>
              <input
                type="text"
                placeholder="Your name (for the audit log)"
                value={removerName}
                onChange={(e) => setRemoverName(e.target.value)}
                className="w-full px-3 py-1.5 mb-2 border border-slate-300 rounded text-sm"
              />
              <textarea
                placeholder="Reason for removal (e.g. 'test submission', 'duplicate', 'patient cancelled')"
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                rows={2}
                className="w-full px-3 py-1.5 mb-2 border border-slate-300 rounded text-sm resize-none"
              />
              {removeError && <div className="mb-2 text-xs text-rose-600">{removeError}</div>}
              <div className="flex items-center gap-2">
                <button
                  onClick={submitRemove}
                  disabled={!removerName.trim() || !removeReason.trim() || removing}
                  className="px-3 py-1 bg-rose-600 text-white text-sm rounded hover:bg-rose-700 disabled:bg-slate-300"
                >
                  {removing ? 'Removing…' : 'Confirm remove'}
                </button>
                <button
                  onClick={() => { setShowRemoveForm(false); setRemoveError(null); }}
                  className="px-3 py-1 text-sm text-slate-500 hover:text-slate-700"
                >Cancel</button>
              </div>
            </div>
          )}
          {/* DASH.1 — removed banner when card is in Removed group */}
          {row.removed_at && (
            <div className="mt-2 px-3 py-2 rounded text-xs bg-slate-100 border border-slate-300 text-slate-600">
              Removed{row.removed_by ? ` by ${row.removed_by}` : ''}{row.remove_reason ? `: "${row.remove_reason}"` : ''}
            </div>
          )}

          {/* DASH.2 — Original Google Form submission, for audit */}
          {showOriginal && (
            <OriginalSubmissionPanel form={row.raw_form_data as unknown as Record<string, unknown> | undefined} />
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DASH.2 — Original Google Form submission panel
// ─────────────────────────────────────────────────────────────────────────

interface FieldDef { key: string; label: string; }

const SUBMISSION_GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Patient',
    fields: [
      { key: 'patient_name', label: 'Name' },
      { key: 'uhid', label: 'UHID' },
      { key: 'age', label: 'Age' },
      { key: 'sex', label: 'Sex' },
      { key: 'contact', label: 'Contact' },
      { key: 'comorbidities', label: 'Comorbidities' },
      { key: 'habits', label: 'Habits' },
    ],
  },
  {
    title: 'Surgical plan',
    fields: [
      { key: 'proposed_procedure', label: 'Proposed procedure' },
      { key: 'surgical_specialty', label: 'Specialty' },
      { key: 'surgeon_name', label: 'Surgeon' },
      { key: 'laterality', label: 'Laterality' },
      { key: 'anaesthesia', label: 'Anaesthesia' },
      { key: 'special_requirements', label: 'Special requirements' },
    ],
  },
  {
    title: 'Timing & urgency',
    fields: [
      { key: 'surgery_date', label: 'Surgery date' },
      { key: 'surgery_time', label: 'Surgery time' },
      { key: 'admission_date', label: 'Admission date' },
      { key: 'admission_time', label: 'Admission time' },
      { key: 'urgency', label: 'Urgency' },
      { key: 'los', label: 'Length of stay (days)' },
    ],
  },
  {
    title: 'PAC',
    fields: [
      { key: 'pac_status', label: 'PAC status' },
      { key: 'pac_advice', label: 'PAC advice' },
    ],
  },
  {
    title: 'Logistics',
    fields: [
      { key: 'admission_to', label: 'Admission to' },
      { key: 'admission_type', label: 'Admission type' },
      { key: 'billing_bed', label: 'Billing bed' },
      { key: 'staying_bed', label: 'Staying bed' },
      { key: 'counselled_by', label: 'Counselled by' },
      { key: 'admission_done_by', label: 'Admission done by' },
      { key: 'transfer', label: 'Transfer patient' },
      { key: 'referring_hospital', label: 'Referring hospital' },
      { key: 'flag_auto', label: 'Auto-flag' },
    ],
  },
  {
    title: 'Financial',
    fields: [
      { key: 'payer', label: 'Payer' },
      { key: 'insurance_details', label: 'Insurance details' },
      { key: 'package_amount', label: 'Package amount' },
      { key: 'advance', label: 'Advance' },
      { key: 'open_bill', label: 'Open bill' },
    ],
  },
  {
    title: 'Notes & attachments',
    fields: [
      { key: 'clinical_justification', label: 'Clinical justification' },
      { key: 'remarks', label: 'Remarks' },
      { key: 'prescription_upload', label: 'Prescription upload' },
      { key: 'submission_timestamp', label: 'Submitted at' },
      { key: 'form_submission_uid', label: 'Form submission ID' },
    ],
  },
];

function renderValue(key: string, val: unknown): React.ReactNode {
  if (val === undefined || val === null || val === '') {
    return <span className="italic text-slate-400">(blank)</span>;
  }
  const str = String(val);
  // Prescription / drive link
  if (key === 'prescription_upload' && /^https?:\/\//.test(str)) {
    return (
      <a
        href={str}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-blue-600 hover:text-blue-800 underline break-all"
      >
        Open in new tab ↗
      </a>
    );
  }
  // Submission timestamp — pretty-print
  if (key === 'submission_timestamp') {
    try {
      const d = new Date(str);
      if (!Number.isNaN(d.getTime())) {
        return <span className="text-slate-700">{d.toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true })}</span>;
      }
    } catch { /* fall through */ }
  }
  // form_submission_uid — render in mono for easy copy
  if (key === 'form_submission_uid') {
    return <span className="font-mono text-xs text-slate-500 break-all">{str}</span>;
  }
  // Long text fields — preserve line breaks
  if (key === 'clinical_justification' || key === 'remarks' || key === 'comorbidities') {
    return <span className="text-slate-700 whitespace-pre-wrap">{str}</span>;
  }
  return <span className="text-slate-700">{str}</span>;
}

function OriginalSubmissionPanel({ form }: { form: Record<string, unknown> | undefined }) {
  if (!form) {
    return (
      <div className="mt-3 px-3 py-2 rounded text-xs bg-amber-50 border border-amber-200 text-amber-800">
        No original form data on file (this assessment row predates DASH.2 audit instrumentation).
      </div>
    );
  }
  // Collect any field keys not covered by the groups, so we don't silently drop new form fields
  const coveredKeys = new Set(SUBMISSION_GROUPS.flatMap(g => g.fields.map(f => f.key)));
  const extraKeys = Object.keys(form).filter(k => !coveredKeys.has(k));

  return (
    <div className="mt-3 border border-slate-200 rounded bg-slate-50" onClick={(e) => e.stopPropagation()}>
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700">
        Original Google Form submission — verbatim audit view
      </div>
      <div className="p-3 space-y-4">
        {SUBMISSION_GROUPS.map(group => (
          <div key={group.title}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{group.title}</h4>
            <dl className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-x-3 gap-y-1 text-xs">
              {group.fields.map(f => (
                <React.Fragment key={f.key}>
                  <dt className="text-slate-500">{f.label}</dt>
                  <dd>{renderValue(f.key, form[f.key])}</dd>
                </React.Fragment>
              ))}
            </dl>
          </div>
        ))}
        {extraKeys.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Other fields</h4>
            <dl className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-x-3 gap-y-1 text-xs">
              {extraKeys.map(k => (
                <React.Fragment key={k}>
                  <dt className="text-slate-500 font-mono">{k}</dt>
                  <dd>{renderValue(k, form[k])}</dd>
                </React.Fragment>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
