'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Upload, CheckCircle, AlertCircle, FileText, Info } from 'lucide-react';

export default function UnitHeadUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setStatus('uploading');
    setErrorMsg('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('date', date);

      const resp = await fetch('/api/kx-upload', {
        method: 'POST',
        body: formData,
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setResult({ ...(data.summary || data), snapshotDate: data.date });
      setStatus('success');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
      setStatus('error');
    }
  };

  const formatINR = (n: number) => {
    if (n >= 10000000) return "\u20B9" + (n / 10000000).toFixed(2) + " Cr";
    if (n >= 100000) return "\u20B9" + (n / 100000).toFixed(2) + " L";
    if (n >= 1000) return "\u20B9" + (n / 1000).toFixed(1) + " K";
    return "\u20B9" + n.toFixed(0);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#7c3aed] to-[#a78bfa] text-white py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <Link href="/form" className="inline-flex items-center text-purple-100 hover:text-white mb-4 text-sm">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Forms
          </Link>
          <h1 className="text-3xl font-bold mb-2">Unit Head — Daily KX Uploads</h1>
          <p className="text-purple-100">Upload daily reports from KX for dashboard integration</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* KX Instructions */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-5">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">How to download the In-Patient Status CSV from KX</h3>
              <ol className="text-sm text-gray-700 space-y-1.5 list-decimal list-inside">
                <li>Open KX → Left sidebar → <strong>IPD Billing</strong> → <strong>Billing Dashboard</strong></li>
                <li>Click the <strong>&quot;In Patient Status&quot;</strong> tab (first tab at top)</li>
                <li>Click the <strong>Download</strong> button (top-right toolbar)</li>
                <li>Save the CSV file to your device</li>
                <li>Upload it below</li>
              </ol>
              <p className="text-xs text-gray-500 mt-2">
                Direct link: IPD Billing → Billing Dashboard → In Patient Status tab → Download
              </p>
            </div>
          </div>
        </div>

        {/* Upload Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-600" />
            KX In-Patient Status Upload
          </h2>

          {/* Date Picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Report Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
            <p className="text-xs text-gray-500 mt-1">Pre-filled with today. Change if uploading for a different date.</p>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              In-Patient Status CSV <span className="text-red-500">*</span>
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-purple-400 transition-colors">
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
              />
              {file && (
                <p className="text-sm text-green-600 mt-2 font-medium">
                  ✓ {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!file || status === 'uploading'}
            className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'uploading' ? 'Uploading & Processing...' : 'Upload & Process'}
          </button>
        </form>

        {/* Success Result */}
        {status === 'success' && result && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <h3 className="font-semibold text-green-800">Upload Successful</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="bg-white rounded-md p-3 text-center">
                <div className="text-gray-500 text-xs">Patients</div>
                <div className="text-lg font-bold text-gray-900">{(result as Record<string, unknown>).totalPatients as number}</div>
              </div>
              <div className="bg-white rounded-md p-3 text-center">
                <div className="text-gray-500 text-xs">Total Bill</div>
                <div className="text-lg font-bold text-gray-900">{formatINR((result as Record<string, unknown>).totalBillAmt as number)}</div>
              </div>
              <div className="bg-white rounded-md p-3 text-center">
                <div className="text-gray-500 text-xs">Deposits</div>
                <div className="text-lg font-bold text-gray-900">{formatINR((result as Record<string, unknown>).totalDepositAmt as number)}</div>
              </div>
              <div className="bg-white rounded-md p-3 text-center">
                <div className="text-gray-500 text-xs">Net Due</div>
                <div className="text-lg font-bold text-red-600">{formatINR((result as Record<string, unknown>).totalDueAmt as number)}</div>
              </div>
            </div>
            <p className="text-xs text-green-700 mt-3">
              Data saved for {(result as Record<string, unknown>).snapshotDate as string}. It will appear in the Finance dashboard.
            </p>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-5">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <h3 className="font-semibold text-red-800">Upload Failed</h3>
            </div>
            <p className="text-sm text-red-700 mt-1">{errorMsg}</p>
          </div>
        )}

        {/* Info Footer */}
        <div className="bg-gray-100 rounded-lg p-4 text-xs text-gray-500">
          <p className="font-medium text-gray-700 mb-1">About this upload</p>
          <p>This uploads the KX In-Patient Status report and stores a daily snapshot of unbilled IP revenue data.
             The data feeds into the Finance Daily Dashboard (IP Unbilled Revenue section) and the Finance Monthly Overview.
             Re-uploading for the same date will replace the previous snapshot.</p>
        </div>
      </div>
    </div>
  );
}