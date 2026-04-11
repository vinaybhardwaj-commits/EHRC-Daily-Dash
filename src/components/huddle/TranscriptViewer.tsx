'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker: number;
  speaker_confidence: number;
}

interface SpeakerMap {
  display_name: string;
  department_slug?: string;
}

interface EditRecord {
  id: number;
  segment_index: number;
  original_text: string;
  edited_text: string;
  edited_at: string;
}

interface TranscriptViewerProps {
  huddleId: string | number;
  segments: TranscriptSegment[];
  audioUrl: string;
  initialSeekSeconds?: number;
  speakerMap?: Record<number, SpeakerMap>;
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

const SPEED_OPTIONS = [1, 1.5, 2];

export default function TranscriptViewer({
  huddleId,
  segments: initialSegments,
  audioUrl,
  initialSeekSeconds,
  speakerMap,
}: TranscriptViewerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [segments, setSegments] = useState(initialSegments);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);

  // Edit state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Edit history popover
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [historyEdits, setHistoryEdits] = useState<EditRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Track which segments have been edited (for visual indicator)
  const [editedSegments, setEditedSegments] = useState<Set<number>>(new Set());

  // Update segments when props change
  useEffect(() => {
    setSegments(initialSegments);
  }, [initialSegments]);

  // Fetch edit counts on mount to show indicators
  useEffect(() => {
    const fetchEditedSegments = async () => {
      try {
        const res = await fetch(`/api/huddle/${huddleId}/transcript-edit`);
        if (res.ok) {
          const data = await res.json();
          const edited = new Set<number>(data.edits?.map((e: EditRecord) => e.segment_index) || []);
          setEditedSegments(edited);
        }
      } catch {
        // ignore
      }
    };
    fetchEditedSegments();
  }, [huddleId]);

  // Handle initial seek from URL hash
  useEffect(() => {
    if (initialSeekSeconds !== undefined && initialSeekSeconds > 0 && audioRef.current) {
      audioRef.current.currentTime = initialSeekSeconds;
      const targetIdx = segments.findIndex(
        (seg) => seg.start <= initialSeekSeconds && seg.end >= initialSeekSeconds
      );
      if (targetIdx >= 0) scrollToSegment(targetIdx);
    }
  }, [initialSeekSeconds, segments]);

