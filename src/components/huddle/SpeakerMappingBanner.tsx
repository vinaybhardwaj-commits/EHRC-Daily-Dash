'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, X, Check, AlertCircle } from 'lucide-react';

interface DepartmentContact {
  head_name: string;
  department_name: string;
  department_slug: string;
  email?: string;
  phone?: string;
}

interface DetectedSpeaker {
  index: number;
  color: string;
  textColor: string;
}

interface SpeakerMapping {
  display_name: string;
  department_slug?: string;
  confidence?: number;
  source?: string;
}

interface SpeakerMappingBannerProps {
  huddleId: string | number;
  detectedSpeakers: DetectedSpeaker[];
  existingMappings?: Record<number, SpeakerMapping>;
  onMappingSaved?: (mappings: Array<{ speaker_index: number; display_name: string; department_slug?: string }>) => void;
  onSkip?: () => void;
}

const SPEAKER_COLORS = [
  'bg-blue-50 border-blue-200',
  'bg-emerald-50 border-emerald-200',
  'bg-purple-50 border-purple-200',
  'bg-amber-50 border-amber-200',
  'bg-rose-50 border-rose-200',
  'bg-cyan-50 border-cyan-200',
];

const SPEAKER_TEXT_COLORS = [
  'text-blue-700',
  'text-emerald-700',
  'text-purple-700',
  'text-amber-700',
  'text-rose-700',
  'text-cyan-700',
];

function ConfidenceBadge({ confidence, source }: { confidence?: number; source?: string }) {
  if (source === 'manual') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded">
        <Check size={10} /> Manual
      </span>
    );
  }

  if (source !== 'auto' || confidence === undefined) return null;

  if (confidence >= 0.75) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded">
        <Check size={10} /> {Math.round(confidence * 100)}%
      </span>
    );
  }
  if (confidence >= 0.55) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded">
        {Math.round(confidence * 100)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-600 rounded">
      <AlertCircle size={10} /> {Math.round(confidence * 100)}%
    </span>
  );
}

