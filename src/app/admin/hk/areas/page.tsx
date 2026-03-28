'use client';

import { useState, useEffect, useCallback } from 'react';

interface Area {
  id: number;
  floor: string;
  name: string;
  area_type: string;
  room_number: string | null;
  active: boolean;
}

const FLOORS = ['GF', '1F', '2F', '3F', '4F', 'ALL'];
const AREA_TYPES = [
  'patient_room', 'icu', 'ot', 'washroom_common', 'washroom_staff',
  'corridor', 'nursing_station', 'lift', 'staircase', 'opd_room',
  'er', 'pharmacy', 'lab', 'radiology', 'dialysis', 'physiotherapy',
  'kitchen', 'cafeteria', 'staff_room', 'sluice', 'store', 'cssd',
  'electrical', 'parking', 'entrance', 'reception', 'billing',
  'admin_office', 'pre_post_op', 'recovery', 'endoscopy',
  'scrub_area', 'duty_room', 'changing_room', 'waiting_area',
  'opd_waiting', 'ramp',
];

const TYPE_LABELS: Record<string, string> = {
  patient_room: 'Patient Room', icu: 'ICU', ot: 'OT', washroom_common: 'Common Washroom',
  washroom_staff: 'Staff Washroom', corridor: 'Corridor', nursing_station: 'Nursing Station',
  lift: 'Lift', staircase: 'Staircase', opd_room: 'OPD Room', er: 'ER', pharmacy: 'Pharmacy',
  lab: 'Lab', radiology: 'Radiology', dialysis: 'Dialysis', physiotherapy: 'Physiotherapy',
  kitchen: 'Kitchen', cafeteria: 'Cafeteria', staff_room: 'Staff Room', sluice: 'Sluice Room',
  store: 'Store', cssd: 'CSSD', electrical: 'Electrical', parking: 'Parking',
  entrance: 'Entrance', reception: 'Reception', billing: 'Billing',
  admin_office: 'Admin Office', pre_post_op: 'Pre/Post-Op', recovery: 'Recovery',
  endoscopy: 'Endoscopy', scrub_area: 'Scrub Area', duty_room: 'Duty Room',
  changing_room: 'Changing Room', waiting_area: 'Waiting Area', opd_waiting: 'OPD Waiting', ramp: 'Ramp',
};

export default function AdminAreasPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFloor, setFilterFloor] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editArea, setEditArea] = useState<Area | null>(null);

  // Form state
  const [formFloor, setFormFloor] = useState('GF');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('patient_room');
  const [formRoom, setFormRoom] = useState('');

  const loadAreas = useCallback(async () => {
    try {
      let url = '/api/hk/areas?';
      if (filterFloor) url += 'floor=' + filterFloor + '&';
      if (filterType) url += 'areaType=' + filterType + '&';
      if (showInactive) url += 'active=all&';
      const res = await fetch(url);
      const data = await res.json();
      setAreas(data.areas || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filterFloor, filterType, showInactive]);

  useEffect(() => { loadAreas(); }, [loadAreas]);

  const openAdd = () => {
    setEditArea(null);
    setFormFloor('GF'); setFormName(''); setFormType('patient_room'); setFormRoom('');
    setShowModal(true);
  };

  const openEdit = (area: Area) => {
    setEditArea(area);
    setFormFloor(area.floor); setFormName(area.name); setFormType(area.area_type); setFormRoom(area.room_number || '');
    setShowModal(true);
  };

  const saveArea = async () => {
    if (!formName.trim()) return;
    const body: Record<string, unknown> = {
      floor: formFloor, name: formName.trim(), area_type: formType, room_number: formRoom.trim() || null,
    };
    if (editArea) body.id = editArea.id;

    const res = await fetch('/api/hk/areas', {
      method: editArea ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) { setShowModal(false); await loadAreas(); }
  };

  const toggleActive = async (area: Area) => {
    await fetch('/api/hk/areas', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: area.id, active: !area.active }),
    });
    await loadAreas();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Hospital Areas</h1>
            <p className="text-sm text-gray-500">Manage physical locations for housekeeping tasks</p>
          </div>
          <div className="flex gap-2">
            <a href="/hk/dashboard" className="text-sm px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Dashboard</a>
            <a href="/admin/hk/tasks" className="text-sm px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Task Templates</a>
            <button onClick={openAdd} className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700">+ Add Area</button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <select value={filterFloor} onChange={e => setFilterFloor(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="">All Floors</option>
            {FLOORS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="">All Types</option>
            {AREA_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
            Show inactive
          </label>
          <span className="text-sm text-gray-400 ml-auto">{areas.length} areas</span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Floor</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Room #</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {areas.map(area => (
                  <tr key={area.id} className={`border-b border-gray-100 ${!area.active ? 'opacity-50 bg-gray-50' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{area.floor}</td>
                    <td className="px-4 py-2.5 text-gray-800">{area.name}</td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">{TYPE_LABELS[area.area_type] || area.area_type}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{area.room_number || '\u2014'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold ${area.active ? 'text-green-600' : 'text-gray-400'}`}>
                        {area.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => openEdit(area)} className="text-xs text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                      <button onClick={() => toggleActive(area)} className={`text-xs ${area.active ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800'}`}>
                        {area.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{editArea ? 'Edit Area' : 'Add New Area'}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Floor</label>
                <select value={formFloor} onChange={e => setFormFloor(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  {FLOORS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Name</label>
                <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Room 201" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" autoFocus />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Area Type</label>
                <select value={formType} onChange={e => setFormType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  {AREA_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Room Number (optional)</label>
                <input type="text" value={formRoom} onChange={e => setFormRoom(e.target.value)} placeholder="e.g. 201" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={saveArea} disabled={!formName.trim()} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:bg-gray-300">
                {editArea ? 'Save Changes' : 'Add Area'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
