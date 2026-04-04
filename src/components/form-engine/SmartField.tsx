'use client';

/**
 * SmartField — Universal field renderer for the EHRC Smart Form Engine.
 *
 * Renders the correct input widget based on field type.
 * Currently renders the 4 legacy types (text, number, paragraph, radio)
 * identically to the existing form renderer. New field types (toggle,
 * dropdown, multi-select, currency, rating, traffic-light, person-picker,
 * file, repeater, date, time) are implemented but not yet used by
 * existing form definitions.
 */

import { useRef } from 'react';
import { AlertCircle, Info, Upload, X, Star, ChevronDown } from 'lucide-react';
import type { SmartFormField, FormFieldValue, UploadedFileRef } from '@/lib/form-engine/types';

interface SmartFieldProps {
  field: SmartFormField;
  value: FormFieldValue;
  error?: string;
  required: boolean;
  onChange: (fieldId: string, value: FormFieldValue) => void;
  disabled?: boolean;
}

export default function SmartField({
  field,
  value,
  error,
  required,
  onChange,
  disabled = false,
}: SmartFieldProps) {
  // All hooks must be at top level (React Rules of Hooks)
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasError = !!error;
  const rawValue = value?.value ?? '';

  // Shared input styling
  const inputBase = `w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    hasError ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'
  }`;

  // ── Helper: update raw value ──
  const updateValue = (v: string | number | boolean | string[] | null) => {
    onChange(field.id, { ...value, value: v });
  };

  // ── Render by field type ──

  const renderInput = () => {
    switch (field.type) {
      // ─────────────────────────────────
      // TEXT (legacy compatible)
      // ─────────────────────────────────
      case 'text':
        return (
          <input
            id={field.id}
            type="text"
            value={String(rawValue)}
            onChange={e => updateValue(e.target.value)}
            placeholder={field.placeholder}
            className={inputBase}
            disabled={disabled}
          />
        );

      // ─────────────────────────────────
      // NUMBER (legacy compatible)
      // ─────────────────────────────────
      case 'number':
        return (
          <div className="relative">
            <input
              id={field.id}
              type="number"
              value={rawValue === '' || rawValue === null ? '' : rawValue}
              onChange={e => {
                const val = e.target.value;
                updateValue(val === '' ? '' : parseFloat(val));
              }}
              min={field.validation?.min}
              max={field.validation?.max}
              step={field.validation?.step ?? 'any'}
              placeholder={field.placeholder}
              className={`${inputBase} ${field.unit ? 'pr-12' : ''}`}
              disabled={disabled}
            />
            {field.unit && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                {field.unit}
              </span>
            )}
          </div>
        );

      // ─────────────────────────────────
      // CURRENCY (new — Rs. formatting)
      // ─────────────────────────────────
      case 'currency':
        return (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">Rs.</span>
            <input
              id={field.id}
              type="number"
              value={rawValue === '' || rawValue === null ? '' : rawValue}
              onChange={e => {
                const val = e.target.value;
                updateValue(val === '' ? '' : parseFloat(val));
              }}
              min={field.validation?.min}
              max={field.validation?.max}
              placeholder={field.placeholder || '0'}
              className={`${inputBase} pl-10`}
              disabled={disabled}
            />
          </div>
        );

      // ─────────────────────────────────
      // PARAGRAPH (legacy compatible)
      // ─────────────────────────────────
      case 'paragraph':
        return (
          <textarea
            id={field.id}
            value={String(rawValue)}
            onChange={e => updateValue(e.target.value)}
            rows={4}
            placeholder={field.placeholder}
            className={inputBase}
            disabled={disabled}
          />
        );

      // ─────────────────────────────────
      // RADIO (legacy compatible)
      // ─────────────────────────────────
      case 'radio':
        return (
          <div className="space-y-2">
            {(field.options ?? []).map(option => (
              <label key={option} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name={field.id}
                  value={option}
                  checked={rawValue === option}
                  onChange={e => updateValue(e.target.value)}
                  className="w-4 h-4 text-blue-600 cursor-pointer"
                  disabled={disabled}
                />
                <span className="text-sm text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        );

      // ─────────────────────────────────
      // DROPDOWN (new)
      // ─────────────────────────────────
      case 'dropdown':
        return (
          <div className="relative">
            <select
              id={field.id}
              value={String(rawValue)}
              onChange={e => updateValue(e.target.value)}
              className={`${inputBase} appearance-none pr-8`}
              disabled={disabled}
            >
              <option value="">{field.placeholder || 'Select...'}</option>
              {(field.options ?? []).map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        );

      // ─────────────────────────────────
      // MULTI-SELECT (new)
      // ─────────────────────────────────
      case 'multi-select': {
        const selected = Array.isArray(rawValue) ? rawValue : [];
        return (
          <div className="space-y-2">
            {(field.options ?? []).map(option => (
              <label key={option} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={e => {
                    const newSelected = e.target.checked
                      ? [...selected, option]
                      : selected.filter(s => s !== option);
                    updateValue(newSelected);
                  }}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  disabled={disabled}
                />
                <span className="text-sm text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        );
      }

      // ─────────────────────────────────
      // TOGGLE (new — Yes/No with expand)
      // ─────────────────────────────────
      case 'toggle': {
        const isOn = rawValue === true || rawValue === 'Yes' || rawValue === 'yes';
        return (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => updateValue(!isOn)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isOn ? 'bg-blue-600' : 'bg-gray-300'
              }`}
              disabled={disabled}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isOn ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm text-gray-700">{isOn ? 'Yes' : 'No'}</span>
          </div>
        );
      }

      // ─────────────────────────────────
      // DATE (new — proper date picker)
      // ─────────────────────────────────
      case 'date':
        return (
          <input
            id={field.id}
            type="date"
            value={String(rawValue)}
            onChange={e => updateValue(e.target.value)}
            className={inputBase}
            disabled={disabled}
          />
        );

      // ─────────────────────────────────
      // TIME (new)
      // ─────────────────────────────────
      case 'time':
        return (
          <input
            id={field.id}
            type="time"
            value={String(rawValue)}
            onChange={e => updateValue(e.target.value)}
            className={inputBase}
            disabled={disabled}
          />
        );

      // ─────────────────────────────────
      // RATING (new — stars/numbers/slider)
      // ─────────────────────────────────
      case 'rating': {
        const config = field.ratingConfig ?? { min: 1, max: 5, step: 1, display: 'stars' };
        const currentRating = typeof rawValue === 'number' ? rawValue : 0;

        if (config.display === 'stars') {
          return (
            <div className="flex items-center gap-1">
              {Array.from({ length: config.max - config.min + 1 }, (_, i) => {
                const starValue = config.min + i;
                return (
                  <button
                    key={starValue}
                    type="button"
                    onClick={() => updateValue(starValue)}
                    className={`p-0.5 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    disabled={disabled}
                  >
                    <Star
                      className={`w-6 h-6 ${
                        starValue <= currentRating
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-300'
                      }`}
                    />
                  </button>
                );
              })}
              <span className="ml-2 text-sm text-gray-500">
                {currentRating > 0 ? `${currentRating}/${config.max}` : ''}
              </span>
            </div>
          );
        }

        if (config.display === 'slider') {
          return (
            <div>
              <input
                type="range"
                min={config.min}
                max={config.max}
                step={config.step}
                value={currentRating || config.min}
                onChange={e => updateValue(parseFloat(e.target.value))}
                className="w-full"
                disabled={disabled}
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{config.labels?.min || config.min}</span>
                <span className="font-medium text-gray-700">{currentRating || '—'}</span>
                <span>{config.labels?.max || config.max}</span>
              </div>
            </div>
          );
        }

        // numbers display
        return (
          <div className="flex gap-2">
            {Array.from({ length: config.max - config.min + 1 }, (_, i) => {
              const numValue = config.min + i;
              return (
                <button
                  key={numValue}
                  type="button"
                  onClick={() => updateValue(numValue)}
                  className={`w-10 h-10 rounded-lg text-sm font-medium border ${
                    numValue === currentRating
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                  disabled={disabled}
                >
                  {numValue}
                </button>
              );
            })}
          </div>
        );
      }

      // ─────────────────────────────────
      // TRAFFIC LIGHT (new)
      // ─────────────────────────────────
      case 'traffic-light': {
        const tlConfig = field.trafficLightConfig ?? { labels: { green: 'Green', amber: 'Amber', red: 'Red' }, notesOnNonGreen: false };
        const lights = [
          { key: 'green', color: 'bg-green-500', ring: 'ring-green-300', label: tlConfig.labels?.green ?? 'Green' },
          { key: 'amber', color: 'bg-yellow-400', ring: 'ring-yellow-200', label: tlConfig.labels?.amber ?? 'Amber' },
          { key: 'red', color: 'bg-red-500', ring: 'ring-red-300', label: tlConfig.labels?.red ?? 'Red' },
        ];
        return (
          <div className="space-y-3">
            <div className="flex gap-3">
              {lights.map(l => (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => updateValue(l.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    rawValue === l.key
                      ? `${l.color} text-white border-transparent ring-2 ${l.ring}`
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                  } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                  disabled={disabled}
                >
                  <span className={`w-3 h-3 rounded-full ${rawValue === l.key ? 'bg-white/50' : l.color}`} />
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        );
      }

      // ─────────────────────────────────
      // PERSON PICKER (new — basic version)
      // ─────────────────────────────────
      case 'person-picker':
        // Basic implementation: text input with roster support (future: autocomplete from API)
        return (
          <input
            id={field.id}
            type="text"
            value={String(rawValue)}
            onChange={e => updateValue(e.target.value)}
            placeholder={field.placeholder || 'Type name(s)...'}
            className={inputBase}
            disabled={disabled}
          />
        );

      // ─────────────────────────────────
      // FILE UPLOAD (new)
      // ─────────────────────────────────
      case 'file': {
        const files = value?.files ?? [];
        const config = field.fileConfig ?? { accept: ['*'], maxSizeMB: 10, maxFiles: 5 };

        return (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept={config.accept.join(',')}
              multiple={config.maxFiles > 1}
              className="hidden"
              onChange={async (e) => {
                const selectedFiles = Array.from(e.target.files ?? []);
                if (selectedFiles.length === 0) return;

                // File upload will be handled by the parent form via an upload callback
                // For now, store file references locally; actual upload happens on submit
                const newRefs: UploadedFileRef[] = selectedFiles.map(f => ({
                  url: URL.createObjectURL(f),
                  filename: f.name,
                  mimeType: f.type,
                  size: f.size,
                  uploadedAt: new Date().toISOString(),
                }));

                onChange(field.id, {
                  ...value,
                  value: rawValue || `${selectedFiles.length} file(s)`,
                  files: [...files, ...newRefs],
                });

                // Reset the input
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              disabled={disabled}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
              disabled={disabled || files.length >= config.maxFiles}
            >
              <Upload className="w-4 h-4" />
              {files.length > 0 ? 'Add more files' : 'Upload file'}
            </button>
            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-gray-50 rounded px-3 py-2">
                    <span className="flex-1 truncate">{f.filename}</span>
                    <span className="text-gray-400 text-xs">
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const newFiles = files.filter((_, j) => j !== i);
                        onChange(field.id, {
                          ...value,
                          value: newFiles.length > 0 ? `${newFiles.length} file(s)` : '',
                          files: newFiles,
                        });
                      }}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400">
              Max {config.maxFiles} file{config.maxFiles > 1 ? 's' : ''}, {config.maxSizeMB}MB each
            </p>
          </div>
        );
      }

      // ─────────────────────────────────
      // SECTION divider (not a real input)
      // ─────────────────────────────────
      case 'section':
        return null;

      // ─────────────────────────────────
      // REPEATER (new — future)
      // ─────────────────────────────────
      case 'repeater':
        // Placeholder — will be implemented when Clinical Lab form is upgraded
        return (
          <div className="text-sm text-gray-400 italic">
            Repeater field (not yet active)
          </div>
        );

      default:
        return (
          <input
            id={field.id}
            type="text"
            value={String(rawValue)}
            onChange={e => updateValue(e.target.value)}
            className={inputBase}
            disabled={disabled}
          />
        );
    }
  };

  // Don't render section dividers as form fields
  if (field.type === 'section') return null;

  return (
    <div>
      <label htmlFor={field.id} className="block text-sm font-medium text-gray-700 mb-2">
        {field.label}
        {required && <span className="text-red-600 ml-1">*</span>}
        {field.tooltip && (
          <span className="inline-block ml-1 group relative">
            <Info className="w-3.5 h-3.5 text-gray-400 inline cursor-help" />
            <span className="hidden group-hover:block absolute bottom-full left-0 mb-1 w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10">
              {field.tooltip}
            </span>
          </span>
        )}
      </label>

      {field.description && (
        <p className="text-xs text-gray-600 mb-2">{field.description}</p>
      )}

      {renderInput()}

      {hasError && (
        <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
}
