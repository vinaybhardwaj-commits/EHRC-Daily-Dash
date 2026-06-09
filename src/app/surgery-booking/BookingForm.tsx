'use client';

import {
  useState,
  useCallback,
  type ReactNode,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type FormEvent,
} from 'react';
import { upload } from '@vercel/blob/client';
import FormFillerBadge from '@/components/FormFillerBadge';
import { OPTIONS, type BookingFormData } from '@/lib/surgical-risk/booking-types';

/* ------------------------------------------------------------------ helpers */

// Parse a response as JSON, but never throw on a non-JSON body (e.g. a platform
// 413 "Request Entity Too Large" or an HTML error page). Returns a usable
// { error } object instead of the cryptic "Unexpected token 'R'…" message.
async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: text.slice(0, 200) || `HTTP ${res.status}` };
  }
}

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-800 mb-1">
        {label} {required && <span className="text-red-600">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-gray-500 mt-1">{hint}</span>}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none';

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputCls} />;
}
function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={inputCls + ' min-h-[64px]'} />;
}
function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: readonly string[]; placeholder?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
      <option value="">{placeholder || 'Select…'}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function CheckboxGroup({ options, values, onToggle }: { options: readonly string[]; values: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => {
        const on = values.includes(o);
        return (
          <button
            type="button"
            key={o}
            onClick={() => onToggle(o)}
            className={`rounded-full px-3 py-1 text-xs border transition-colors ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
      <h2 className="text-sm font-semibold text-blue-900 uppercase tracking-wide mb-4 pb-2 border-b border-gray-100">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

const FLAG_COLOURS: Record<string, string> = {
  'Requested time and dates OK': 'bg-green-100 text-green-900 border-green-300',
  'Requested time and dates provisionally OK': 'bg-green-50 text-green-900 border-green-200',
  "Requested time and dates most likely OK, subject to anaesthetist's advice": 'bg-yellow-50 text-yellow-900 border-yellow-300',
  'More time after admission (at least 4 working hours) required before requested OT time': 'bg-orange-50 text-orange-900 border-orange-300',
  'More time after admission (at least 12 working hours) required before requested OT time': 'bg-red-50 text-red-900 border-red-300',
  'Requested time of surgery out of operational hours': 'bg-orange-100 text-orange-900 border-orange-400',
  'Anaesthetist + facility head need to discuss with the operating surgeon': 'bg-red-100 text-red-900 border-red-400',
};

type S = Record<string, string>;
const EMPTY: S = {};

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

/* -------------------------------------------------------------------- form */

export default function BookingForm() {
  const [f, setF] = useState<S>(EMPTY);
  const [comorbidities, setComorbidities] = useState<string[]>([]);
  const [habits, setHabits] = useState<string[]>([]);
  const [transfer, setTransfer] = useState<'' | 'Yes' | 'No'>('');
  const [isTest, setIsTest] = useState(false);
  const [counselledBy, setCounselledBy] = useState('');
  const [deviceId, setDeviceId] = useState('');

  const [prescriptionUrl, setPrescriptionUrl] = useState('');
  const [prescriptionName, setPrescriptionName] = useState('');
  const [uploading, setUploading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<null | { flag: string; id: string; token: string }>(null);
  const [copied, setCopied] = useState(false);

  const set = (k: string) => (v: string) => setF(prev => ({ ...prev, [k]: v }));
  const toggle = (arr: string[], setArr: (a: string[]) => void) => (v: string) =>
    setArr(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  const onFillerReady = useCallback((name: string, device: string) => {
    setDeviceId(device);
    setCounselledBy(prev => prev || name); // prefill once, stay editable
  }, []);

  // Client-side direct-to-Blob upload. Bypasses the serverless 4.5 MB body
  // limit by uploading straight to Vercel Blob storage; the route only signs a
  // short-lived token (see /api/surgical-risk/booking/upload).
  async function handleUpload(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 15 MB. Please upload a smaller scan or PDF.`);
      return;
    }
    setUploading(true);
    setError('');
    try {
      const safeName = (file.name || 'prescription').replace(/[^a-zA-Z0-9._-]/g, '_');
      const blob = await upload(`surgery-booking/prescriptions/${safeName}`, file, {
        access: 'public',
        handleUploadUrl: '/api/surgical-risk/booking/upload',
        contentType: file.type || undefined,
      });
      setPrescriptionUrl(blob.url);
      setPrescriptionName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Please try again or use a smaller file.');
    } finally {
      setUploading(false);
    }
  }

  const urgencyNeedsJustification = !!f.urgency && f.urgency !== 'Elective (Planned surgery)';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!f.patient_name?.trim() || !f.uhid?.trim()) {
      setError('Patient name and UHID are required.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (urgencyNeedsJustification && !f.clinical_justification?.trim()) {
      setError('Clinical justification is required for non-elective urgency.');
      return;
    }

    const payload: BookingFormData = {
      patient_name: f.patient_name.trim(),
      uhid: f.uhid.trim(),
      age: f.age ? parseInt(f.age, 10) : null,
      sex: f.sex,
      contact: f.contact,
      surgeon_name: f.surgeon_name,
      surgical_specialty: f.surgical_specialty,
      proposed_procedure: f.proposed_procedure,
      laterality: f.laterality,
      anaesthesia: f.anaesthesia,
      urgency: f.urgency,
      clinical_justification: f.clinical_justification,
      comorbidities,
      pac_status: f.pac_status,
      pac_advice: f.pac_advice,
      habits,
      transfer: transfer === '' ? null : transfer === 'Yes',
      referring_hospital: f.referring_hospital,
      surgery_date: f.surgery_date,
      surgery_time: f.surgery_time,
      admission_date: f.admission_date,
      admission_time: f.admission_time,
      special_requirements: f.special_requirements,
      payer: f.payer,
      insurance_details: f.insurance_details,
      los: f.los,
      admission_to: f.admission_to,
      billing_bed: f.billing_bed,
      staying_bed: f.staying_bed,
      admission_type: f.admission_type,
      package_amount: f.package_amount ? parseFloat(f.package_amount) : null,
      open_bill_items: f.open_bill_items,
      advance: f.advance ? parseFloat(f.advance) : null,
      counselled_by: counselledBy,
      submitted_by_device: deviceId,
      admission_done_by: f.admission_done_by,
      prescription_url: prescriptionUrl,
      remarks: f.remarks,
      is_test: isTest,
    };

    setSubmitting(true);
    try {
      const res = await fetch('/api/surgical-risk/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || 'Save failed');
      setDone({ flag: (data.flag as string) || '', id: data.id as string, token: data.portal_token as string });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------------------------------------------------------- success view */
  if (done) {
    const colour = FLAG_COLOURS[done.flag] || 'bg-gray-100 text-gray-800 border-gray-300';
    const portalUrl = (typeof window !== 'undefined' ? window.location.origin : '') + `/booking/${done.token}`;
    const copyLink = async () => {
      try { await navigator.clipboard.writeText(portalUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
    };
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-lg w-full text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Booking saved</h1>
          <p className="text-sm text-gray-500 mb-5">Ref: {done.id.slice(0, 8)}</p>
          {done.flag
            ? <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${colour}`}>⚑ {done.flag}</div>
            : <div className="rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-600">No scheduling flag — requested time looks clear.</div>}

          <div className="mt-5 text-left bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-xs font-semibold text-blue-900 mb-1">Patient document link</div>
            <div className="text-xs text-gray-600 mb-2">Share with the patient to download their forms (Financial Counselling, Information, Admission slip).</div>
            <div className="flex items-center gap-2">
              <input readOnly value={portalUrl} className="flex-1 text-xs rounded border border-gray-300 px-2 py-1.5 bg-white text-gray-700" />
              <button onClick={copyLink} className="text-xs font-medium rounded bg-blue-600 text-white px-3 py-1.5 whitespace-nowrap">{copied ? 'Copied ✓' : 'Copy'}</button>
            </div>
            <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-xs text-blue-600 underline">Open patient page</a>
          </div>

          <button
            onClick={() => { setDone(null); setF(EMPTY); setComorbidities([]); setHabits([]); setTransfer(''); setPrescriptionUrl(''); setPrescriptionName(''); }}
            className="mt-6 w-full rounded-lg bg-blue-600 text-white py-2.5 text-sm font-medium hover:bg-blue-700"
          >
            Record another booking
          </button>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------- form view */
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-[#1e40af] to-[#3b82f6] text-white py-7 px-4">
        <div className="max-w-3xl mx-auto flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold mb-1">Surgery Booking &amp; Financial Counselling</h1>
            <p className="text-blue-100 text-sm">Please collect name &amp; age as per Aadhaar.</p>
          </div>
          <div className="bg-white/90 rounded-full"><FormFillerBadge onReady={onFillerReady} /></div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-4 py-8">
        {error && <div className="mb-5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">{error}</div>}

        <Section title="Patient">
          <Field label="Patient name" required><TextInput value={f.patient_name || ''} onChange={e => set('patient_name')(e.target.value)} /></Field>
          <Field label="UHID" required><TextInput value={f.uhid || ''} onChange={e => set('uhid')(e.target.value)} /></Field>
          <Field label="Age"><TextInput type="number" min="0" value={f.age || ''} onChange={e => set('age')(e.target.value)} /></Field>
          <Field label="Sex"><Select value={f.sex || ''} onChange={set('sex')} options={OPTIONS.SEX} /></Field>
          <Field label="Contact number"><TextInput value={f.contact || ''} onChange={e => set('contact')(e.target.value)} /></Field>
        </Section>

        <Section title="Clinical">
          <Field label="Surgeon name"><TextInput value={f.surgeon_name || ''} onChange={e => set('surgeon_name')(e.target.value)} /></Field>
          <Field label="Surgical specialty"><TextInput value={f.surgical_specialty || ''} onChange={e => set('surgical_specialty')(e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Proposed procedure"><TextArea value={f.proposed_procedure || ''} onChange={e => set('proposed_procedure')(e.target.value)} /></Field></div>
          <Field label="Laterality"><Select value={f.laterality || ''} onChange={set('laterality')} options={OPTIONS.LATERALITY} /></Field>
          <Field label="Anaesthesia"><Select value={f.anaesthesia || ''} onChange={set('anaesthesia')} options={OPTIONS.ANAESTHESIA} /></Field>
          <Field label="Urgency"><Select value={f.urgency || ''} onChange={set('urgency')} options={OPTIONS.URGENCY} /></Field>
          {urgencyNeedsJustification && (
            <div className="sm:col-span-2"><Field label="Clinical justification / indication" required hint="Required for non-elective urgency."><TextArea value={f.clinical_justification || ''} onChange={e => set('clinical_justification')(e.target.value)} /></Field></div>
          )}
        </Section>

        <Section title="Pre-op risk & workup">
          <div className="sm:col-span-2"><Field label="Known co-morbidities"><CheckboxGroup options={OPTIONS.COMORBIDITIES} values={comorbidities} onToggle={toggle(comorbidities, setComorbidities)} /></Field></div>
          <Field label="PAC status"><Select value={f.pac_status || ''} onChange={set('pac_status')} options={OPTIONS.PAC} /></Field>
          <Field label="Anaesthetist's advice"><Select value={f.pac_advice || ''} onChange={set('pac_advice')} options={OPTIONS.PAC_ADVICE} /></Field>
          <div className="sm:col-span-2"><Field label="Habits"><CheckboxGroup options={OPTIONS.HABITS} values={habits} onToggle={toggle(habits, setHabits)} /></Field></div>
        </Section>

        <Section title="Logistics">
          <Field label="Transfer patient?">
            <div className="flex gap-2">
              {(['Yes', 'No'] as const).map(v => (
                <button type="button" key={v} onClick={() => setTransfer(v)} className={`flex-1 rounded-lg border px-3 py-2 text-sm ${transfer === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}>{v}</button>
              ))}
            </div>
          </Field>
          {transfer === 'Yes' && <Field label="Referring hospital"><TextInput value={f.referring_hospital || ''} onChange={e => set('referring_hospital')(e.target.value)} /></Field>}
          <Field label="Surgery date"><TextInput type="date" value={f.surgery_date || ''} onChange={e => set('surgery_date')(e.target.value)} /></Field>
          <Field label="Surgery time" hint="24h. Operational window 06:30–18:30."><TextInput type="time" value={f.surgery_time || ''} onChange={e => set('surgery_time')(e.target.value)} /></Field>
          <Field label="Admission date"><TextInput type="date" value={f.admission_date || ''} onChange={e => set('admission_date')(e.target.value)} /></Field>
          <Field label="Admission — arrive by"><TextInput type="time" value={f.admission_time || ''} onChange={e => set('admission_time')(e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Special requirements (implants / consumables / equipment)"><TextArea value={f.special_requirements || ''} onChange={e => set('special_requirements')(e.target.value)} /></Field></div>
        </Section>

        <Section title="Financial">
          <Field label="Payer"><Select value={f.payer || ''} onChange={set('payer')} options={OPTIONS.PAYER} /></Field>
          <Field label="Expected length of stay"><TextInput value={f.los || ''} onChange={e => set('los')(e.target.value)} placeholder="e.g. 2, or As per Dr" /></Field>
          <div className="sm:col-span-2"><Field label="Insurance details"><TextArea value={f.insurance_details || ''} onChange={e => set('insurance_details')(e.target.value)} /></Field></div>
          <Field label="Admission to"><Select value={f.admission_to || ''} onChange={set('admission_to')} options={OPTIONS.ADMISSION_TO} /></Field>
          <Field label="Admission type"><Select value={f.admission_type || ''} onChange={set('admission_type')} options={OPTIONS.ADMISSION_TYPE} /></Field>
          <Field label="Billing bed category"><Select value={f.billing_bed || ''} onChange={set('billing_bed')} options={OPTIONS.BED_CATEGORY} /></Field>
          <Field label="Staying bed category"><Select value={f.staying_bed || ''} onChange={set('staying_bed')} options={OPTIONS.BED_CATEGORY} /></Field>
          <Field label="Package amount (₹)" hint={f.package_amount ? `= ₹${Number(f.package_amount).toLocaleString('en-IN')} (${(Number(f.package_amount) / 100000).toFixed(2)} L)` : 'Enter rupees, e.g. 115000'}>
            <TextInput type="number" min="0" step="1" value={f.package_amount || ''} onChange={e => set('package_amount')(e.target.value)} />
          </Field>
          <Field label="Advance to collect (₹)" required hint={f.advance ? `= ₹${Number(f.advance).toLocaleString('en-IN')}` : 'Enter rupees'}>
            <TextInput type="number" min="0" step="1" value={f.advance || ''} onChange={e => set('advance')(e.target.value)} />
          </Field>
          <div className="sm:col-span-2"><Field label="Open bill line items"><TextArea value={f.open_bill_items || ''} onChange={e => set('open_bill_items')(e.target.value)} /></Field></div>
          <Field label="Counselled by" hint="Auto-filled from your name; editable."><TextInput value={counselledBy} onChange={e => setCounselledBy(e.target.value)} /></Field>
          <Field label="Admission done by"><TextInput value={f.admission_done_by || ''} onChange={e => set('admission_done_by')(e.target.value)} /></Field>
          <div className="sm:col-span-2">
            <Field label="Prescription upload" hint="Image or PDF, up to 15 MB. Must mention date & time of surgery and admission.">
              <input type="file" accept="image/*,application/pdf" onChange={e => handleUpload(e.target.files?.[0])} className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-blue-700" />
              {uploading && <span className="block text-xs text-blue-600 mt-1">Uploading…</span>}
              {prescriptionUrl && <span className="block text-xs text-green-700 mt-1">✓ {prescriptionName} uploaded</span>}
            </Field>
          </div>
          <div className="sm:col-span-2"><Field label="Remarks"><TextArea value={f.remarks || ''} onChange={e => set('remarks')(e.target.value)} /></Field></div>
        </Section>

        <label className="flex items-center gap-2 text-sm text-gray-600 mb-5">
          <input type="checkbox" checked={isTest} onChange={e => setIsTest(e.target.checked)} /> This is a test submission (excluded from reports)
        </label>

        <button type="submit" disabled={submitting || uploading} className="w-full rounded-lg bg-blue-600 text-white py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          {submitting ? 'Saving…' : 'Submit booking'}
        </button>
      </form>
    </div>
  );
}
