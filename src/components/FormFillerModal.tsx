'use client';

import { useState, useEffect, useRef, type FormEvent } from 'react';

// Shared localStorage keys (locked in PRD §12)
export const FILLER_NAME_KEY = 'ehrc_filler_name';
export const FILLER_DEVICE_KEY = 'ehrc_filler_device_id';

export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = window.localStorage.getItem(FILLER_DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(FILLER_DEVICE_KEY, id);
  }
  return id;
}

export function getFillerName(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(FILLER_NAME_KEY) || '';
}

export interface FormFillerModalProps {
  // Controlled open state (true when name is missing OR user clicked "change")
  open: boolean;
  // Current name — if provided, we're in "change" mode (show current + let user edit)
  currentName?: string;
  // Mode: 'first' = non-dismissable first-time capture; 'change' = dismissable rename
  mode?: 'first' | 'change';
  // Called after successful upsert with the persisted name
  onSaved: (name: string, deviceId: string) => void;
  // Called to cancel (only used in 'change' mode)
  onCancel?: () => void;
}

/**
 * S2 R3: Captures "Filling as" identity for form submissions.
 * First-time mode is non-dismissable (no backdrop click, no esc close, no cancel button).
 * Change mode shows current name + cancel button.
 */
export default function FormFillerModal({
  open,
  currentName,
  mode = 'first',
  onSaved,
  onCancel,
}: FormFillerModalProps) {
  const [name, setName] = useState<string>(currentName || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(currentName || '');
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, currentName]);

  // In 'first' mode, block escape/body scroll
  useEffect(() => {
    if (!open || mode !== 'first') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, mode]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (trimmed.length < 2) {
      setError('Please enter at least 2 characters.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const deviceId = getDeviceId();
      const res = await fetch('/api/form-filler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId, name: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      const payload = await res.json();
      window.localStorage.setItem(FILLER_NAME_KEY, payload.name);
      onSaved(payload.name, deviceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="filler-modal-title"
    >
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <form onSubmit={handleSubmit} className="p-6">
          <h2 id="filler-modal-title" className="text-lg font-semibold text-gray-900">
            {mode === 'first' ? 'Who is filling this form?' : 'Change your name'}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {mode === 'first'
              ? 'Your name is stamped on every form you submit from this device. You can change it later.'
              : `Currently filling as "${currentName || '-'}". Change to a different name?`}
          </p>
          <label htmlFor="filler-name" className="mt-4 block text-sm font-medium text-gray-700">
            Name
          </label>
          <input
            ref={inputRef}
            id="filler-name"
            type="text"
            autoComplete="name"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Raj Kumar"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
            disabled={submitting}
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="mt-5 flex items-center justify-end gap-2">
            {mode === 'change' && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting || name.trim().length < 2}
              className="rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-950 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : mode === 'first' ? 'Continue' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
