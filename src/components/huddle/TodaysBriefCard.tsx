'use client';

import { useState, useEffect } from 'react';

interface HuddleToday {
  id: number;
  recording_status: string;
  transcript_status: string;
  duration_seconds: number | null;
  detected_speaker_count: number | null;
  started_at: string;
  chunk_count: number;
}

export default function TodaysBriefCard() {
  const [huddle, setHuddle] = useState<HuddleToday | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchToday = async () => {
      try {
        const res = await fetch('/api/huddle/today');
        if (res.ok) {
          const data = await res.json();
          setHuddle(data.huddle || null);
        }
      } catch {
        // Silently fail — card just won't show
      } finally {
        setLoading(false);
      }
    };

    fetchToday();
    // Poll every 30 seconds to catch state changes
    const interval = setInterval(fetchToday, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return null;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatClockTime = (isoString: string): string => {
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  // Determine card content based on huddle state
  let icon: string;
  let label: string;
  let sublabel: string | null = null;
  let bgClass: string;
  let borderClass: string;

  if (!huddle) {
    icon = '🎙';
    label = 'No recording yet';
    sublabel = 'Tap to open Daily Brief';
    bgClass = 'bg-slate-50';
    borderClass = 'border-slate-200';
  } else if (huddle.recording_status === 'recording') {
    icon = '🔴';
    label = `Recording since ${formatClockTime(huddle.started_at)}`;
    sublabel = `${huddle.chunk_count} chunks uploaded`;
    bgClass = 'bg-red-50';
    borderClass = 'border-red-200';
  } else if (huddle.transcript_status === 'processing' || huddle.recording_status === 'transcribing') {
    icon = '⏳';
    label = 'Transcribing...';
    sublabel = huddle.duration_seconds ? formatTime(huddle.duration_seconds) : 'Processing audio';
    bgClass = 'bg-amber-50';
    borderClass = 'border-amber-200';
  } else if (huddle.transcript_status === 'completed') {
    icon = '✅';
    const duration = huddle.duration_seconds ? formatTime(huddle.duration_seconds) : '';
    const speakers = huddle.detected_speaker_count ? `${huddle.detected_speaker_count} speakers` : '';
    label = [duration, speakers].filter(Boolean).join(' · ') || 'Transcript ready';
    sublabel = 'Tap to read transcript';
    bgClass = 'bg-emerald-50';
    borderClass = 'border-emerald-200';
  } else if (huddle.transcript_status === 'failed') {
    icon = '⚠️';
    label = 'Transcription failed';
    sublabel = 'Tap to retry';
    bgClass = 'bg-red-50';
    borderClass = 'border-red-200';
  } else {
    // uploaded, pending transcription
    icon = '⏳';
    label = huddle.duration_seconds ? `${formatTime(huddle.duration_seconds)} recorded` : 'Huddle recorded';
    sublabel = 'Awaiting transcription';
    bgClass = 'bg-blue-50';
    borderClass = 'border-blue-200';
  }

  return (
    <a
      href={huddle ? `/huddle?id=${huddle.id}` : '/huddle'}
      className={`block w-full p-4 rounded-xl border ${bgClass} ${borderClass} hover:shadow-md transition-shadow mb-4`}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">
            Today&apos;s Brief
          </p>
          <p className="text-sm text-slate-700">{label}</p>
          {sublabel && (
            <p className="text-xs text-slate-500 mt-0.5">{sublabel}</p>
          )}
        </div>
        <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </a>
  );
}
