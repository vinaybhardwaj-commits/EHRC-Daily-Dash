import Link from 'next/link';
import { getAllFormConfigs } from '@/lib/form-engine/registry';
import { ArrowRight } from 'lucide-react';
import FormFillerBadge from '@/components/FormFillerBadge';

export const metadata = {
  title: 'Department Forms | EHRC Daily Dashboard',
  description: 'Fill daily forms for your department',
};

/**
 * Dept-to-section grouping. Confirmed by V on 2026-05-05 (EHRC-2-NEW-DEPTS-PRD §6.2).
 * Order within each section is intentional (clinical workflow → ED → quality/IPC trail).
 * Adding a new dept? Add its slug here AND to the smart-form registry.
 */
const SECTION_GROUPS: { title: string; subtitle: string; slugs: string[] }[] = [
  {
    title: 'Clinical Care',
    subtitle: 'Patient-facing departments',
    slugs: [
      'nursing',
      'ot',
      'emergency',
      'clinical-lab',
      'pharmacy',
      'radiology',
      'patient-safety',
      'diet',
      'quality-accreditation',
      'infection-control',
    ],
  },
  {
    title: 'Support Services',
    subtitle: 'Operations & infrastructure',
    slugs: ['facility', 'it', 'biomedical', 'supply-chain', 'hr-manpower'],
  },
  {
    title: 'Administrative',
    subtitle: 'Back-office & business functions',
    slugs: ['billing', 'customer-care', 'finance', 'training'],
  },
];

export default function FormIndexPage() {
  const allForms = getAllFormConfigs();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1e40af] to-[#3b82f6] text-white py-8 px-4">
        <div className="max-w-5xl mx-auto flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">EHRC Daily Reporting</h1>
            <p className="text-blue-100">Select your department to fill the daily form</p>
          </div>
          <div className="bg-white/90 rounded-full">
            <FormFillerBadge />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 py-10">

        {/* Unit Head Upload Section (preserved) */}
        <div className="mb-10">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Unit Head Uploads</h2>
          <Link
            href="/form/unit-head"
            className="group bg-white rounded-xl border-2 border-purple-200 p-5 hover:border-purple-400 hover:shadow-md transition-all block"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-purple-500"></span>
                  <h3 className="text-base font-semibold text-gray-900 group-hover:text-purple-600 transition-colors">
                    KX Daily Uploads
                  </h3>
                </div>
                <p className="text-sm text-gray-600 mt-0.5">
                  Upload In-Patient Status CSV from KX for unbilled revenue tracking
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-purple-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all flex-shrink-0 ml-3 mt-1" />
            </div>
          </Link>
        </div>

        {/* Department Sections */}
        {SECTION_GROUPS.map(section => {
          const sectionForms = section.slugs
            .map(slug => allForms[slug])
            .filter((f): f is NonNullable<typeof f> => Boolean(f));

          if (sectionForms.length === 0) return null;

          return (
            <section key={section.title} className="mb-10">
              <div className="flex items-baseline justify-between mb-4 pb-2 border-b border-gray-200">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{section.title}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{section.subtitle}</p>
                </div>
                <span className="text-xs text-gray-400 font-medium">{sectionForms.length} forms</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {sectionForms.map(form => (
                  <Link
                    key={form.slug}
                    href={`/form/${form.slug}`}
                    className="group bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-400 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                          {form.department}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {form.description.split('\n')[0]}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all flex-shrink-0 mt-0.5" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        {/* Footer Info (preserved) */}
        <div className="mt-10 bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h3 className="font-semibold text-gray-900 mb-2 text-sm">How it works</h3>
          <ul className="text-sm text-gray-700 space-y-1">
            <li>• Select your department from the list above</li>
            <li>• Fill in all required fields marked with <span className="text-red-600">★</span></li>
            <li>• Today's date is pre-filled automatically</li>
            <li>• Most forms take under 5 minutes</li>
            <li>• Your submission is recorded immediately</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
