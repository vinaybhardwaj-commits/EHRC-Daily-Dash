'use client';

import { useState, useEffect } from 'react';

interface Props {
  availableDays: string[];
  selectedDate: string;
  onSelect: (date: string) => void;
}

export default function CalendarPicker({ availableDays, selectedDate, onSelect }: Props) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const daysInMonth = new Date(currentMonth.year, currentMonth.month + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentMonth.year, currentMonth.month, 1).getDay();
  const availableSet = new Set(availableDays);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const prevMonth = () => {
    setCurrentMonth(prev => prev.month === 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month: prev.month - 1 });
  };
  const nextMonth = () => {
    setCurrentMonth(prev => prev.month === 11 ? { year: prev.year + 1, month: 0 } : { year: prev.year, month: prev.month + 1 });
  };

  const days = [];
  for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded text-gray-600">&larr;</button>
        <h3 className="font-semibold text-gray-800">{monthNames[currentMonth.month]} {currentMonth.year}</h3>
        <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded text-gray-600">&rarr;</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} className="font-semibold text-gray-400 py-1">{d}</div>
        ))}
        {days.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;
          const dateStr = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const hasData = availableSet.has(dateStr);
          const isSelected = dateStr === selectedDate;
          return (
            <button
              key={dateStr}
              onClick={() => hasData && onSelect(dateStr)}
              disabled={!hasData}
              className={`py-1.5 rounded-lg text-sm transition-colors
                ${isSelected ? 'bg-blue-600 text-white font-bold' : ''}
                ${hasData && !isSelected ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium cursor-pointer' : ''}
                ${!hasData ? 'text-gray-300 cursor-default' : ''}
              `}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
