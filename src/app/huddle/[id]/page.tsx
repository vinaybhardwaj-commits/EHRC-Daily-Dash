'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import TranscriptViewer from '@/components/huddle/TranscriptViewer';

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker: number;
  speaker_confidence: number;
}

interface Huddle {
  id: number;
  date: string;
  recording_status: string;
  transcript_status?: string;
  transcript_text?: string;
  transcript_json?: TranscriptSegment[];
  audio_url?: string;
  duration_seconds?: number;
  detected_speaker_count?: number;
  started_at?: string;
  ended_at?: string;
  chunk_count?: number;
}

export default function HuddleDetailPage() {
  const params = useParams();
  const huddleId = params.id as string;

  const [huddle, setHuddle] = useState<Huddle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  // Parse URL hash for initial seek time
  const getInitialSeek = (): number => {
    if (typeof window === 'undefined') return 0;
    const hash = window.location.hash;
    const match = hash.match(/^#t=(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  };

  useEffect(() => {
    const fetchHuddle = async () => {
      try {
        const res = await fetch(`/api/huddle/${huddleId}`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Huddle not found');
          return;
        }
        const data = await res.json();
        setHuddle(data.huddle);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load huddle');
      } finally {
        setLoading(false);
      }
    };

    if (huddleId) fetchHuddle();
  }, [huddleId]);

  // Poll while transcribing
  useEffect(() => {
    if (!huddle) return;
    if (huddle.transcript_status === 'completed' || huddle.transcript_status === 'failed') return;
    if (huddle.recording_status !== 'uploaded' && huddle.recording_status !== 'transcribing') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/huddle/${huddleId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.huddle) {
          setHuddle(data.huddle);
          if (data.huddle.transcript_status === 'completed' || data.huddle.transcript_status === 'failed') {
            clearInterval(interval);
          }
        }
      } catch {
        // Ignore poll errors
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [huddle, huddleId]);

  const handleRetryTranscription = async () => {
    if (!huddle) return;
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch(`/api/huddle/${huddle.id}/transcribe`, {
        method: 'POST',
        headers: { 'x-trigger-type': 'manual-retry' },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.details || errData.error || 'Transcription failed');
      }
      // Re-fetch
      const refetchRes = await fetch(`/api/huddle/${huddleId}`);
      if (refetchRes.ok) {
        const data = await refetchRes.json();
        setHuddle(data.huddle);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-slate-900 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Daily Brief</h1>
            <div className="flex items-center gap-3">
              <a href="/huddle" className="text-sm text-blue-200 hover:text-white transition-colors">
                ← Today
              </a>
              <a href="/" className="text-sm text-blue-200 hover:text-white transition-colors">
                Dashboard
              </a>
            </div>
          </div>
          {huddle && (
            <p className="text-blue-100 text-sm mt-1">{formatDate(huddle.date)}</p>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            <p className="mt-4 text-slate-600">Loading huddle...</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && !huddle && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <p className="text-red-600 font-semibold">Error</p>
            <p className="text-slate-600 mt-2">{error}</p>
            <a href="/huddle"
              className="inline-block mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
              Go to Today&apos;s Brief
            </a>
          </div>
        )}

        {/* Huddle loaded */}
        {!loading && huddle && (
          <>
            {/* Transcript ready */}
            {huddle.transcript_status === 'completed' && huddle.transcript_json ? (
              <div className="space-y-4">
                {/* Summary bar */}
                <div className="bg-white/10 backdrop-blur rounded-xl p-4 flex items-center justify-between">
                  <div className="text-sm text-white">
                    <span className="font-semibold">
                      {huddle.duration_seconds ? formatTime(huddle.duration_seconds) : '--:--'}
                    </span>
                    {huddle.detected_speaker_count && (
                      <span className="ml-2 text-blue-200">· {huddle.detected_speaker_count} speakers</span>
                    )}
                    <span className="ml-2 text-blue-200">· {huddle.transcript_json.length} segments</span>
                  </div>
                </div>

                <TranscriptViewer
                  huddleId={huddle.id}
                  segments={huddle.transcript_json}
                  audioUrl={`/api/huddle/${huddle.id}/audio`}
                  initialSeekSeconds={getInitialSeek()}
                />
              </div>
            ) : huddle.transcript_status === 'processing' || huddle.recording_status === 'transcribing' ? (
              /* Transcribing */
              <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
                <h3 className="text-lg font-semibold text-slate-900 mt-4">Transcribing...</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Processing{huddle.duration_seconds ? ` ${formatTime(huddle.duration_seconds)} of` : ''} audio. This usually takes 1-2 minutes.
                </p>
              </div>
            ) : huddle.transcript_status === 'failed' ? (
              /* Failed */
              <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
                <div className="inline-block p-3 bg-red-100 rounded-full mb-4">
                  <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Transcription Failed</h3>
                <p className="mt-2 text-sm text-slate-600">
                  {huddle.duration_seconds ? `${formatTime(huddle.duration_seconds)} recorded` : 'Audio recorded'} but transcription could not complete.
                </p>
                {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
                <button onClick={handleRetryTranscription} disabled={retrying}
                  className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">
                  {retrying ? 'Retrying...' : 'Retry Transcription'}
                </button>
              </div>
            ) : (
              /* Uploaded / waiting */
              <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
                <div className="inline-block p-3 bg-blue-100 rounded-full mb-4">
                  <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Awaiting Transcription</h3>
                <p className="mt-2 text-sm text-slate-600">
                  {huddle.duration_seconds ? `${formatTime(huddle.duration_seconds)} recorded` : 'Audio recorded'}
                  {huddle.chunk_count ? ` · ${huddle.chunk_count} chunks` : ''}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
