'use client';

import { useState, useEffect } from 'react';
import { FORMS_BY_SLUG } from '@/lib/form-definitions';
import { CONTACTS_BY_SLUG } from '@/lib/department-contacts';
import { AlertCircle, CheckCircle } from 'lucide-react';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function FormPage({ params }: PageProps) {
  const [slug, setSlug] = useState<string>('');
  const [formData, setFormData] = useState<Record<string, string | number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    params.then(p => {
      setSlug(p.slug);
      // Auto-fill date in DD-MM-YYYY format (IST timezone)
      const now = new Date();
      const istOffset = 5.5 * 60; // IST is UTC+5:30
      const istDate = new Date(now.getTime() + (istOffset * 60 * 1000) - (now.getTimezoneOffset() * 60 * 1000));
      const dd = String(istDate.getUTCDate()).padStart(2, '0');
      const mm = String(istDate.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = istDate.getUTCFullYear();
      setFormData({ date: `${dd}-${mm}-${yyyy}` });
    });
  }, [params]);

  const form = FORMS_BY_SLUG[slug];

  if (!form) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-r from-[#1e40af] to-[#3b82f6] text-white py-6 px-4">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold">Form Not Found</h1>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">The form "{slug}" could not be found.</p>
          </div>
        </div>
      </div>
    );
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    form.sections.forEach(section => {
      section.fields.forEach(field => {
        if (field.type === 'section') return;

        const value = formData[field.id];
        const isEmpty = value === '' || value === undefined || value === null;

        if (field.required && isEmpty) {
          newErrors[field.id] = `${field.label} is required`;
        }

        if (field.type === 'number' && value !== '' && value !== undefined && value !== null) {
          const num = typeof value === 'string' ? parseFloat(value) : value;
          if (isNaN(num)) {
            newErrors[field.id] = 'Must be a valid number';
          } else if (field.validation) {
            if (field.validation.min !== undefined && num < field.validation.min) {
              newErrors[field.id] = `Must be at least ${field.validation.min}`;
            }
            if (field.validation.max !== undefined && num > field.validation.max) {
              newErrors[field.id] = `Must be at most ${field.validation.max}`;
            }
          }
        }
      });
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (fieldId: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
    if (errors[fieldId]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);

    try {
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
        setSubmitError(data.error || 'Failed to submit form');
        setSubmitting(false);
        return;
      }

      setSubmitted(true);
      setSubmitting(false);

      // Reset form after 3 seconds
      setTimeout(() => {
        setSubmitted(false);
        setFormData({ date: formData.date });
      }, 3000);
    } catch (error) {
      setSubmitError('An error occurred while submitting the form');
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-r from-[#1e40af] to-[#3b82f6] text-white py-6 px-4">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold">{form.title}</h1>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-green-800 mb-2">Form Submitted Successfully</h2>
            <p className="text-green-700 mb-4">
              Your {form.department} department form has been recorded.
            </p>
            <p className="text-sm text-green-600">
              Redirecting in a moment...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1e40af] to-[#3b82f6] text-white py-6 px-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold mb-1">{form.title}</h1>
          <p className="text-blue-100">{form.department}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Description */}
        <div className="bg-white rounded-lg p-6 mb-6 border border-gray-200">
          <p className="text-gray-700 whitespace-pre-line">{form.description}</p>
        </div>

        {/* Error Alert */}
        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-800">Submission Error</h3>
              <p className="text-red-700 text-sm mt-1">{submitError}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {form.sections.map((section, sectionIdx) => (
            <div key={sectionIdx}>
              {/* Section Header */}
              <div className="mb-4">
                <h2 className="text-lg font-bold text-gray-900">{section.title}</h2>
                {section.description && (
                  <p className="text-sm text-gray-600 mt-1">{section.description}</p>
                )}
              </div>

              {/* Section Fields */}
              <div className="bg-white rounded-lg p-6 border border-gray-200 space-y-5">
                {section.fields.map(field => {
                  if (field.type === 'section') return null;

                  const value = formData[field.id] ?? '';
                  const error = errors[field.id];
                  const hasError = !!error;

                  return (
                    <div key={field.id}>
                      <label htmlFor={field.id} className="block text-sm font-medium text-gray-700 mb-2">
                        {field.label}
                        {field.required && <span className="text-red-600 ml-1">*</span>}
                      </label>

                      {field.description && (
                        <p className="text-xs text-gray-600 mb-2">{field.description}</p>
                      )}

                      {field.type === 'text' && (
                        <input
                          id={field.id}
                          type="text"
                          value={value}
                          onChange={e => handleChange(field.id, e.target.value)}
                          className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            hasError
                              ? 'border-red-300 bg-red-50'
                              : 'border-gray-300 bg-white'
                          }`}
                          disabled={field.id === 'date'}
                        />
                      )}

                      {field.type === 'number' && (
                        <input
                          id={field.id}
                          type="number"
                          value={value}
                          onChange={e => handleChange(field.id, e.target.value === '' ? '' : parseFloat(e.target.value))}
                          min={field.validation?.min}
                          max={field.validation?.max}
                          className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            hasError
                              ? 'border-red-300 bg-red-50'
                              : 'border-gray-300 bg-white'
                          }`}
                        />
                      )}

                      {field.type === 'paragraph' && (
                        <textarea
                          id={field.id}
                          value={value}
                          onChange={e => handleChange(field.id, e.target.value)}
                          rows={4}
                          className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            hasError
                              ? 'border-red-300 bg-red-50'
                              : 'border-gray-300 bg-white'
                          }`}
                        />
                      )}

                      {field.type === 'radio' && field.options && (
                        <div className="space-y-2">
                          {field.options.map(option => (
                            <label key={option} className="flex items-center gap-3 cursor-pointer">
                              <input
                                type="radio"
                                name={field.id}
                                value={option}
                                checked={value === option}
                                onChange={e => handleChange(field.id, e.target.value)}
                                className="w-4 h-4 text-blue-600 cursor-pointer"
                              />
                              <span className="text-sm text-gray-700">{option}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      {hasError && (
                        <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {error}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Submit Button */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-gradient-to-r from-[#1e40af] to-[#3b82f6] text-white py-3 rounded-lg font-medium hover:from-[#1e3a8a] hover:to-[#1d4ed8] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : 'Submit Form'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
