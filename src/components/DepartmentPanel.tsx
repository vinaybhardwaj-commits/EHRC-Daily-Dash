'use client';

import { DepartmentData } from '@/lib/types';
import { FORM_DEFINITIONS, FormField, DepartmentFormDef } from '@/lib/form-definitions';

interface Props {
  dept: DepartmentData;
}

function getRadioBadgeColor(value: string): { bg: string; text: string } {
  const lower = String(value || '').toLowerCase();
  if (lower.includes('yes') || lower.includes('full')) return { bg: 'bg-emerald-100', text: 'text-emerald-700' };
  if (lower.includes('partial')) return { bg: 'bg-amber-100', text: 'text-amber-700' };
  if (lower.includes('no')) return { bg: 'bg-red-100', text: 'text-red-700' };
  return { bg: 'bg-slate-100', text: 'text-slate-700' };
}

export default function DepartmentPanel({ dept }: Props) {
  const latestEntry = dept.entries[dept.entries.length - 1];
  const formDef = FORM_DEFINITIONS.find(f => f.slug === dept.slug);

  if (!formDef) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
        <p className="text-slate-500">No form definition available for {dept.name}</p>
      </div>
    );
  }

  if (!latestEntry) {
    const mandatoryFields = formDef.sections
      .filter(s => s.title.toLowerCase().includes('mandatory') || !s.title.toLowerCase().includes('optional'))
      .flatMap(s => s.fields)
      .filter(f => f.required);

    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="font-semibold text-amber-800">Not Submitted</h3>
        </div>
        <p className="text-sm text-amber-700 mb-4">
          No data from {dept.name} for this date. Expected fields:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {mandatoryFields.slice(0, 8).map((field, i) => (
            <div key={i} className="text-xs text-amber-600 bg-amber-100 rounded-lg px-3 py-1.5 truncate" title={field.name}>
              {field.name}
            </div>
          ))}
          {mandatoryFields.length > 8 && (
            <div className="text-xs text-amber-500 px-3 py-1.5">+{mandatoryFields.length - 8} more fields</div>
          )}
        </div>
      </div>
    );
  }

  // Data exists â show KPI cards and sections
  const kpiCards = (formDef.kpiFields || [])
    .map(fieldName => ({ fieldName, value: latestEntry.fields[fieldName] }))
    .filter(item => item.value !== undefined && item.value !== '');

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      {kpiCards.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wider">Key Metrics</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {kpiCards.map(item => {
              const field = getAllFields(formDef).find((f: FormField) => f.name === item.fieldName);
              const isRadio = field?.type === 'radio';
              const badgeColor = isRadio ? getRadioBadgeColor(String(item.value)) : null;

              return (
                <div
                  key={item.fieldName}
                  className={`rounded-xl border p-3.5 transition-all ${
                    isRadio
                      ? `${badgeColor?.bg} border-transparent`
                      : 'bg-white border-slate-200 shadow-sm'
                  }`}
                >
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider leading-tight mb-2 line-clamp-2" title={item.fieldName}>
                    {item.fieldName}
                  </p>
                  {isRadio ? (
                    <p className={`text-sm font-semibold ${badgeColor?.text}`}>{item.value}</p>
                  ) : (
                    <p className="text-xl sm:text-2xl font-bold text-slate-900">
                      {typeof item.value === 'number' ? item.value.toLocaleString('en-IN') : item.value}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sections */}
      {formDef.sections.map((section, sectionIdx) => {
        const sectionValues = section.fields
          .map(field => ({ field, value: latestEntry.fields[field.name || field.label] }))
          .filter(item => item.value !== undefined && item.value !== '');

        if (sectionValues.length === 0) return null;

        return (
          <div key={sectionIdx} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 sm:px-5 py-3">
              <h3 className="font-semibold text-slate-800 text-sm">{section.title}</h3>
              {section.description && (
                <p className="text-xs text-slate-500 mt-0.5">{section.description}</p>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {sectionValues.map(({ field, value }, idx) => {
                const isRadio = field.type === 'radio';
                const badgeColor = isRadio ? getRadioBadgeColor(String(value)) : null;
                const isLongText = typeof value === 'string' && value.length > 80;

                return (
                  <div key={idx} className="px-4 sm:px-5 py-3 hover:bg-slate-50/50 transition-colors">
                    <div className={`flex ${isLongText ? 'flex-col gap-2' : 'items-start justify-between gap-4'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">{field.name}</p>
                        {field.helper && (
                          <p className="text-xs text-slate-400 mt-0.5">{field.helper}</p>
                        )}
                      </div>
                      <div className={isLongText ? '' : 'flex-shrink-0'}>
                        {isRadio ? (
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${badgeColor?.bg} ${badgeColor?.text}`}>
                            {value}
                          </span>
                        ) : typeof value === 'number' ? (
                          <p className="text-sm font-bold text-slate-900 tabular-nums">{value.toLocaleString('en-IN')}</p>
                        ) : isLongText ? (
                          <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{String(value)}</p>
                        ) : (
                          <p className="text-sm text-slate-700 text-right">{value}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getAllFields(def: DepartmentFormDef): FormField[] {
  return def.sections.flatMap(s => s.fields);
}
