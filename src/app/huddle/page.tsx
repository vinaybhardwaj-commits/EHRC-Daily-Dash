'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type HuddleState = 'loading' | 'no-huddle' | 'recording' | 'uploading' | 'uploaded' | 'error';

interface Huddle {
  id: string;
  date: string;
  recording_status: string;
  recording_session_id?: string;
  duration_seconds?: number;
  chunk_count?: number;
  created_at?: string;
  ended_at?: string;
  transcript_status?: string;
  transcript_text?: string;
  audio_url?: string;
}

export default function HuddlePage() {
  const [huddleState, setHuddleState] = useState<HuddleState>('loading');
  const [huddle, setHuddle] = useState<Huddle | null>(null);
  const [isRecorder] = useState(true); // For Sprint 1.1, always true
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [chunkCount, setChunkCount] = useState(0);
  const [lastFlush, setLastFlush] = useState<string>('');
  const [recordingSessionId, setRecordingSessionId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState<string>('');
  const [showKeyPrompt, setShowKeyPrompt] = useState(false);
  const [tmpKeyInput, setTmpKeyInput] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

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
          setHuddle(data.huddle);
          setChunkCount(data.huddle.chunk_count || 0);
          setRecordingSessionId(data.huddle.recording_session_id || '');

          if (data.huddle.recording_status === 'recording') {
            // Recording is already in progress from a previous page load
            setHuddleState('recording');
          } else if (data.huddle.recording_status === 'completed' || data.huddle.recording_status === 'uploaded') {
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

    // Load admin key from localStorage
    const storedKey = localStorage.getItem('ehrc_admin_key') || '';
    setAdminKey(storedKey);

    fetchHuddle();
  }, []);

  // Timer effect during recording
  useEffect(() => {
    if (huddleState !== 'recording') return;

    timerIntervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [huddleState]);

  const handleStartHuddle = useCallback(async () => {
    let keyToUse = adminKey;

    // If no key stored, prompt for it
    if (!keyToUse) {
      setShowKeyPrompt(true);
      return;
    }

    try {
      setHuddleState('loading');

      // Call POST /api/huddle/start
      const res = await fetch(`/api/huddle/start?key=${encodeURIComponent(keyToUse)}`, {
        method: 'POST',
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
      setRecordingSessionId(data.recording_session_id);
      setChunkCount(0);
      setElapsedSeconds(0);
      setLastFlush('');
      setError(null);

      // Request screen wake lock
      try {
        if (navigator.wakeLock) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch (wlErr) {
        console.warn('Wake lock request failed:', wlErr);
      }

      // Initialize MediaRecorder
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Find supported MIME type
      let mimeType = '';
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', ''];
      for (const candidate of candidates) {
        if (MediaRecorder.isTypeSupported(candidate)) {
          mimeType = candidate;
          break;
        }
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 32000,
      });

      // Handle chunk data
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size === 0) return;

        const formData = new FormData();
        formData.append('audio', event.data);
        formData.append('chunk_index', String(chunkCount));
        formData.append('recording_session_id', recordingSessionId);
        formData.append('mime_type', mimeType);

        try {
          const chunkRes = await fetch(`/api/huddle/${newHuddle.id}/chunk`, {
            method: 'POST',
            body: formData,
          });

          if (chunkRes.ok) {
            setChunkCount((prev) => prev + 1);
            setLastFlush(new Date().toLocaleTimeString());
          } else {
            console.error('Chunk upload failed:', await chunkRes.json());
          }
        } catch (chunkErr) {
          console.error('Chunk upload error:', chunkErr);
        }
      };

      // Start recording with 30 second timeslice
      mediaRecorder.start(30000);
      mediaRecorderRef.current = mediaRecorder;

      setHuddleState('recording');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errMsg);
      setHuddleState('error');
      console.error('Start huddle error:', err);
    }
  }, [adminKey, chunkCount, recordingSessionId]);

  const handleKeySubmit = useCallback(() => {
    if (!tmpKeyInput.trim()) {
      setError('Admin key cannot be empty');
      return;
    }

    setAdminKey(tmpKeyInput);
    localStorage.setItem('ehrc_admin_key', tmpKeyInput);
    setShowKeyPrompt(false);
    setTmpKeyInput('');

    // Now proceed with start huddle
    setHuddleState('loading');
    const startWithKey = async () => {
      try {
        const res = await fetch(`/api/huddle/start?key=${encodeURIComponent(tmpKeyInput)}`, {
          method: 'POST',
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
        setRecordingSessionId(data.recording_session_id);
        setChunkCount(0);
        setElapsedSeconds(0);
        setLastFlush('');
        setError(null);

        // Request screen wake lock
        try {
          if (navigator.wakeLock) {
            wakeLockRef.current = await navigator.wakeLock.request('screen');
          }
        } catch (wlErr) {
          console.warn('Wake lock request failed:', wlErr);
        }

        // Initialize MediaRecorder
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        let mimeType = '';
        const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', ''];
        for (const candidate of candidates) {
          if (MediaRecorder.isTypeSupported(candidate)) {
            mimeType = candidate;
            break;
          }
        }

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType,
          audioBitsPerSecond: 32000,
        });

        mediaRecorder.ondataavailable = async (event) => {
          if (event.data.size === 0) return;

          const formData = new FormData();
          formData.append('audio', event.data);
          formData.append('chunk_index', String(chunkCount));
          formData.append('recording_session_id', data.recording_session_id);
          formData.append('mime_type', mimeType);

          try {
            const chunkRes = await fetch(`/api/huddle/${newHuddle.id}/chunk`, {
              method: 'POST',
              body: formData,
            });

            if (chunkRes.ok) {
              setChunkCount((prev) => prev + 1);
              setLastFlush(new Date().toLocaleTimeString());
            } else {
              console.error('Chunk upload failed:', await chunkRes.json());
            }
          } catch (chunkErr) {
            console.error('Chunk upload error:', chunkErr);
          }
        };

        mediaRecorder.start(30000);
        mediaRecorderRef.current = mediaRecorder;

        setHuddleState('recording');
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errMsg);
        setHuddleState('error');
        console.error('Start huddle error:', err);
      }
    };

    startWithKey();
  }, [tmpKeyInput, chunkCount]);

  const handleEndHuddle = useCallback(async () => {
    if (!mediaRecorderRef.current || !huddle) return;

    try {
      setHuddleState('uploading');

      // Stop the MediaRecorder
      mediaRecorderRef.current.stop();

      // Wait for final chunk
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Release wake lock
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
        } catch (wlErr) {
          console.warn('Wake lock release failed:', wlErr);
        }
      }

      // Call finalize
      const res = await fetch(`/api/huddle/${huddle.id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_seconds: elapsedSeconds }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to finalize huddle');
      }

      // Clear timer
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

      setError(null);
      setHuddleState('uploaded');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errMsg);
      setHuddleState('error');
      console.error('End huddle error:', err);
    }
  }, [huddle, elapsedSeconds]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  // Render based on state
  const renderContent = () => {
    if (huddleState === 'loading') {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <p className="mt-4 text-slate-600">Loading huddle...</p>
          </div>
        </div>
      );
    }

    if (huddleState === 'error') {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center max-w-sm">
            <p className="text-red-600 font-semibold">Error</p>
            <p className="text-slate-600 mt-2">{error || 'Something went wrong'}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    if (showKeyPrompt) {
      return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-lg">
            <h2 className="text-lg font-bold text-slate-900">Admin Key Required</h2>
            <p className="text-sm text-slate-600 mt-2">Enter your admin key to start the huddle:</p>
            <input
              type="password"
              value={tmpKeyInput}
              onChange={(e) => setTmpKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleKeySubmit();
              }}
              placeholder="Enter admin key"
              className="w-full mt-4 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowKeyPrompt(false);
                  setTmpKeyInput('');
                }}
                className="flex-1 px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleKeySubmit}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-slate-900 p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
              <span>Daily Brief</span>
              {huddleState === 'recording' && (
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
              )}
            </h1>
            <p className="text-blue-100 text-sm mt-1">{dateStr}</p>
          </div>

          {/* Main Card */}
          <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
            {huddleState === 'no-huddle' && isRecorder && (
              <div className="text-center">
                <div className="flex justify-center mb-6">
                  <button
                    onClick={handleStartHuddle}
                    className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 shadow-md flex items-center justify-center transition-all active:scale-95"
                    title="Start Huddle"
                  >
                    <svg
                      className="w-8 h-8 text-white"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"></path>
                      <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V5a1 1 0 00-1-1H3zm11 3a1 1 0 10-2 0v3.076a1 1 0 001 1h.154a1 1 0 001-1V7zm-9 3a1 1 0 10-2 0v3.076a1 1 0 001 1h.154a1 1 0 001-1V10z"></path>
                    </svg>
                  </button>
                </div>
                <p className="text-slate-700 font-medium">Start Huddle</p>
              </div>
            )}

            {huddleState === 'no-huddle' && !isRecorder && (
              <div className="text-center py-8">
                <p className="text-slate-600 text-sm">
                  No recording yet today — check back after the morning meeting.
                </p>
              </div>
            )}

            {huddleState === 'recording' && (
              <div className="text-center">
                {/* Pulsing dot and timer */}
                <div className="flex justify-center mb-8">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center shadow-lg animate-pulse">
                      <span className="text-3xl font-bold text-white">
                        {formatTime(elapsedSeconds)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* End Huddle Button */}
                <button
                  onClick={handleEndHuddle}
                  className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-md transition-all active:scale-95 mb-6"
                >
                  End Huddle
                </button>

                {/* Status info */}
                <div className="text-xs text-slate-500 space-y-1">
                  <p>Recording to chunk {chunkCount} · Last flush {lastFlush || 'pending'}</p>
                  <p className="text-yellow-600 font-medium">⚠ Keep screen on</p>
                </div>
              </div>
            )}

            {huddleState === 'uploading' && (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <p className="mt-4 text-slate-600 text-sm">Finalizing huddle...</p>
              </div>
            )}

            {huddleState === 'uploaded' && (
              <div className="text-center">
                <div className="inline-block p-3 bg-emerald-100 rounded-full mb-4">
                  <svg className="w-6 h-6 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Huddle Recorded</h3>
                <div className="mt-4 text-sm text-slate-600 space-y-2">
                  <p>
                    <span className="font-medium">Duration:</span> {formatTime(elapsedSeconds)}
                  </p>
                  <p>
                    <span className="font-medium">Chunks:</span> {chunkCount}
                  </p>
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  Transcription coming in Sprint 1.2.
                </p>
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return <>{renderContent()}</>;
}
