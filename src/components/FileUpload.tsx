'use client';

import { useState, useRef, useEffect } from 'react';

interface Props {
  onUploadComplete: () => void;
  selectedDate: string;
}

export default function FileUpload({ onUploadComplete, selectedDate }: Props) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [uploadType, setUploadType] = useState<'department-data' | 'huddle-summary'>('department-data');
  const [huddleDate, setHuddleDate] = useState(selectedDate);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setHuddleDate(selectedDate); }, [selectedDate]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] || null);
    setMessage('');
  };

  const handleUpload = async () => {
    if (!selectedFile) { setMessage('Error: Please select a file'); return; }
    setUploading(true);
    setMessage('');
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('type', uploadType);
    if (uploadType === 'huddle-summary') formData.append('date', huddleDate);

    try {
      const resp = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await resp.json();
      if (resp.ok) {
        setMessage(uploadType === 'department-data'
          ? `Uploaded ${data.department} data for ${data.datesUpdated?.length || 0} day(s)`
          : `Uploaded huddle summary for ${huddleDate}`);
        setSelectedFile(null);
        if (fileRef.current) fileRef.current.value = '';
        onUploadComplete();
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch { setMessage('Upload failed'); }
    setUploading(false);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h3 className="font-semibold text-slate-900 text-base mb-4">Upload Data</h3>

      <div className="flex gap-2 mb-4">
        {(['department-data', 'huddle-summary'] as const).map(type => (
          <button
            key={type}
            onClick={() => { setUploadType(type); setSelectedFile(null); if (fileRef.current) fileRef.current.value = ''; }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              uploadType === type
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {type === 'department-data' ? 'Department CSV/Excel' : 'Huddle Summary'}
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

      <p className="text-xs text-slate-500 mb-3">
        {uploadType === 'department-data'
          ? 'Upload a department CSV or Excel file. Data is parsed and organized by date.'
          : 'Upload a huddle summary (.md, .docx, .pdf) for the selected date.'}
      </p>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          onChange={handleFileChange}
          accept={uploadType === 'department-data' ? '.csv,.xlsx,.xls' : '.md,.txt,.docx,.pdf'}
          className="text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 file:cursor-pointer"
        />
        <button
          onClick={handleUpload}
          disabled={uploading || !selectedFile}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
            selectedFile && !uploading
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>

      {message && (
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
