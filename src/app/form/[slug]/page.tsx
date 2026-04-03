'use client';

import { useState, useEffect } from 'react';
import { getFormConfig } from '@/lib/form-engine/registry';
import { SmartForm } from '@/components/form-engine';
import { FORMS_BY_SLUG } from '@/lib/form-definitions';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function FormPage({ params }: PageProps) {
  const [slug, setSlug] = useState<string>('');

  useEffect(() => {
    params.then(p => setSlug(p.slug));
  }, [params]);

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
      // Get the legacy form definition for field label mapping
      const legacyForm = FORMS_BY_SLUG[slug];

      const response = await fetch('/api/form-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          date: formData.date as string,
          fields: formData,
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

  return <SmartForm config={config} slug={slug} onSubmit={handleSubmit} />;
}
