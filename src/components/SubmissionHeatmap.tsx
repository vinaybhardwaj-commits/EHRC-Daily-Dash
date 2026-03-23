'use client';

import { DaySnapshot, DEPARTMENTS } from '@/lib/types';

interface Props {
  snapshots: DaySnapshot[]; // All snapshots for the current month
  currentMonth: string; // YYYY-MM
}

export default function SubmissionHeatmap({ snapshots, currentMonth }: Props) {
  // Get all dates in the current month
  const [year, month] = currentMonth.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const dates = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  });

  // Create a map of date -> submitted department slugs
  const submissionMap = new Map<string, Set<string>>();
  snapshots.forEach(snapshot => {
    if (!submissionMap.has(snapshot.date)) {
      submissionMap.set(snapshot.date, new Set());
    }
    snapshot.departments.forEach(dept => {
      submissionMap.get(snapshot.date)?.add(dept.slug);
    });
  });

  const getStatus = (deptSlug: string, date: string): 'submitted' | 'not-submitted' | 'future' => {
    if (date > todayStr) return 'future';
    return submissionMap.get(date)?.has(deptSlug) ? 'submitted' : 'not-submitted';
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 overflow-x-auto">
      <h3 className="font-semibold text-gray-900 text-lg mb-4">Department Submission Heatmap</h3>
      <div className="inline-block min-w-full">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2 font-semibold text-gray-700 bg-gray-50 border border-gray-200" style={{ minWidth: '140px' }}>
                Department
              </th>
              {dates.map(date => {
                const d = new Date(date);
                const dayNum = d.getDate();
                return (
                  <th
                    key={date}
                    className="p-1.5 font-medium text-gray-600 bg-gray-50 border border-gray-200 text-center"
                    style={{ minWidth: '32px' }}
                    title={date}
                  >
                    {dayNum}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {DEPARTMENTS.map(dept => (
              <tr key={dept.slug}>
                <td className="p-2 font-medium text-gray-700 bg-gray-50 border border-gray-200 sticky left-0 z-10">
                  {dept.name}
                </td>
                {dates.map(date => {
                  const status = getStatus(dept.slug, date);
                  const bgColor =
                    status === 'submitted'
                      ? 'bg-green-200'
                      : status === 'not-submitted'
                        ? 'bg-red-200'
                        : 'bg-gray-100';

                  return (
                    <td
                      key={`${dept.slug}-${date}`}
                      className={`p-1.5 border border-gray-300 text-center ${bgColor} transition-colors hover:opacity-75`}
                      title={`${dept.name} - ${date}: ${status}`}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-200 border border-gray-300 rounded" />
          <span className="text-gray-700">Submitted</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-200 border border-gray-300 rounded" />
          <span className="text-gray-700">Not Submitted</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-100 border border-gray-300 rounded" />
          <span className="text-gray-700">Future Date</span>
        </div>
      </div>
    </div>
  );
}
