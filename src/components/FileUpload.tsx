'use client';

import { useState, useRef, useEffect } from 'react';

interface UploadResult {
  totalEntriesExtracted?: number;
  departmentsUpdated?: string[];
  datesUpdated?: string[];
  globalIssuesFlagged?: number;
  entriesMerged?: number;
  entriesSkipped?: number;
  sourceGroups?: string[];
  period?: string;
  department?: string;
  error?: string;
}

interface Props {
  onUploadComplete: () => void;
  selectedDate: string;
  onNavigateToInsights?: () => void;
}

type UploadType = 'department-data' | 'huddle-summary' | 'chat-analysis';
type UploadStage = 'idle' | 'parsing' | 'processing' | 'merging' | 'done' | 'error';

const STAGE_LABELS: Record<UploadStage, string> = {
  idle: '',
  parsing: 'Parsing file...',
  processing: 'Processing entries...',
  merging: 'Merging with database...',
  done: 'Upload complete!',
  error: 'Upload failed',
};

const STAGE_PROGRESS: Record<UploadStage, number> = {
  idle: 0,
  parsing: 25,
  processing: 55,
  merging: 80,
  done: 100,
  error: 0,
};

export default function FileUpload({ onUploadComplete, selectedDate, onNavigateToInsights }: Props) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [uploadType, setUploadType] = useState<UploadType>('department-data');
  const [huddleDate, setHuddleDate] = useState(selectedDate);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [stage, setStage] = useState<UploadStage>('idle');
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [autoNavCountdown, setAutoNavCountdown] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setHuddleDate(selectedDate); }, [selectedDate]);

  // Auto-navigate countdown for chat-analysis
  useEffect(() => {
    if (autoNavCountdown !== null && autoNavCountdown > 0) {
      countdownRef.current = setInterval(() => {
        setAutoNavCountdown(prev => {
          if (prev !== null && prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            onNavigateToInsights?.();
            return null;
          }
          return prev !== null ? prev - 1 : null;
        });
      }, 1000);
      return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
    }
  }, [autoNavCountdown, onNavigateToInsights]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] || null);
    setMessage('');
    setStage('idle');
    setUploadResult(null);
    setAutoNavCountdown(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) { setMessage('Error: Please select a file'); return; }
    setUploading(true);
    setMessage('');
    setUploadResult(null);
    setAutoNavCountdown(null);

    const isChatAnalysis = uploadType === 'chat-analysis';

    // Simulate progress stages for chat analysis
    if (isChatAnalysis) {
      setStage('parsing');
      await new Promise(r => setTimeout(r, 400));
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('type', uploadType);
    if (uploadType === 'huddle-summary') formData.append('date', huddleDate);

    if (isChatAnalysis) {
      setStage('processing');
      await new Promise(r => setTimeout(r, 300));
    }

    try {
      if (isChatAnalysis) setStage('merging');
      const resp = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await resp.json();

      if (resp.ok) {
        if (isChatAnalysis) {
          setStage('done');
          setUploadResult(data);
          setAutoNavCountdown(5);
        } else if (uploadType === 'department-data') {
          setMessage(`Uploaded ${data.department} data for ${data.datesUpdated?.length || 0} day(s)`);
        } else {
          setMessage(`Uploaded huddle summary for ${huddleDate}`);
        }
        setSelectedFile(null);
        if (fileRef.current) fileRef.current.value = '';
        onUploadComplete();
      } else {
        setStage(isChatAnalysis ? 'error' : 'idle');
        setMessage(`Error: ${data.error}`);
      }
    } catch {
      setStage(isChatAnalysis ? 'error' : 'idle');
      setMessage('Upload failed');
    }
    setUploading(false);
  };

  const resetUpload = () => {
    setStage('idle');
    setUploadResult(null);
    setAutoNavCountdown(null);
    setMessage('');
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  const uploadTypes: { key: UploadType; label: string; color: string }[] = [
    { key: 'department-data', label: 'Dept CSV/Excel', color: 'blue' },
    { key: 'huddle-summary', label: 'Huddle Summary', color: 'blue' },
    { key: 'chat-analysis', label: 'Chat Analysis', color: 'emerald' },
  ];

  const acceptMap: Record<UploadType, string> = {
    'department-data': '.csv,.xlsx,.xls',
    'huddle-summary': '.md,.txt,.docx,.pdf',
    'chat-analysis': '.md,.txt',
  };

  const helpText: Record<UploadType, string> = {
    'department-data': 'Upload a department CSV or Excel file. Data is parsed and organized by date.',
    'huddle-summary': 'Upload a huddle summary (.md, .docx, .pdf) for the selected date.',
    'chat-analysis': 'Upload a structured chat analysis (.md) generated from WhatsApp exports using the EHRC rubric. Data is merged into existing department records.',
  };

  const isChatUpload = uploadType === 'chat-analysis';
  const showProgressBar = isChatUpload && stage !== 'idle';
  const showSummaryCard = isChatUpload && stage === 'done' && uploadResult;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h3 className="font-semibold text-slate-900 text-base mb-4">Upload Data</h3>

      <div className="flex flex-wrap gap-2 mb-4">
        {uploadTypes.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setUploadType(key); setSelectedFile(null); setMessage(''); resetUpload(); if (fileRef.current) fileRef.current.value = ''; }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              uploadType === key
                ? key === 'chat-analysis'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {key === 'chat-analysis' && (
              <span className="inline-block w-2 h-2 rounded-full bg-green-300 mr-1.5 align-middle" />
            )}
            {label}
          </button>
        ))}
      </div>

      {uploadType === 'huddle-summary' && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <label className="text-sm font-medium text-slate-800 block mb-1.5">Date</label>
          <input
            type="date"
            value={huddleDate}
            onChange={e => setHuddleDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {uploadType === 'chat-analysis' && stage === 'idle' && (
        <div className="mb-4 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
          <p className="text-xs text-emerald-800 font-medium mb-1">WhatsApp Chat Analysis</p>
          <p className="text-xs text-emerald-700">
            Upload the structured .md file generated by Claude from your WhatsApp chat exports.
            Data is merged with existing form submissions — form data takes precedence.
            Chat-derived data is tagged with a <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 border border-green-200 mx-0.5">WA</span> badge on the dashboard.
          </p>
        </div>
      )}

      {/* Progress Bar (Chat Analysis only) */}
      {showProgressBar && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-xs font-medium ${stage === 'error' ? 'text-red-600' : stage === 'done' ? 'text-emerald-600' : 'text-slate-600'}`}>
              {STAGE_LABELS[stage]}
            </span>
            {stage !== 'error' && (
              <span className="text-xs text-slate-400">{STAGE_PROGRESS[stage]}%</span>
            )}
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                stage === 'error' ? 'bg-red-500' : stage === 'done' ? 'bg-emerald-500' : 'bg-emerald-400'
              }`}
              style={{ width: `${STAGE_PROGRESS[stage]}%` }}
            />
          </div>
          {stage !== 'done' && stage !== 'error' && (
            <div className="flex gap-4 mt-2">
              {(['parsing', 'processing', 'merging'] as const).map((s, idx) => (
                <div key={s} className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    stage === s ? 'bg-emerald-500 animate-pulse' :
                    STAGE_PROGRESS[stage] > STAGE_PROGRESS[s] ? 'bg-emerald-500' : 'bg-slate-300'
                  }`} />
                  <span className={`text-[10px] ${stage === s ? 'text-emerald-700 font-medium' : 'text-slate-400'}`}>
                    {['Parse', 'Process', 'Merge'][idx]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Post-Upload Summary Card (Chat Analysis) */}
      {showSummaryCard && uploadResult && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h4 className="font-semibold text-emerald-800 text-sm">Chat Analysis Uploaded</h4>
            </div>
            {uploadResult.period && (
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{uploadResult.period}</span>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div className="bg-white rounded-lg p-2 border border-emerald-100">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Data Points</p>
              <p className="text-lg font-bold text-slate-900">{uploadResult.totalEntriesExtracted || 0}</p>
            </div>
            <div className="bg-white rounded-lg p-2 border border-emerald-100">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Departments</p>
              <p className="text-lg font-bold text-slate-900">{uploadResult.departmentsUpdated?.length || 0}</p>
            </div>
            <div className="bg-white rounded-lg p-2 border border-emerald-100">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Dates</p>
              <p className="text-lg font-bold text-slate-900">{uploadResult.datesUpdated?.length || 0}</p>
            </div>
            <div className="bg-white rounded-lg p-2 border border-emerald-100">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Global Issues</p>
              <p className={`text-lg font-bold ${(uploadResult.globalIssuesFlagged || 0) > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                {uploadResult.globalIssuesFlagged || 0}
              </p>
            </div>
          </div>

          {/* Department list */}
          {uploadResult.departmentsUpdated && uploadResult.departmentsUpdated.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Updated Departments</p>
              <div className="flex flex-wrap gap-1">
                {uploadResult.departmentsUpdated.map(slug => (
                  <span key={slug} className="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                    {slug}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Source groups */}
          {uploadResult.sourceGroups && uploadResult.sourceGroups.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Source Groups</p>
              <div className="flex flex-wrap gap-1">
                {uploadResult.sourceGroups.map(g => (
                  <span key={g} className="text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Auto-navigate footer */}
          <div className="flex items-center justify-between pt-2 border-t border-emerald-200">
            {autoNavCountdown !== null && onNavigateToInsights ? (
              <p className="text-xs text-emerald-600">
                Opening WhatsApp Insights in {autoNavCountdown}s...
              </p>
            ) : (
              <p className="text-xs text-emerald-600">Upload complete</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={resetUpload}
                className="text-xs text-slate-500 hover:text-slate-700 underline"
              >
                Upload Another
              </button>
              {onNavigateToInsights && (
                <button
                  onClick={() => { setAutoNavCountdown(null); if (countdownRef.current) clearInterval(countdownRef.current); onNavigateToInsights(); }}
                  className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors"
                >
                  View Insights Now
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* File input + Upload button (hide when summary is shown) */}
      {!showSummaryCard && (
        <>
          <p className="text-xs text-slate-500 mb-3">{helpText[uploadType]}</p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              onChange={handleFileChange}
              accept={acceptMap[uploadType]}
              disabled={uploading}
              className="text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 file:cursor-pointer"
            />
            <button
              onClick={handleUpload}
              disabled={uploading || !selectedFile}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                selectedFile && !uploading
                  ? isChatUpload
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </>
      )}

      {/* Non-chat-analysis messages */}
      {message && !showSummaryCard && (
        <div className={`mt-4 p-3 rounded-lg text-sm ${
          message.startsWith('Error')
            ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        }`}>
          {message}
        </div>
      )}
    </div>
  );
}
