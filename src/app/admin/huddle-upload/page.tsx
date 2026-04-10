'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

interface HuddleRecord {
  id: number;
  date: string;
  duration_seconds: number | null;
  recording_status: string;
  transcript_status: string;
  detected_speaker_count: number | null;
  transcript_length: number;
  created_at: string;
}

interface UploadResult {
  success: boolean;
  huddle_id: number;
  date: string;
  duration_seconds?: number;
  transcript?: {
    segments: number;
    speakers: number;
    plain_text_length: number;
    auto_identified_speakers: number;
  };
  latency_ms?: number;
  error?: string;
  warning?: string;
}

export default function HuddleUploadPage() {
  const [key, setKey] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');

  const [huddles, setHuddles] = useState<HuddleRecord[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Try to extract date from filename (e.g., "2026-03-15 morning huddle.mp3")
  const extractDateFromFilename = (filename: string): string => {
    // Try YYYY-MM-DD
    const isoMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];
    // Try DD-MM-YYYY or DD.MM.YYYY
    const dmyMatch = filename.match(/(\d{2})[-.](\d{2})[-.](\d{4})/);
    if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
    return '';
  };

  // Auth
  const handleAuth = async () => {
    try {
      const res = await fetch('/api/admin/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      if (res.ok) {
        setAuthenticated(true);
        setAuthError('');
        fetchHuddles();
      } else {
        setAuthError('Invalid admin key');
      }
    } catch {
      setAuthError('Connection error');
    }
  };

  // Fetch huddle list
  const fetchHuddles = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/huddle/list');
      if (res.ok) {
        const data = await res.json();
        setHuddles(data.huddles || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingList(false);
    }
  }, []);

  // File selection
  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setUploadResult(null);
    setUploadError('');

    // Try to auto-detect date from filename
    if (!selectedDate) {
      const detected = extractDateFromFilename(file.name);
      if (detected) setSelectedDate(detected);
    }
  };

  // Drag & drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  // Upload
  const handleUpload = async () => {
    if (!selectedFile || !selectedDate) return;

    setUploading(true);
    setUploadError('');
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('audio', selectedFile);
      formData.append('date', selectedDate);
      formData.append('key', key);

      const res = await fetch('/api/huddle/upload-audio', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setUploadError(data.error || 'Upload failed');
        return;
      }

      setUploadResult(data);
      setSelectedFile(null);
      setSelectedDate('');
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Refresh list
      fetchHuddles();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const formatDate = (dateStr: string): string => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      completed: 'bg-emerald-100 text-emerald-700',
      failed: 'bg-red-100 text-red-700',
      processing: 'bg-amber-100 text-amber-700',
      pending: 'bg-slate-100 text-slate-600',
      uploaded: 'bg-blue-100 text-blue-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] || 'bg-slate-100 text-slate-600'}`}>
        {status}
      </span>
    );
  };

  // ─── Auth screen ──────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 w-full max-w-sm">
          <h1 className="text-lg font-bold text-slate-900 mb-4">Huddle Upload</h1>
          <p className="text-sm text-slate-500 mb-4">Enter admin key to upload audio files.</p>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
            placeholder="Admin key"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {authError && <p className="text-xs text-red-600 mb-2">{authError}</p>}
          <button
            onClick={handleAuth}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600"
          >
            Enter
          </button>
        </div>
      </div>
    );
  }

  // ─── Main page ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Upload Huddle Audio</h1>
            <p className="text-xs text-slate-500">Upload MP3/M4A recordings for transcription + speaker ID</p>
          </div>
          <Link href="/admin" className="text-sm text-blue-600 hover:text-blue-800">
            Admin
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Upload Zone */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Upload Audio File</h2>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-blue-400 bg-blue-50'
                : selectedFile
                ? 'border-emerald-300 bg-emerald-50'
                : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.m4a,.wav,.webm,.ogg,.aac,audio/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
            {selectedFile ? (
              <div>
                <div className="text-2xl mb-2">🎙️</div>
                <p className="text-sm font-semibold text-emerald-700">{selectedFile.name}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {(selectedFile.size / 1024 / 1024).toFixed(1)} MB · Click or drop to change
                </p>
              </div>
            ) : (
              <div>
                <div className="text-2xl mb-2">📁</div>
                <p className="text-sm text-slate-600">Drop an audio file here or click to browse</p>
                <p className="text-xs text-slate-400 mt-1">MP3, M4A, WAV, WebM · Max 200MB</p>
              </div>
            )}
          </div>

          {/* Date picker */}
          <div className="mt-4 flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 mb-1">Huddle Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleUpload}
              disabled={!selectedFile || !selectedDate || uploading}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px]"
            >
              {uploading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin text-sm">⏳</span>
                  Uploading...
                </span>
              ) : (
                'Upload & Transcribe'
              )}
            </button>
          </div>

          {/* Progress / Error / Result */}
          {uploading && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700">
                Uploading, transcribing via Deepgram, and running speaker identification...
              </p>
              <p className="text-xs text-blue-500 mt-1">This can take 1-3 minutes for long recordings.</p>
            </div>
          )}

          {uploadError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{uploadError}</p>
            </div>
          )}

          {uploadResult && (
            <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
              <p className="text-sm font-semibold text-emerald-800">
                ✓ Uploaded and transcribed successfully
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs text-emerald-700">
                <div>Huddle ID: <strong>{uploadResult.huddle_id}</strong></div>
                <div>Date: <strong>{uploadResult.date}</strong></div>
                {uploadResult.duration_seconds && (
                  <div>Duration: <strong>{formatDuration(uploadResult.duration_seconds)}</strong></div>
                )}
                {uploadResult.transcript && (
                  <>
                    <div>Segments: <strong>{uploadResult.transcript.segments}</strong></div>
                    <div>Speakers: <strong>{uploadResult.transcript.speakers}</strong></div>
                    <div>Auto-ID&apos;d: <strong>{uploadResult.transcript.auto_identified_speakers}</strong></div>
                  </>
                )}
                {uploadResult.latency_ms && (
                  <div>Time: <strong>{(uploadResult.latency_ms / 1000).toFixed(1)}s</strong></div>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <Link
                  href={`/huddle/${uploadResult.huddle_id}`}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  View transcript →
                </Link>
                <a
                  href={`/api/huddle/${uploadResult.huddle_id}/transcript-download?format=named`}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  Download TXT ↓
                </a>
              </div>
              {uploadResult.warning && (
                <p className="text-xs text-amber-600 mt-1">{uploadResult.warning}</p>
              )}
            </div>
          )}
        </div>

        {/* Huddle List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">All Huddles ({huddles.length})</h2>
            <button
              onClick={fetchHuddles}
              disabled={loadingList}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              {loadingList ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {huddles.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">
              No huddles yet. Upload your first recording above.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {huddles.map((h) => (
                <div key={h.id} className="px-5 py-3 flex items-center gap-3">
                  {/* Date & ID */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800">
                      {formatDate(h.date)}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      ID {h.id} · {formatDuration(h.duration_seconds)}
                      {h.detected_speaker_count && ` · ${h.detected_speaker_count} speakers`}
                      {h.transcript_length > 0 && ` · ${h.transcript_length} chars`}
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex-shrink-0">
                    {statusBadge(h.transcript_status)}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-shrink-0">
                    <Link
                      href={`/huddle/${h.id}`}
                      className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded hover:bg-blue-50"
                    >
                      View
                    </Link>
                    {h.transcript_status === 'completed' && (
                      <a
                        href={`/api/huddle/${h.id}/transcript-download?format=named`}
                        className="px-2 py-1 text-xs text-slate-600 hover:text-slate-800 border border-slate-200 rounded hover:bg-slate-50"
                      >
                        TXT ↓
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
