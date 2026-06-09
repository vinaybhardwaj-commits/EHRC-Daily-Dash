import { notFound } from 'next/navigation';
import { getBookingByToken } from '@/lib/surgical-risk/booking-db';
import { DOC_TYPES, DOC_TITLE, type DocType } from '@/lib/surgical-risk/pdf/render';

export const dynamic = 'force-dynamic';

function fmtDate(v: unknown): string {
  if (!v) return '—';
  const d = v instanceof Date ? v : new Date(typeof v === 'string' && v.length <= 10 ? `${v}T00:00:00` : String(v));
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const DOC_DESC: Record<DocType, string> = {
  fc: 'Estimated cost & payment terms, with the consent to sign.',
  info: 'Clinical and admission details for your reference.',
  adm: 'Admission slip to sign on arrival.',
};

export default async function PatientPortal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const b = await getBookingByToken(token);
  if (!b || b.revoked) notFound();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-[#1e40af] to-[#3b82f6] text-white py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold">EVEN HOSPITALS</h1>
          <p className="text-blue-100 text-sm">Race Course Road, Bangalore 560001</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Your admission documents</h2>
        <p className="text-sm text-gray-500 mb-5">
          Please download, print, and bring these — signed where indicated — at the time of admission.
        </p>

        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt className="text-gray-500 col-span-1">Patient</dt><dd className="text-gray-900 font-medium col-span-2">{b.patient_name}</dd>
            <dt className="text-gray-500 col-span-1">UHID</dt><dd className="text-gray-900 col-span-2">{b.uhid}</dd>
            <dt className="text-gray-500 col-span-1">Procedure</dt><dd className="text-gray-900 col-span-2">{b.proposed_procedure || '—'}</dd>
            <dt className="text-gray-500 col-span-1">Consultant</dt><dd className="text-gray-900 col-span-2">{b.surgeon_name || '—'}</dd>
            <dt className="text-gray-500 col-span-1">Surgery date</dt><dd className="text-gray-900 col-span-2">{fmtDate(b.surgery_date)}</dd>
            <dt className="text-gray-500 col-span-1">Admission</dt><dd className="text-gray-900 col-span-2">{fmtDate(b.admission_date)}{b.admission_time ? ` (by ${b.admission_time})` : ''}</dd>
          </dl>
        </div>

        <div className="space-y-3">
          {DOC_TYPES.map((t) => (
            <a
              key={t}
              href={`/api/surgical-risk/booking/pdf/${token}/${t}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-400 hover:shadow-sm transition-all"
            >
              <div className="pr-3">
                <div className="text-sm font-semibold text-gray-900">{DOC_TITLE[t]}</div>
                <div className="text-xs text-gray-500 mt-0.5">{DOC_DESC[t]}</div>
              </div>
              <span className="text-xs font-medium text-blue-600 border border-blue-200 rounded-md px-3 py-1.5 whitespace-nowrap">Open PDF</span>
            </a>
          ))}
        </div>

        <p className="text-xs text-gray-400 mt-8">
          These are provisional estimates; final charges may vary based on clinical condition and length of stay.
          For assistance, contact Even Hospitals, Race Course Road, Bangalore 560001.
        </p>
      </div>
    </div>
  );
}
