'use client';

import { useState } from 'react';

interface HKProgressBarProps {
  done: number;
  total: number;
  label?: string;
}

export function HKProgressBar({ done, total, label }: HKProgressBarProps) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="w-full">
      {label && <p className="text-xs text-gray-500 mb-1">{label}</p>}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm font-semibold text-gray-700 min-w-[60px] text-right">{pct}% ({done}/{total})</span>
      </div>
    </div>
  );
}

interface HKFloorFilterProps {
  floors: string[];
  selected: string;
  onSelect: (floor: string) => void;
  overdueCount: number;
}

export function HKFloorFilter({ floors, selected, onSelect, overdueCount }: HKFloorFilterProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 px-1 -mx-1 scrollbar-hide">
      <button
        onClick={() => onSelect('ALL')}
        className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
          selected === 'ALL' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >All</button>
      {overdueCount > 0 && (
        <button
          onClick={() => onSelect('OVERDUE')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
            selected === 'OVERDUE' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'
          }`}
        >Overdue ({overdueCount})</button>
      )}
      {floors.map(f => (
        <button
          key={f}
          onClick={() => onSelect(f)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
            selected === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >{f}</button>
      ))}
    </div>
  );
}

interface TaskItem {
  id: number;
  task_name: string;
  task_category: string;
  disinfectant: string | null;
  status: 'pending' | 'done' | 'skipped';
  source: string;
  sewa_request_id: string | null;
  area_name: string;
  floor: string;
  area_id: number;
  priority: number;
}

interface HKTaskCardProps {
  areaName: string;
  floor: string;
  areaId: number;
  tasks: TaskItem[];
  onCompleteTask: (taskId: number) => void;
  onCompleteRoom: (areaId: number) => void;
  onSkipTask: (taskId: number) => void;
}

export function HKTaskCard({ areaName, floor, areaId, tasks, onCompleteTask, onCompleteRoom, onSkipTask }: HKTaskCardProps) {
  const [showSkip, setShowSkip] = useState<number | null>(null);
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const doneTasks = tasks.filter(t => t.status === 'done');
  const isCarryover = tasks.some(t => t.source === 'carryover');
  const isSewa = tasks.some(t => t.source === 'sewa');
  const allDone = pendingTasks.length === 0 && doneTasks.length > 0;

  const borderColor = isCarryover ? 'border-l-red-500' : isSewa ? 'border-l-orange-500' : 'border-l-gray-300';
  const bgColor = allDone ? 'bg-green-50' : isCarryover ? 'bg-red-50' : 'bg-white';

  return (
    <div className={`rounded-lg border border-gray-200 border-l-4 ${borderColor} ${bgColor} shadow-sm mb-3 overflow-hidden`}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
        <div>
          {isCarryover && <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded mr-1.5">OVERDUE</span>}
          {isSewa && <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded mr-1.5">SEWA</span>}
          <span className="text-sm font-semibold text-gray-800">{floor} — {areaName}</span>
        </div>
        {allDone && <span className="text-green-600 text-sm font-bold">Done</span>}
      </div>

      {/* Task list */}
      <div className="px-3 py-1.5">
        {tasks.map(task => (
          <div key={task.id} className={`flex items-start gap-2 py-1.5 ${task.status === 'done' ? 'opacity-50' : ''}`}>
            <button
              onClick={() => task.status === 'pending' ? onCompleteTask(task.id) : undefined}
              disabled={task.status !== 'pending'}
              className={`mt-0.5 w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${
                task.status === 'done' ? 'bg-green-500 border-green-500 text-white' :
                task.status === 'skipped' ? 'bg-gray-300 border-gray-300 text-white' :
                'border-gray-300 hover:border-blue-500 active:bg-blue-50'
              }`}
            >
              {task.status === 'done' && <span className="text-xs">&#10003;</span>}
              {task.status === 'skipped' && <span className="text-xs">&#10005;</span>}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                {task.task_name}
              </p>
              {task.disinfectant && (
                <p className="text-[11px] text-gray-400">{task.disinfectant}</p>
              )}
              {task.sewa_request_id && (
                <p className="text-[11px] text-orange-500">Sewa #{task.sewa_request_id}</p>
              )}
            </div>
            {task.status === 'pending' && (
              <button
                onClick={() => setShowSkip(showSkip === task.id ? null : task.id)}
                className="text-gray-400 hover:text-gray-600 text-xs px-1"
                title="Skip"
              >Skip</button>
            )}
          </div>
        ))}
      </div>

      {/* Skip reason selector */}
      {showSkip && (
        <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-1.5">Skip reason:</p>
          <div className="flex flex-wrap gap-1.5">
            {['Not enough staff', 'Area occupied / in use', 'Supplies unavailable', 'Other'].map(reason => (
              <button
                key={reason}
                onClick={() => { onSkipTask(showSkip); setShowSkip(null); }}
                className="text-xs px-2 py-1 rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 active:bg-gray-200"
              >{reason}</button>
            ))}
          </div>
        </div>
      )}

      {/* Complete All button */}
      {pendingTasks.length > 1 && (
        <div className="px-3 py-2 border-t border-gray-100">
          <button
            onClick={() => onCompleteRoom(areaId)}
            className="w-full py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 active:bg-green-800 transition-colors"
          >Complete All ({pendingTasks.length} tasks)</button>
        </div>
      )}
    </div>
  );
}
