// Department head contact directory for submission reminders
// Each entry maps a department slug to the head's name and email

export interface DepartmentContact {
  slug: string;
  department: string;
  headName: string;
  email: string;
}

export const DEPARTMENT_CONTACTS: DepartmentContact[] = [
  { slug: 'emergency', department: 'Emergency', headName: 'Gautham Shankar', email: 'gautham.shankar@even.in' },
  { slug: 'customer-care', department: 'Customer Care', headName: 'Lavanya R', email: 'lavanya.r@even.in' },
  { slug: 'patient-safety', department: 'Patient Safety & Quality', headName: 'Ankita Priya', email: 'ankita.priya@even.in' },
  { slug: 'finance', department: 'Finance', headName: 'Sathyamoorthy', email: 'sathyamoorthy@even.in' },
  { slug: 'billing', department: 'Billing', headName: 'Mohankumar Kesavamurthy', email: 'mohankumar.kesavamurthy@even.in' },
  { slug: 'supply-chain', department: 'Supply Chain & Procurement', headName: 'CS Yogendra', email: 'cs.yogendra@even.in' },
  { slug: 'facility', department: 'Facility', headName: 'Charan Kumar S', email: 'charan.kumar@even.in' },
  { slug: 'it', department: 'IT', headName: 'BV Dilip', email: 'bv.dilip@even.in' },
  { slug: 'nursing', department: 'Nursing', headName: 'Mary Nirmala S', email: 'mary.nirmala@even.in' },
  { slug: 'pharmacy', department: 'Pharmacy', headName: 'B Rajesh', email: 'b.rajesh@even.in' },
  { slug: 'clinical-lab', department: 'Clinical Lab', headName: 'Chandrakala LN', email: 'chandrakala.ln@even.in' },
  { slug: 'radiology', department: 'Radiology', headName: 'N Saran', email: 'n.saran@even.in' },
  { slug: 'ot', department: 'OT', headName: 'Leela', email: 'leela@even.in' },
  { slug: 'hr-manpower', department: 'HR & Manpower', headName: 'Manjunath', email: 'manjunath@even.in' },
  { slug: 'training', department: 'Training', headName: 'Naveen B', email: 'naveen.b@even.in' },
  { slug: 'diet', department: 'Diet', headName: 'Kamar Afshan', email: 'kamar.afshan@even.in' },
  { slug: 'biomedical', department: 'Biomedical', headName: 'Arul Thomas Victor Rebello', email: 'arul@even.in' },
];

// Quick lookup by slug
export const CONTACTS_BY_SLUG: Record<string, DepartmentContact> = Object.fromEntries(
  DEPARTMENT_CONTACTS.map(c => [c.slug, c])
);
