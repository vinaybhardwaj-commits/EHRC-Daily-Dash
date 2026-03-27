// ═══════════════════════════════════════════════════════════════════
// Sewa v2 — Internal Staff Service Request System
// Complete department complaint configuration (148 types, 17 departments)
// ═══════════════════════════════════════════════════════════════════

export interface ComplaintType {
  id: string;
  name: string;
  icon: string;
  responseSlaMin: number;   // Time to acknowledge
  resolutionSlaMin: number; // Time to fix
  extraFields?: ExtraField[];
}

export interface ExtraField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea';
  required: boolean;
  options?: string[]; // for select type
  placeholder?: string;
}

export interface SubMenu {
  id: string;
  name: string;
  icon: string;
  color: string;
  types: ComplaintType[];
}

export interface DepartmentConfig {
  slug: string;
  name: string;
  icon: string;
  color: string;
  subMenus?: SubMenu[];      // If department has sub-menus (e.g., Facility)
  complaintTypes?: ComplaintType[]; // If department has a flat list
}

// ── COMMON EXTRA FIELDS (reused across departments) ──────────────

const patientFields: ExtraField[] = [
  { id: 'patientName', label: 'Patient Name', type: 'text', required: false, placeholder: 'If applicable' },
  { id: 'patientUhid', label: 'Patient UHID', type: 'text', required: false, placeholder: 'e.g., EHRC-2026-XXXXX' },
];

const wardField: ExtraField = { id: 'ward', label: 'Ward / Area', type: 'text', required: true, placeholder: 'e.g., 2nd Floor East' };
const roomField: ExtraField = { id: 'room', label: 'Room Number', type: 'text', required: false, placeholder: 'e.g., 215a' };
const equipmentField: ExtraField = { id: 'equipmentName', label: 'Equipment Name', type: 'text', required: true };
const assetTagField: ExtraField = { id: 'assetTag', label: 'Asset Tag / ID', type: 'text', required: false, placeholder: 'If known' };

// ═══════════════════════════════════════════════════════════════════
// 1. EMERGENCY
// ═══════════════════════════════════════════════════════════════════
const emergency: DepartmentConfig = {
  slug: 'emergency',
  name: 'Emergency',
  icon: '🚑',
  color: '#dc2626',
  complaintTypes: [
    { id: 'em-01', name: 'Patient handoff delayed to ward', icon: '🔄', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [wardField, ...patientFields] },
    { id: 'em-02', name: 'Patient boarding too long in ED', icon: '⏰', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'hoursInEd', label: 'Hours in ED', type: 'number', required: true }, ...patientFields] },
    { id: 'em-03', name: 'Admission paperwork incomplete', icon: '📋', responseSlaMin: 15, resolutionSlaMin: 30, extraFields: [{ id: 'missingDocs', label: 'Missing Document(s)', type: 'text', required: true }, ...patientFields] },
    { id: 'em-04', name: 'Trolley/wheelchair not returned', icon: '🛒', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [{ id: 'equipType', label: 'Equipment Type', type: 'select', required: true, options: ['Trolley', 'Wheelchair', 'Stretcher'] }, { id: 'lastLocation', label: 'Last Known Location', type: 'text', required: false }] },
    { id: 'em-05', name: 'Ward not informed of incoming admission', icon: '📢', responseSlaMin: 10, resolutionSlaMin: 15, extraFields: [wardField, { id: 'expectedArrival', label: 'Expected Arrival Time', type: 'text', required: false }] },
    { id: 'em-06', name: 'Referral protocol not followed', icon: '⚠️', responseSlaMin: 15, resolutionSlaMin: 45, extraFields: [{ id: 'referringDoctor', label: 'Referring Doctor', type: 'text', required: false }, { id: 'specialty', label: 'Specialty', type: 'text', required: false }] },
    { id: 'em-07', name: 'Incomplete patient info sent to Lab/Radiology', icon: '📄', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [{ id: 'missingInfo', label: 'Missing Info Type', type: 'text', required: true }, ...patientFields] },
    { id: 'em-08', name: 'ED security concern', icon: '🛡️', responseSlaMin: 5, resolutionSlaMin: 15, extraFields: [{ id: 'concern', label: 'Nature of Concern', type: 'textarea', required: true }] },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// 2. CUSTOMER CARE
// ═══════════════════════════════════════════════════════════════════
const customerCare: DepartmentConfig = {
  slug: 'customer-care',
  name: 'Customer Care',
  icon: '📞',
  color: '#0891b2',
  complaintTypes: [
    { id: 'cc-01', name: 'Patient complaint not followed up', icon: '📋', responseSlaMin: 30, resolutionSlaMin: 120, extraFields: [{ id: 'complaintRef', label: 'Original Complaint Reference', type: 'text', required: false }] },
    { id: 'cc-02', name: 'Feedback not shared with department', icon: '📢', responseSlaMin: 30, resolutionSlaMin: 120, extraFields: [{ id: 'deptConcerned', label: 'Department Concerned', type: 'text', required: true }, { id: 'feedbackType', label: 'Feedback Type', type: 'select', required: true, options: ['Positive', 'Negative', 'Suggestion'] }] },
    { id: 'cc-03', name: 'Escalation stuck / no update', icon: '🔴', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'escalationRef', label: 'Escalation ID / Reference', type: 'text', required: false }] },
    { id: 'cc-04', name: 'Patient satisfaction form not distributed', icon: '📝', responseSlaMin: 30, resolutionSlaMin: 60, extraFields: [wardField] },
    { id: 'cc-05', name: 'VIP/special attention alert not communicated', icon: '⭐', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [...patientFields] },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// 3. PATIENT SAFETY & QUALITY
// ═══════════════════════════════════════════════════════════════════
const patientSafety: DepartmentConfig = {
  slug: 'patient-safety',
  name: 'Patient Safety & Quality',
  icon: '🛡️',
  color: '#7c3aed',
  complaintTypes: [
    { id: 'ps-01', name: 'Audit findings not communicated', icon: '📋', responseSlaMin: 30, resolutionSlaMin: 120, extraFields: [{ id: 'auditType', label: 'Audit Type', type: 'text', required: true }, { id: 'auditDate', label: 'Date of Audit', type: 'text', required: false }] },
    { id: 'ps-02', name: 'Incident report processing delayed', icon: '⏰', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'incidentNumber', label: 'Incident Report Number', type: 'text', required: false }] },
    { id: 'ps-03', name: 'Infection control response slow', icon: '🦠', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [wardField, { id: 'concernType', label: 'Type of Concern', type: 'text', required: true }] },
    { id: 'ps-04', name: 'Quality indicator data not collected', icon: '📊', responseSlaMin: 30, resolutionSlaMin: 120, extraFields: [{ id: 'indicatorName', label: 'Indicator Name', type: 'text', required: true }, { id: 'period', label: 'Period', type: 'text', required: false }] },
    { id: 'ps-05', name: 'Safety signage missing/damaged', icon: '🪧', responseSlaMin: 30, resolutionSlaMin: 60 },
    { id: 'ps-06', name: 'Non-compliance issue not addressed', icon: '⚠️', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'standardRef', label: 'Standard / Protocol Reference', type: 'text', required: false }] },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// 4. FINANCE
