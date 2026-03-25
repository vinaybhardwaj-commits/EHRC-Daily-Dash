import Link from 'next/link';
import { DEPARTMENT_FORMS } from '@/lib/form-definitions';
import { ArrowRight } from 'lucide-react';

export const metadata = {
  title: 'Department Forms | EHRC Daily Dashboard',
  description: 'Fill daily forms for your department',
};

export default function FormIndexPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1e40af] to-[#3b82f6] text-white py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">EHRC Daily Reporting</h1>
          <p className="text-blue-100">Select your department to fill the daily form</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">

        {/* Unit Head Upload Section */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Unit Head Uploads</h2>
          <Link
            href="/form/unit-head"
            className="group bg-white rounded-lg border-2 border-purple-200 p-6 hover:border-purple-400 hover:shadow-lg transition-all block"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-purple-500"></span>
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-purple-600 transition-colors">
                    KX Daily Uploads
                  </h3>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  Upload In-Patient Status CSV from KX for unbilled revenue tracking
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-purple-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all flex-shrink-0 ml-3 mt-1" />
            </div>
          </Link>
        </div>

        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Department Forms</h2>
        {/* Department Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DEPARTMENT_FORMS.map(form => (
            <Link
              key={form.slug}
              href={`/form/${form.slug}`}
              className="group bg-white rounded-lg border border-gray-200 p-6 hover:border-blue-400 hover:shadow-lg transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                    {form.department}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                    {form.description.split('\n')[0]}
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all flex-shrink-0 ml-3 mt-1" />
              </div>
            </Link>
          ))}
        </div>

        {/* Footer Info */}
        <div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-2">How it works</h3>
          <ul className="text-sm text-gray-700 space-y-1">
            <li>• Select your department from the list above</li>
            <li>• Fill in all required fields marked with <span className="text-red-600">*</span></li>
            <li>• Today's date is pre-filled automatically</li>
            <li>• Takes under 5 minutes for most departments</li>
            <li>• Your submission is recorded immediately</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
