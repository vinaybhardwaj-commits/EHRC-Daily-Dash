'use client';

import { DEPARTMENTS } from '@/lib/types';

interface FormLink {
  slug: string;
  name: string;
  tab: string;
  url: string;
  owner?: string;
}

const FORM_LINKS: FormLink[] = [
  {
    slug: 'emergency',
    name: 'Emergency',
    tab: 'ED',
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSeCrHDQGoFIoTI-6fUZ6Au9tWZn8qGcz2h8MPlJZk1VahisEQ/viewform?usp=header',
  },
  {
    slug: 'customer-care',
    name: 'Customer Care',
    tab: 'Customer Care',
    url: 'https://forms.gle/YxuujLuDNVA4qeBm7',
    owner: 'Lavanya',
  },
  {
    slug: 'patient-safety',
    name: 'Patient Safety & Quality',
    tab: 'Patient Safety',
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSclCnqnnHbiOeuAQ2a2xdsu6tdtMAUYECGqZvKzRYrUYeTfUA/viewform?usp=header',
    owner: 'Dr. Ankita Priya',
  },
  {
    slug: 'finance',
    name: 'Finance',
    tab: 'Finance',
    url: 'https://docs.google.com/forms/d/e/1FAIpQLScCCouovrK8dlcjsafRZzZK1XGzhcJyngpJxESa3QV542y_7g/viewform?usp=header',
  },
  {
    slug: 'billing',
    name: 'Billing',
    tab: 'Billing',
    url: 'https://docs.google.com/forms/d/e/1FAIpQLScQdzM7b95D4hvGEmgA6z96-rbWiWv4FPHiDWM7I4WbjhPFeA/viewform?usp=header',
  },
  {
    slug: 'supply-chain',
    name: 'Supply Chain & Procurement',
    tab: 'Supply Chain',
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSc-8v9kNxl-UVtjDgcunyFKqKKGK5oVE1qFy7f2DefuZ5LeRQ/viewform?usp=header',
  },
  {
    slug: 'facility',
    name: 'Facility',
    tab: 'FMS',
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSfiiaknJfGuCDFv5rWiJ2rfBOrUo8ZvyYA6c4g2TgiXXk-lZw/viewform?usp=header',
  },
  {
    slug: 'it',
    name: 'IT',
    tab: 'IT',
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSc-GEBLRQl-_LlCgt8h2TEEf5NNX8ySlIBGI4DfoEEHTqHSBg/viewform?usp=header',
  },
  {
    slug: 'nursing',
    name: 'Nursing',
    tab: 'Nursing',
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSeCi9zFwXRDIuFgVXBmoQOmCQzawH73VlN0gsKGev1PDG5bVA/viewform?usp=header',
  },
  {
    slug: 'pharmacy',
    name: 'Pharmacy',
    tab: 'Pharmacy',
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSePB02n6djb_F4T0Sg3GnemNwqyr2I4cv7xjZ6H9d-kRdbQVA/viewform?usp=header',
  },
  {
    slug: 'clinical-lab',
    name: 'Clinical Lab',
    tab: 'Clinical Lab',
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSeUQiIr53m_RKK5gD5ghAB9L0TDFXdsfVsAdbPoM5DtR1hFlw/viewform?usp=header',
  },
  {
    slug: 'radiology',
    name: 'Radiology',
    tab: 'Radiology',
    url: 'https://docs.google.com/forms/d/1BjDncMCJrgh8Tb9osfhDfO052T6rPB_VrmsPbUsTvJk/edit',
  },
  {
    slug: 'ot',
    name: 'OT',
    tab: 'OT',
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSdArzQN0Vc8ArpiYjGj62HHFWWAgkgyknAs3lWdztrdqwFPWQ/viewform?usp=header',
  },
  {
    slug: 'hr-manpower',
    name: 'HR & Manpower',
    tab: 'Human Resources',
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSfDNSshJ7S0f9Wi-xLtjr85OROuU7XhBqt6MpilXuNP97c2dg/viewform?usp=header',
  },
  {
    slug: 'training',
    name: 'Training',
    tab: 'Training',
    url: 'https://docs.google.com/forms/d/15JeNvjlL_TOmJCt6HsJyVn70i3LYJFrVRE7bYMePG44/edit',
  },
  {
    slug: 'diet',
    name: 'Diet',
    tab: 'Clinical Nutrition, F&B',
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSfq8_xckOifK-2pMAfWq1_NG1Mg50hDj1Fb3SLkFt5Wc6qiTw/viewform?usp=header',
  },
  {
    slug: 'biomedical',
    name: 'Biomedical',
    tab: 'Biomedical',
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSdfihDGdUAiNSqQp_Bd6WZ-Qq1CopqQZqLAKWr8-5YvJbjWSw/viewform?usp=header',
  },
];

// Color palette for department icons
const DEPT_COLORS: Record<string, string> = {
  'emergency': 'bg-red-100 text-red-700 border-red-200',
  'customer-care': 'bg-blue-100 text-blue-700 border-blue-200',
  'patient-safety': 'bg-purple-100 text-purple-700 border-purple-200',
  'finance': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'billing': 'bg-green-100 text-green-700 border-green-200',
  'supply-chain': 'bg-orange-100 text-orange-700 border-orange-200',
  'facility': 'bg-gray-100 text-gray-700 border-gray-200',
  'it': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'nursing': 'bg-pink-100 text-pink-700 border-pink-200',
  'pharmacy': 'bg-teal-100 text-teal-700 border-teal-200',
  'clinical-lab': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'radiology': 'bg-violet-100 text-violet-700 border-violet-200',
  'ot': 'bg-amber-100 text-amber-700 border-amber-200',
  'hr-manpower': 'bg-rose-100 text-rose-700 border-rose-200',
  'training': 'bg-lime-100 text-lime-700 border-lime-200',
  'diet': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  'biomedical': 'bg-sky-100 text-sky-700 border-sky-200',
};

// Department initials for the icon
function getInitials(name: string): string {
  const words = name.split(/[\s&]+/).filter(w => w.length > 0);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

interface DepartmentFormsProps {
  submittedSlugs?: string[];
}

export default function DepartmentForms({ submittedSlugs = [] }: DepartmentFormsProps) {
  const submittedSet = new Set(submittedSlugs);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Daily Morning Meeting Forms</h2>
        <p className="text-sm text-gray-500 mb-3">
          Department heads: please fill in your form before 9:00 AM every day.
          Contact Dr. V if any form link does not work.
        </p>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
            Submitted today
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-300 inline-block"></span>
            Not yet submitted
          </span>
        </div>
      </div>

      {/* Form cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {FORM_LINKS.map((form) => {
          const isSubmitted = submittedSet.has(form.slug);
          const colors = DEPT_COLORS[form.slug] || 'bg-gray-100 text-gray-700 border-gray-200';

          return (
            <a
              key={form.slug}
              href={form.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`group flex items-center gap-3 p-3 sm:p-4 rounded-xl border transition-all duration-150 ${
                isSubmitted
                  ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-300 hover:shadow-md'
                  : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-md'
              }`}
            >
              {/* Department icon */}
              <div className={`flex-shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-lg border flex items-center justify-center text-xs sm:text-sm font-bold ${colors}`}>
                {getInitials(form.name)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-900 truncate">{form.name}</span>
                  {isSubmitted && (
                    <span className="flex-shrink-0 text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
                      Done
                    </span>
                  )}
                </div>
                {form.owner && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">Owner: {form.owner}</p>
                )}
              </div>

              {/* Arrow */}
              <svg
                className="w-4 h-4 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          );
        })}
      </div>
    </div>
  );
}
