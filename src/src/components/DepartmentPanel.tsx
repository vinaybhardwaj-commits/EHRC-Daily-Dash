'use client';

import { DepartmentData } from '@/lib/types';
import { FORM_DEFINITIONS, FormField, DepartmentFormDef } from '@/lib/form-definitions';
import KPICard from './KPICard';

interface Props {
  dept: DepartmentData;
}

function getRadioBadgeColor(value: string): { bg: string; text: string } {
  const lower = String(value || '').toLowerCase();
  if (lower.includes('yes') || lower.includes('full')) return { bg: 'bg-green-100', text: 'text-green-700' };
  if (lower.includes('partial')) return { bg: 'bg-yellow-100', text: 'text-yellow-700' };
  if (lower.includes('no')) return { bg: 'bg-red-100', text: 'text-red-700' };
  return { bg: 'bg-gray-100', text: 'text-gray-700' };
}

export default function DepartmentPanel({ dept }: Props) {
  const latestEntry = dept.entries[dept.entries.length - 1];
  const formDef = FORM_DEFINITIONS.find(f => f.slug === dept.slug);

  // No form definition
  if (!formDef) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <p className="text-gray-500">No form definition available for {dept.name}</p>
      </div>
    );
  }

  // No data submitted
  if (!latestEntry) {
    const mandatoryFields = formDef.sections
      .filter(s => s.title.toLowerCase().includes('mandatory') || !s.title.toLowerCase().includes('optional'))
      .flatMap(s => s.fields)
      .filter(f => f.required);

    return (
      <div className="bg-amber-50 border-l-4 border-amber-400 rounded-lg p-5">
        <h3 className="font-semibold text-amber-900 mb-3">Not Submitted</h3>
        <p className="text-sm text-amber-800 mb-4">
          No data has been submitted by {dept.name} for this date. Expected mandatory fields:
        </p>
        <div className="space-y-1">
          {mandatoryFields.map((field, i) => (
            <div key={i} className="text-sm text-amber-700 flex items-start gap-2">
              <span className="font-semibold">•</span>
              <span>{field.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Data exists - show by sections with KPI cards
  const kpiCards = formDef.kpiFields
    .map(fieldName => ({ fieldName, value: latestEntry.fields[fieldName] }))
    .filter(item => item.value !== undefined && item.value !== '');

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      {kpiCards.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Key Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {kpiCards.map(item => {
              const field = getAllFields(formDef).find((f: FormField) => f.name === item.fieldName);
              const isRadio = field?.type === 'radio';
              const badgeColor = isRadio ? getRadioBadgeColor(String(item.value)) : null;

              return (
                <div
                  key={item.fieldName}
                  className={`rounded-xl border p-4 transition-all ${
                    isRadio
                      ? `${badgeColor?.bg} border-transparent`
                      : 'bg-white border-gray-200 shadow-sm hover:shadow-md'
                  }`}
                >
                  <p className="text-xs font-medium text-gray-600 uppercase tracking-wide truncate" title={item.fieldName}>
                    {item.fieldName}
                  </p>
                  {isRadio ? (
                    <p className={`mt-2 text-sm font-semibold ${badgeColor?.text}`}>{item.value}</p>
                  ) : (
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                      {typeof item.value === 'number' ? item.value.toLocaleString('en-IN') : item.value}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sections with Fields */}
      {formDef.sections.map((section, sectionIdx) => {
        const sectionValues = section.fields
          .map(field => ({
            field,
            value: latestEntry.fields[field.name],
          }))
          .filter(item => item.value !== undefined && item.value !== '');

        if (sectionValues.length === 0) return null;

        return (
          <div key={sectionIdx} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b px-5 py-3">
              <h3 className="font-semibold text-gray-900">{section.title}</h3>
              {section.description && (
                <p className="text-xs text-gray-600 mt-1">{section.description}</p>
              )}
            </div>
            <div className="divide-y">
              {sectionValues.map(({ field, value }, idx) => {
                const isRadio = field.type === 'radio';
                const badgeColor = isRadio ? getRadioBadgeColor(String(value)) : null;

                return (
                  <div key={idx} className="px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{field.name}</p>
                        {field.helper && (
                          <p className="text-xs text-gray-500 mt-1">{field.helper}</p>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        {isRadio ? (
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                              badgeColor?.bg
                            } ${badgeColor?.text}`}
                          >
                            {value}
                          </span>
                        ) : typeof value === 'number' ? (
                          <p className="text-sm font-semibold text-gray-900">{value.toLocaleString('en-IN')}</p>
                        ) : String(value).length > 100 ? (
                          <p className="text-sm text-gray-700 max-w-xs text-right whitespace-normal">
                            {String(value).substring(0, 100)}...
                          </p>
                        ) : (
                          <p className="text-sm text-gray-700 max-w-xs text-right whitespace-normal">{value}</p>
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
