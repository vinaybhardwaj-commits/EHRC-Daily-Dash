'use client';

import { useState, useEffect, useCallback } from 'react';
import FormFillerModal, {
  FILLER_NAME_KEY,
  FILLER_DEVICE_KEY,
  getDeviceId,
  getFillerName,
} from './FormFillerModal';

/**
 * S2 R3: Site-wide identity gate for /form routes.
 *
 * Renders:
 *   - A non-dismissable FormFillerModal if no name is captured on this device
 *   - A "Filling as <name> · change" badge once captured
 *
 * On first save it writes localStorage (ehrc_filler_name + ehrc_filler_device_id).
 * Exposes identity via two signals:
 *   - `onReady(name, deviceId)` callback (optional) — so page-level submit logic can read it
 *   - window dispatchEvent('ehrc-filler-changed', { detail: { name, device_id } })
 */
export interface FormFillerBadgeProps {
  onReady?: (name: string, deviceId: string) => void;
}

export default function FormFillerBadge({ onReady }: FormFillerBadgeProps) {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'first' | 'change'>('first');

  useEffect(() => {
    setMounted(true);
    const n = getFillerName();
    const d = getDeviceId();
    setName(n);
    setDeviceId(d);
    if (!n) {
      setModalMode('first');
      setModalOpen(true);
    } else {
      onReady?.(n, d);
    }
  }, [onReady]);

  const handleSaved = useCallback((newName: string, newDeviceId: string) => {
    setName(newName);
    setDeviceId(newDeviceId);
    setModalOpen(false);
    onReady?.(newName, newDeviceId);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('ehrc-filler-changed', {
          detail: { name: newName, device_id: newDeviceId },
        }),
      );
    }
  }, [onReady]);

  const handleChange = useCallback(() => {
    setModalMode('change');
    setModalOpen(true);
  }, []);

  const handleCancel = useCallback(() => {
    setModalOpen(false);
  }, []);

  if (!mounted) return null;

  return (
    <>
      <FormFillerModal
        open={modalOpen}
        currentName={name}
        mode={modalMode}
        onSaved={handleSaved}
        onCancel={modalMode === 'change' ? handleCancel : undefined}
      />
      {name && (
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-900 ring-1 ring-blue-200">
          <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span>
            Filling as <span className="font-semibold">{name}</span>
          </span>
          <button
            type="button"
            onClick={handleChange}
            className="ml-1 text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
          >
            change
          </button>
        </div>
      )}
    </>
  );
}

// Re-export the keys + helpers so call sites can share a single source of truth
export { FILLER_NAME_KEY, FILLER_DEVICE_KEY, getDeviceId, getFillerName };
