'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getFormConfig } from '@/lib/form-engine/registry';
import { SmartForm } from '@/components/form-engine';
import { FORMS_BY_SLUG } from '@/lib/form-definitions';
import FormChat from '@/components/FormChat';
import SupplyChainTracker from '@/components/SupplyChainTracker';
import FormFillerBadge, { getDeviceId, getFillerName } from '@/components/FormFillerBadge';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function FormPage({ params }: PageProps) {
  const [slug, setSlug] = useState<string>('');
  const [submittedData, setSubmittedData] = useState<{
    formData: Record<string, unknown>;
    sessionId: string;
    date: string;
  } | null>(null);
  const [chatSlot, setChatSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    params.then(p => setSlug(p.slug));
  }, [params]);

  // Watch for the chat slot element to appear after submission
  useEffect(() => {
    if (submittedData) {
      const checkSlot = () => {
        const el = document.getElementById('form-chat-slot');
        if (el) {
          setChatSlot(el);
        } else {
          // Retry once after render
          requestAnimationFrame(() => {
            setChatSlot(document.getElementById('form-chat-slot'));
          });
        }
      };
      checkSlot();
    } else {
      setChatSlot(null);
    }
  }, [submittedData]);

  if (!slug) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const config = getFormConfig(slug);

  if (!config) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-r from-[#1e40af] to-[#3b82f6] text-white py-6 px-4">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold">Form Not Found</h1>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">The form &ldquo;{slug}&rdquo; could not be found.</p>
          </div>
        </div>
      </div>
    );
  }

  // Submit handler — uses the existing form-submit API (unchanged)
  const handleSubmit = async (formData: Record<string, unknown>): Promise<{ success: boolean; error?: string }> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const legacyForm = FORMS_BY_SLUG[slug];

      const fillerName = getFillerName();
      const fillerDeviceId = getDeviceId();

      const response = await fetch('/api/form-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          date: formData.date as string,
          fields: formData,
          filler_name: fillerName || undefined,
          filler_device_id: fillerDeviceId || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to submit form' };
      }

      return { success: true };
    } catch {
      return { success: false, error: 'An error occurred while submitting the form' };
    }
  };

  // Called by SmartForm after successful submission
  const handleSubmitSuccess = (data: { formData: Record<string, unknown>; sessionId: string }) => {
    setSubmittedData({
      formData: data.formData,
      sessionId: data.sessionId,
      date: data.formData.date as string,
    });
  };

  return (
    <>
      <div className="max-w-2xl mx-auto px-4 pt-4 flex justify-end">
        <FormFillerBadge />
      </div>
      {/* DD.1: Supply Chain Requirement Tracker */}
      {slug === 'supply-chain' && (
        <div className="max-w-2xl mx-auto px-4 mb-6">
          <SupplyChainTracker />
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-xs text-slate-500 text-center mb-2">
              Daily operational metrics (fill below as usual)
            </p>
          </div>
        </div>
      )}

      <SmartForm
        config={config}
        slug={slug}
        onSubmit={handleSubmit}
        onSubmitSuccess={handleSubmitSuccess}
      />
      {/* Portal FormChat into the success screen's slot */}
      {submittedData && chatSlot && createPortal(
        <FormChat
          slug={slug}
          date={submittedData.date}
          formData={submittedData.formData}
          sessionId={submittedData.sessionId}
        />,
        chatSlot
      )}
    </>
  );
}
