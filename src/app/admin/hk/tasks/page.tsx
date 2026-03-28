'use client';

import { useState, useEffect, useCallback } from 'react';

interface Template {
  id: number;
  name: string;
  category: string;
  area_id: number | null;
  area_type: string | null;
  frequency: string;
  shifts: string[];
  disinfectant: string | null;
  priority_weight: number;
  checklist_ref: string | null;
  active: boolean;
}

interface SewaMapping {
  id: number;
  sewa_complaint_type_id: string;
  sewa_complaint_name: string;
  hk_category: string;
  auto_create_task: boolean;
  default_priority: number;
}

const CATEGORIES = ['routine','terminal','high_touch','bmw','washroom','weekly','ppe','icu','ot','er','opd','common','diagnostics','linen','kitchen','staff'];
const FREQUENCIES = ['per_shift','twice_daily','daily','weekly','per_event'];
const SHIFTS = ['AM','PM','NIGHT'];
const CAT_LABELS: Record<string,string> = {
  routine:'Routine',terminal:'Terminal Clean',high_touch:'High-Touch',bmw:'BMW',washroom:'Washroom',
  weekly:'Weekly',ppe:'PPE',icu:'ICU',ot:'OT',er:'ER',opd:'OPD',common:'Common Area',
  diagnostics:'Diagnostics',linen:'Linen',kitchen:'Kitchen',staff:'Staff Area',
};