// ═══════════════════════════════════════════════════════════════════
const finance: DepartmentConfig = {
  slug: 'finance',
  name: 'Finance',
  icon: '💰',
  color: '#059669',
  complaintTypes: [
    { id: 'fn-01', name: 'Vendor payment delayed', icon: '💳', responseSlaMin: 30, resolutionSlaMin: 240, extraFields: [{ id: 'vendorName', label: 'Vendor Name', type: 'text', required: true }, { id: 'poNumber', label: 'PO Number', type: 'text', required: false }, { id: 'amount', label: 'Amount (Rs.)', type: 'number', required: false }] },
    { id: 'fn-02', name: 'Budget approval pending', icon: '📋', responseSlaMin: 30, resolutionSlaMin: 240, extraFields: [{ id: 'budgetItem', label: 'Budget Line Item', type: 'text', required: true }, { id: 'amount', label: 'Amount (Rs.)', type: 'number', required: false }] },
    { id: 'fn-03', name: 'Reimbursement not processed', icon: '💸', responseSlaMin: 30, resolutionSlaMin: 120, extraFields: [{ id: 'employeeName', label: 'Employee Name', type: 'text', required: true }, { id: 'amount', label: 'Amount (Rs.)', type: 'number', required: true }, { id: 'submissionDate', label: 'Submission Date', type: 'text', required: false }] },
    { id: 'fn-04', name: 'Petty cash not replenished', icon: '💵', responseSlaMin: 15, resolutionSlaMin: 60 },
    { id: 'fn-05', name: 'Financial report/MIS delayed', icon: '📊', responseSlaMin: 30, resolutionSlaMin: 240, extraFields: [{ id: 'reportName', label: 'Report Name', type: 'text', required: true }, { id: 'period', label: 'Period', type: 'text', required: false }] },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// 5. BILLING
// ═══════════════════════════════════════════════════════════════════
const billing: DepartmentConfig = {
  slug: 'billing',
  name: 'Billing',
  icon: '🧾',
  color: '#2563eb',
  complaintTypes: [
    { id: 'bl-01', name: 'Patient bill correction needed', icon: '📝', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [...patientFields, { id: 'billNumber', label: 'Bill Number', type: 'text', required: false }, { id: 'errorDesc', label: 'Error Description', type: 'textarea', required: true }] },
    { id: 'bl-02', name: 'TPA/insurance authorization delayed', icon: '🛡️', responseSlaMin: 15, resolutionSlaMin: 120, extraFields: [...patientFields, { id: 'insuranceCo', label: 'Insurance Company', type: 'text', required: true }, { id: 'authType', label: 'Authorization Type', type: 'select', required: true, options: ['Pre-auth', 'Enhancement', 'Final settlement'] }] },
    { id: 'bl-03', name: 'Discharge billing delayed', icon: '⏰', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [...patientFields, wardField, { id: 'dischargeOrderTime', label: 'Discharge Order Time', type: 'text', required: false }] },
    { id: 'bl-04', name: 'Interim bill not generated', icon: '📄', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [...patientFields] },
    { id: 'bl-05', name: 'Rate discrepancy / wrong tariff', icon: '💰', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'serviceName', label: 'Service Name', type: 'text', required: true }, { id: 'expectedAmount', label: 'Expected Amount', type: 'number', required: false }, { id: 'actualAmount', label: 'Actual Amount', type: 'number', required: false }] },
    { id: 'bl-06', name: 'Deposit/refund processing delayed', icon: '💸', responseSlaMin: 15, resolutionSlaMin: 120, extraFields: [...patientFields, { id: 'amount', label: 'Amount (Rs.)', type: 'number', required: true }] },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// 6. SUPPLY CHAIN & PROCUREMENT
// ═══════════════════════════════════════════════════════════════════
const supplyChain: DepartmentConfig = {
  slug: 'supply-chain',
  name: 'Supply Chain & Procurement',
  icon: '📦',
  color: '#ea580c',
  complaintTypes: [
    { id: 'sc-01', name: 'Item out of stock', icon: '❌', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'itemName', label: 'Item Name', type: 'text', required: true }, { id: 'itemCode', label: 'Item Code', type: 'text', required: false, placeholder: 'If known' }, { id: 'qtyNeeded', label: 'Quantity Needed', type: 'number', required: true }] },
    { id: 'sc-02', name: 'Purchase order delayed', icon: '⏰', responseSlaMin: 30, resolutionSlaMin: 240, extraFields: [{ id: 'poNumber', label: 'PO Number', type: 'text', required: false }, { id: 'itemDesc', label: 'Item Description', type: 'text', required: true }] },
    { id: 'sc-03', name: 'Wrong item delivered', icon: '🔄', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'itemOrdered', label: 'Item Ordered', type: 'text', required: true }, { id: 'itemReceived', label: 'Item Received', type: 'text', required: true }, { id: 'grnNumber', label: 'GRN Number', type: 'text', required: false }] },
    { id: 'sc-04', name: 'Vendor quality issue', icon: '⚠️', responseSlaMin: 30, resolutionSlaMin: 120, extraFields: [{ id: 'vendorName', label: 'Vendor Name', type: 'text', required: true }, { id: 'itemName', label: 'Item', type: 'text', required: true }, { id: 'defect', label: 'Nature of Defect', type: 'textarea', required: true }] },
    { id: 'sc-05', name: 'Indent not processed', icon: '📋', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'indentNumber', label: 'Indent Number', type: 'text', required: false }, { id: 'dateSubmitted', label: 'Date Submitted', type: 'text', required: false }] },
    { id: 'sc-06', name: 'Emergency procurement needed', icon: '🚨', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [{ id: 'itemName', label: 'Item Name', type: 'text', required: true }, { id: 'urgencyReason', label: 'Urgency Reason', type: 'textarea', required: true }, { id: 'qtyNeeded', label: 'Quantity', type: 'number', required: true }] },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// 7. FACILITY (FMS) — 7 SUB-MENUS
