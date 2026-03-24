'use client';

import React from 'react';

interface HeatmapDay {
  date: string;
  slugs: string[];
}

interface DeptInfo {
  slug: string;
  name: string;
}

interface Props {
  heatmapData: HeatmapDay[];
  allDepartments: DeptInfo[];
  currentMonth: string; // 'YYYY-MM'
}

export default function OverviewHeatmap({ heatmapData, allDepartments, currentMonth }: Props) {
  const [year, month] = currentMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const dates = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  });

  // Build a set-lookup for fast access
  const submissionMap = new Map<string, Set<string>>();
  heatmapData.forEach(day => {
    submissionMap.set(day.date, new Set(day.slugs));
  });

  const getStatus = (slug: string, date: string): 'submitted' | 'missing' | 'future' => {
    if (date > todayStr) return 'future';
    return submissionMap.get(date)?.has(slug) ? 'submitted' : 'missing';
  };

  // Calculate per-department submission rate
  const getDeptRate = (slug: string): number => {
    const pastDates = dates.filter(d => d <= todayStr);
    if (pastDates.length === 0) return 0;
    const submitted = pastDates.filter(d => submissionMap.get(d)?.has(slug)).length;
    return Math.round((submitted / pastDates.length) * 100);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">
            Submission Heatmap
          </h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-emerald-400 rounded-sm" />
              Submitted
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-red-300 rounded-sm" />
              Missing
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-slate-100 border border-slate-200 rounded-sm" />
              Future
            </span>
          </div>
        </div>
      </div>
      <div className="p-4 overflow-x-auto">
        <div className="inline-block min-w-full">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr>
                <th className="text-left p-2 font-semibold text-slate-600 bg-slate-50 border border-slate-200" style={{ minWidth: '130px' }}>
                  Department
                </th>
                {dates.map(date => {
                  const dayNum = new Date(date + 'T00:00:00').getDate();
                  const isToday = date === todayStr;
                  const isWeekend = [0, 6].includes(new Date(date + 'T00:00:00').getDay());
                  return (
                    <th
                      key={date}
                      className={`p-0.5 font-medium text-center border border-slate-200 ${
                        isToday ? 'bg-blue-100 text-blue-700 font-bold' :
                        isWeekend ? 'bg-slate-100 text-slate-400' :
                        'bg-slate-50 text-slate-500'
                      }`}
                      style={{ minWidth: '24px' }}
                      title={date}
                    >
                      {dayNum}
                    </th>
                  );
                })}
                <th className="p-2 font-semibold text-slate-600 bg-slate-50 border border-slate-200 text-center" style={{ minWidth: '45px' }}>
                  Rate
                </th>
              </tr>
            </thead>
            <tbody>
              {allDepartments.map(dept => {
                const rate = getDeptRate(dept.slug);
                return (
                  <tr key={dept.slug}>
                    <td className="p-2 font-medium text-slate-700 bg-slate-50 border border-slate-200 sticky left-0 z-10 whitespace-nowrap">
                      {dept.name}
                    </td>
                    {dates.map(date => {
                      const status = getStatus(dept.slug, date);
                      const bgColor =
                        status === 'submitted' ? 'bg-emerald-400' :
                        status === 'missing' ? 'bg-red-300' :
                        'bg-slate-100';

                      return (
                        <td
                          key={`${dept.slug}-${date}`}
                          className={`p-0.5 border border-slate-200 ${bgColor} transition-colors hover:opacity-80`}
                          title={`${dept.name} — ${date}: ${status}`}
                        />
                      );
                    })}
                    <td className={`p-1 border border-slate-200 text-center font-bold text-xs ${
                      rate >= 80 ? 'text-emerald-600 bg-emerald-50' :
                      rate >= 50 ? 'text-amber-600 bg-amber-50' :
                      'text-red-600 bg-red-50'
                    }`}>
                      {rate}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