export default function SpeakerMappingBanner({
  huddleId,
  detectedSpeakers,
  existingMappings = {},
  onMappingSaved,
  onSkip,
}: SpeakerMappingBannerProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [contacts, setContacts] = useState<DepartmentContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [mappings, setMappings] = useState<Record<number, SpeakerMapping>>({});
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const [customInputs, setCustomInputs] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch department contacts
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const res = await fetch('/api/department-contacts');
        if (!res.ok) throw new Error('Failed to fetch contacts');
        const data = await res.json();
        setContacts(data.contacts || []);
      } catch (err) {
        console.error('Error fetching contacts:', err);
        setError('Failed to load department contacts');
      } finally {
        setLoadingContacts(false);
      }
    };
    fetchContacts();
  }, []);

  // Initialize mappings from existing data (including auto-identified)
  useEffect(() => {
    if (Object.keys(existingMappings).length > 0) {
      setMappings(existingMappings);
    }
  }, [existingMappings]);

  // Check states
  const allDetectedHaveMappings = detectedSpeakers.every((s) => mappings[s.index]);
  const hasAutoMappings = Object.values(mappings).some((m) => m.source === 'auto');
  const hasAnyMappings = Object.keys(mappings).length > 0;
  const hasChanges = Object.entries(mappings).some(([idx, m]) => {
    const existing = existingMappings[parseInt(idx)];
    if (!existing) return true;
    return existing.display_name !== m.display_name || existing.department_slug !== m.department_slug;
  });

  const handleSelectMapping = useCallback(
    (speakerIndex: number, displayName: string, departmentSlug?: string) => {
      setMappings((prev) => ({
        ...prev,
        [speakerIndex]: {
          display_name: displayName,
          department_slug: departmentSlug,
          confidence: 1.0,
          source: 'manual',
        },
      }));
      setOpenDropdown(null);
      setCustomInputs((prev) => {
        const next = { ...prev };
        delete next[speakerIndex];
        return next;
      });
    },
    []
  );

  const handleCustomInput = useCallback((speakerIndex: number, value: string) => {
    setCustomInputs((prev) => ({ ...prev, [speakerIndex]: value }));
  }, []);

  const handleApplyCustom = useCallback(
    (speakerIndex: number) => {
      const value = customInputs[speakerIndex]?.trim();
      if (!value) {
        setError('Please enter a name');
        return;
      }
      handleSelectMapping(speakerIndex, value);
    },
    [customInputs, handleSelectMapping]
  );

  const handleRemoveMapping = useCallback((speakerIndex: number) => {
    setMappings((prev) => {
      const next = { ...prev };
      delete next[speakerIndex];
      return next;
    });
    setCustomInputs((prev) => {
      const next = { ...prev };
      delete next[speakerIndex];
      return next;
    });
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const mappingsArray = Object.entries(mappings).map(([index, data]) => ({
        speaker_index: parseInt(index, 10),
        display_name: data.display_name,
        department_slug: data.department_slug,
      }));

      const res = await fetch(`/api/huddle/${huddleId}/speakers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: mappingsArray }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save mappings');
      }

      const data = await res.json();
      onMappingSaved?.(data.speakers);
      setIsExpanded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save mappings');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmAll = async () => {
    // Confirm all auto-identified mappings as manual (locks them in)
    await handleSave();
  };

  // ─── Collapsed state ───────────────────────────────────────────────
  if (!isExpanded && allDetectedHaveMappings) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
        <div className="text-sm text-emerald-700 flex-1">
          <span className="font-semibold">Speakers:</span>
          {detectedSpeakers.map((speaker, idx) => {
            const m = mappings[speaker.index];
            return (
              <span key={speaker.index} className="ml-1">
                {idx > 0 && '· '}
                {m?.display_name || `Speaker ${speaker.index}`}
              </span>
            );
          })}
        </div>
        <button
          onClick={() => setIsExpanded(true)}
          className="ml-2 text-sm text-emerald-700 hover:text-emerald-900 font-semibold flex-shrink-0"
        >
          Edit
        </button>
      </div>
    );
  }

  // ─── Expanded state ────────────────────────────────────────────────
  return (
    <div className="bg-white/90 backdrop-blur border border-slate-200 rounded-xl p-4 space-y-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-900 text-sm">
            {hasAutoMappings ? 'Review Speaker Identifications' : 'Map Speakers'}
          </h3>
          {hasAutoMappings && (
            <p className="text-xs text-slate-500 mt-0.5">
              Auto-identified from content. Tap to correct any wrong guesses.
            </p>
          )}
        </div>
        <button
          onClick={() => {
            setIsExpanded(false);
            onSkip?.();
          }}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          Skip
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loadingContacts ? (
        <div className="text-sm text-slate-500">Loading contacts...</div>
      ) : (
        <div className="space-y-2">
          {detectedSpeakers.map((speaker) => {
            const mapped = mappings[speaker.index];
            const customValue = customInputs[speaker.index];
            const isCustomMode = customValue !== undefined;

            return (
              <div key={speaker.index} className="flex items-center gap-2">
                {/* Speaker color tag */}
                <div
                  className={`px-2 py-1.5 rounded text-xs font-bold flex-shrink-0 ${
                    SPEAKER_COLORS[speaker.index % SPEAKER_COLORS.length]
                  }`}
                >
                  <span className={SPEAKER_TEXT_COLORS[speaker.index % SPEAKER_TEXT_COLORS.length]}>
                    S{speaker.index}
                  </span>
                </div>

                {/* Mapped name with confidence OR dropdown */}
                <div className="flex-1 min-w-0">
                  {mapped && !isCustomMode ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-50 rounded border border-slate-200 flex-1 min-w-0">
                        <span className="text-sm text-slate-800 truncate">{mapped.display_name}</span>
                        {mapped.department_slug && (
                          <span className="text-xs text-slate-400 flex-shrink-0">
                            {mapped.department_slug}
                          </span>
                        )}
                        <ConfidenceBadge confidence={mapped.confidence} source={mapped.source} />
                      </div>
                      <button
                        onClick={() => handleRemoveMapping(speaker.index)}
                        className="p-1 text-slate-300 hover:text-red-500 flex-shrink-0"
                        title="Change mapping"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      {isCustomMode ? (
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={customValue}
                            onChange={(e) => handleCustomInput(speaker.index, e.target.value)}
                            placeholder="Enter name..."
                            className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleApplyCustom(speaker.index);
                              if (e.key === 'Escape') {
                                setCustomInputs((prev) => {
                                  const next = { ...prev };
                                  delete next[speaker.index];
                                  return next;
                                });
                              }
                            }}
                            autoFocus
                          />
                          <button
                            onClick={() => handleApplyCustom(speaker.index)}
                            className="px-2 py-1.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 font-semibold"
                          >
                            OK
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            setOpenDropdown(openDropdown === speaker.index ? null : speaker.index)
                          }
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm text-left bg-white hover:bg-slate-50 flex items-center justify-between"
                        >
                          <span className="text-slate-400">Select speaker...</span>
                          {openDropdown === speaker.index ? (
                            <ChevronUp size={14} className="text-slate-400" />
                          ) : (
                            <ChevronDown size={14} className="text-slate-400" />
                          )}
                        </button>
                      )}

                      {/* Dropdown */}
                      {openDropdown === speaker.index && !isCustomMode && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-30 max-h-56 overflow-y-auto">
                          {/* V (Admin) */}
                          <button
                            onClick={() => handleSelectMapping(speaker.index, 'Dr. Bhardwaj', 'admin')}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-slate-100"
                          >
                            <span className="text-slate-800">Dr. Bhardwaj</span>
                            <span className="text-slate-400 ml-1 text-xs">admin / facilitator</span>
                          </button>

                          {/* Department contacts */}
                          {contacts.map((c) => (
                            <button
                              key={c.department_slug}
                              onClick={() =>
                                handleSelectMapping(speaker.index, c.head_name, c.department_slug)
                              }
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-slate-100 last:border-b-0"
                            >
                              <span className="text-slate-800">{c.head_name}</span>
                              <span className="text-slate-400 ml-1 text-xs">({c.department_name})</span>
                            </button>
                          ))}

                          {/* Custom */}
                          <button
                            onClick={() => {
                              setOpenDropdown(null);
                              handleCustomInput(speaker.index, '');
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm font-semibold text-blue-600 border-t border-slate-200"
                          >
                            + Custom Name
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        {hasAutoMappings && allDetectedHaveMappings ? (
          <button
            onClick={handleConfirmAll}
            disabled={saving}
            className="flex-1 px-3 py-2 bg-emerald-500 text-white rounded-lg text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Confirm All'}
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving || Object.keys(mappings).length === 0}
            className="flex-1 px-3 py-2 bg-blue-500 text-white rounded-lg text-sm font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
        <button
          onClick={() => {
            setIsExpanded(false);
            onSkip?.();
          }}
          className="px-3 py-2 text-slate-500 hover:text-slate-700 text-sm font-semibold"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