// ═══════════════════════════════════════════════════════════════════
const facility: DepartmentConfig = {
  slug: 'facility',
  name: 'Facility',
  icon: '🏗️',
  color: '#b45309',
  subMenus: [
    {
      id: 'electrical', name: 'Electrical', icon: '⚡', color: '#eab308',
      types: [
        { id: 'fac-e01', name: 'Light not working', icon: '💡', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'lightType', label: 'Light Type', type: 'select', required: false, options: ['Tube light', 'LED panel', 'Bedside lamp', 'OT light', 'Corridor light'] }] },
        { id: 'fac-e02', name: 'Power socket not working', icon: '🔌', responseSlaMin: 15, resolutionSlaMin: 60 },
        { id: 'fac-e03', name: 'UPS / power backup issue', icon: '⚡', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [{ id: 'areaAffected', label: 'Area Affected', type: 'text', required: true }, { id: 'duration', label: 'Duration (minutes)', type: 'number', required: false }] },
        { id: 'fac-e04', name: 'Switch / panel malfunction', icon: '🔲', responseSlaMin: 15, resolutionSlaMin: 60 },
        { id: 'fac-e05', name: 'Earthing / safety concern', icon: '⚠️', responseSlaMin: 5, resolutionSlaMin: 30, extraFields: [{ id: 'concern', label: 'Nature of Concern', type: 'textarea', required: true }] },
      ],
    },
    {
      id: 'plumbing', name: 'Plumbing', icon: '🔧', color: '#0ea5e9',
      types: [
        { id: 'fac-p01', name: 'Tap / faucet leaking', icon: '💧', responseSlaMin: 15, resolutionSlaMin: 60 },
        { id: 'fac-p02', name: 'Drain / toilet blocked', icon: '🚽', responseSlaMin: 10, resolutionSlaMin: 45 },
        { id: 'fac-p03', name: 'Water supply interrupted', icon: '💧', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [{ id: 'areaAffected', label: 'Area Affected', type: 'text', required: true }] },
        { id: 'fac-p04', name: 'Geyser / hot water not working', icon: '🌡️', responseSlaMin: 15, resolutionSlaMin: 60 },
        { id: 'fac-p05', name: 'Sewage / overflow issue', icon: '⚠️', responseSlaMin: 5, resolutionSlaMin: 30 },
      ],
    },
    {
      id: 'hvac', name: 'HVAC / AC', icon: '❄️', color: '#06b6d4',
      types: [
        { id: 'fac-h01', name: 'AC not cooling', icon: '❄️', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'acUnit', label: 'AC Unit ID', type: 'text', required: false, placeholder: 'If known' }] },
        { id: 'fac-h02', name: 'AC water dripping', icon: '💧', responseSlaMin: 15, resolutionSlaMin: 60 },
        { id: 'fac-h03', name: 'AC remote required', icon: '📱', responseSlaMin: 10, resolutionSlaMin: 30 },
        { id: 'fac-h04', name: 'Bad smell from AC vent', icon: '👃', responseSlaMin: 15, resolutionSlaMin: 60 },
        { id: 'fac-h05', name: 'Exhaust fan not working', icon: '🌀', responseSlaMin: 15, resolutionSlaMin: 60 },
        { id: 'fac-h06', name: 'Temperature too hot/cold', icon: '🌡️', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'currentTemp', label: 'Current Temperature', type: 'text', required: false, placeholder: 'If known' }] },
      ],
    },
    {
      id: 'civil', name: 'Civil Works', icon: '🧱', color: '#a16207',
      types: [
        { id: 'fac-c01', name: 'Wall damage / crack', icon: '🧱', responseSlaMin: 30, resolutionSlaMin: 240 },
        { id: 'fac-c02', name: 'Floor tile broken / loose', icon: '🔲', responseSlaMin: 15, resolutionSlaMin: 120 },
        { id: 'fac-c03', name: 'Window / door broken', icon: '🪟', responseSlaMin: 15, resolutionSlaMin: 120 },
        { id: 'fac-c04', name: 'Ceiling leak / damage', icon: '💧', responseSlaMin: 15, resolutionSlaMin: 60 },
        { id: 'fac-c05', name: 'Paint / wall touch-up needed', icon: '🎨', responseSlaMin: 30, resolutionSlaMin: 480 },
      ],
    },
    {
      id: 'pest', name: 'Pest Control', icon: '🐛', color: '#65a30d',
      types: [
        { id: 'fac-pc01', name: 'Cockroach / insect sighting', icon: '🐛', responseSlaMin: 15, resolutionSlaMin: 60 },
        { id: 'fac-pc02', name: 'Rodent sighting', icon: '🐀', responseSlaMin: 10, resolutionSlaMin: 30 },
        { id: 'fac-pc03', name: 'Mosquito / fly issue', icon: '🦟', responseSlaMin: 15, resolutionSlaMin: 60 },
        { id: 'fac-pc04', name: 'Bird / pigeon nesting', icon: '🐦', responseSlaMin: 30, resolutionSlaMin: 240 },
      ],
    },
    {
      id: 'lifts', name: 'Lifts & Common Areas', icon: '🛗', color: '#6366f1',
      types: [
        { id: 'fac-l01', name: 'Lift not working', icon: '🛗', responseSlaMin: 10, resolutionSlaMin: 60, extraFields: [{ id: 'liftNumber', label: 'Lift Number', type: 'text', required: false }, { id: 'floor', label: 'Floor', type: 'text', required: false }] },
        { id: 'fac-l02', name: 'Lift making noise / jerking', icon: '⚠️', responseSlaMin: 10, resolutionSlaMin: 60, extraFields: [{ id: 'liftNumber', label: 'Lift Number', type: 'text', required: true }] },
        { id: 'fac-l03', name: 'Signage missing / damaged', icon: '🪧', responseSlaMin: 30, resolutionSlaMin: 120 },
        { id: 'fac-l04', name: 'Parking issue', icon: '🅿️', responseSlaMin: 30, resolutionSlaMin: 120 },
        { id: 'fac-l05', name: 'Garden / outdoor maintenance', icon: '🌳', responseSlaMin: 30, resolutionSlaMin: 240 },
      ],
    },
    {
      id: 'housekeeping', name: 'Housekeeping & Cleaning', icon: '🧹', color: '#0d9488',
      types: [
        { id: 'fac-hk01', name: 'Room not cleaned', icon: '🧹', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [roomField] },
        { id: 'fac-hk02', name: 'Washroom dirty', icon: '🚿', responseSlaMin: 10, resolutionSlaMin: 30 },
        { id: 'fac-hk03', name: 'Waste not cleared', icon: '🗑️', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [{ id: 'wasteType', label: 'Waste Type', type: 'select', required: false, options: ['BMW (Biomedical)', 'General', 'Recyclable'] }] },
        { id: 'fac-hk04', name: 'Linen / bedsheet change needed', icon: '🛏️', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [roomField] },
        { id: 'fac-hk05', name: 'Spill / wet floor cleanup', icon: '⚠️', responseSlaMin: 5, resolutionSlaMin: 15 },
        { id: 'fac-hk06', name: 'Common area needs cleaning', icon: '🧽', responseSlaMin: 15, resolutionSlaMin: 45 },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// 8. PHARMACY
// ═══════════════════════════════════════════════════════════════════
const pharmacy: DepartmentConfig = {
  slug: 'pharmacy',
  name: 'Pharmacy',
  icon: '💊',
  color: '#7c3aed',
  complaintTypes: [
    { id: 'ph-01', name: 'Medicine out of stock', icon: '❌', responseSlaMin: 10, resolutionSlaMin: 60, extraFields: [{ id: 'medicineName', label: 'Medicine Name', type: 'text', required: true }, { id: 'genericBrand', label: 'Generic / Brand', type: 'select', required: false, options: ['Generic', 'Brand'] }, { id: 'qtyNeeded', label: 'Quantity Needed', type: 'number', required: false }] },
    { id: 'ph-02', name: 'Dispensing delayed', icon: '⏰', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [...patientFields, { id: 'prescRef', label: 'Prescription Reference', type: 'text', required: false }] },
    { id: 'ph-03', name: 'Wrong medicine dispensed', icon: '⚠️', responseSlaMin: 5, resolutionSlaMin: 15, extraFields: [...patientFields, { id: 'medicineGiven', label: 'Medicine Given', type: 'text', required: true }, { id: 'medicineOrdered', label: 'Medicine Ordered', type: 'text', required: true }] },
    { id: 'ph-04', name: 'Stat dose not delivered', icon: '🚨', responseSlaMin: 5, resolutionSlaMin: 15, extraFields: [...patientFields, { id: 'medicineName', label: 'Medicine', type: 'text', required: true }, wardField] },
    { id: 'ph-05', name: 'Non-formulary drug request', icon: '📋', responseSlaMin: 15, resolutionSlaMin: 120, extraFields: [{ id: 'medicineName', label: 'Medicine Name', type: 'text', required: true }, { id: 'prescribingDoctor', label: 'Prescribing Doctor', type: 'text', required: false }, { id: 'justification', label: 'Clinical Justification', type: 'textarea', required: true }] },
    { id: 'ph-06', name: 'Narcotic / controlled substance indent delay', icon: '🔒', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [{ id: 'drugName', label: 'Drug Name', type: 'text', required: true }, wardField] },
    { id: 'ph-07', name: 'Expired / damaged medicine received', icon: '🚫', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [{ id: 'medicineName', label: 'Medicine Name', type: 'text', required: true }, { id: 'batchNumber', label: 'Batch Number', type: 'text', required: false }, { id: 'expiryDate', label: 'Expiry Date', type: 'text', required: false }] },
    { id: 'ph-08', name: 'Prescription clarification needed', icon: '📝', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [...patientFields, { id: 'prescribingDoctor', label: 'Prescribing Doctor', type: 'text', required: false }] },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// 9. TRAINING
// ═══════════════════════════════════════════════════════════════════
const training: DepartmentConfig = {
  slug: 'training',
  name: 'Training',
  icon: '📚',
  color: '#0d9488',
  complaintTypes: [
    { id: 'tr-01', name: 'Training session request', icon: '📅', responseSlaMin: 60, resolutionSlaMin: 2880, extraFields: [{ id: 'topic', label: 'Topic', type: 'text', required: true }, { id: 'attendees', label: '# of Attendees', type: 'number', required: false }, { id: 'preferredDates', label: 'Preferred Date(s)', type: 'text', required: false }] },
    { id: 'tr-02', name: 'New joiner induction', icon: '👋', responseSlaMin: 30, resolutionSlaMin: 480, extraFields: [{ id: 'joinerName', label: 'New Joiner Name', type: 'text', required: true }, { id: 'department', label: 'Department', type: 'text', required: true }, { id: 'startDate', label: 'Start Date', type: 'text', required: true }] },
    { id: 'tr-03', name: 'Competency assessment needed', icon: '📊', responseSlaMin: 60, resolutionSlaMin: 2880, extraFields: [{ id: 'staffNames', label: 'Staff Name(s)', type: 'text', required: true }, { id: 'competencyArea', label: 'Competency Area', type: 'text', required: true }] },
    { id: 'tr-04', name: 'Certification renewal overdue', icon: '⚠️', responseSlaMin: 30, resolutionSlaMin: 1440, extraFields: [{ id: 'staffName', label: 'Staff Name', type: 'text', required: true }, { id: 'certType', label: 'Certification Type', type: 'text', required: true }, { id: 'expiryDate', label: 'Expiry Date', type: 'text', required: true }] },
    { id: 'tr-05', name: 'Training material / resource needed', icon: '📄', responseSlaMin: 60, resolutionSlaMin: 1440, extraFields: [{ id: 'topic', label: 'Topic', type: 'text', required: true }, { id: 'format', label: 'Format', type: 'select', required: false, options: ['PPT', 'Handout', 'Video', 'Manual'] }] },
    { id: 'tr-06', name: 'Trainer did not show up', icon: '❌', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'session', label: 'Scheduled Session', type: 'text', required: true }, { id: 'trainerName', label: 'Trainer Name', type: 'text', required: true }, { id: 'waitingCount', label: '# Waiting', type: 'number', required: false }] },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// 10. CLINICAL LAB
// ═══════════════════════════════════════════════════════════════════
const clinicalLab: DepartmentConfig = {
  slug: 'clinical-lab',
  name: 'Clinical Lab',
  icon: '🔬',
  color: '#4338ca',
  complaintTypes: [
    { id: 'lab-01', name: 'Report delayed', icon: '⏰', responseSlaMin: 10, resolutionSlaMin: 60, extraFields: [...patientFields, { id: 'testName', label: 'Test Name', type: 'text', required: true }, { id: 'sampleTime', label: 'Sample Collection Time', type: 'text', required: false }] },
    { id: 'lab-02', name: 'Sample recollection needed', icon: '🔄', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [...patientFields, { id: 'reason', label: 'Reason', type: 'select', required: true, options: ['Hemolysis', 'Wrong tube', 'Insufficient sample', 'Labeling error', 'Other'] }] },
    { id: 'lab-03', name: 'Wrong report / value discrepancy', icon: '⚠️', responseSlaMin: 5, resolutionSlaMin: 30, extraFields: [...patientFields, { id: 'testName', label: 'Test Name', type: 'text', required: true }, { id: 'discrepancy', label: 'Reported vs Expected', type: 'textarea', required: true }] },
    { id: 'lab-04', name: 'Sample not collected on time', icon: '⏰', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [...patientFields, wardField, { id: 'orderedTime', label: 'Ordered Time', type: 'text', required: false }] },
    { id: 'lab-05', name: 'Critical value not communicated', icon: '🚨', responseSlaMin: 5, resolutionSlaMin: 15, extraFields: [...patientFields, { id: 'testName', label: 'Test', type: 'text', required: true }, { id: 'value', label: 'Value', type: 'text', required: true }] },
    { id: 'lab-06', name: 'Equipment breakdown', icon: '🔧', responseSlaMin: 15, resolutionSlaMin: 120, extraFields: [{ id: 'analyzerName', label: 'Analyzer Name', type: 'text', required: true }, { id: 'testsAffected', label: 'Tests Affected', type: 'text', required: false }] },
    { id: 'lab-07', name: 'Reagent stock-out affecting tests', icon: '❌', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'reagentName', label: 'Reagent Name', type: 'text', required: true }, { id: 'testsAffected', label: 'Tests Affected', type: 'text', required: false }] },
    { id: 'lab-08', name: 'Lab staff behavior / attitude', icon: '🙁', responseSlaMin: 30, resolutionSlaMin: 120 },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// 11. RADIOLOGY
// ═══════════════════════════════════════════════════════════════════
const radiology: DepartmentConfig = {
  slug: 'radiology',
  name: 'Radiology',
  icon: '🩻',
  color: '#6366f1',
  complaintTypes: [
    { id: 'rad-01', name: 'Report delayed', icon: '⏰', responseSlaMin: 10, resolutionSlaMin: 60, extraFields: [...patientFields, { id: 'studyType', label: 'Study Type', type: 'select', required: true, options: ['X-ray', 'CT', 'MRI', 'USG', 'Mammography', 'Other'] }] },
    { id: 'rad-02', name: 'Scheduling conflict / slot not available', icon: '📅', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [...patientFields, { id: 'studyType', label: 'Study Type', type: 'select', required: true, options: ['X-ray', 'CT', 'MRI', 'USG', 'Mammography', 'Other'] }, { id: 'requestedTime', label: 'Requested Date/Time', type: 'text', required: false }] },
    { id: 'rad-03', name: 'Wrong study / repeat needed', icon: '⚠️', responseSlaMin: 10, resolutionSlaMin: 60, extraFields: [...patientFields, { id: 'studyType', label: 'Study Type', type: 'text', required: true }, { id: 'reason', label: 'Reason for Repeat', type: 'textarea', required: true }] },
    { id: 'rad-04', name: 'Contrast reaction concern', icon: '🚨', responseSlaMin: 5, resolutionSlaMin: 15, extraFields: [...patientFields, { id: 'contrastType', label: 'Contrast Type', type: 'text', required: true }, { id: 'reaction', label: 'Reaction', type: 'textarea', required: true }] },
    { id: 'rad-05', name: 'Equipment downtime', icon: '🔧', responseSlaMin: 15, resolutionSlaMin: 120, extraFields: [{ id: 'modality', label: 'Modality', type: 'select', required: true, options: ['CT', 'MRI', 'X-ray', 'USG', 'Mammography', 'C-Arm'] }, { id: 'impact', label: 'Impact Description', type: 'textarea', required: false }] },
    { id: 'rad-06', name: 'Patient not prepped / wrong prep', icon: '📋', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [...patientFields, { id: 'studyType', label: 'Study Type', type: 'text', required: true }] },
    { id: 'rad-07', name: 'PACS / RIS system issue', icon: '💻', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'issueNature', label: 'Nature of Issue', type: 'textarea', required: true }] },
    { id: 'rad-08', name: 'Radiology staff behavior / attitude', icon: '🙁', responseSlaMin: 30, resolutionSlaMin: 120 },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// 12. OT (OPERATING THEATRE)
// ═══════════════════════════════════════════════════════════════════
const ot: DepartmentConfig = {
  slug: 'ot',
  name: 'OT',
  icon: '🔪',
  color: '#be185d',
  complaintTypes: [
    { id: 'ot-01', name: 'OT not ready on time', icon: '⏰', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [{ id: 'otNumber', label: 'OT Number', type: 'text', required: true }, { id: 'scheduledTime', label: 'Scheduled Time', type: 'text', required: true }, { id: 'surgeon', label: 'Surgeon', type: 'text', required: false }] },
    { id: 'ot-02', name: 'Delay between cases (turnaround)', icon: '🔄', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [{ id: 'otNumber', label: 'OT Number', type: 'text', required: true }, { id: 'prevCaseEnd', label: 'Previous Case End Time', type: 'text', required: false }] },
    { id: 'ot-03', name: 'Scheduling conflict', icon: '📅', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'otNumber', label: 'OT Number', type: 'text', required: false }, { id: 'conflictDetails', label: 'Conflicting Cases', type: 'textarea', required: true }] },
    { id: 'ot-04', name: 'Emergency case bumping elective', icon: '🚨', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [{ id: 'electiveCase', label: 'Elective Case Details', type: 'text', required: true }, { id: 'emergencyCase', label: 'Emergency Case Details', type: 'text', required: true }] },
    { id: 'ot-05', name: 'Instruments not sterile / ready', icon: '⚠️', responseSlaMin: 5, resolutionSlaMin: 30, extraFields: [{ id: 'instrumentSet', label: 'Instrument Set Name', type: 'text', required: true }, { id: 'otNumber', label: 'OT Number', type: 'text', required: false }] },
    { id: 'ot-06', name: 'OT table / light malfunction', icon: '🔧', responseSlaMin: 10, resolutionSlaMin: 60, extraFields: [{ id: 'otNumber', label: 'OT Number', type: 'text', required: true }, { id: 'equipType', label: 'Equipment Type', type: 'select', required: true, options: ['OT Table', 'OT Light', 'Cautery', 'Suction', 'Other'] }] },
    { id: 'ot-07', name: 'Missing consumables / implants', icon: '❌', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [{ id: 'itemName', label: 'Item Name', type: 'text', required: true }, { id: 'caseDetails', label: 'Case Details', type: 'text', required: false }] },
    { id: 'ot-08', name: 'Anaesthesia equipment issue', icon: '🫁', responseSlaMin: 5, resolutionSlaMin: 30, extraFields: [{ id: 'otNumber', label: 'OT Number', type: 'text', required: true }, { id: 'equipType', label: 'Equipment Type', type: 'text', required: true }] },
    { id: 'ot-09', name: 'Post-op handoff incomplete', icon: '📋', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [...patientFields, { id: 'missingInfo', label: 'Missing Information', type: 'textarea', required: true }] },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// 13. HR & MANPOWER
// ═══════════════════════════════════════════════════════════════════
const hrManpower: DepartmentConfig = {
  slug: 'hr-manpower',
  name: 'HR & Manpower',
  icon: '👥',
  color: '#9333ea',
  complaintTypes: [
    { id: 'hr-01', name: 'Short-staffed today', icon: '🚨', responseSlaMin: 10, resolutionSlaMin: 60, extraFields: [{ id: 'deptWard', label: 'Department / Ward', type: 'text', required: true }, { id: 'staffNeeded', label: '# Staff Needed', type: 'number', required: true }, { id: 'shift', label: 'Shift', type: 'select', required: true, options: ['Morning', 'Afternoon', 'Night'] }] },
    { id: 'hr-02', name: 'Staff did not report for duty', icon: '❌', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'staffName', label: 'Staff Name', type: 'text', required: true }, { id: 'department', label: 'Department', type: 'text', required: true }, { id: 'shift', label: 'Shift', type: 'select', required: true, options: ['Morning', 'Afternoon', 'Night'] }] },
    { id: 'hr-03', name: 'Attendance correction needed', icon: '📋', responseSlaMin: 30, resolutionSlaMin: 120, extraFields: [{ id: 'staffName', label: 'Staff Name', type: 'text', required: true }, { id: 'dates', label: 'Date(s)', type: 'text', required: true }, { id: 'correctionType', label: 'Correction Type', type: 'select', required: true, options: ['Marked absent but present', 'Wrong shift recorded', 'Overtime not logged', 'Other'] }] },
    { id: 'hr-04', name: 'Salary / payroll discrepancy', icon: '💰', responseSlaMin: 30, resolutionSlaMin: 240, extraFields: [{ id: 'staffName', label: 'Staff Name', type: 'text', required: true }, { id: 'month', label: 'Month', type: 'text', required: true }, { id: 'discrepancy', label: 'Description of Discrepancy', type: 'textarea', required: true }] },
    { id: 'hr-05', name: 'Overtime not paid / recorded', icon: '⏰', responseSlaMin: 30, resolutionSlaMin: 240, extraFields: [{ id: 'staffName', label: 'Staff Name', type: 'text', required: true }, { id: 'dates', label: 'Date(s)', type: 'text', required: true }, { id: 'hours', label: 'Hours', type: 'number', required: true }] },
    { id: 'hr-06', name: 'Leave approval pending', icon: '📅', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'staffName', label: 'Staff Name', type: 'text', required: true }, { id: 'leaveDates', label: 'Leave Dates', type: 'text', required: true }, { id: 'leaveType', label: 'Leave Type', type: 'select', required: true, options: ['Casual', 'Sick', 'Earned', 'Compensatory', 'Other'] }] },
    { id: 'hr-07', name: 'Grievance against colleague', icon: '🤝', responseSlaMin: 30, resolutionSlaMin: 240, extraFields: [{ id: 'grievanceNature', label: 'Nature of Grievance', type: 'textarea', required: true, placeholder: 'Do not include names here. HR will contact you privately.' }] },
    { id: 'hr-08', name: 'Uniform / ID card issue', icon: '👔', responseSlaMin: 30, resolutionSlaMin: 120, extraFields: [{ id: 'staffName', label: 'Staff Name', type: 'text', required: true }, { id: 'issueType', label: 'Issue Type', type: 'select', required: true, options: ['Uniform not provided', 'Wrong size', 'ID card lost', 'ID card damaged', 'New ID required'] }] },
    { id: 'hr-09', name: 'New hire onboarding delayed', icon: '👋', responseSlaMin: 30, resolutionSlaMin: 240, extraFields: [{ id: 'newHireName', label: 'New Hire Name', type: 'text', required: true }, { id: 'expectedStart', label: 'Expected Start Date', type: 'text', required: true }] },
    { id: 'hr-10', name: 'Training certification expired', icon: '⚠️', responseSlaMin: 30, resolutionSlaMin: 120, extraFields: [{ id: 'staffName', label: 'Staff Name', type: 'text', required: true }, { id: 'certType', label: 'Certification Type', type: 'text', required: true }, { id: 'expiryDate', label: 'Expiry Date', type: 'text', required: true }] },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// 14. DIET (Clinical Nutrition & F&B)
// ═══════════════════════════════════════════════════════════════════
const diet: DepartmentConfig = {
  slug: 'diet',
  name: 'Diet',
  icon: '🍽️',
  color: '#f59e0b',
  complaintTypes: [
    { id: 'dt-01', name: 'Wrong diet served to patient', icon: '⚠️', responseSlaMin: 5, resolutionSlaMin: 15, extraFields: [...patientFields, wardField, { id: 'dietOrdered', label: 'Diet Ordered', type: 'text', required: true }, { id: 'dietServed', label: 'Diet Served', type: 'text', required: true }] },
    { id: 'dt-02', name: 'Diet tray not delivered on time', icon: '⏰', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [...patientFields, wardField, { id: 'meal', label: 'Meal', type: 'select', required: true, options: ['Breakfast', 'Lunch', 'Dinner', 'Snack'] }] },
    { id: 'dt-03', name: 'Therapeutic / special diet not prepared', icon: '📋', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [...patientFields, { id: 'dietType', label: 'Diet Type', type: 'text', required: true }, { id: 'prescribingDoctor', label: 'Prescribing Doctor', type: 'text', required: false }] },
    { id: 'dt-04', name: 'NPO violation (patient fed before procedure)', icon: '🚨', responseSlaMin: 5, resolutionSlaMin: 15, extraFields: [...patientFields, { id: 'procedure', label: 'Procedure', type: 'text', required: true }, { id: 'timeFed', label: 'Time Fed', type: 'text', required: true }] },
    { id: 'dt-05', name: 'Diet chart not updated after doctor order', icon: '📝', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [...patientFields, { id: 'newDietOrder', label: 'New Diet Order', type: 'text', required: true }] },
    { id: 'dt-06', name: 'Food quality / temperature complaint', icon: '👎', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [wardField, { id: 'meal', label: 'Meal', type: 'select', required: false, options: ['Breakfast', 'Lunch', 'Dinner', 'Snack'] }, { id: 'issue', label: 'Specific Issue', type: 'textarea', required: true }] },
    { id: 'dt-07', name: 'Tray not cleared from room', icon: '🗑️', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [roomField] },
    { id: 'dt-08', name: 'Supplement / formula not available', icon: '❌', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'productName', label: 'Product Name', type: 'text', required: true }, ...patientFields] },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// 15. BIOMEDICAL ENGINEERING
// ═══════════════════════════════════════════════════════════════════
const biomedical: DepartmentConfig = {
  slug: 'biomedical',
  name: 'Biomedical',
  icon: '🔧',
  color: '#0369a1',
  complaintTypes: [
    { id: 'bm-01', name: 'Equipment breakdown', icon: '🔴', responseSlaMin: 10, resolutionSlaMin: 60, extraFields: [equipmentField, assetTagField, { id: 'deptArea', label: 'Department / Area', type: 'text', required: true }, { id: 'impact', label: 'Impact on Patient Care', type: 'textarea', required: false }] },
    { id: 'bm-02', name: 'Equipment not functioning properly', icon: '⚠️', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [equipmentField, assetTagField, { id: 'symptom', label: 'Symptom Description', type: 'textarea', required: true }] },
    { id: 'bm-03', name: 'Calibration overdue / readings inaccurate', icon: '📊', responseSlaMin: 15, resolutionSlaMin: 120, extraFields: [equipmentField, { id: 'lastCalDate', label: 'Last Calibration Date', type: 'text', required: false }] },
    { id: 'bm-04', name: 'Preventive maintenance (PMC) overdue', icon: '📅', responseSlaMin: 30, resolutionSlaMin: 240, extraFields: [equipmentField, assetTagField, { id: 'lastPmDate', label: 'Last PM Date', type: 'text', required: false }] },
    { id: 'bm-05', name: 'Spare parts needed', icon: '🔩', responseSlaMin: 30, resolutionSlaMin: 240, extraFields: [equipmentField, { id: 'partDesc', label: 'Part Description', type: 'text', required: true }] },
    { id: 'bm-06', name: 'New equipment request / replacement', icon: '📋', responseSlaMin: 60, resolutionSlaMin: 2880, extraFields: [{ id: 'equipType', label: 'Equipment Type', type: 'text', required: true }, { id: 'justification', label: 'Clinical Justification', type: 'textarea', required: true }, { id: 'estimatedCost', label: 'Estimated Cost (Rs.)', type: 'number', required: false }] },
    { id: 'bm-07', name: 'Equipment safety concern', icon: '🚨', responseSlaMin: 5, resolutionSlaMin: 30, extraFields: [equipmentField, assetTagField, { id: 'concern', label: 'Nature of Concern', type: 'textarea', required: true }] },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// 16. NURSING
// ═══════════════════════════════════════════════════════════════════
const nursing: DepartmentConfig = {
  slug: 'nursing',
  name: 'Nursing',
  icon: '👩‍⚕️',
  color: '#0891b2',
  complaintTypes: [
    { id: 'ns-01', name: 'Nurse not responding to call', icon: '📢', responseSlaMin: 5, resolutionSlaMin: 15, extraFields: [{ id: 'wardRoom', label: 'Ward / Room', type: 'text', required: true }, { id: 'callTime', label: 'Time of Call', type: 'text', required: false }] },
    { id: 'ns-02', name: 'Short-staffed in ward', icon: '🚨', responseSlaMin: 10, resolutionSlaMin: 60, extraFields: [wardField, { id: 'shift', label: 'Shift', type: 'select', required: true, options: ['Morning', 'Afternoon', 'Night'] }, { id: 'nursesPresent', label: '# Nurses Present', type: 'number', required: false }, { id: 'nursesRequired', label: '# Nurses Required', type: 'number', required: false }] },
    { id: 'ns-03', name: 'Medication administration delayed', icon: '💊', responseSlaMin: 5, resolutionSlaMin: 15, extraFields: [...patientFields, { id: 'medicine', label: 'Medicine', type: 'text', required: true }, { id: 'scheduledTime', label: 'Scheduled Time', type: 'text', required: true }] },
    { id: 'ns-04', name: 'IV line / drip issue', icon: '💉', responseSlaMin: 5, resolutionSlaMin: 15, extraFields: [...patientFields, wardField, { id: 'issueNature', label: 'Nature of Issue', type: 'text', required: true }] },
    { id: 'ns-05', name: 'Patient handoff incomplete', icon: '🔄', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [...patientFields, { id: 'fromWard', label: 'From Ward', type: 'text', required: true }, { id: 'toWard', label: 'To Ward', type: 'text', required: true }, { id: 'missingInfo', label: 'Missing Information', type: 'textarea', required: true }] },
    { id: 'ns-06', name: 'Vitals not recorded on time', icon: '📋', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [...patientFields, { id: 'missedVitals', label: 'Missed Vital(s)', type: 'text', required: true }, { id: 'timeGap', label: 'Time Gap', type: 'text', required: false }] },
    { id: 'ns-07', name: 'Fall risk patient not monitored', icon: '⚠️', responseSlaMin: 5, resolutionSlaMin: 15, extraFields: [...patientFields, wardField] },
    { id: 'ns-08', name: 'Bedsore / pressure injury concern', icon: '🛏️', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [...patientFields, { id: 'bodyLocation', label: 'Location on Body', type: 'text', required: true }, { id: 'stage', label: 'Stage', type: 'select', required: false, options: ['Stage 1', 'Stage 2', 'Stage 3', 'Stage 4', 'Unstageable', 'Unknown'] }] },
    { id: 'ns-09', name: 'Catheter / tube care issue', icon: '🔧', responseSlaMin: 5, resolutionSlaMin: 15, extraFields: [...patientFields, { id: 'deviceType', label: 'Device Type', type: 'select', required: true, options: ['Urinary catheter', 'Central line', 'NG tube', 'Tracheostomy', 'Drain', 'Other'] }] },
    { id: 'ns-10', name: 'Nursing documentation incomplete', icon: '📝', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [...patientFields, { id: 'docType', label: 'Document Type', type: 'text', required: true }] },
    { id: 'ns-11', name: 'Nursing staff behavior / attitude', icon: '🙁', responseSlaMin: 30, resolutionSlaMin: 120 },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// 17. IT
// ═══════════════════════════════════════════════════════════════════
const it: DepartmentConfig = {
  slug: 'it',
  name: 'IT',
  icon: '💻',
  color: '#1e40af',
  complaintTypes: [
    { id: 'it-01', name: 'Computer / workstation not working', icon: '🖥️', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [assetTagField, { id: 'symptom', label: 'Symptom', type: 'textarea', required: true }] },
    { id: 'it-02', name: 'Printer not working / paper jam', icon: '🖨️', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'printerName', label: 'Printer Name', type: 'text', required: false }] },
    { id: 'it-03', name: 'WiFi / network down', icon: '📶', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [{ id: 'areaAffected', label: 'Area Affected', type: 'text', required: true }, { id: 'usersImpacted', label: '# of Users Impacted', type: 'number', required: false }] },
    { id: 'it-04', name: 'Phone / intercom not working', icon: '📞', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'extension', label: 'Extension Number', type: 'text', required: false }] },
    { id: 'it-05', name: 'CCTV camera issue', icon: '📹', responseSlaMin: 15, resolutionSlaMin: 120, extraFields: [{ id: 'cameraLocation', label: 'Camera Location', type: 'text', required: true }, { id: 'issue', label: 'Issue', type: 'select', required: true, options: ['Offline', 'Blurry', 'No recording', 'Wrong angle', 'Other'] }] },
    { id: 'it-06', name: 'Password reset needed', icon: '🔑', responseSlaMin: 10, resolutionSlaMin: 15, extraFields: [{ id: 'staffName', label: 'Staff Name', type: 'text', required: true }, { id: 'system', label: 'System', type: 'select', required: true, options: ['Email', 'KareXpert', 'PACS', 'Other'] }] },
    { id: 'it-07', name: 'New user account request', icon: '👤', responseSlaMin: 30, resolutionSlaMin: 120, extraFields: [{ id: 'newUserName', label: 'New User Name', type: 'text', required: true }, { id: 'department', label: 'Department', type: 'text', required: true }, { id: 'systemsNeeded', label: 'Systems Needed', type: 'text', required: true }] },
    { id: 'it-08', name: 'UPS / power to IT equipment', icon: '⚡', responseSlaMin: 10, resolutionSlaMin: 30, extraFields: [{ id: 'equipAffected', label: 'Equipment Affected', type: 'text', required: true }] },
    { id: 'it-09', name: 'Software / application not responding', icon: '💻', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'appName', label: 'Application Name', type: 'text', required: true }, { id: 'errorMessage', label: 'Error Message', type: 'text', required: false, placeholder: 'If any' }] },
    { id: 'it-10', name: 'Hardware replacement request', icon: '🔧', responseSlaMin: 30, resolutionSlaMin: 480, extraFields: [{ id: 'equipType', label: 'Equipment Type', type: 'text', required: true }, { id: 'age', label: 'Age (years)', type: 'number', required: false }, { id: 'reason', label: 'Reason for Replacement', type: 'textarea', required: true }] },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// MASTER EXPORT
// ═══════════════════════════════════════════════════════════════════



// ═══════════════════════════════════════════════════════════════════
// 18. ADMINISTRATION
// ═══════════════════════════════════════════════════════════════════

const administration: DepartmentConfig = {
  slug: 'administration',
  name: 'Administration',
  icon: '🏥',
  color: '#4f46e5',
  complaintTypes: [
    { id: 'adm-01', name: 'Interdepartmental coordination failure', icon: '🔗', responseSlaMin: 30, resolutionSlaMin: 240, extraFields: [{ id: 'deptsInvolved', label: 'Departments Involved', type: 'text', required: true, placeholder: 'e.g., Finance + Billing' }, { id: 'impactDesc', label: 'Impact Description', type: 'textarea', required: true }] },
    { id: 'adm-02', name: 'Approval / authorization delay', icon: '⏳', responseSlaMin: 30, resolutionSlaMin: 120, extraFields: [{ id: 'approvalType', label: 'Approval Type', type: 'select', required: true, options: ['Purchase Order', 'Leave/HR', 'Vendor Payment', 'Capital Expenditure', 'Policy Exception', 'Other'] }, { id: 'pendingSince', label: 'Pending Since (date)', type: 'text', required: true, placeholder: 'e.g., 2026-03-20' }] },
    { id: 'adm-03', name: 'Policy / process concern', icon: '📜', responseSlaMin: 60, resolutionSlaMin: 1440, extraFields: [{ id: 'policyName', label: 'Policy / SOP Name', type: 'text', required: true }, { id: 'concern', label: 'Concern Details', type: 'textarea', required: true }] },
    { id: 'adm-04', name: 'Communication gap', icon: '📢', responseSlaMin: 30, resolutionSlaMin: 120, extraFields: [{ id: 'commType', label: 'Communication Type', type: 'select', required: true, options: ['Circular not received', 'Incorrect info shared', 'Delayed communication', 'Missing escalation', 'Other'] }, { id: 'affectedParties', label: 'Affected Parties', type: 'text', required: true }] },
    { id: 'adm-05', name: 'Meeting / scheduling conflict', icon: '📅', responseSlaMin: 30, resolutionSlaMin: 60, extraFields: [{ id: 'meetingSubject', label: 'Meeting Subject', type: 'text', required: true }, { id: 'conflictDetails', label: 'Conflict Details', type: 'textarea', required: true }] },
    { id: 'adm-06', name: 'Documentation / record-keeping issue', icon: '📂', responseSlaMin: 30, resolutionSlaMin: 240, extraFields: [{ id: 'docType', label: 'Document Type', type: 'select', required: true, options: ['Patient record', 'Administrative record', 'Compliance document', 'Financial document', 'HR record', 'Other'] }, { id: 'issue', label: 'Issue Description', type: 'textarea', required: true }] },
    { id: 'adm-07', name: 'Compliance / regulatory concern', icon: '⚖️', responseSlaMin: 15, resolutionSlaMin: 480, extraFields: [{ id: 'regulatoryBody', label: 'Regulatory Body', type: 'select', required: true, options: ['NABH', 'State Health Dept', 'CPCB', 'Fire Safety', 'AERB', 'Other'] }, { id: 'complianceDetails', label: 'Compliance Issue Details', type: 'textarea', required: true }] },
    { id: 'adm-08', name: 'Staff welfare issue', icon: '🙋', responseSlaMin: 30, resolutionSlaMin: 480, extraFields: [{ id: 'issueCategory', label: 'Issue Category', type: 'select', required: true, options: ['Workplace safety', 'Harassment/bullying', 'Facilities concern', 'Workload', 'Benefits/compensation', 'Other'] }, { id: 'details', label: 'Details', type: 'textarea', required: true }] },
    { id: 'adm-09', name: 'Visitor / vendor management issue', icon: '👥', responseSlaMin: 15, resolutionSlaMin: 60, extraFields: [{ id: 'personType', label: 'Person Type', type: 'select', required: true, options: ['Visitor', 'Vendor', 'Contractor', 'Consultant', 'Other'] }, { id: 'issueDesc', label: 'Issue Description', type: 'textarea', required: true }] },
    { id: 'adm-10', name: 'General administrative request', icon: '📋', responseSlaMin: 60, resolutionSlaMin: 1440, extraFields: [{ id: 'requestDetails', label: 'Request Details', type: 'textarea', required: true }] },
  ],
};

export const SEWA_DEPARTMENTS: DepartmentConfig[] = [
  emergency,
  customerCare,
  patientSafety,
  finance,
  billing,
  supplyChain,
  facility,
  pharmacy,
  training,
  clinicalLab,
  radiology,
  ot,
  hrManpower,
  diet,
  biomedical,
  nursing,
  it,
  administration,
];

// Helper: get department by slug
export function getDepartment(slug: string): DepartmentConfig | undefined {
  return SEWA_DEPARTMENTS.find(d => d.slug === slug);
}

// Helper: get all complaint types for a department (flattening sub-menus)
export function getAllComplaintTypes(dept: DepartmentConfig): ComplaintType[] {
  if (dept.complaintTypes) return dept.complaintTypes;
  if (dept.subMenus) return dept.subMenus.flatMap(sm => sm.types);
  return [];
}

// Helper: find a complaint type by ID across all departments
export function findComplaintType(typeId: string): { dept: DepartmentConfig; type: ComplaintType } | undefined {
  for (const dept of SEWA_DEPARTMENTS) {
    const types = getAllComplaintTypes(dept);
    const found = types.find(t => t.id === typeId);
    if (found) return { dept, type: found };
  }
  return undefined;
}

// SLA Escalation Levels (same as v1)
export const SLA_LEVELS = [
  { level: 0, time: 'T+0', notify: 'Department responder', channels: 'In-app' },
  { level: 1, time: 'T+30', notify: '+ Supervisor', channels: 'In-app + WhatsApp' },
  { level: 2, time: 'T+60', notify: '+ Dept Manager', channels: 'In-app + WhatsApp + Email' },
  { level: 3, time: 'T+90', notify: '+ Ops Heads (Vinay, Yash)', channels: 'Email + WhatsApp' },
  { level: 4, time: 'T+120', notify: '+ Hospital Admin (Chandrika, Animesh)', channels: 'All channels' },
  { level: 5, time: 'T+150', notify: 'Terminal', channels: 'All + Urgent Flag' },
];

// Request status type
export type RequestStatus = 'NEW' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'BLOCKED' | 'RESOLVED';

// Complaint/Request interface
export interface SewaRequest {
  id: string;
  requestorName: string;
  requestorDept: string;
  requestorEmpId?: string;
  targetDept: string;
  complaintTypeId: string;
  complaintTypeName: string;
  subMenu?: string;
  priority: 'normal' | 'urgent';
  status: RequestStatus;
  location: string;
  description: string;
  patientName?: string;
  patientUhid?: string;
  extraFields: Record<string, string | number>;
  responseSlaMin: number;
  resolutionSlaMin: number;
  createdAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  acknowledgedBy?: string;
  resolvedBy?: string;
  escalationLevel: number;
  comments: { user: string; text: string; time: string; action?: string; blockingDept?: string }[];
  blockedAt?: string;
  blockingDept?: string;
  blockedReason?: string;
}