  // Track current time during playback
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      const t = audio.currentTime;
      setCurrentTime(t);
      const idx = segments.findIndex((seg) => t >= seg.start && t <= seg.end);
      if (idx !== activeSegmentIndex) setActiveSegmentIndex(idx);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [segments, activeSegmentIndex]);

  const scrollToSegment = useCallback((index: number) => {
    const el = segmentRefs.current.get(index);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const seekTo = useCallback((seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      audioRef.current.play();
    }
  }, []);

  const toggleSpeed = useCallback(() => {
    const nextIndex = (speedIndex + 1) % SPEED_OPTIONS.length;
    setSpeedIndex(nextIndex);
    if (audioRef.current) audioRef.current.playbackRate = SPEED_OPTIONS[nextIndex];
  }, [speedIndex]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const getSpeakerLabel = (speakerIndex: number): string => {
    if (speakerMap && speakerMap[speakerIndex]) {
      const mapped = speakerMap[speakerIndex];
      const deptSlug = mapped.department_slug;
      return deptSlug ? `${mapped.display_name} (${deptSlug})` : mapped.display_name;
    }
    return `Speaker ${speakerIndex}`;
  };

  // ─── Edit handlers ────────────────────────────────────────────────

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditText(segments[index].text);
    setEditError('');
    // Focus textarea after render
    setTimeout(() => editTextareaRef.current?.focus(), 50);
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditText('');
    setEditError('');
  };

  const saveEdit = async () => {
    if (editingIndex === null) return;
    const trimmed = editText.trim();
    if (!trimmed) {
      setEditError('Text cannot be empty');
      return;
    }
    if (trimmed === segments[editingIndex].text) {
      cancelEditing();
      return;
    }

    setSaving(true);
    setEditError('');

    try {
      const res = await fetch(`/api/huddle/${huddleId}/transcript-edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment_index: editingIndex, text: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Save failed');
      }

      // Update local segment
      setSegments((prev) => {
        const updated = [...prev];
        updated[editingIndex] = { ...updated[editingIndex], text: trimmed };
        return updated;
      });

      // Mark as edited
      setEditedSegments((prev) => new Set(prev).add(editingIndex));

      cancelEditing();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // ─── Edit history ─────────────────────────────────────────────────

  const toggleHistory = async (index: number) => {
    if (historyIndex === index) {
      setHistoryIndex(null);
      return;
    }

    setHistoryIndex(index);
    setHistoryLoading(true);
    setHistoryEdits([]);

    try {
      const res = await fetch(`/api/huddle/${huddleId}/transcript-edit?segment=${index}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryEdits(data.edits || []);
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  };

  const formatEditTime = (dateStr: string): string => {
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', {
      day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="space-y-4">
      {/* Audio Player */}
      <div className="bg-slate-900 rounded-xl p-4 sticky top-0 z-10 shadow-lg">
        <audio ref={audioRef} src={audioUrl} preload="metadata" className="w-full" controls />
        <div className="flex items-center justify-between mt-3">
          <div className="text-xs text-slate-400">
            {formatTime(currentTime)} / {segments.length > 0 ? formatTime(segments[segments.length - 1].end) : '00:00'}
          </div>
          <button
            onClick={toggleSpeed}
            className="px-3 py-1 text-xs font-bold bg-slate-700 text-slate-200 rounded-full hover:bg-slate-600 transition-colors"
          >
            {SPEED_OPTIONS[speedIndex]}x
          </button>
        </div>
      </div>

      {/* Transcript Segments */}
      <div className="space-y-2">
        {segments.map((segment, index) => {
          const colorIdx = segment.speaker % SPEAKER_COLORS.length;
          const isActive = index === activeSegmentIndex;
          const isEditing = editingIndex === index;
          const hasEdits = editedSegments.has(index);
          const showHistory = historyIndex === index;

          return (
            <div
              key={index}
              ref={(el) => { if (el) segmentRefs.current.set(index, el); }}
              className={`p-3 rounded-lg border transition-all ${
                SPEAKER_COLORS[colorIdx]
              } ${isActive ? 'ring-2 ring-blue-500 shadow-md' : ''} ${
                isEditing ? 'ring-2 ring-amber-400' : ''
              }`}
            >
              {/* Header row: timestamp, speaker, actions */}
              <div className="flex items-center gap-2 mb-1">
                <button
                  onClick={() => seekTo(segment.start)}
                  className="text-xs font-mono text-slate-500 hover:text-blue-600 hover:underline"
                >
                  {formatTime(segment.start)}
                </button>
                <span className={`text-xs font-semibold ${SPEAKER_TEXT_COLORS[colorIdx]}`}>
                  {getSpeakerLabel(segment.speaker)}
                </span>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Edit indicator + button */}
                {!isEditing && (
                  <div className="flex items-center gap-1">
                    {hasEdits && (
                      <button
                        onClick={() => toggleHistory(index)}
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          showHistory
                            ? 'bg-amber-200 text-amber-800'
                            : 'bg-amber-100 text-amber-600 hover:bg-amber-200'
                        }`}
                        title="View edit history"
                      >
                        edited
                      </button>
                    )}
                    <button
                      onClick={() => startEditing(index)}
                      className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-white/50"
                      title="Edit this segment"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        <path d="m15 5 4 4" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* Segment text or edit textarea */}
              {isEditing ? (
                <div className="space-y-2">
                  <textarea
                    ref={editTextareaRef}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit();
                      if (e.key === 'Escape') cancelEditing();
                    }}
                    rows={Math.max(2, Math.ceil(editText.length / 80))}
                    className="w-full px-3 py-2 text-sm text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  />
                  {editError && (
                    <p className="text-xs text-red-600">{editError}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={saveEdit}
                      disabled={saving}
                      className="px-3 py-1 text-xs font-semibold bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="px-3 py-1 text-xs text-slate-600 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                    <span className="text-xs text-slate-400 ml-auto">⌘+Enter to save · Esc to cancel</span>
                  </div>
                </div>
              ) : (
                <p
                  className="text-sm text-slate-800 leading-relaxed cursor-pointer"
                  onClick={() => seekTo(segment.start)}
                >
                  {segment.text}
                </p>
              )}

              {/* Edit history popover */}
              {showHistory && !isEditing && (
                <div className="mt-2 p-3 bg-white/80 rounded-lg border border-amber-200 space-y-2">
                  <div className="text-xs font-semibold text-amber-800">Edit History</div>
                  {historyLoading ? (
                    <p className="text-xs text-slate-400">Loading...</p>
                  ) : historyEdits.length === 0 ? (
                    <p className="text-xs text-slate-400">No edits recorded</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {historyEdits.map((edit) => (
                        <div key={edit.id} className="text-xs space-y-1">
                          <div className="text-slate-400">{formatEditTime(edit.edited_at)}</div>
                          <div className="flex gap-2">
                            <div className="flex-1 p-1.5 bg-red-50 rounded text-red-700 line-through">
                              {edit.original_text.length > 120
                                ? edit.original_text.slice(0, 120) + '...'
                                : edit.original_text}
                            </div>
                            <div className="flex-1 p-1.5 bg-emerald-50 rounded text-emerald-700">
                              {edit.edited_text.length > 120
                                ? edit.edited_text.slice(0, 120) + '...'
                                : edit.edited_text}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setHistoryIndex(null)}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
