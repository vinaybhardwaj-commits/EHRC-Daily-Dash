'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { SmartFormConfig, SmartFormSection, SmartFormField, AnalyticsEvent, AnalyticsEventType } from '@/lib/form-engine/types';
import { isFieldVisible, isFieldRequired } from '@/lib/form-engine/condition-evaluator';
import { resolvePipes, hasPipeTokens } from '@/lib/form-engine/pipe-resolver';
import SmartField from './SmartField';
import { CheckCircle, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';

/* ── Props ────────────────────────────────────────────────────────── */

interface SmartFormProps {
  config: SmartFormConfig;
  slug: string;
  onSubmit: (data: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  onSubmitSuccess?: (data: { formData: Record<string, unknown>; sessionId: string }) => void;
}

/* ── Analytics Session ────────────────────────────────────────────── */

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/* ── Main Component ───────────────────────────────────────────────── */

export default function SmartForm({ config, slug, onSubmit, onSubmitSuccess }: SmartFormProps) {
  // Form state
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Layout / wizard state
  // 'responsive' picks wizard on first render when viewport < 640px; HOD can flip any time.
  const computeInitialMode = (): 'scroll' | 'wizard' => {
    if (config.layout === 'wizard') return 'wizard';
    if (config.layout === 'responsive') {
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches) return 'wizard';
      return 'scroll';
    }
    return 'scroll';
  };
  const [viewMode, setViewMode] = useState<'scroll' | 'wizard'>(computeInitialMode);
  const isWizard = viewMode === 'wizard';
  const [currentStep, setCurrentStep] = useState(0);
  const isResponsive = config.layout === 'responsive';

  // Analytics state
  const sessionId = useRef(generateSessionId());
  const formStartTime = useRef(Date.now());
  const fieldFocusTimes = useRef<Record<string, number>>({});
  const analyticsBuffer = useRef<AnalyticsEvent[]>([]);
  const sectionsSeen = useRef<Set<string>>(new Set());

  // Visible sections (accounting for conditional logic)
  const visibleSections = useMemo(() => {
    return config.sections.filter(section =>
      isFieldVisible(section.showWhen, formData as Record<string, string | number | boolean | string[] | undefined>)
    );
  }, [config.sections, formData]);

  const currentSection = isWizard ? visibleSections[currentStep] : null;
  const totalSteps = visibleSections.length;
  const isLastStep = currentStep >= totalSteps - 1;

  // ── Auto-fill date on mount ──
  useEffect(() => {
    const now = new Date();
    const istOffset = 5.5 * 60;
    const istDate = new Date(now.getTime() + (istOffset * 60 * 1000) - (now.getTimezoneOffset() * 60 * 1000));
    const dd = String(istDate.getUTCDate()).padStart(2, '0');
    const mm = String(istDate.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = istDate.getUTCFullYear();
    setFormData({ date: `${dd}-${mm}-${yyyy}` });

    // Track form start
    trackEvent('form_start');

    // Track abandonment on unload
    const handleUnload = () => {
      if (!submitted) {
        trackEvent('form_abandon');
        flushAnalytics();
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track section entry for wizard
  useEffect(() => {
    if (isWizard && currentSection && !sectionsSeen.current.has(currentSection.id)) {
      sectionsSeen.current.add(currentSection.id);
      trackEvent('section_enter', { sectionId: currentSection.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, isWizard]);

  // ── Analytics helpers ──
  const trackEvent = useCallback((type: AnalyticsEventType, extra?: Partial<AnalyticsEvent>) => {
    const event: AnalyticsEvent = {
      type,
      formSlug: slug,
      sessionId: sessionId.current,
      timestamp: Date.now(),
      ...extra,
    };
    analyticsBuffer.current.push(event);
  }, [slug]);

  const flushAnalytics = useCallback(() => {
    if (analyticsBuffer.current.length === 0) return;
    const events = [...analyticsBuffer.current];
    analyticsBuffer.current = [];

    // Fire and forget — don't block form UX
    navigator.sendBeacon?.(
      '/api/form-analytics',
      JSON.stringify({ events }),
    ) || fetch('/api/form-analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      keepalive: true,
    }).catch(() => { /* silent fail */ });
  }, []);

  // Flush analytics every 30 seconds
  useEffect(() => {
    const interval = setInterval(flushAnalytics, 30000);
    return () => clearInterval(interval);
  }, [flushAnalytics]);

  // ── Field event handlers ──
  const handleFieldFocus = useCallback((fieldId: string) => {
    fieldFocusTimes.current[fieldId] = Date.now();
    trackEvent('field_focus', { fieldId });
  }, [trackEvent]);

  const handleFieldBlur = useCallback((fieldId: string) => {
    const focusStart = fieldFocusTimes.current[fieldId];
    const duration = focusStart ? Date.now() - focusStart : 0;
    trackEvent('field_blur', { fieldId, durationMs: duration });
    delete fieldFocusTimes.current[fieldId];
  }, [trackEvent]);

  // ── Form data helpers ──
  const handleChange = useCallback((fieldId: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
    if (errors[fieldId]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  }, [errors]);

  // ── Resolve response pipes in a field ──
  const resolveField = useCallback((field: SmartFormField): SmartFormField => {
    if (!field._hasPipes && !hasPipeTokens(field.label) && !hasPipeTokens(field.description || '') && !hasPipeTokens(field.placeholder || '')) {
      return field;
    }
    const state = formData as Record<string, string | number | boolean | string[] | undefined>;
    return {
      ...field,
      label: resolvePipes(field.label, state),
      description: field.description ? resolvePipes(field.description, state) : undefined,
      placeholder: field.placeholder ? resolvePipes(field.placeholder, state) : undefined,
    };
  }, [formData]);

  // ── Validation ──
  const validateSection = useCallback((section: SmartFormSection): Record<string, string> => {
    const newErrors: Record<string, string> = {};
    const state = formData as Record<string, string | number | boolean | string[] | undefined>;

    section.fields.forEach(field => {
      if (!isFieldVisible(field.showWhen, state)) return;

      const val = formData[field.id];
      const req = isFieldRequired(field.required, field.requireWhen, state);
      const isEmpty = val === '' || val === undefined || val === null ||
        (Array.isArray(val) && val.length === 0);

      if (req && isEmpty) {
        newErrors[field.id] = field.validation?.customMessage || `${field.label} is required`;
      }

      if (field.type === 'number' || field.type === 'currency') {
        if (val !== '' && val !== undefined && val !== null) {
          const num = typeof val === 'string' ? parseFloat(val) : typeof val === 'number' ? val : NaN;
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
      }

      if (field.validation?.pattern && typeof val === 'string' && val) {
        const regex = new RegExp(field.validation.pattern);
        if (!regex.test(val)) {
          newErrors[field.id] = field.validation.patternMessage || 'Invalid format';
        }
      }
    });

    return newErrors;
  }, [formData]);

  const validateAll = useCallback((): boolean => {
    const allErrors: Record<string, string> = {};
    for (const section of visibleSections) {
      Object.assign(allErrors, validateSection(section));
    }
    setErrors(allErrors);
    if (Object.keys(allErrors).length > 0) {
      trackEvent('validation_error', {
        metadata: { fieldCount: Object.keys(allErrors).length } as Record<string, string | number | boolean>,
      });
    }
    return Object.keys(allErrors).length === 0;
  }, [visibleSections, validateSection, trackEvent]);

  // ── Wizard navigation ──
  const goNext = useCallback(() => {
    if (!currentSection) return;
    const sectionErrors = validateSection(currentSection);
    if (Object.keys(sectionErrors).length > 0) {
      setErrors(prev => ({ ...prev, ...sectionErrors }));
      trackEvent('validation_error', { sectionId: currentSection.id });
      return;
    }
    if (!isLastStep) {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentSection, validateSection, isLastStep, trackEvent]);

  const goBack = useCallback(() => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  }, [currentStep]);

  // ── Submit ──
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validateAll()) return;

    setSubmitting(true);

    try {
      const result = await onSubmit(formData);

      if (!result.success) {
        setSubmitError(result.error || 'Failed to submit form');
        setSubmitting(false);
        return;
      }

      // Track success
      trackEvent('form_submit', {
        durationMs: Date.now() - formStartTime.current,
      });
      flushAnalytics();

      setSubmitted(true);
      setSubmitting(false);

      // Notify parent with submitted data for AI question engine
      if (onSubmitSuccess) {
        onSubmitSuccess({ formData: { ...formData }, sessionId: sessionId.current });
      }
    } catch {
      setSubmitError('An error occurred while submitting the form');
      setSubmitting(false);
    }
  }, [formData, validateAll, onSubmit, onSubmitSuccess, trackEvent, flushAnalytics]);

  // ── Reset form for new submission ──
  const handleNewSubmission = useCallback(() => {
    setSubmitted(false);
    setFormData({ date: formData.date as string });
    setCurrentStep(0);
    sessionId.current = generateSessionId();
    formStartTime.current = Date.now();
    sectionsSeen.current.clear();
  }, [formData.date]);

  // ── Layout toggle ──
  const toggleMode = useCallback(() => {
    setViewMode(prev => (prev === 'wizard' ? 'scroll' : 'wizard'));
    setCurrentStep(0);
  }, []);

  // ── Render: Success ──
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <FormHeader title={config.title} subtitle={config.department} viewMode={viewMode} onToggleMode={toggleMode} showToggle={isResponsive} />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
            <CheckCircle className="w-14 h-14 text-green-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-green-800 mb-2">Form Submitted Successfully</h2>
            <p className="text-green-700 text-sm">
              Your {config.department} department form has been recorded.
            </p>
          </div>
          {/* AI Question Engine chat panel renders here via parent */}
          <div id="form-chat-slot" />
          <div className="mt-6 text-center">
            <button
              onClick={handleNewSubmission}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Submit another response
            </button>
          </div>
        </div>
      </div>
    );
  }

  const state = formData as Record<string, string | number | boolean | string[] | undefined>;

  // ── Render: Wizard layout ──
  if (isWizard && currentSection) {
    const progress = ((currentStep + 1) / totalSteps) * 100;
    return (
      <div className="min-h-screen bg-gray-50">
        <FormHeader title={config.title} subtitle={config.department} viewMode={viewMode} onToggleMode={toggleMode} showToggle={isResponsive} />

        {/* Progress bar */}
        <div className="max-w-2xl mx-auto px-4 pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">Step {currentStep + 1} of {totalSteps}</span>
            <span className="text-xs text-gray-400">{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Section header */}
          <div className="mb-5">
            <h2 className="text-lg font-bold text-gray-900">{currentSection.title}</h2>
            {currentSection.description && (
              <p className="text-sm text-gray-500 mt-1">{currentSection.description}</p>
            )}
          </div>

          {submitError && <ErrorBanner message={submitError} />}

          {/* Fields */}
          <form onSubmit={isLastStep ? handleSubmit : (e) => { e.preventDefault(); goNext(); }} className="space-y-5">
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm space-y-5">
              {currentSection.fields.map(field => {
                const resolved = resolveField(field);
                const visible = isFieldVisible(field.showWhen, state);
                const required = isFieldRequired(field.required, field.requireWhen, state);
                return (
                  <SmartField
                    key={field.id}
                    field={resolved}
                    value={formData[field.id]}
                    error={errors[field.id]}
                    required={required}
                    visible={visible}
                    onChange={handleChange}
                    onFocus={handleFieldFocus}
                    onBlur={handleFieldBlur}
                  />
                );
              })}
            </div>

            {/* Navigation */}
            <div className="flex gap-3">
              {currentStep > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  className="flex items-center gap-1.5 px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-[#1e40af] to-[#3b82f6] text-white py-2.5 rounded-lg font-medium hover:from-[#1e3a8a] hover:to-[#1d4ed8] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {submitting ? 'Submitting...' : isLastStep ? 'Submit Form' : (
                  <>Next <ChevronRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ── Render: Scroll layout (default) ──
  return (
    <div className="min-h-screen bg-gray-50">
      <FormHeader title={config.title} subtitle={config.department} viewMode={viewMode} onToggleMode={toggleMode} showToggle={isResponsive} />

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Description */}
        {config.description && (
          <div className="bg-white rounded-xl p-5 mb-5 border border-gray-100 shadow-sm">
            <p className="text-sm text-gray-700 whitespace-pre-line">{config.description}</p>
          </div>
        )}

        {submitError && <ErrorBanner message={submitError} />}

        <form onSubmit={handleSubmit} className="space-y-6">
          {visibleSections.map(section => (
            <SectionBlock
              key={section.id}
              section={section}
              formData={formData}
              errors={errors}
              state={state}
              resolveField={resolveField}
              onChange={handleChange}
              onFocus={handleFieldFocus}
              onBlur={handleFieldBlur}
              onSectionVisible={(sectionId) => {
                if (!sectionsSeen.current.has(sectionId)) {
                  sectionsSeen.current.add(sectionId);
                  trackEvent('section_enter', { sectionId });
                }
              }}
            />
          ))}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gradient-to-r from-[#1e40af] to-[#3b82f6] text-white py-3 rounded-xl font-medium hover:from-[#1e3a8a] hover:to-[#1d4ed8] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {submitting ? 'Submitting...' : 'Submit Form'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────────────── */

function FormHeader({ title, subtitle, viewMode, onToggleMode, showToggle }: {
  title: string;
  subtitle: string;
  viewMode?: 'scroll' | 'wizard';
  onToggleMode?: () => void;
  showToggle?: boolean;
}) {
  return (
    <div className="bg-gradient-to-r from-[#1e40af] to-[#3b82f6] text-white py-5 px-4">
      <div className="max-w-2xl mx-auto flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold mb-0.5">{title}</h1>
          <p className="text-blue-200 text-sm">{subtitle}</p>
        </div>
        {showToggle && onToggleMode && (
          <button
            type="button"
            onClick={onToggleMode}
            aria-label={`Switch to ${viewMode === 'wizard' ? 'scroll' : 'wizard'} mode`}
            className="shrink-0 bg-white/15 hover:bg-white/25 border border-white/30 text-white text-xs font-medium rounded-lg px-2.5 py-1.5 transition-colors whitespace-nowrap"
          >
            {viewMode === 'wizard' ? 'Scroll' : 'Wizard'} mode
          </button>
        )}
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex gap-3">
      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
      <div>
        <h3 className="font-semibold text-red-800 text-sm">Submission Error</h3>
        <p className="text-red-700 text-xs mt-0.5">{message}</p>
      </div>
    </div>
  );
}

function SectionBlock({ section, formData, errors, state, resolveField, onChange, onFocus, onBlur, onSectionVisible }: {
  section: SmartFormSection;
  formData: Record<string, unknown>;
  errors: Record<string, string>;
  state: Record<string, string | number | boolean | string[] | undefined>;
  resolveField: (f: SmartFormField) => SmartFormField;
  onChange: (id: string, v: unknown) => void;
  onFocus: (id: string) => void;
  onBlur: (id: string) => void;
  onSectionVisible: (sectionId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Track section visibility for scroll layout analytics
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onSectionVisible(section.id);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [section.id, onSectionVisible]);

  return (
    <div ref={ref}>
      <div className="mb-3">
        <h2 className="text-base font-bold text-gray-900">{section.title}</h2>
        {section.description && (
          <p className="text-xs text-gray-500 mt-0.5">{section.description}</p>
        )}
      </div>

      <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm space-y-5">
        {section.fields.map(field => {
          const resolved = resolveField(field);
          const visible = isFieldVisible(field.showWhen, state);
          const required = isFieldRequired(field.required, field.requireWhen, state);
          return (
            <SmartField
              key={field.id}
              field={resolved}
              value={formData[field.id]}
              error={errors[field.id]}
              required={required}
              visible={visible}
              onChange={onChange}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          );
        })}
      </div>
    </div>
  );
}