export default function AdminTasksPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [mappings, setMappings] = useState<SewaMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTpl, setEditTpl] = useState<Template | null>(null);

  // Form state
  const [fName, setFName] = useState('');
  const [fCat, setFCat] = useState('routine');
  const [fAreaType, setFAreaType] = useState('');
  const [fFreq, setFFreq] = useState('per_shift');
  const [fShifts, setFShifts] = useState<string[]>(['AM','PM']);
  const [fDisinfectant, setFDisinfectant] = useState('');
  const [fPriority, setFPriority] = useState('50');
  const [fRef, setFRef] = useState('');

  const loadData = useCallback(async () => {
    try {
      let url = '/api/hk/templates?active=all';
      if (filterCat) url += '&category=' + filterCat;
      const [tplRes, mapRes] = await Promise.all([fetch(url), fetch('/api/hk/sewa-mappings')]);
      const tplData = await tplRes.json();
      const mapData = await mapRes.json();
      setTemplates(tplData.templates || []);
      setMappings(mapData.mappings || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filterCat]);

  useEffect(() => { loadData(); }, [loadData]);

  const openAdd = () => {
    setEditTpl(null);
    setFName(''); setFCat('routine'); setFAreaType('patient_room'); setFFreq('per_shift');
    setFShifts(['AM','PM']); setFDisinfectant(''); setFPriority('50'); setFRef('');
    setShowModal(true);
  };

  const openEdit = (t: Template) => {
    setEditTpl(t);
    setFName(t.name); setFCat(t.category); setFAreaType(t.area_type || '');
    setFFreq(t.frequency); setFShifts(t.shifts || ['AM','PM']);
    setFDisinfectant(t.disinfectant || ''); setFPriority(String(t.priority_weight)); setFRef(t.checklist_ref || '');
    setShowModal(true);
  };

  const toggleShift = (s: string) => {
    setFShifts(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const saveTpl = async () => {
    if (!fName.trim()) return;
    const body: Record<string,unknown> = {
      name: fName.trim(), category: fCat, area_type: fAreaType || null,
      frequency: fFreq, shifts: fShifts, disinfectant: fDisinfectant.trim() || null,
      priority_weight: Number(fPriority) || 50, checklist_ref: fRef.trim() || null,
    };
    if (editTpl) body.id = editTpl.id;

    const res = await fetch('/api/hk/templates', {
      method: editTpl ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) { setShowModal(false); await loadData(); }
  };

  const toggleActive = async (t: Template) => {
    await fetch('/api/hk/templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, active: !t.active }),
    });
    await loadData();
  };

  const toggleSewaMapping = async (m: SewaMapping) => {
    await fetch('/api/hk/sewa-mappings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: m.id, auto_create_task: !m.auto_create_task }),
    });
    await loadData();
  };

  const freqLabel = (f: string) => ({ per_shift: 'Per Shift', twice_daily: 'Twice Daily', daily: 'Daily', weekly: 'Weekly', per_event: 'Per Event' }[f] || f);
  const catColor = (c: string) => {
    if (c === 'terminal') return 'bg-red-100 text-red-700';
    if (c === 'icu') return 'bg-purple-100 text-purple-700';
    if (c === 'ot') return 'bg-blue-100 text-blue-700';
    if (c === 'weekly') return 'bg-indigo-100 text-indigo-700';
    if (c === 'bmw') return 'bg-yellow-100 text-yellow-700';
    return 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">HK Task Templates</h1>
            <p className="text-sm text-gray-500">Manage cleaning task definitions and Sewa mappings</p>
          </div>
          <div className="flex gap-2">
            <a href="/hk/dashboard" className="text-sm px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Dashboard</a>
            <a href="/admin/hk/areas" className="text-sm px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Areas</a>
            <button onClick={openAdd} className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700">+ Add Template</button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-4 space-y-6">
        {/* Filters */}
        <div className="flex gap-3 items-center">
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
          </select>
          <span className="text-sm text-gray-400 ml-auto">{templates.length} templates</span>
        </div>

        {/* Templates table */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Task Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Area Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Frequency</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Shifts</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Priority</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <tr key={t.id} className={`border-b border-gray-100 ${!t.active ? 'opacity-40 bg-gray-50' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-800">{t.name}</p>
                      {t.disinfectant && <p className="text-[11px] text-gray-400">{t.disinfectant}</p>}
                      {t.checklist_ref && <span className="text-[10px] text-blue-500 font-mono">Ref: {t.checklist_ref}</span>}
                    </td>
                    <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded text-xs font-semibold ${catColor(t.category)}`}>{CAT_LABELS[t.category] || t.category}</span></td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{t.area_type || '\u2014'}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{freqLabel(t.frequency)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">{(t.shifts || []).map(s => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-semibold">{s}</span>
                      ))}</div>
                    </td>
                    <td className="px-4 py-2.5 text-center text-gray-600">{t.priority_weight}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => openEdit(t)} className="text-xs text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                      <button onClick={() => toggleActive(t)} className={`text-xs ${t.active ? 'text-red-500' : 'text-green-600'}`}>
                        {t.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Sewa Mappings */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-bold text-gray-900 mb-3">Sewa \u2192 HK Task Mappings</h2>
          <div className="space-y-2">
            {mappings.map(m => (
              <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <button onClick={() => toggleSewaMapping(m)} className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${
                    m.auto_create_task ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'
                  }`}>{m.auto_create_task ? '\u2713' : ''}</button>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{m.sewa_complaint_type_id}: {m.sewa_complaint_name}</p>
                    <p className="text-xs text-gray-500">Category: {m.hk_category} | Priority: {m.default_priority}</p>
                  </div>
                </div>
                <span className={`text-xs font-semibold ${m.auto_create_task ? 'text-green-600' : 'text-gray-400'}`}>
                  {m.auto_create_task ? 'Auto-create ON' : 'Auto-create OFF'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{editTpl ? 'Edit Template' : 'Add New Template'}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Task Name</label>
                <input type="text" value={fName} onChange={e => setFName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Category</label>
                  <select value={fCat} onChange={e => setFCat(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Target Area Type</label>
                  <input type="text" value={fAreaType} onChange={e => setFAreaType(e.target.value)} placeholder="e.g. patient_room" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Frequency</label>
                  <select value={fFreq} onChange={e => setFFreq(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    {FREQUENCIES.map(f => <option key={f} value={f}>{freqLabel(f)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Priority (1=highest)</label>
                  <input type="number" value={fPriority} onChange={e => setFPriority(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Applicable Shifts</label>
                <div className="flex gap-2">
                  {SHIFTS.map(s => (
                    <button key={s} onClick={() => toggleShift(s)} className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      fShifts.includes(s) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}>{s}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Disinfectant</label>
                  <input type="text" value={fDisinfectant} onChange={e => setFDisinfectant(e.target.value)} placeholder="e.g. Satol 2" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Checklist Ref</label>
                  <input type="text" value={fRef} onChange={e => setFRef(e.target.value)} placeholder="e.g. A1" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={saveTpl} disabled={!fName.trim()} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:bg-gray-300">
                {editTpl ? 'Save Changes' : 'Add Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
