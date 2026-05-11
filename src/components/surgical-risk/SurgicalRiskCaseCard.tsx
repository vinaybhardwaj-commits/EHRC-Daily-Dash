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

import { useState } from 'react';
import type { SurgicalRiskAssessmentRow } from '@/lib/surgical-risk/types';
import { TIER_STYLES } from './tier-styles';
import ScoreGauge from './ScoreGauge';
import FactorTable from './FactorTable';

interface Props {
  row: SurgicalRiskAssessmentRow;
  onReviewed?: (id: number, reviewedBy: string, reviewedAt: string) => void;
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

export default function SurgicalRiskCaseCard({ row, onReviewed }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [reviewerName, setReviewerName] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);

  const s = TIER_STYLES[row.risk_tier];
  const a = row.assessment_json;
  const reviewed = !!row.reviewed_at;

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
          {row.llm_divergence_logged && (
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
            <button
              onClick={(e) => { e.stopPropagation(); window.print(); }}
              className="text-xs text-slate-500 hover:text-slate-700 underline print:hidden"
            >
              Print Assessment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
