'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  SEWA_DEPARTMENTS,
  getDepartment,
  getAllComplaintTypes,
  type DepartmentConfig,
  type SubMenu,
  type ComplaintType,
  type ExtraField,
  type SewaRequest,
  type RequestStatus,
} from '@/lib/sewa-config';

// ═══════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════

/** Sliding BottomSheet (ported from Sewa v1) */
function BottomSheet({ isOpen, onClose, title, children }: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[999] flex items-end"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white w-full rounded-t-[20px] max-h-[85vh] flex flex-col"
        style={{ animation: 'sewaSlideUp 0.3s ease-out' }}
      >
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 m-0">{title}</h2>
          <button onClick={onClose} className="bg-transparent border-none text-2xl cursor-pointer text-gray-400 p-0 leading-none">&times;</button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

/** SLA Progress Bar (ported from Sewa v1) */
function SLABar({ slaMinutes, createdAt, label }: {
  slaMinutes: number;
  createdAt: string;
  label: string;
}) {
  const minutesPassed = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  const minutesRemaining = Math.max(0, slaMinutes - minutesPassed);
  const pct = slaMinutes > 0 ? Math.max(0, minutesRemaining / slaMinutes) : 0;
  const color = pct > 0.5 ? '#10b981' : pct > 0.25 ? '#f59e0b' : '#dc2626';

  return (
    <div className="mb-2">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[11px] text-gray-500">{label}</span>
        <span className="text-[11px] font-semibold" style={{ color }}>
          {minutesRemaining > 0 ? `${minutesRemaining}m left` : 'BREACHED'}
        </span>
      </div>
      <div className="bg-gray-200 h-1.5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300" style={{ background: color, width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

/** Toast notification */
function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-3 rounded-xl text-sm font-medium shadow-lg z-[1000] max-w-[90%] text-center"
      style={{ animation: 'sewaSlideUp 0.3s ease-out' }}
    >
      {message}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN SEWA PAGE
// ═══════════════════════════════════════════════════════════════════

export default function SewaPage() {
  // ── User identity (persisted in localStorage) ──
  const [userName, setUserName] = useState('');
  const [userDept, setUserDept] = useState('');
  const [userEmpId, setUserEmpId] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);

  // ── Navigation state ──
  const [activeView, setActiveView] = useState<'home' | 'my-complaints'>('home');
  const [selectedDept, setSelectedDept] = useState<DepartmentConfig | null>(null);
  const [selectedSubMenu, setSelectedSubMenu] = useState<SubMenu | null>(null);
  const [selectedType, setSelectedType] = useState<ComplaintType | null>(null);

  // ── Complaint form state ──
  const [formLocation, setFormLocation] = useState('');
  const [formPriority, setFormPriority] = useState<'normal' | 'urgent'>('normal');
  const [formDescription, setFormDescription] = useState('');
  const [formPatientName, setFormPatientName] = useState('');
  const [formPatientUhid, setFormPatientUhid] = useState('');
  const [formExtraFields, setFormExtraFields] = useState<Record<string, string>>({});

  // ── Requests state ──
  const [requests, setRequests] = useState<SewaRequest[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── UI state ──
  const [toast, setToast] = useState<string | null>(null);
  const [viewingRequest, setViewingRequest] = useState<SewaRequest | null>(null);
  const [, setTick] = useState(0); // force re-render for SLA countdown

  // ── Load saved identity ──
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('sewa-user') || '{}');
      if (saved.name && saved.dept) {
        setUserName(saved.name);
        setUserDept(saved.dept);
        setUserEmpId(saved.empId || '');
        setIsRegistered(true);
      }
    } catch { /* first time */ }
  }, []);

  // ── Load user's complaints from API ──
  const loadMyRequests = useCallback(async () => {
    if (!userName) return;
    try {
      const res = await fetch(`/api/sewa/requests?requestor=${encodeURIComponent(userName)}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch { /* silently fail, will retry on next tick */ }
  }, [userName]);

  useEffect(() => {
    if (isRegistered && userName) loadMyRequests();
  }, [isRegistered, userName, loadMyRequests]);

  // SLA countdown ticker + refresh
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
      if (isRegistered && userName) loadMyRequests();
    }, 30000);
    return () => clearInterval(interval);
  }, [isRegistered, userName, loadMyRequests]);

  // ── Registration handler ──
  const handleRegister = useCallback(() => {
    if (!userName.trim() || !userDept) return;
    const user = { name: userName.trim(), dept: userDept, empId: userEmpId.trim() };
    try { sessionStorage.setItem('sewa-user', JSON.stringify(user)); } catch { /* ok */ }
    setIsRegistered(true);
  }, [userName, userDept, userEmpId]);

  // ── Submit complaint via API ──
  const handleSubmit = useCallback(async () => {
    if (!selectedType || !selectedDept) return;
    if (!formDescription.trim()) {
      setToast('Please describe the issue');
      return;
    }
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/sewa/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestorName: userName,
          requestorDept: userDept,
          requestorEmpId: userEmpId || undefined,
          targetDept: selectedDept.slug,
          complaintTypeId: selectedType.id,
          complaintTypeName: selectedType.name,
          subMenu: selectedSubMenu?.name,
          priority: formPriority,
          location: formLocation,
          description: formDescription,
          patientName: formPatientName || undefined,
          patientUhid: formPatientUhid || undefined,
          extraFields: { ...formExtraFields },
          responseSlaMin: selectedType.responseSlaMin,
          resolutionSlaMin: selectedType.resolutionSlaMin,
        }),
      });

      const data = await res.json();
      if (res.ok && data.id) {
        setToast(`Complaint ${data.id} submitted!`);
        // Reset form
        setSelectedType(null);
        setSelectedSubMenu(null);
        setSelectedDept(null);
        setFormLocation('');
        setFormPriority('normal');
        setFormDescription('');
        setFormPatientName('');
        setFormPatientUhid('');
        setFormExtraFields({});
        // Refresh complaints list
        loadMyRequests();
      } else {
        setToast(data.error || 'Failed to submit');
      }
    } catch {
      setToast('Network error — please try again');
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedType, selectedDept, selectedSubMenu, formLocation, formPriority, formDescription, formPatientName, formPatientUhid, formExtraFields, userName, userDept, userEmpId, loadMyRequests]);

  // ── Reset form state ──
  const resetToHome = useCallback(() => {
    setSelectedType(null);
    setSelectedSubMenu(null);
    setSelectedDept(null);
    setFormLocation('');
    setFormPriority('normal');
    setFormDescription('');
    setFormPatientName('');
    setFormPatientUhid('');
    setFormExtraFields({});
  }, []);

  // ════════════════════════════════════════════════════════════════
  // RENDER: Registration Screen
  // ════════════════════════════════════════════════════════════════
  if (!isRegistered) {
    return (
      <div className="max-w-[480px] mx-auto bg-white min-h-screen" style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <div className="bg-gradient-to-br from-[#1a6bf0] to-[#0c4dba] text-white px-4 pt-12 pb-8 text-center">
          <div className="text-5xl mb-3">💙</div>
          <h1 className="text-2xl font-bold mb-1">Sewa</h1>
          <p className="text-sm opacity-90">Even Hospital &middot; Staff Service Requests</p>
        </div>
        <div className="p-6" style={{ animation: 'sewaFadeIn 0.3s ease-out' }}>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Welcome</h2>
          <p className="text-sm text-gray-500 mb-6">Please identify yourself to get started</p>

          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Your Name *</label>
          <input
            value={userName}
            onChange={e => setUserName(e.target.value)}
            placeholder="e.g., Dr. Gautham"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm mb-4 focus:outline-none focus:border-blue-500"
          />

          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Your Department *</label>
          <select
            value={userDept}
            onChange={e => setUserDept(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm mb-4 bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="">Select department...</option>
            {SEWA_DEPARTMENTS.map(d => (
              <option key={d.slug} value={d.slug}>{d.name}</option>
            ))}
          </select>

          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Employee ID <span className="text-gray-400 font-normal">(optional)</span></label>
          <input
            value={userEmpId}
            onChange={e => setUserEmpId(e.target.value)}
            placeholder="e.g., E0045"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm mb-6 focus:outline-none focus:border-blue-500"
          />

          <button
            onClick={handleRegister}
            disabled={!userName.trim() || !userDept}
            className="w-full py-3 bg-[#1a6bf0] text-white rounded-xl text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // RENDER: Complaint Form (when a type is selected)
  // ════════════════════════════════════════════════════════════════
  if (selectedType && selectedDept) {
    const extraFields = selectedType.extraFields || [];
    return (
      <div className="max-w-[480px] mx-auto bg-white min-h-screen" style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 z-30 flex items-center gap-3 px-4 py-3">
          <button onClick={() => setSelectedType(null)} className="bg-transparent border-none text-xl cursor-pointer p-0">←</button>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-gray-900 truncate">{selectedType.name}</h2>
            <p className="text-xs text-gray-500">→ {selectedDept.name}</p>
          </div>
        </div>

        <div className="p-4 space-y-4" style={{ animation: 'sewaFadeIn 0.3s ease-out' }}>
          {/* SLA Info */}
          <div className="bg-blue-50 rounded-xl p-3">
            <div className="flex items-center gap-2 text-xs text-blue-700">
              <span>⏱️</span>
              <span>Response: <strong>{selectedType.responseSlaMin}m</strong></span>
              <span className="text-blue-300">|</span>
              <span>Resolution: <strong>{selectedType.resolutionSlaMin > 60 ? `${Math.round(selectedType.resolutionSlaMin / 60)}h` : `${selectedType.resolutionSlaMin}m`}</strong></span>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Location (Floor / Wing / Room)</label>
            <input
              value={formLocation}
              onChange={e => setFormLocation(e.target.value)}
              placeholder="e.g., 2nd Floor, East Wing, Room 215a"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Priority</label>
            <div className="flex gap-3">
              <button
                onClick={() => setFormPriority('normal')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${formPriority === 'normal' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'}`}
              >
                Normal
              </button>
              <button
                onClick={() => setFormPriority('urgent')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${formPriority === 'urgent' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500'}`}
              >
                🚨 Urgent
              </button>
            </div>
          </div>

          {/* Extra Fields (complaint-type-specific) */}
          {extraFields.map((field: ExtraField) => (
            <div key={field.id}>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </label>
              {field.type === 'select' ? (
                <select
                  value={formExtraFields[field.id] || ''}
                  onChange={e => setFormExtraFields(prev => ({ ...prev, [field.id]: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select...</option>
                  {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  value={formExtraFields[field.id] || ''}
                  onChange={e => setFormExtraFields(prev => ({ ...prev, [field.id]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm min-h-[70px] resize-y focus:outline-none focus:border-blue-500"
                />
              ) : (
                <input
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={formExtraFields[field.id] || ''}
                  onChange={e => setFormExtraFields(prev => ({ ...prev, [field.id]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                />
              )}
            </div>
          ))}

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Describe the Issue *</label>
            <textarea
              value={formDescription}
              onChange={e => setFormDescription(e.target.value)}
              placeholder="Provide details about the problem..."
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm min-h-[100px] resize-y focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Patient Info (optional) */}
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-500 mb-2">Patient Details (if applicable)</p>
            <div className="grid grid-cols-2 gap-3">
              <input
                value={formPatientName}
                onChange={e => setFormPatientName(e.target.value)}
                placeholder="Patient Name"
                className="px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-blue-500"
              />
              <input
                value={formPatientUhid}
                onChange={e => setFormPatientUhid(e.target.value)}
                placeholder="UHID"
                className="px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!formDescription.trim() || isSubmitting}
            className="w-full py-3.5 bg-[#1a6bf0] text-white rounded-xl text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-lg"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Complaint'}
          </button>
        </div>

        {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // RENDER: Request Detail View
  // ════════════════════════════════════════════════════════════════
  if (viewingRequest) {
    const req = viewingRequest;
    const dept = getDepartment(req.targetDept);
    const statusColors: Record<RequestStatus, string> = {
      NEW: '#3b82f6',
      ACKNOWLEDGED: '#f59e0b',
      IN_PROGRESS: '#8b5cf6',
      BLOCKED: '#dc2626',
      RESOLVED: '#10b981',
    };

    return (
      <div className="max-w-[480px] mx-auto bg-white min-h-screen" style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <div className="sticky top-0 bg-white border-b border-gray-100 z-30 flex items-center gap-3 px-4 py-3">
          <button onClick={() => setViewingRequest(null)} className="bg-transparent border-none text-xl cursor-pointer p-0">←</button>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-gray-900">{req.id}</h2>
            <p className="text-xs text-gray-500">{req.complaintTypeName}</p>
          </div>
          <span className="text-xs font-semibold px-2 py-1 rounded-full text-white" style={{ background: statusColors[req.status] }}>{req.status}</span>
        </div>

        <div className="p-4 space-y-3" style={{ animation: 'sewaFadeIn 0.3s ease-out' }}>
          {/* Details */}
          <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Target Dept</span>
              <span className="font-semibold">{dept?.icon} {dept?.name}</span>
            </div>
            {req.subMenu && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Category</span>
                <span className="font-semibold">{req.subMenu}</span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Priority</span>
              <span className={`font-semibold ${req.priority === 'urgent' ? 'text-red-600' : 'text-gray-900'}`}>
                {req.priority === 'urgent' ? '🚨 Urgent' : 'Normal'}
              </span>
            </div>
            {req.location && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Location</span>
                <span className="font-semibold">{req.location}</span>
              </div>
            )}
            {req.patientName && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Patient</span>
                <span className="font-semibold">{req.patientName} {req.patientUhid ? `(${req.patientUhid})` : ''}</span>
              </div>
            )}
          </div>

          {/* SLA Bars */}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <SLABar slaMinutes={req.responseSlaMin} createdAt={req.createdAt} label="Response SLA" />
            <SLABar slaMinutes={req.resolutionSlaMin} createdAt={req.createdAt} label="Resolution SLA" />
          </div>

          {/* Description */}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-500 mb-1">Description</p>
            <p className="text-sm text-gray-800">{req.description}</p>
          </div>

          {/* Extra fields */}
          {Object.keys(req.extraFields).length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-1">
              <p className="text-xs font-semibold text-gray-500 mb-1">Additional Details</p>
              {Object.entries(req.extraFields).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-gray-500 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                  <span className="font-semibold text-gray-800">{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Timestamp */}
          <p className="text-[11px] text-gray-400 text-center">
            Raised {new Date(req.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
          </p>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // RENDER: Main Home View
  // ════════════════════════════════════════════════════════════════
  const myRequests = requests.filter(r => r.requestorName === userName);
  const activeCount = myRequests.filter(r => r.status !== 'RESOLVED').length;

  return (
    <div className="max-w-[480px] mx-auto bg-white min-h-screen pb-20" style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div className="bg-gradient-to-br from-[#1a6bf0] to-[#0c4dba] text-white px-4 pt-6 pb-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h1 className="text-xl font-bold mb-0.5">Sewa</h1>
            <p className="text-xs opacity-80">Even Hospital &middot; Race Course Road</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold opacity-90">{userName}</p>
            <p className="text-[10px] opacity-70">{getDepartment(userDept)?.name}</p>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => setActiveView('home')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${activeView === 'home' ? 'bg-white text-blue-700' : 'bg-white/20 text-white'}`}
          >
            Raise Complaint
          </button>
          <button
            onClick={() => setActiveView('my-complaints')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all relative ${activeView === 'my-complaints' ? 'bg-white text-blue-700' : 'bg-white/20 text-white'}`}
          >
            My Complaints
            {activeCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">
                {activeCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ──────── HOME: Department Picker ──────── */}
      {activeView === 'home' && (
        <div className="p-4" style={{ animation: 'sewaFadeIn 0.3s ease-out' }}>
          <h2 className="text-sm font-bold text-gray-900 mb-3">Which department do you need help from?</h2>
          <div className="grid grid-cols-3 gap-3">
            {SEWA_DEPARTMENTS.map(dept => (
              <button
                key={dept.slug}
                onClick={() => setSelectedDept(dept)}
                className="bg-white border-2 rounded-xl p-3 text-center cursor-pointer transition-all hover:shadow-md active:scale-[0.97]"
                style={{ borderColor: dept.color + '60' }}
              >
                <div className="text-2xl mb-1">{dept.icon}</div>
                <p className="text-[11px] font-semibold text-gray-800 leading-tight">{dept.name}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ──────── MY COMPLAINTS ──────── */}
      {activeView === 'my-complaints' && (
        <div className="p-4" style={{ animation: 'sewaFadeIn 0.3s ease-out' }}>
          {myRequests.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-3">📋</div>
              <p className="text-sm text-gray-500">No complaints raised yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myRequests.map(req => {
                const dept = getDepartment(req.targetDept);
                const statusColors: Record<RequestStatus, string> = {
                  NEW: '#3b82f6', ACKNOWLEDGED: '#f59e0b', IN_PROGRESS: '#8b5cf6', BLOCKED: '#dc2626', RESOLVED: '#10b981',
                };
                return (
                  <button
                    key={req.id}
                    onClick={() => setViewingRequest(req)}
                    className="w-full bg-white border border-gray-200 rounded-xl p-3 text-left cursor-pointer transition-all hover:shadow-md active:scale-[0.98]"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate">{req.complaintTypeName}</p>
                        <p className="text-[11px] text-gray-500">{req.id} &middot; → {dept?.icon} {dept?.name}</p>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white ml-2 flex-shrink-0" style={{ background: statusColors[req.status] }}>
                        {req.status}
                      </span>
                    </div>
                    <SLABar slaMinutes={req.responseSlaMin} createdAt={req.createdAt} label="Response" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ──────── BOTTOM SHEET: Department's complaint types ──────── */}
      <BottomSheet
        isOpen={!!selectedDept && !selectedType && !selectedSubMenu}
        onClose={resetToHome}
        title={selectedDept ? `${selectedDept.icon} ${selectedDept.name}` : ''}
      >
        {selectedDept && (
          <div className="p-3">
            {/* If department has sub-menus */}
            {selectedDept.subMenus && (
              <div className="grid grid-cols-2 gap-3">
                {selectedDept.subMenus.map(sm => (
                  <button
                    key={sm.id}
                    onClick={() => setSelectedSubMenu(sm)}
                    className="bg-gray-50 border-2 rounded-xl p-3 text-center cursor-pointer transition-all hover:shadow-sm active:scale-[0.97]"
                    style={{ borderColor: sm.color + '40' }}
                  >
                    <div className="text-2xl mb-1">{sm.icon}</div>
                    <p className="text-xs font-semibold text-gray-800">{sm.name}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{sm.types.length} types</p>
                  </button>
                ))}
              </div>
            )}

            {/* If department has flat list */}
            {selectedDept.complaintTypes && (
              <div className="grid grid-cols-2 gap-2.5">
                {selectedDept.complaintTypes.map(ct => (
                  <button
                    key={ct.id}
                    onClick={() => setSelectedType(ct)}
                    className="bg-gray-50 rounded-xl p-3 text-center cursor-pointer transition-all hover:bg-gray-100 active:scale-[0.97] min-h-[70px] flex flex-col items-center justify-center gap-1"
                  >
                    <span className="text-xl">{ct.icon}</span>
                    <span className="text-[11px] font-semibold text-gray-800 leading-tight">{ct.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      {/* ──────── BOTTOM SHEET: Sub-menu complaint types ──────── */}
      <BottomSheet
        isOpen={!!selectedSubMenu}
        onClose={() => setSelectedSubMenu(null)}
        title={selectedSubMenu ? `${selectedSubMenu.icon} ${selectedSubMenu.name}` : ''}
      >
        {selectedSubMenu && (
          <div className="p-3 grid grid-cols-2 gap-2.5">
            {selectedSubMenu.types.map(ct => (
              <button
                key={ct.id}
                onClick={() => { setSelectedType(ct); setSelectedSubMenu(null); }}
                className="bg-gray-50 rounded-xl p-3 text-center cursor-pointer transition-all hover:bg-gray-100 active:scale-[0.97] min-h-[70px] flex flex-col items-center justify-center gap-1"
              >
                <span className="text-xl">{ct.icon}</span>
                <span className="text-[11px] font-semibold text-gray-800 leading-tight">{ct.name}</span>
              </button>
            ))}
          </div>
        )}
      </BottomSheet>

      {/* Footer with nav */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-white border-t border-gray-100 px-4 py-2 flex justify-between items-center">
        <Link href="/" className="text-[10px] text-blue-600 font-medium hover:underline">EHRC Dash</Link>
        <span className="text-[10px] text-gray-400">Sewa &middot; Even Healthcare</span>
        <div className="flex gap-3">
          <Link href="/sewa/queue" className="text-[10px] text-blue-600 font-medium hover:underline">Queue</Link>
          <Link href="/sewa/dashboard" className="text-[10px] text-blue-600 font-medium hover:underline">Dashboard</Link>
        </div>
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
