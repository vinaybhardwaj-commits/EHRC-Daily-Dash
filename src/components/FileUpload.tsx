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

  // Update huddle date when selected date changes
  useEffect(() => {
    setHuddleDate(selectedDate);
  }, [selectedDate]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setSelectedFile(file || null);
    setMessage('');
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage('Error: Please select a file');
      return;
    }

    setUploading(true);
    setMessage('');

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('type', uploadType);
    if (uploadType === 'huddle-summary') {
      formData.append('date', huddleDate);
    }

    try {
      const resp = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await resp.json();
      if (resp.ok) {
        setMessage(
          uploadType === 'department-data'
            ? `Uploaded ${data.department} data for ${data.datesUpdated?.length || 0} day(s)`
            : `Uploaded huddle summary for ${huddleDate}`
        );
        setSelectedFile(null);
        if (fileRef.current) fileRef.current.value = '';
        onUploadComplete();
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (error) {
      setMessage('Upload failed');
    }
    setUploading(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <h3 className="font-semibold text-gray-900 text-lg mb-4">Upload Data</h3>

      {/* Upload Type Selection */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => {
            setUploadType('department-data');
            setSelectedFile(null);
            if (fileRef.current) fileRef.current.value = '';
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            uploadType === 'department-data'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Department CSV/Excel
        </button>
        <button
          onClick={() => {
            setUploadType('huddle-summary');
            setSelectedFile(null);
            if (fileRef.current) fileRef.current.value = '';
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            uploadType === 'huddle-summary'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Huddle Summary
        </button>
      </div>

      {/* Huddle Date Selector (only for huddle summaries) */}
      {uploadType === 'huddle-summary' && (
        <div className="mb-5 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <label className="text-sm font-medium text-gray-900 block mb-2">Huddle Summary Date</label>
          <input
            type="date"
            value={huddleDate}
            onChange={e => setHuddleDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-blue-700 mt-2">This huddle summary will be attached to {huddleDate}</p>
        </div>
      )}

      {/* Help Text */}
      <p className="text-xs text-gray-600 mb-4">
        {uploadType === 'department-data'
          ? 'Upload a department CSV or Excel file. Data will be parsed and organized by date automatically.'
          : 'Upload a huddle summary document (.md, .docx, .pdf) for the selected date.'}
      </p>

      {/* File Input and Upload Button */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            onChange={handleFileChange}
            accept={uploadType === 'department-data' ? '.csv,.xlsx,.xls' : '.md,.txt,.docx,.pdf'}
            className="text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <button
            onClick={handleUpload}
            disabled={uploading || !selectedFile}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedFile && !uploading
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>

        {selectedFile && (
          <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3">
            Selected file: <span className="font-medium">{selectedFile.name}</span>
          </div>
        )}
      </div>

      {/* Status Message */}
      {message && (
        <div
          className={`mt-4 p-3 rounded-lg text-sm ${
            message.startsWith('Error')
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}
