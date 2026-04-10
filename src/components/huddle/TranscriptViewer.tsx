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
  segments,
  audioUrl,
  initialSeekSeconds,
  speakerMap,
}: TranscriptViewerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);

  // Handle initial seek from URL hash
  useEffect(() => {
    if (initialSeekSeconds !== undefined && initialSeekSeconds > 0 && audioRef.current) {
      audioRef.current.currentTime = initialSeekSeconds;
      // Scroll to the segment closest to this time
      const targetIdx = segments.findIndex(
        (seg) => seg.start <= initialSeekSeconds && seg.end >= initialSeekSeconds
      );
      if (targetIdx >= 0) {
        scrollToSegment(targetIdx);
      }
    }
  }, [initialSeekSeconds, segments]);

  // Track current time during playback
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      const t = audio.currentTime;
      setCurrentTime(t);

      // Find active segment
      const idx = segments.findIndex((seg) => t >= seg.start && t <= seg.end);
      if (idx !== activeSegmentIndex) {
        setActiveSegmentIndex(idx);
      }
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
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
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
    if (audioRef.current) {
      audioRef.current.playbackRate = SPEED_OPTIONS[nextIndex];
    }
  }, [speedIndex]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const getDepartmentName = (slug?: string): string => {
    if (!slug) return '';
    // Simple lookup for common departments
    const deptNames: Record<string, string> = {
      admin: 'Admin',
      nursing: 'Nursing',
      hr: 'HR',
      finance: 'Finance',
      it: 'IT',
      operations: 'Operations',
      medical: 'Medical',
      lab: 'Lab',
      imaging: 'Imaging',
      pharmacy: 'Pharmacy',
      reception: 'Reception',
      housekeeping: 'Housekeeping',
      security: 'Security',
      transport: 'Transport',
      catering: 'Catering',
      maintenance: 'Maintenance',
      ot: 'OT',
    };
    return deptNames[slug] || slug.charAt(0).toUpperCase() + slug.slice(1);
  };

  const getSpeakerLabel = (speakerIndex: number): string => {
    if (speakerMap && speakerMap[speakerIndex]) {
      const mapped = speakerMap[speakerIndex];
      const deptName = getDepartmentName(mapped.department_slug);
      return deptName ? `${mapped.display_name} (${deptName})` : mapped.display_name;
    }
    return `Speaker ${speakerIndex}`;
  };

  return (
    <div className="space-y-4">
      {/* Audio Player */}
      <div className="bg-slate-900 rounded-xl p-4 sticky top-0 z-10 shadow-lg">
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          className="w-full"
          controls
        />
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

          return (
            <div
              key={index}
              ref={(el) => {
                if (el) segmentRefs.current.set(index, el);
              }}
              className={`p-3 rounded-lg border transition-all cursor-pointer ${
                SPEAKER_COLORS[colorIdx]
              } ${isActive ? 'ring-2 ring-blue-500 shadow-md' : 'hover:shadow-sm'}`}
              onClick={() => seekTo(segment.start)}
            >
              <div className="flex items-center gap-2 mb-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    seekTo(segment.start);
                  }}
                  className="text-xs font-mono text-slate-500 hover:text-blue-600 hover:underline"
                >
                  {formatTime(segment.start)}
                </button>
                <span className={`text-xs font-semibold ${SPEAKER_TEXT_COLORS[colorIdx]}`}>
                  {getSpeakerLabel(segment.speaker)}
                </span>
              </div>
              <p className="text-sm text-slate-800 leading-relaxed">{segment.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
