'use client';

import { DaySnapshot, DEPARTMENTS } from '@/lib/types';

interface Props {
  snapshots: DaySnapshot[];
  currentMonth: string;
}

export default function SubmissionHeatmap({ snapshots, currentMonth }: Props) {
  const [year, month] = currentMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const dates = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  });

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
    <div>
      <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider mb-4">Department Submission Heatmap</h3>
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 overflow-x-auto">
        <div className="inline-block min-w-full">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr>
                <th className="text-left p-2 font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-tl-lg" style={{ minWidth: '120px' }}>
                  Department
                </th>
                {dates.map(date => {
                  const dayNum = new Date(date + 'T00:00:00').getDate();
                  const isToday = date === todayStr;
                  return (
                    <th
                      key={date}
                      className={`p-1 font-medium text-slate-500 bg-slate-50 border border-slate-200 text-center ${isToday ? 'bg-blue-50 text-blue-700 font-bold' : ''}`}
                      style={{ minWidth: '28px' }}
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
                  <td className="p-2 font-medium text-slate-700 bg-slate-50 border border-slate-200 sticky left-0 z-10 whitespace-nowrap">
                    {dept.name}
                  </td>
                  {dates.map(date => {
                    const status = getStatus(dept.slug, date);
                    const bgColor =
                      status === 'submitted'
                        ? 'bg-emerald-400'
                        : status === 'not-submitted'
                          ? 'bg-red-300'
                          : 'bg-slate-100';

                    return (
                      <td
                        key={`${dept.slug}-${date}`}
                        className={`p-1 border border-slate-200 text-center ${bgColor} transition-colors hover:opacity-80`}
                        title={`${dept.name} â ${date}: ${status}`}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-emerald-400 rounded-sm" />
            <span className="text-slate-600">Submitted</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-red-300 rounded-sm" />
            <span className="text-slate-600">Missing</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-slate-100 border border-slate-200 rounded-sm" />
            <span className="text-slate-600">Future</span>
          </div>
        </div>
      </div>
    </div>
  );
}
