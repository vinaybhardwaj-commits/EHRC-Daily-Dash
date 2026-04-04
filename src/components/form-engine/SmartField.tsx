'use client';

import React, { useState, useRef, useCallback } from 'react';
import type { SmartFormField, SmartFieldType } from '@/lib/form-engine/types';
import { AlertCircle, Upload, X, Plus, Trash2, Star } from 'lucide-react';

/* ── Props ────────────────────────────────────────────────────────── */

interface SmartFieldProps {
  field: SmartFormField;
  value: unknown;
  error?: string;
  required: boolean;
  visible: boolean;
  onChange: (fieldId: string, value: unknown) => void;
  onFocus?: (fieldId: string) => void;
  onBlur?: (fieldId: string) => void;
}

/* ── Main Component ───────────────────────────────────────────────── */

export default function SmartField({
  field, value, error, required, visible, onChange, onFocus, onBlur,
}: SmartFieldProps) {
  if (!visible) return null;

  const hasError = !!error;
  const baseInput = `w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
    hasError ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white hover:border-gray-300'
  }`;

  const handleFocus = () => onFocus?.(field.id);
  const handleBlur = () => onBlur?.(field.id);

  return (
    <div className="space-y-1.5">
      {/* Label */}
      <label htmlFor={field.id} className="block text-sm font-medium text-gray-700">
        {field.label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>

      {/* Description */}
      {field.description && (
        <p className="text-xs text-gray-500">{field.description}</p>
      )}

      {/* Field renderer */}
      <FieldRenderer
        field={field}
        value={value}
        onChange={onChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        baseInput={baseInput}
        hasError={hasError}
      />

      {/* Error message */}
      {hasError && (
        <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/* ── Field Renderer (dispatches by type) ──────────────────────────── */

interface RendererProps {
  field: SmartFormField;
  value: unknown;
  onChange: (fieldId: string, value: unknown) => void;
  onFocus: () => void;
  onBlur: () => void;
  baseInput: string;
  hasError: boolean;
}

function FieldRenderer({ field, value, onChange, onFocus, onBlur, baseInput, hasError }: RendererProps) {
  const v = value ?? '';

  switch (field.type) {
    case 'text':
    case 'date':
    case 'time':
      return (
        <input
          id={field.id}
          type={field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : 'text'}
          value={String(v)}
          onChange={e => onChange(field.id, e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={field.placeholder}
          disabled={field.id === 'date' && field.smartDefault?.type === 'today'}
          className={baseInput}
        />
      );

    case 'number':
      return (
        <input
          id={field.id}
          type="number"
          value={String(v)}
          onChange={e => onChange(field.id, e.target.value === '' ? '' : parseFloat(e.target.value))}
          onFocus={onFocus}
          onBlur={onBlur}
          min={field.validation?.min}
          max={field.validation?.max}
          step={field.validation?.step ?? 'any'}
          placeholder={field.placeholder}
          className={baseInput}
        />
      );

    case 'currency':
      return <CurrencyField field={field} value={v} onChange={onChange} onFocus={onFocus} onBlur={onBlur} hasError={hasError} />;

    case 'paragraph':
      return (
        <textarea
          id={field.id}
          value={String(v)}
          onChange={e => onChange(field.id, e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          rows={3}
          placeholder={field.placeholder}
          className={baseInput + ' resize-y'}
        />
      );

    case 'radio':
      return <RadioField field={field} value={v} onChange={onChange} onFocus={onFocus} />;

    case 'dropdown':
      return (
        <select
          id={field.id}
          value={String(v)}
          onChange={e => onChange(field.id, e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          className={baseInput}
        >
          <option value="">Select...</option>
          {(field.options || []).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );

    case 'multi-select':
      return <MultiSelectField field={field} value={v} onChange={onChange} onFocus={onFocus} />;

    case 'toggle':
      return <ToggleField field={field} value={v} onChange={onChange} onFocus={onFocus} />;

    case 'rating':
      return <RatingField field={field} value={v} onChange={onChange} onFocus={onFocus} />;

    case 'traffic-light':
      return <TrafficLightField field={field} value={v} onChange={onChange} onFocus={onFocus} />;

    case 'file':
      return <FileField field={field} value={v} onChange={onChange} onFocus={onFocus} />;

    case 'repeater':
      return <RepeaterField field={field} value={v} onChange={onChange} onFocus={onFocus} onBlur={onBlur} />;

    case 'person-picker':
      return <PersonPickerField field={field} value={v} onChange={onChange} onFocus={onFocus} onBlur={onBlur} hasError={hasError} />;

    case 'computed':
      return (
        <div className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 font-mono">
          {String(v) || '—'}
        </div>
      );

    default:
      return <input id={field.id} type="text" value={String(v)} onChange={e => onChange(field.id, e.target.value)} className={baseInput} />;
  }
}

/* ── Currency Field ───────────────────────────────────────────────── */

function CurrencyField({ field, value, onChange, onFocus, onBlur, hasError }: {
  field: SmartFormField; value: unknown; onChange: (id: string, v: unknown) => void;
  onFocus: () => void; onBlur: () => void; hasError: boolean;
}) {
  const symbol = field.currencyConfig?.symbol || '\u20b9';
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-medium">{symbol}</span>
      <input
        id={field.id}
        type="number"
        value={String(value ?? '')}
        onChange={e => onChange(field.id, e.target.value === '' ? '' : parseFloat(e.target.value))}
        onFocus={onFocus}
        onBlur={onBlur}
        className={`w-full pl-8 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          hasError ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white hover:border-gray-300'
        }`}
        placeholder={field.placeholder || '0'}
      />
    </div>
  );
}

/* ── Radio Field ──────────────────────────────────────────────────── */

function RadioField({ field, value, onChange, onFocus }: {
  field: SmartFormField; value: unknown; onChange: (id: string, v: unknown) => void; onFocus: () => void;
}) {
  return (
    <div className="space-y-1.5" onFocus={onFocus}>
      {(field.options || []).map(opt => (
        <label key={opt} className="flex items-center gap-2.5 cursor-pointer py-1 px-2 rounded-md hover:bg-gray-50 transition-colors">
          <input
            type="radio"
            name={field.id}
            value={opt}
            checked={value === opt}
            onChange={() => onChange(field.id, opt)}
            className="w-4 h-4 text-blue-600 cursor-pointer"
          />
          <span className="text-sm text-gray-700">{opt}</span>
        </label>
      ))}
    </div>
  );
}

/* ── Multi-Select Field ───────────────────────────────────────────── */

function MultiSelectField({ field, value, onChange, onFocus }: {
  field: SmartFormField; value: unknown; onChange: (id: string, v: unknown) => void; onFocus: () => void;
}) {
  const selected = Array.isArray(value) ? value : [];
  const toggle = (opt: string) => {
    const next = selected.includes(opt)
      ? selected.filter(s => s !== opt)
      : [...selected, opt];
    onChange(field.id, next);
  };

  return (
    <div className="space-y-1.5" onFocus={onFocus}>
      {(field.options || []).map(opt => (
        <label key={opt} className="flex items-center gap-2.5 cursor-pointer py-1 px-2 rounded-md hover:bg-gray-50 transition-colors">
          <input
            type="checkbox"
            checked={selected.includes(opt)}
            onChange={() => toggle(opt)}
            className="w-4 h-4 text-blue-600 rounded cursor-pointer"
          />
          <span className="text-sm text-gray-700">{opt}</span>
        </label>
      ))}
    </div>
  );
}

/* ── Toggle Field ─────────────────────────────────────────────────── */

function ToggleField({ field, value, onChange, onFocus }: {
  field: SmartFormField; value: unknown; onChange: (id: string, v: unknown) => void; onFocus: () => void;
}) {
  const isOn = value === true || value === 'yes' || value === 'Yes';
  return (
    <div className="space-y-2" onFocus={onFocus}>
      <button
        type="button"
        onClick={() => onChange(field.id, !isOn)}
        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
          isOn ? 'bg-blue-600' : 'bg-gray-300'
        }`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          isOn ? 'translate-x-6' : 'translate-x-1'
        }`} />
      </button>
      <span className="ml-2 text-sm text-gray-600">{isOn ? 'Yes' : 'No'}</span>
    </div>
  );
}

/* ── Rating Field (Stars) ─────────────────────────────────────────── */

function RatingField({ field, value, onChange, onFocus }: {
  field: SmartFormField; value: unknown; onChange: (id: string, v: unknown) => void; onFocus: () => void;
}) {
  const maxStars = field.ratingConfig?.maxStars || 5;
  const step = field.ratingConfig?.step || 1;
  const labels = field.ratingConfig?.labels;
  const current = typeof value === 'number' ? value : 0;
  const [hover, setHover] = useState(0);

  const stars = [];
  for (let i = step; i <= maxStars; i += step) {
    const filled = i <= (hover || current);
    stars.push(
      <button
        key={i}
        type="button"
        onClick={() => { onChange(field.id, i); onFocus(); }}
        onMouseEnter={() => setHover(i)}
        onMouseLeave={() => setHover(0)}
        className="p-0.5 transition-colors"
      >
        <Star className={`w-6 h-6 ${filled ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-0.5">{stars}</div>
      {labels && current > 0 && (
        <p className="text-xs text-gray-500">{labels[Math.ceil(current / step) - 1]}</p>
      )}
    </div>
  );
}

/* ── Traffic Light Field ──────────────────────────────────────────── */

function TrafficLightField({ field, value, onChange, onFocus }: {
  field: SmartFormField; value: unknown; onChange: (id: string, v: unknown) => void; onFocus: () => void;
}) {
  const options = field.trafficLightConfig?.options || [
    { value: 'green', label: 'Good', color: 'bg-emerald-500' },
    { value: 'amber', label: 'Caution', color: 'bg-amber-500' },
    { value: 'red', label: 'Critical', color: 'bg-red-500' },
  ];
  const allowNotes = field.trafficLightConfig?.allowNotes ?? false;
  const currentVal = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : { status: value, notes: '' };
  const status = String(currentVal.status || '');
  const notes = String(currentVal.notes || '');

  return (
    <div className="space-y-2" onFocus={onFocus}>
      <div className="flex gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(field.id, allowNotes ? { status: opt.value, notes } : opt.value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all text-sm font-medium ${
              status === opt.value
                ? 'border-gray-900 shadow-sm'
                : 'border-transparent bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <span className={`w-3.5 h-3.5 rounded-full ${opt.color}`} />
            {opt.label}
          </button>
        ))}
      </div>
      {allowNotes && status && (
        <input
          type="text"
          value={notes}
          onChange={e => onChange(field.id, { status, notes: e.target.value })}
          placeholder={field.trafficLightConfig?.notesLabel || 'Notes (optional)'}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}
    </div>
  );
}

/* ── File Upload Field ────────────────────────────────────────────── */

function FileField({ field, value, onChange, onFocus }: {
  field: SmartFormField; value: unknown; onChange: (id: string, v: unknown) => void; onFocus: () => void;
}) {
  const config = field.fileConfig || {};
  const maxFiles = config.maxFiles || 1;
  const files = Array.isArray(value) ? (value as { name: string; url: string }[]) : [];
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    onFocus();
    setUploading(true);

    const newFiles = [...files];
    for (let i = 0; i < fileList.length && newFiles.length < maxFiles; i++) {
      const file = fileList[i];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fieldId', field.id);

      try {
        const res = await fetch('/api/file-upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.url) {
          newFiles.push({ name: file.name, url: data.url });
        }
      } catch (e) {
        console.error('File upload failed:', e);
      }
    }

    onChange(field.id, newFiles);
    setUploading(false);
  }, [files, field.id, maxFiles, onChange, onFocus]);

  const removeFile = (idx: number) => {
    onChange(field.id, files.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      {files.map((f, i) => (
        <div key={i} className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm">
          <span className="flex-1 truncate text-blue-700">{f.name}</span>
          <button type="button" onClick={() => removeFile(i)} className="text-blue-400 hover:text-red-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}

      {files.length < maxFiles && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50"
        >
          <Upload className="w-4 h-4" />
          {uploading ? 'Uploading...' : (config.acceptLabel || 'Choose file')}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={config.accept?.join(',')}
        multiple={maxFiles > 1}
        onChange={e => handleUpload(e.target.files)}
        className="hidden"
      />
    </div>
  );
}

/* ── Repeater Field ───────────────────────────────────────────────── */

function RepeaterField({ field, value, onChange, onFocus, onBlur }: {
  field: SmartFormField; value: unknown; onChange: (id: string, v: unknown) => void;
  onFocus: () => void; onBlur: () => void;
}) {
  const config = field.repeaterConfig;
  if (!config) return null;

  const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

  const addRow = () => {
    if (config.maxRows && rows.length >= config.maxRows) return;
    const emptyRow: Record<string, unknown> = {};
    config.fields.forEach(f => { emptyRow[f.id] = ''; });
    onChange(field.id, [...rows, emptyRow]);
    onFocus();
  };

  const updateRow = (rowIdx: number, subFieldId: string, val: unknown) => {
    const updated = rows.map((row, i) => i === rowIdx ? { ...row, [subFieldId]: val } : row);
    onChange(field.id, updated);
  };

  const removeRow = (rowIdx: number) => {
    if (config.minRows && rows.length <= config.minRows) return;
    onChange(field.id, rows.filter((_, i) => i !== rowIdx));
  };

  return (
    <div className="space-y-3" onFocus={onFocus} onBlur={onBlur}>
      {rows.length === 0 && config.emptyMessage && (
        <p className="text-xs text-gray-400 py-2">{config.emptyMessage}</p>
      )}

      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2 relative">
          <button
            type="button"
            onClick={() => removeRow(rowIdx)}
            className="absolute top-2 right-2 text-gray-400 hover:text-red-500"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {config.fields.map(subField => (
            <div key={subField.id}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{subField.label}</label>
              <input
                type={subField.type === 'number' ? 'number' : 'text'}
                value={String(row[subField.id] ?? '')}
                onChange={e => updateRow(rowIdx, subField.id, subField.type === 'number' ? (e.target.value === '' ? '' : parseFloat(e.target.value)) : e.target.value)}
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={subField.placeholder}
              />
            </div>
          ))}
        </div>
      ))}

      {(!config.maxRows || rows.length < config.maxRows) && (
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          <Plus className="w-4 h-4" />
          {config.addLabel || 'Add row'}
        </button>
      )}
    </div>
  );
}

/* ── Person Picker Field ──────────────────────────────────────────── */

function PersonPickerField({ field, value, onChange, onFocus, onBlur, hasError }: {
  field: SmartFormField; value: unknown; onChange: (id: string, v: unknown) => void;
  onFocus: () => void; onBlur: () => void; hasError: boolean;
}) {
  const config = field.personPickerConfig;
  const options = config?.options || field.options || [];

  if (config?.multiple) {
    const selected = Array.isArray(value) ? value as string[] : [];
    const toggle = (opt: string) => {
      const next = selected.includes(opt)
        ? selected.filter(s => s !== opt)
        : [...selected, opt];
      onChange(field.id, next);
    };
    return (
      <div className="flex flex-wrap gap-2" onFocus={onFocus} onBlur={onBlur}>
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              selected.includes(opt)
                ? 'bg-blue-100 border-blue-300 text-blue-700'
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    );
  }

  // Single select — dropdown
  return (
    <select
      id={field.id}
      value={String(value ?? '')}
      onChange={e => onChange(field.id, e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        hasError ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <option value="">Select person...</option>
      {options.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}
