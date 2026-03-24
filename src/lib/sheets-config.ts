// Google Sheets configuration for auto-sync
// All 17 department forms feed into one spreadsheet with separate tabs

export const SPREADSHEET_ID = '19Aqqqa2gatb--5h7hFzEzpFpbWcADqzH7d0v5xNviJM';

// Maps each department slug to its Google Sheet tab name
export const SHEET_TAB_MAP: Record<string, string> = {
  'emergency': 'ED',
  'customer-care': 'Customer Care',
  'patient-safety': 'Patient Safety',
  'finance': 'Finance',
  'billing': 'Billing',
  'supply-chain': 'Supply Chain',
  'facilities': 'FMS',
  'it': 'IT',
  'nursing': 'Nursing',
  'pharmacy': 'Pharmacy',
  'clinical-lab': 'Clinical Lab',
  'radiology': 'Radiology',
  'ot': 'OT',
  'hr-manpower': 'Human Resources',
  'training': 'Training',
  'diet': 'Clinical Nutrition, F&B',
  'biomedical': 'Biomedical',
};

export function getSheetCsvUrl(tabName: string): string {
  const encoded = encodeURIComponent(tabName);
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encoded}`;
}
