// src/lib/hk-types.ts
// SanitizeTrack — TypeScript interfaces for housekeeping task tracking

// Database row types (snake_case, matching Postgres columns)

export interface HKAreaRow {
  id: number;
  floor: string;
  name: string;
  area_type: string;
  room_number: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HKTaskTemplateRow {
  id: number;
  name: string;
  name_kn: string | null;
  category: string;
  area_id: number | null;
  area_type: string | null;
  frequency: string;
  shifts: string[];
  disinfectant: string | null;
  priority_weight: number;
  checklist_ref: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HKShiftRow {
  id: number;
  date: string;
  shift_type: string;
  supervisor_name: string | null;
  staff_count: number | null;
  male_count: number | null;
  female_count: number | null;
  ip_census: number | null;
  started_at: string;
  completed_at: string | null;
}

export interface HKShiftTaskRow {
  id: number;
  shift_id: number;
  template_id: number | null;
  area_id: number;
  task_name: string;
  task_category: string;
  disinfectant: string | null;
  floor: string;
  area_name: string;
  source: 'scheduled' | 'sewa' | 'carryover' | 'manual';
  sewa_request_id: string | null;
  carryover_from_id: number | null;
  status: 'pending' | 'done' | 'skipped';
  priority: number;
  completed_at: string | null;
  completed_by: string | null;
  photo_url: string | null;
  skip_reason: string | null;
  notes: string | null;
  created_at: string;
}

export interface HKSewaMappingRow {
  id: number;
  sewa_complaint_type_id: string;
  sewa_complaint_name: string;
  hk_category: string;
  auto_create_task: boolean;
  default_priority: number;
}

// API request/response types

export interface StartShiftRequest {
  supervisorName: string;
  staffCount: number;
  maleCount: number;
  femaleCount: number;
  ipCensus: number;
}

export interface CompleteTaskRequest {
  taskId: number;
  completedBy: string;
}

export interface CompleteRoomRequest {
  areaId: number;
  shiftId: number;
  completedBy: string;
}

export interface SkipTaskRequest {
  taskId: number;
  reason: string;
}

export interface AddTaskRequest {
  areaId: number;
  taskName: string;
  category: string;
  priority: number;
}

export interface ShiftSummary {
  shiftId: number;
  date: string;
  shiftType: string;
  supervisorName: string | null;
  staffCount: number | null;
  maleCount: number | null;
  femaleCount: number | null;
  ipCensus: number | null;
  totalTasks: number;
  doneTasks: number;
  pendingTasks: number;
  skippedTasks: number;
  overdueTasks: number;
  completionPct: number;
}

export interface FloorHeatmapCell {
  floor: string;
  areaType: string;
  total: number;
  done: number;
  pct: number;
}

export interface DashboardData {
  currentShift: ShiftSummary | null;
  floorHeatmap: FloorHeatmapCell[];
  overdueItems: HKShiftTaskRow[];
  terminalCleanStats: TerminalCleanStats | null;
}

export interface TerminalCleanStats {
  totalDischarges: number;
  cleansCompleted: number;
  cleansPending: number;
  avgMinutesToClean: number | null;
}

// Seed data types (used in hk-config.ts)

export interface AreaSeed {
  floor: string;
  name: string;
  area_type: string;
  room_number?: string;
}

export interface TemplateSeed {
  name: string;
  category: string;
  area_id?: number;
  area_type?: string;
  frequency: string;
  shifts: string[];
  disinfectant?: string;
  priority_weight: number;
  checklist_ref?: string;
}

export interface SewaMappingSeed {
  sewa_complaint_type_id: string;
  sewa_complaint_name: string;
  hk_category: string;
  auto_create_task: boolean;
  default_priority: number;
}

// Constants

export const SHIFT_TYPES = ['AM', 'PM', 'NIGHT'] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];

export const SHIFT_WINDOWS: Record<ShiftType, { start: number; end: number; label: string }> = {
  AM:    { start: 8,  end: 14, label: 'Morning (8 AM – 2 PM)' },
  PM:    { start: 14, end: 20, label: 'Evening (2 PM – 8 PM)' },
  NIGHT: { start: 20, end: 8,  label: 'Night (8 PM – 8 AM)' },
};

export const TASK_CATEGORIES = [
  'routine', 'terminal', 'high_touch', 'bmw', 'washroom',
  'weekly', 'ppe', 'icu', 'ot', 'er', 'opd', 'common',
  'diagnostics', 'linen', 'kitchen', 'staff',
] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const AREA_TYPES = [
  'patient_room', 'icu', 'ot', 'washroom_common', 'washroom_staff',
  'corridor', 'nursing_station', 'lift', 'staircase', 'opd_room',
  'er', 'pharmacy', 'lab', 'radiology', 'dialysis', 'physiotherapy',
  'kitchen', 'cafeteria', 'staff_room', 'sluice', 'store', 'cssd',
  'electrical', 'parking', 'entrance', 'reception', 'billing',
  'admin_office', 'pre_post_op', 'recovery', 'endoscopy',
  'scrub_area', 'duty_room', 'changing_room', 'waiting_area',
  'opd_waiting', 'ramp',
] as const;
export type AreaType = (typeof AREA_TYPES)[number];

export const SKIP_REASONS = [
  'Not enough staff',
  'Area occupied / in use',
  'Supplies unavailable',
  'Other',
] as const;

export function getCurrentShiftType(): ShiftType {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const hour = istNow.getUTCHours();
  if (hour >= 8 && hour < 14) return 'AM';
  if (hour >= 14 && hour < 20) return 'PM';
  return 'NIGHT';
}

export function getTodayIST(): string {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  return istNow.toISOString().split('T')[0];
}
