'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import TranscriptViewer from '@/components/huddle/TranscriptViewer';
import SpeakerMappingBanner from '@/components/huddle/SpeakerMappingBanner';

type HuddleState = 'loading' | 'no-huddle' | 'recording' | 'uploading' | 'uploaded' | 'interrupted' | 'transcribing' | 'transcribed' | 'error';

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
  confidence?: number;
  source?: string;
}

interface Huddle {
  id: string;
  date: string;
  recording_status: string;
  recording_session_id?: string;
  duration_seconds?: number;
  chunk_count?: number;
  created_at?: string;
  started_at?: string;
  ended_at?: string;
  transcript_status?: string;
  transcript_text?: string;
  transcript_json?: TranscriptSegment[];
  audio_url?: string;
  detected_speaker_count?: number;
}

export default function HuddlePage() {
  const [huddleState, setHuddleState] = useState<HuddleState>('loading');
  const [huddle, setHuddle] = useState<Huddle | null>(null);
  const [isRecorder] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [chunkCount, setChunkCount] = useState(0);
  const [lastFlush, setLastFlush] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState<string>('');
  const [showKeyPrompt, setShowKeyPrompt] = useState(false);
  const [tmpKeyInput, setTmpKeyInput] = useState('');
  const [reRecordConfirm, setReRecordConfirm] = useState(false);
  const [keyPromptAction, setKeyPromptAction] = useState<'start' | 'rerecord' | 'save-interrupted'>('start');
  const [retrying, setRetrying] = useState(false);
  const [speakerMappings, setSpeakerMappings] = useState<Record<number, SpeakerMap>>({});

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const chunkCountRef = useRef(0);
  const isLiveRecording = useRef(false);
  const transcriptionPollRef = useRef<NodeJS.Timeout | null>(null);

  // Parse URL hash for initial seek time
  const getInitialSeek = (): number => {
    if (typeof window === 'undefined') return 0;
    const hash = window.location.hash;
    const match = hash.match(/^#t=(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  };

  // Fetch speaker mappings for a huddle
  const fetchSpeakerMappings = async (huddleId: string | number) => {
    try {
      const res = await fetch(`/api/huddle/${huddleId}/speakers`);
      if (res.ok) {
        const data = await res.json();
        const map: Record<number, SpeakerMap> = {};
        data.speakers?.forEach((s: any) => {
          map[s.speaker_index] = {
            display_name: s.display_name,
            department_slug: s.department_slug,
            confidence: s.confidence,
            source: s.source,
          };
        });
        setSpeakerMappings(map);
      }
    } catch {
      // Ignore speaker fetch errors
    }
  };

  // Fetch today's huddle on mount
  useEffect(() => {
    const fetchHuddle = async () => {
      try {
        const res = await fetch('/api/huddle/today');
        if (!res.ok) {
          setHuddleState('error');
          setError('Failed to fetch huddle data');
          return;
        }
        const data = await res.json();

        if (data.huddle) {
          const h = data.huddle;
          setHuddle(h);
          setChunkCount(h.chunk_count || 0);
          chunkCountRef.current = h.chunk_count || 0;

          if (h.recording_status === 'recording') {
            if (h.started_at) {
              const elapsed = Math.floor((Date.now() - new Date(h.started_at).getTime()) / 1000);
              setElapsedSeconds(elapsed);
            }
            setHuddleState('interrupted');
          } else if (h.transcript_status === 'completed' && h.transcript_json) {
            if (h.duration_seconds) setElapsedSeconds(h.duration_seconds);
            setHuddleState('transcribed');
            // Fetch speaker mappings
            fetchSpeakerMappings(h.id);
          } else if (h.transcript_status === 'processing' || h.recording_status === 'transcribing') {
            if (h.duration_seconds) setElapsedSeconds(h.duration_seconds);
            setHuddleState('transcribing');
          } else if (h.recording_status === 'uploaded' || h.recording_status === 'completed') {
            if (h.duration_seconds) setElapsedSeconds(h.duration_seconds);
            setHuddleState('uploaded');
          } else {
            setHuddleState('no-huddle');
          }
        } else {
          setHuddleState('no-huddle');
        }
      } catch (err) {
        console.error('Error fetching huddle:', err);
        setHuddleState('error');
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    const storedKey = localStorage.getItem('ehrc_admin_key') || '';
    setAdminKey(storedKey);
    fetchHuddle();
  }, []);

  // Poll for transcription completion when in transcribing or uploaded state
  // Also self-heals: if transcript_status is 'pending' (never attempted), triggers transcription
  const selfHealAttempted = useRef(false);
  useEffect(() => {
    if (huddleState !== 'transcribing' && huddleState !== 'uploaded') {
      selfHealAttempted.current = false;
      return;
    }

    transcriptionPollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/huddle/today');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.huddle) return;

        const h = data.huddle;
        if (h.transcript_status === 'completed' && h.transcript_json) {
          setHuddle(h);
          setElapsedSeconds(h.duration_seconds || 0);
          setHuddleState('transcribed');
          fetchSpeakerMappings(h.id);
          if (transcriptionPollRef.current) clearInterval(transcriptionPollRef.current);
        } else if (h.transcript_status === 'failed') {
          setHuddle(h);
          setHuddleState('uploaded');
          setError('Transcription failed. You can retry manually.');
          if (transcriptionPollRef.current) clearInterval(transcriptionPollRef.current);
        } else if (h.recording_status === 'transcribing') {
          setHuddleState('transcribing');
        } else if (
          (h.transcript_status === 'pending' || h.transcript_status === null) &&
          h.recording_status === 'uploaded' &&
          !selfHealAttempted.current
        ) {
          // Self-heal: transcription was never attempted, trigger it now
          selfHealAttempted.current = true;
          setHuddleState('transcribing');
          try {
            const txRes = await fetch(`/api/huddle/${h.id}/transcribe`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-trigger-type': 'auto' },
            });
            if (txRes.ok) {
              const refetch = await fetch('/api/huddle/today');
              if (refetch.ok) {
                const d2 = await refetch.json();
                if (d2.huddle?.transcript_status === 'completed' && d2.huddle?.transcript_json) {
                  setHuddle(d2.huddle);
                  setElapsedSeconds(d2.huddle.duration_seconds || 0);
                  setHuddleState('transcribed');
                  if (transcriptionPollRef.current) clearInterval(transcriptionPollRef.current);
                }
              }
            } else {
              const errData = await txRes.json().catch(() => ({}));
              setError(errData.error || 'Auto-transcription failed');
              setHuddleState('uploaded');
              if (transcriptionPollRef.current) clearInterval(transcriptionPollRef.current);
            }
          } catch {
            setHuddleState('uploaded');
          }
        }
      } catch {
        // Ignore poll errors
      }
    }, 10000); // Poll every 10 seconds

    return () => {
      if (transcriptionPollRef.current) clearInterval(transcriptionPollRef.current);
    };
  }, [huddleState]);

  // Timer effect during LIVE recording only
  useEffect(() => {
    if (huddleState !== 'recording' || !isLiveRecording.current) return;
    timerIntervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [huddleState]);

  const startRecording = useCallback(async (keyToUse: string, abandonHuddleId?: string) => {
    try {
      setHuddleState('loading');
      if (abandonHuddleId) {
        const abandonRes = await fetch(`/api/huddle/${abandonHuddleId}/abandon`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': keyToUse },
          body: JSON.stringify({ reason: 'Re-recording initiated by recorder' }),
        });
        if (!abandonRes.ok) {
          const errData = await abandonRes.json();
          throw new Error(errData.error || 'Failed to abandon previous huddle');
        }
      }

      const res = await fetch(`/api/huddle/start`, {
        method: 'POST',
        headers: { 'x-admin-key': keyToUse },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to start huddle');
      }

      const data = await res.json();
      const newHuddle: Huddle = {
        id: data.huddle_id,
        date: data.date,
        recording_status: 'recording',
        recording_session_id: data.recording_session_id,
      };
      setHuddle(newHuddle);
      setChunkCount(0);
      chunkCountRef.current = 0;
      setElapsedSeconds(0);
      setLastFlush('');
      setError(null);

      try {
        if (navigator.wakeLock) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch (wlErr) {
        console.warn('Wake lock failed:', wlErr);
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = '';
      for (const candidate of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', '']) {
        if (MediaRecorder.isTypeSupported(candidate)) { mimeType = candidate; break; }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size === 0) return;
        const currentChunkIndex = chunkCountRef.current;
        const formData = new FormData();
        formData.append('audio', event.data);
        formData.append('chunk_index', String(currentChunkIndex));
        formData.append('recording_session_id', data.recording_session_id);
        formData.append('mime_type', mimeType);
        try {
          const chunkRes = await fetch(`/api/huddle/${newHuddle.id}/chunk`, { method: 'POST', body: formData });
          if (chunkRes.ok) {
            chunkCountRef.current += 1;
            setChunkCount(chunkCountRef.current);
            setLastFlush(new Date().toLocaleTimeString());
          }
        } catch (chunkErr) {
          console.error('Chunk upload error:', chunkErr);
        }
      };

      mediaRecorder.start(30000);
      mediaRecorderRef.current = mediaRecorder;
      isLiveRecording.current = true;
      setHuddleState('recording');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setHuddleState('error');
    }
  }, []);

  const handleStartHuddle = useCallback(async () => {
    if (!adminKey) { setKeyPromptAction('start'); setShowKeyPrompt(true); return; }
    await startRecording(adminKey);
  }, [adminKey, startRecording]);

  const handleKeySubmit = useCallback(() => {
    if (!tmpKeyInput.trim()) { setError('Admin key cannot be empty'); return; }
    const key = tmpKeyInput;
    setAdminKey(key);
    localStorage.setItem('ehrc_admin_key', key);
    setShowKeyPrompt(false);
    setTmpKeyInput('');
    if (keyPromptAction === 'start') startRecording(key);
    else if (keyPromptAction === 'rerecord' && huddle) { setReRecordConfirm(false); startRecording(key, huddle.id); }
    else if (keyPromptAction === 'save-interrupted' && huddle) finalizeInterrupted(key);
  }, [tmpKeyInput, keyPromptAction, huddle]);

  const handleReRecord = useCallback(async () => {
    if (!huddle) return;
    if (!adminKey) { setKeyPromptAction('rerecord'); setShowKeyPrompt(true); return; }
    setReRecordConfirm(false);
    await startRecording(adminKey, huddle.id);
  }, [adminKey, huddle, startRecording]);

  const finalizeInterrupted = useCallback(async (keyOverride?: string) => {
    const keyToUse = keyOverride || adminKey;
    if (!keyToUse) { setKeyPromptAction('save-interrupted'); setShowKeyPrompt(true); return; }
    try {
      setHuddleState('uploading');
      const todayRes = await fetch('/api/huddle/today');
      if (!todayRes.ok) throw new Error('Could not check current huddle status');
      const todayData = await todayRes.json();
      if (!todayData.huddle) throw new Error('No active huddle found for today.');
      const currentHuddle = todayData.huddle;
      if (currentHuddle.recording_status !== 'recording') {
        if (currentHuddle.recording_status === 'uploaded' || currentHuddle.recording_status === 'completed') {
          setHuddle(currentHuddle);
          setChunkCount(currentHuddle.chunk_count || 0);
          setElapsedSeconds(currentHuddle.duration_seconds || 0);
          setHuddleState('uploaded');
          return;
        }
        throw new Error(`Huddle is in "${currentHuddle.recording_status}" status and cannot be finalized.`);
      }
      const res = await fetch(`/api/huddle/${currentHuddle.id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_seconds: 0, compute_from_server: true }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.details || errData.error || 'Failed to finalize huddle');
      }
      const data = await res.json();
      setHuddle(currentHuddle);
      setChunkCount(currentHuddle.chunk_count || 0);
      if (data.duration_seconds) setElapsedSeconds(data.duration_seconds);
      setError(null);
      setHuddleState('transcribing');

      // Trigger transcription from client
      try {
        const txRes = await fetch(`/api/huddle/${currentHuddle.id}/transcribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-trigger-type': 'auto' },
        });
        if (txRes.ok) {
          const todayRes = await fetch('/api/huddle/today');
          if (todayRes.ok) {
            const todayData2 = await todayRes.json();
            if (todayData2.huddle?.transcript_status === 'completed' && todayData2.huddle?.transcript_json) {
              setHuddle(todayData2.huddle);
              setElapsedSeconds(todayData2.huddle.duration_seconds || 0);
              setHuddleState('transcribed');
              return;
            }
          }
        }
      } catch (txErr) {
        console.error('Client transcription trigger error:', txErr);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setHuddleState('error');
    }
  }, [adminKey]);

  const handleEndHuddle = useCallback(async () => {
    if (!huddle) return;
    if (!mediaRecorderRef.current || !isLiveRecording.current) {
      await finalizeInterrupted();
      return;
    }
    try {
      setHuddleState('uploading');
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      isLiveRecording.current = false;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (wakeLockRef.current) {
        try { await wakeLockRef.current.release(); } catch {}
      }
      const res = await fetch(`/api/huddle/${huddle.id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_seconds: elapsedSeconds }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to finalize huddle');
      }
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      setError(null);
      setHuddleState('transcribing');

      // Trigger transcription from client (fire-and-forget on server is unreliable on Vercel)
      try {
        const txRes = await fetch(`/api/huddle/${huddle.id}/transcribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-trigger-type': 'auto' },
        });
        if (txRes.ok) {
          // Transcription completed — refresh huddle data
          const todayRes = await fetch('/api/huddle/today');
          if (todayRes.ok) {
            const data = await todayRes.json();
            if (data.huddle) {
              setHuddle(data.huddle);
              if (data.huddle.transcript_status === 'completed' && data.huddle.transcript_json) {
                setElapsedSeconds(data.huddle.duration_seconds || 0);
                setHuddleState('transcribed');
                return;
              }
            }
          }
        } else {
          const errData = await txRes.json().catch(() => ({ error: 'Unknown transcription error' }));
          console.error('Client transcription trigger failed:', errData);
          setError(errData.error || 'Transcription failed');
          // Refresh huddle to get actual DB state
          const todayRes2 = await fetch('/api/huddle/today');
          if (todayRes2.ok) {
            const data2 = await todayRes2.json();
            if (data2.huddle) {
              setHuddle(data2.huddle);
              setElapsedSeconds(data2.huddle.duration_seconds || 0);
            }
          }
          setHuddleState('uploaded');
        }
      } catch (txErr) {
        console.error('Client transcription trigger error:', txErr);
        setError(txErr instanceof Error ? txErr.message : 'Transcription request failed');
        setHuddleState('uploaded');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setHuddleState('error');
    }
  }, [huddle, elapsedSeconds, finalizeInterrupted]);

  const handleRetryTranscription = useCallback(async () => {
    if (!huddle) return;
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch(`/api/huddle/${huddle.id}/transcribe`, {
        method: 'POST',
        headers: { 'x-trigger-type': 'manual' },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.details || errData.error || 'Transcription failed');
      }
      // Re-fetch huddle to get transcript
      const todayRes = await fetch('/api/huddle/today');
      if (todayRes.ok) {
        const data = await todayRes.json();
        if (data.huddle) {
          setHuddle(data.huddle);
          if (data.huddle.transcript_status === 'completed' && data.huddle.transcript_json) {
            setElapsedSeconds(data.huddle.duration_seconds || 0);
            setHuddleState('transcribed');
          } else {
            setHuddleState('transcribing');
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(false);
    }
  }, [huddle]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // --- DIALOGS ---
  if (showKeyPrompt) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-lg">
          <h2 className="text-lg font-bold text-slate-900">Admin Key Required</h2>
          <p className="text-sm text-slate-600 mt-2">Enter your admin key to continue:</p>
          <input type="password" value={tmpKeyInput} onChange={(e) => setTmpKeyInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleKeySubmit(); }}
            placeholder="Enter admin key"
            className="w-full mt-4 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
          <div className="flex gap-3 mt-6">
            <button onClick={() => { setShowKeyPrompt(false); setTmpKeyInput(''); }}
              className="flex-1 px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
            <button onClick={handleKeySubmit}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Submit</button>
          </div>
        </div>
      </div>
    );
  }

  if (reRecordConfirm) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-lg">
          <h2 className="text-lg font-bold text-slate-900">Re-record Today&apos;s Huddle?</h2>
          <p className="text-sm text-slate-600 mt-2">
            This will discard the current recording ({formatTime(elapsedSeconds)}, {chunkCount} chunks) and start fresh.
          </p>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setReRecordConfirm(false)}
              className="flex-1 px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50">Keep Current</button>
            <button onClick={handleReRecord}
              className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">Re-record</button>
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN PAGE ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-slate-900 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
              <span>Daily Brief</span>
              {huddleState === 'recording' && <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />}
              {huddleState === 'interrupted' && <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />}
              {huddleState === 'transcribing' && <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />}
            </h1>
            <a href="/" className="text-sm text-blue-200 hover:text-white transition-colors">
              ← Dashboard
            </a>
          </div>
          <p className="text-blue-100 text-sm mt-1">{dateStr}</p>
        </div>

        {/* Loading */}
        {huddleState === 'loading' && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            <p className="mt-4 text-slate-600">Loading huddle...</p>
          </div>
        )}

        {/* Error */}
        {huddleState === 'error' && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <p className="text-red-600 font-semibold">Error</p>
            <p className="text-slate-600 mt-2">{error || 'Something went wrong'}</p>
            <button onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Reload Page</button>
          </div>
        )}

        {/* No Huddle */}
        {huddleState === 'no-huddle' && (
          <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 text-center">
            {isRecorder ? (
              <>
                <div className="flex justify-center mb-6">
                  <button onClick={handleStartHuddle}
                    className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 shadow-md flex items-center justify-center transition-all active:scale-95" title="Start Huddle">
                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" />
                    </svg>
                  </button>
                </div>
                <p className="text-slate-700 font-medium">Start Huddle</p>
              </>
            ) : (
              <p className="text-slate-600 text-sm py-8">No recording yet today — check back after the morning meeting.</p>
            )}
          </div>
        )}

        {/* Interrupted */}
        {huddleState === 'interrupted' && (
          <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 text-center">
            <div className="inline-block p-3 bg-amber-100 rounded-full mb-4">
              <svg className="w-6 h-6 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Recording Interrupted</h3>
            <p className="mt-2 text-sm text-slate-600">The browser was closed while recording was in progress.</p>
            <div className="mt-4 text-sm text-slate-600 space-y-1">
              <p><span className="font-medium">Chunks saved:</span> {chunkCount}</p>
              {chunkCount > 0 && <p><span className="font-medium">Audio captured:</span> ~{formatTime(chunkCount * 30)}</p>}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              {chunkCount > 0 && (
                <button onClick={() => finalizeInterrupted()}
                  className="flex-1 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg transition-all active:scale-95">
                  Save What We Have</button>
              )}
              <button onClick={() => { if (huddle) setReRecordConfirm(true); }}
                className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-all active:scale-95">
                Discard &amp; Re-record</button>
            </div>
          </div>
        )}

        {/* Recording */}
        {huddleState === 'recording' && (
          <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 text-center">
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center shadow-lg animate-pulse">
                <span className="text-3xl font-bold text-white">{formatTime(elapsedSeconds)}</span>
              </div>
            </div>
            <button onClick={handleEndHuddle}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-md transition-all active:scale-95 mb-6">
              End Huddle</button>
            <div className="text-xs text-slate-500 space-y-1">
              <p>Chunks uploaded: {chunkCount} · Last flush {lastFlush || 'pending'}</p>
              <p className="text-yellow-600 font-medium">Keep screen on</p>
            </div>
          </div>
        )}

        {/* Uploading / Finalizing */}
        {huddleState === 'uploading' && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            <p className="mt-4 text-slate-600 text-sm">Finalizing huddle...</p>
          </div>
        )}

        {/* Uploaded (awaiting transcription or failed) */}
        {huddleState === 'uploaded' && (
          <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 text-center">
            <div className="inline-block p-3 bg-emerald-100 rounded-full mb-4">
              <svg className="w-6 h-6 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Huddle Recorded</h3>
            <div className="mt-4 text-sm text-slate-600 space-y-2">
              <p><span className="font-medium">Duration:</span> {formatTime(elapsedSeconds)}</p>
              <p><span className="font-medium">Chunks:</span> {chunkCount}</p>
            </div>

            {huddle?.transcript_status === 'failed' ? (
              <div className="mt-4">
                <p className="text-sm text-red-600 mb-3">Transcription failed.</p>
                <button onClick={handleRetryTranscription} disabled={retrying}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">
                  {retrying ? 'Retrying...' : 'Retry Transcription'}
                </button>
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-500">Awaiting transcription...</p>
            )}

            {isRecorder && (
              <button onClick={() => setReRecordConfirm(true)}
                className="mt-6 px-4 py-2 text-sm text-slate-500 border border-slate-300 rounded-lg hover:bg-slate-50 hover:text-slate-700 transition-colors">
                Re-record</button>
            )}
          </div>
        )}

        {/* Transcribing */}
        {huddleState === 'transcribing' && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
            <h3 className="text-lg font-semibold text-slate-900 mt-4">Transcribing...</h3>
            <p className="mt-2 text-sm text-slate-600">
              Deepgram is processing {formatTime(elapsedSeconds)} of audio. This usually takes 1-2 minutes.
            </p>
          </div>
        )}

        {/* Transcribed — Show Transcript Viewer */}
        {huddleState === 'transcribed' && huddle && (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="bg-white/10 backdrop-blur rounded-xl p-4 flex items-center justify-between">
              <div className="text-sm text-white">
                <span className="font-semibold">{formatTime(elapsedSeconds)}</span>
                {huddle.detected_speaker_count && (
                  <span className="ml-2 text-blue-200">· {huddle.detected_speaker_count} speakers</span>
                )}
                {huddle.transcript_json && (
                  <span className="ml-2 text-blue-200">· {huddle.transcript_json.length} segments</span>
                )}
              </div>
              {isRecorder && (
                <button onClick={() => setReRecordConfirm(true)}
                  className="text-xs text-blue-200 hover:text-white border border-blue-300/30 px-3 py-1 rounded-lg hover:bg-white/10 transition-colors">
                  Re-record</button>
              )}
            </div>

            {/* Speaker Mapping Banner */}
            {huddle.transcript_json && huddle.transcript_json.length > 0 && (
              (() => {
                const detectedIndices = new Set(huddle.transcript_json.map(seg => seg.speaker));
                const hasUnmapped = Array.from(detectedIndices).some(idx => !speakerMappings[idx]);
                const hasAutoMappings = Object.values(speakerMappings).some(m => m.source === 'auto');

                // Show banner if unmapped speakers or auto-IDs need review
                if (hasUnmapped || hasAutoMappings || Object.keys(speakerMappings).length > 0) {
                  const SC = [
                    'bg-blue-50 border-blue-200',
                    'bg-emerald-50 border-emerald-200',
                    'bg-purple-50 border-purple-200',
                    'bg-amber-50 border-amber-200',
                    'bg-rose-50 border-rose-200',
                    'bg-cyan-50 border-cyan-200',
                  ];
                  const STC = [
                    'text-blue-700',
                    'text-emerald-700',
                    'text-purple-700',
                    'text-amber-700',
                    'text-rose-700',
                    'text-cyan-700',
                  ];
                  const detectedSpeakers = Array.from(detectedIndices).sort().map(idx => ({
                    index: idx,
                    color: SC[idx % SC.length],
                    textColor: STC[idx % STC.length],
                  }));

                  return (
                    <SpeakerMappingBanner
                      huddleId={huddle.id}
                      detectedSpeakers={detectedSpeakers}
                      existingMappings={speakerMappings}
                      onMappingSaved={(newMappings) => {
                        const newMap: Record<number, SpeakerMap> = { ...speakerMappings };
                        newMappings.forEach((m: any) => {
                          newMap[m.speaker_index] = {
                            display_name: m.display_name,
                            department_slug: m.department_slug,
                            confidence: m.confidence ?? 1.0,
                            source: m.source ?? 'manual',
                          };
                        });
                        setSpeakerMappings(newMap);
                      }}
                    />
                  );
                }
                return null;
              })()
            )}

            {/* Transcript */}
            <TranscriptViewer
              huddleId={huddle.id}
              segments={huddle.transcript_json || []}
              audioUrl={`/api/huddle/${huddle.id}/audio`}
              initialSeekSeconds={getInitialSeek()}
              speakerMap={speakerMappings}
            />
          </div>
        )}

        {/* Error bar (non-blocking) */}
        {error && huddleState !== 'error' && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
