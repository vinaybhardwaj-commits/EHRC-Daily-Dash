// src/lib/hk-config.ts
// SanitizeTrack — Seed data for areas, task templates, and Sewa mappings
// Derived from EHRC HK Daily Checklist v1.0 and PRD Section 7

import { AreaSeed, TemplateSeed, SewaMappingSeed } from './hk-types';

// ═══════════════════════════════════════════════════════════════
// Hospital Areas (~85 areas across 5 floors + cross-floor)
// NOTE: 1F and 2F room lists are PLACEHOLDER — pending walkthrough with Charan Kumar
// ═══════════════════════════════════════════════════════════════

export const SEED_AREAS: AreaSeed[] = [
  // ── Ground Floor (GF) ──
  { floor: 'GF', name: 'Room 101', area_type: 'patient_room', room_number: '101' },
  { floor: 'GF', name: 'Room 102', area_type: 'patient_room', room_number: '102' },
  { floor: 'GF', name: 'Room 103', area_type: 'patient_room', room_number: '103' },
  { floor: 'GF', name: 'Room 104', area_type: 'patient_room', room_number: '104' },
  { floor: 'GF', name: 'Room 105', area_type: 'patient_room', room_number: '105' },
  { floor: 'GF', name: 'Room 106', area_type: 'patient_room', room_number: '106' },
  { floor: 'GF', name: 'Room 107', area_type: 'patient_room', room_number: '107' },
  { floor: 'GF', name: 'Room 108', area_type: 'patient_room', room_number: '108' },
  { floor: 'GF', name: 'Room 109A', area_type: 'patient_room', room_number: '109A' },
  { floor: 'GF', name: 'Room 109B', area_type: 'patient_room', room_number: '109B' },
  { floor: 'GF', name: 'Room 110A', area_type: 'patient_room', room_number: '110A' },
  { floor: 'GF', name: 'Room 110B', area_type: 'patient_room', room_number: '110B' },
  { floor: 'GF', name: 'ER Red Zone', area_type: 'er' },
  { floor: 'GF', name: 'ER Yellow Zone', area_type: 'er' },
  { floor: 'GF', name: 'ER Green Zone', area_type: 'er' },
  { floor: 'GF', name: 'Pharmacy', area_type: 'pharmacy' },
  { floor: 'GF', name: 'OPD Room 1', area_type: 'opd_room', room_number: 'OPD-1' },
  { floor: 'GF', name: 'OPD Room 2', area_type: 'opd_room', room_number: 'OPD-2' },
  { floor: 'GF', name: 'OPD Room 3', area_type: 'opd_room', room_number: 'OPD-3' },
  { floor: 'GF', name: 'OPD Room 4', area_type: 'opd_room', room_number: 'OPD-4' },
  { floor: 'GF', name: 'OPD Room 5', area_type: 'opd_room', room_number: 'OPD-5' },
  { floor: 'GF', name: 'OPD Room 6', area_type: 'opd_room', room_number: 'OPD-6' },
  { floor: 'GF', name: 'OPD Room 7', area_type: 'opd_room', room_number: 'OPD-7' },
  { floor: 'GF', name: 'OPD Waiting Area', area_type: 'opd_waiting' },
  { floor: 'GF', name: 'Reception / Lobby', area_type: 'reception' },
  { floor: 'GF', name: 'Main Entrance', area_type: 'entrance' },
  { floor: 'GF', name: 'ER Entrance', area_type: 'entrance' },
  { floor: 'GF', name: 'Ramp', area_type: 'ramp' },
  { floor: 'GF', name: 'GF Corridor', area_type: 'corridor' },
  { floor: 'GF', name: 'GF Common Washroom', area_type: 'washroom_common' },
  { floor: 'GF', name: 'GF Staff Washroom', area_type: 'washroom_staff' },
  { floor: 'GF', name: 'Admin Office', area_type: 'admin_office' },
  { floor: 'GF', name: 'Cafeteria', area_type: 'cafeteria' },
  { floor: 'GF', name: 'Kitchen / Pantry', area_type: 'kitchen' },
  { floor: 'GF', name: 'Billing Counter', area_type: 'billing' },

  // ── 1st Floor (1F) — PLACEHOLDER ──
  { floor: '1F', name: '1F Corridor', area_type: 'corridor' },
  { floor: '1F', name: '1F Nursing Station', area_type: 'nursing_station' },
  { floor: '1F', name: '1F Common Washroom', area_type: 'washroom_common' },
  { floor: '1F', name: '1F Staff Washroom', area_type: 'washroom_staff' },
  { floor: '1F', name: '1F Sluice Room', area_type: 'sluice' },

  // ── 2nd Floor (2F) — PLACEHOLDER ──
  { floor: '2F', name: 'Room 203', area_type: 'patient_room', room_number: '203' },
  { floor: '2F', name: 'Room 206', area_type: 'patient_room', room_number: '206' },
  { floor: '2F', name: 'Room 214 (Suite)', area_type: 'patient_room', room_number: '214' },
  { floor: '2F', name: 'Room 216', area_type: 'patient_room', room_number: '216' },
  { floor: '2F', name: '2F Corridor', area_type: 'corridor' },
  { floor: '2F', name: '2F Nursing Station', area_type: 'nursing_station' },
  { floor: '2F', name: '2F Common Washroom', area_type: 'washroom_common' },
  { floor: '2F', name: '2F Staff Washroom', area_type: 'washroom_staff' },
  { floor: '2F', name: '2F Sluice Room', area_type: 'sluice' },

  // ── 3rd Floor (3F) — OT + ICU ──
  { floor: '3F', name: 'OT 1', area_type: 'ot', room_number: 'OT-1' },
  { floor: '3F', name: 'OT 2', area_type: 'ot', room_number: 'OT-2' },
  { floor: '3F', name: 'OT 3', area_type: 'ot', room_number: 'OT-3' },
  { floor: '3F', name: 'OT Scrub Area', area_type: 'scrub_area' },
  { floor: '3F', name: 'OT Sluice Room', area_type: 'sluice' },
  { floor: '3F', name: 'Pre-Op / Post-Op', area_type: 'pre_post_op' },
  { floor: '3F', name: 'Recovery Room', area_type: 'recovery' },
  { floor: '3F', name: 'ICU Bed 1', area_type: 'icu', room_number: 'ICU-1' },
  { floor: '3F', name: 'ICU Bed 2', area_type: 'icu', room_number: 'ICU-2' },
  { floor: '3F', name: 'ICU Bed 3', area_type: 'icu', room_number: 'ICU-3' },
  { floor: '3F', name: 'ICU Bed 4', area_type: 'icu', room_number: 'ICU-4' },
  { floor: '3F', name: 'ICU Bed 5', area_type: 'icu', room_number: 'ICU-5' },
  { floor: '3F', name: 'ICU Bed 6', area_type: 'icu', room_number: 'ICU-6' },
  { floor: '3F', name: 'ICU Isolation Bed', area_type: 'icu', room_number: 'ICU-ISO' },
  { floor: '3F', name: 'Endoscopy Room', area_type: 'endoscopy' },
  { floor: '3F', name: '3F Corridor', area_type: 'corridor' },
  { floor: '3F', name: '3F Washroom', area_type: 'washroom_common' },

  // ── 4th Floor (4F) ──
  { floor: '4F', name: 'CSSD', area_type: 'cssd' },
  { floor: '4F', name: 'Lab', area_type: 'lab' },
  { floor: '4F', name: 'Store Room 1', area_type: 'store' },
  { floor: '4F', name: 'Store Room 2', area_type: 'store' },
  { floor: '4F', name: 'Admin Office 4F', area_type: 'admin_office' },
  { floor: '4F', name: '4F Corridor', area_type: 'corridor' },
  { floor: '4F', name: 'Staff Changing Room M', area_type: 'changing_room' },
  { floor: '4F', name: 'Staff Changing Room F', area_type: 'changing_room' },
  { floor: '4F', name: 'Duty Doctor Room 1', area_type: 'duty_room' },
  { floor: '4F', name: 'Duty Doctor Room 2', area_type: 'duty_room' },

  // ── Cross-floor ──
  { floor: 'ALL', name: 'Lift 1 (Passenger)', area_type: 'lift' },
  { floor: 'ALL', name: 'Lift 2 (Passenger)', area_type: 'lift' },
  { floor: 'ALL', name: 'Lift 3 (Patient)', area_type: 'lift' },
  { floor: 'ALL', name: 'Staircase Landing GF', area_type: 'staircase' },
  { floor: 'ALL', name: 'Staircase Landing 1F', area_type: 'staircase' },
  { floor: 'ALL', name: 'Staircase Landing 2F', area_type: 'staircase' },
  { floor: 'ALL', name: 'Staircase Landing 3F', area_type: 'staircase' },
  { floor: 'ALL', name: 'Staircase Landing 4F', area_type: 'staircase' },
  { floor: 'ALL', name: 'Parking Area', area_type: 'parking' },
];

// ═══════════════════════════════════════════════════════════════
// Task Templates (~60 templates from EHRC HK Daily Checklist)
// ═══════════════════════════════════════════════════════════════

export const SEED_TEMPLATES: TemplateSeed[] = [
  // ── Section A: Routine (per occupied patient room, per shift) ──
  { name: 'Floor wet-mopped', category: 'routine', area_type: 'patient_room', frequency: 'per_shift', shifts: ['AM', 'PM'], disinfectant: 'Satol 2', priority_weight: 50, checklist_ref: 'A1' },
  { name: 'Washroom cleaned (floor, commode, sink, mirror)', category: 'routine', area_type: 'patient_room', frequency: 'per_shift', shifts: ['AM', 'PM'], disinfectant: 'Satol 1/6', priority_weight: 50, checklist_ref: 'A2' },
  { name: 'Commode disinfected', category: 'routine', area_type: 'patient_room', frequency: 'per_shift', shifts: ['AM', 'PM'], disinfectant: '1% sodium hypochlorite', priority_weight: 45, checklist_ref: 'A3' },
  { name: 'Bedside locker wiped', category: 'routine', area_type: 'patient_room', frequency: 'per_shift', shifts: ['AM', 'PM'], disinfectant: '25% Bacillol', priority_weight: 55, checklist_ref: 'A4' },
  { name: 'Overbed table wiped', category: 'routine', area_type: 'patient_room', frequency: 'per_shift', shifts: ['AM', 'PM'], disinfectant: '25% Bacillol', priority_weight: 55, checklist_ref: 'A5' },
  { name: 'TV / telephone / call bell wiped', category: 'routine', area_type: 'patient_room', frequency: 'per_shift', shifts: ['AM', 'PM'], disinfectant: '25% Bacillol', priority_weight: 60, checklist_ref: 'A6' },
  { name: 'Dustbin emptied, new liner placed', category: 'routine', area_type: 'patient_room', frequency: 'per_shift', shifts: ['AM', 'PM'], priority_weight: 50, checklist_ref: 'A7' },
  { name: 'BMW bins checked (not >3/4 full)', category: 'bmw', area_type: 'patient_room', frequency: 'per_shift', shifts: ['AM', 'PM', 'NIGHT'], priority_weight: 40, checklist_ref: 'A8' },
  { name: 'Water dispenser functional on floor', category: 'common', area_type: 'corridor', frequency: 'daily', shifts: ['AM'], priority_weight: 45, checklist_ref: 'A9' },
  { name: 'Bedsheets/towels changed (if soiled or >24hrs)', category: 'linen', area_type: 'patient_room', frequency: 'daily', shifts: ['AM'], priority_weight: 40, checklist_ref: 'A10' },
  { name: 'Hand sanitizer dispenser checked/refilled', category: 'routine', area_type: 'patient_room', frequency: 'per_shift', shifts: ['AM', 'PM'], priority_weight: 45, checklist_ref: 'A11' },

  // ── Section B: Terminal clean (per event — not auto-generated) ──
  { name: 'Terminal: All linen stripped from bed', category: 'terminal', area_type: 'patient_room', frequency: 'per_event', shifts: ['AM', 'PM', 'NIGHT'], priority_weight: 5, checklist_ref: 'B1' },
  { name: 'Terminal: Mattress wiped with disinfectant', category: 'terminal', area_type: 'patient_room', frequency: 'per_event', shifts: ['AM', 'PM', 'NIGHT'], disinfectant: '25% Bacillol', priority_weight: 5, checklist_ref: 'B2' },
  { name: 'Terminal: Bed frame, rails, wheels wiped', category: 'terminal', area_type: 'patient_room', frequency: 'per_event', shifts: ['AM', 'PM', 'NIGHT'], disinfectant: '25% Bacillol', priority_weight: 5, checklist_ref: 'B3' },
  { name: 'Terminal: IV pole wiped', category: 'terminal', area_type: 'patient_room', frequency: 'per_event', shifts: ['AM', 'PM', 'NIGHT'], disinfectant: '25% Bacillol', priority_weight: 5, checklist_ref: 'B4' },
  { name: 'Terminal: Overbed table, bedside locker — all surfaces', category: 'terminal', area_type: 'patient_room', frequency: 'per_event', shifts: ['AM', 'PM', 'NIGHT'], disinfectant: '25% Bacillol', priority_weight: 5, checklist_ref: 'B5' },
  { name: 'Terminal: Call bell, switches, door handles wiped', category: 'terminal', area_type: 'patient_room', frequency: 'per_event', shifts: ['AM', 'PM', 'NIGHT'], disinfectant: '25% Bacillol', priority_weight: 5, checklist_ref: 'B6' },
  { name: 'Terminal: Washroom deep-cleaned', category: 'terminal', area_type: 'patient_room', frequency: 'per_event', shifts: ['AM', 'PM', 'NIGHT'], disinfectant: '1% hypochlorite', priority_weight: 5, checklist_ref: 'B7' },
  { name: 'Terminal: Floor wet-mopped with disinfectant (1m radius)', category: 'terminal', area_type: 'patient_room', frequency: 'per_event', shifts: ['AM', 'PM', 'NIGHT'], disinfectant: 'Virkon 1:10', priority_weight: 5, checklist_ref: 'B8' },
  { name: 'Terminal: Curtains changed, sent to laundry', category: 'terminal', area_type: 'patient_room', frequency: 'per_event', shifts: ['AM', 'PM', 'NIGHT'], priority_weight: 10, checklist_ref: 'B9' },
  { name: 'Terminal: All BMW bins emptied, fresh liners', category: 'terminal', area_type: 'patient_room', frequency: 'per_event', shifts: ['AM', 'PM', 'NIGHT'], priority_weight: 5, checklist_ref: 'B10' },
  { name: 'Terminal: Fresh linen placed', category: 'terminal', area_type: 'patient_room', frequency: 'per_event', shifts: ['AM', 'PM', 'NIGHT'], priority_weight: 5, checklist_ref: 'B11' },
  { name: 'Terminal: Room confirmed ready to nursing station', category: 'terminal', area_type: 'patient_room', frequency: 'per_event', shifts: ['AM', 'PM', 'NIGHT'], priority_weight: 5, checklist_ref: 'B12' },

  // ── Section C: ICU ──
  { name: 'ICU: Floor wet-mopped', category: 'icu', area_type: 'icu', frequency: 'per_shift', shifts: ['AM', 'PM', 'NIGHT'], disinfectant: 'Virkon 1:10', priority_weight: 30, checklist_ref: 'C1' },
  { name: 'ICU: Bed rails, monitors, IV pumps wiped', category: 'icu', area_type: 'icu', frequency: 'per_shift', shifts: ['AM', 'PM', 'NIGHT'], disinfectant: '25% Bacillol', priority_weight: 25, checklist_ref: 'C2' },
  { name: 'ICU: Suction apparatus exterior cleaned', category: 'icu', area_type: 'icu', frequency: 'per_shift', shifts: ['AM', 'PM', 'NIGHT'], disinfectant: '25% Bacillol', priority_weight: 35, checklist_ref: 'C3' },
  { name: 'ICU: Crash cart exterior wiped', category: 'icu', area_type: 'icu', frequency: 'daily', shifts: ['AM'], disinfectant: '25% Bacillol', priority_weight: 35, checklist_ref: 'C4' },
  { name: 'ICU: Door handles, light switches wiped', category: 'icu', area_type: 'icu', frequency: 'per_shift', shifts: ['AM', 'PM', 'NIGHT'], disinfectant: '25% Bacillol', priority_weight: 30, checklist_ref: 'C5' },
  { name: 'ICU: Sinks scrubbed', category: 'icu', area_type: 'icu', frequency: 'daily', shifts: ['AM'], disinfectant: 'Detergent', priority_weight: 40, checklist_ref: 'C6' },
  { name: 'ICU: BMW bins emptied', category: 'icu', area_type: 'icu', frequency: 'per_shift', shifts: ['AM', 'PM', 'NIGHT'], priority_weight: 25, checklist_ref: 'C7' },
  { name: 'ICU: Hand sanitizer dispensers full', category: 'icu', area_type: 'icu', frequency: 'per_shift', shifts: ['AM', 'PM', 'NIGHT'], priority_weight: 25, checklist_ref: 'C8' },
  { name: 'ICU: Isolation bed — separate mop/cloth used', category: 'icu', area_type: 'icu', frequency: 'per_shift', shifts: ['AM', 'PM', 'NIGHT'], disinfectant: 'Virkon 1:10', priority_weight: 20, checklist_ref: 'C9' },

  // ── Section D: OT ──
  { name: 'OT: Pre-first-case floors mopped', category: 'ot', area_type: 'ot', frequency: 'daily', shifts: ['AM'], disinfectant: 'Virkon 1:10', priority_weight: 20, checklist_ref: 'D1' },
  { name: 'OT: Tables, lights, surfaces damp-dusted', category: 'ot', area_type: 'ot', frequency: 'daily', shifts: ['AM'], priority_weight: 25, checklist_ref: 'D2' },
  { name: 'OT: Terminal clean (end of day)', category: 'ot', area_type: 'ot', frequency: 'daily', shifts: ['PM'], disinfectant: 'Virkon 1:10', priority_weight: 15, checklist_ref: 'D4' },
  { name: 'OT: Scrub area sinks cleaned', category: 'ot', area_type: 'scrub_area', frequency: 'daily', shifts: ['AM'], disinfectant: 'Detergent', priority_weight: 35, checklist_ref: 'D5' },
  { name: 'OT: Sluice room cleaned', category: 'ot', area_type: 'sluice', frequency: 'daily', shifts: ['PM'], priority_weight: 40, checklist_ref: 'D7' },
  { name: 'OT: BMW bins emptied', category: 'ot', area_type: 'ot', frequency: 'per_shift', shifts: ['AM', 'PM'], priority_weight: 25, checklist_ref: 'D8' },
  { name: 'OT: PPE compliance (cap, mask, shoe covers)', category: 'ppe', area_type: 'ot', frequency: 'per_shift', shifts: ['AM', 'PM'], priority_weight: 20, checklist_ref: 'D9' },

  // ── Section E: ER ──
  { name: 'ER: Floor wet-mopped', category: 'er', area_type: 'er', frequency: 'per_shift', shifts: ['AM', 'PM', 'NIGHT'], disinfectant: 'Virkon 1:10', priority_weight: 30, checklist_ref: 'E1' },
  { name: 'ER: Trolley/bed surfaces wiped', category: 'er', area_type: 'er', frequency: 'per_shift', shifts: ['AM', 'PM', 'NIGHT'], disinfectant: '25% Bacillol', priority_weight: 30, checklist_ref: 'E2' },
  { name: 'ER: BMW bins emptied', category: 'er', area_type: 'er', frequency: 'per_shift', shifts: ['AM', 'PM', 'NIGHT'], priority_weight: 25, checklist_ref: 'E3' },

  // ── Section F: OPD ──
  { name: 'OPD: Consultation room cleaned', category: 'opd', area_type: 'opd_room', frequency: 'daily', shifts: ['AM'], disinfectant: 'Satol 2', priority_weight: 50, checklist_ref: 'F1' },
  { name: 'OPD: Waiting area cleaned', category: 'opd', area_type: 'opd_waiting', frequency: 'per_shift', shifts: ['AM', 'PM'], priority_weight: 50, checklist_ref: 'F2' },

  // ── Section G: Common areas ──
  { name: 'Corridor: Floor mopped', category: 'common', area_type: 'corridor', frequency: 'per_shift', shifts: ['AM', 'PM'], disinfectant: 'Satol 2', priority_weight: 55, checklist_ref: 'G1' },
  { name: 'Nursing station: Surfaces wiped', category: 'common', area_type: 'nursing_station', frequency: 'per_shift', shifts: ['AM', 'PM'], disinfectant: '25% Bacillol', priority_weight: 45, checklist_ref: 'G2' },
  { name: 'Lift cabin: Floor mopped, buttons wiped', category: 'common', area_type: 'lift', frequency: 'per_shift', shifts: ['AM', 'PM'], priority_weight: 50, checklist_ref: 'G3' },
  { name: 'Staircase: Swept and mopped', category: 'common', area_type: 'staircase', frequency: 'daily', shifts: ['AM'], priority_weight: 60, checklist_ref: 'G4' },

  // ── Section H: Washrooms ──
  { name: 'Common washroom: Full clean', category: 'washroom', area_type: 'washroom_common', frequency: 'per_shift', shifts: ['AM', 'PM', 'NIGHT'], disinfectant: '1% hypochlorite', priority_weight: 40, checklist_ref: 'H1' },
  { name: 'Staff washroom: Full clean', category: 'washroom', area_type: 'washroom_staff', frequency: 'per_shift', shifts: ['AM', 'PM'], disinfectant: '1% hypochlorite', priority_weight: 45, checklist_ref: 'H2' },

  // ── Section J: BMW ──
  { name: 'BMW: Central collection from all floors', category: 'bmw', area_type: 'sluice', frequency: 'per_shift', shifts: ['AM', 'PM', 'NIGHT'], priority_weight: 30, checklist_ref: 'J1' },

  // ── Section L: Kitchen/Cafeteria ──
  { name: 'Cafeteria: Tables and floor cleaned', category: 'kitchen', area_type: 'cafeteria', frequency: 'per_shift', shifts: ['AM', 'PM'], priority_weight: 50, checklist_ref: 'L1' },
  { name: 'Kitchen: Floor mopped, counters wiped', category: 'kitchen', area_type: 'kitchen', frequency: 'per_shift', shifts: ['AM', 'PM'], priority_weight: 45, checklist_ref: 'L2' },

  // ── Section W: Weekly (Sunday AM only) ──
  { name: 'Weekly: Deep clean under/behind beds', category: 'weekly', area_type: 'patient_room', frequency: 'weekly', shifts: ['AM'], priority_weight: 60, checklist_ref: 'W1' },
  { name: 'Weekly: AC vents/grills dusted', category: 'weekly', area_type: 'patient_room', frequency: 'weekly', shifts: ['AM'], priority_weight: 65, checklist_ref: 'W2' },
  { name: 'Weekly: High dusting — corners, ceiling cobwebs', category: 'weekly', area_type: 'corridor', frequency: 'weekly', shifts: ['AM'], priority_weight: 65, checklist_ref: 'W3' },
  { name: 'Weekly: Curtains in critical areas sent for laundry', category: 'weekly', area_type: 'icu', frequency: 'weekly', shifts: ['AM'], priority_weight: 60, checklist_ref: 'W4' },
  { name: 'Weekly: Drain traps flushed with disinfectant', category: 'weekly', area_type: 'washroom_common', frequency: 'weekly', shifts: ['AM'], priority_weight: 55, checklist_ref: 'W5' },
  { name: 'Weekly: OT deep clean (walls, ceiling, vents)', category: 'weekly', area_type: 'ot', frequency: 'weekly', shifts: ['AM'], priority_weight: 50, checklist_ref: 'W6' },
  { name: 'Weekly: Mop heads sent for hot-water laundry', category: 'weekly', area_type: 'sluice', frequency: 'weekly', shifts: ['AM'], priority_weight: 55, checklist_ref: 'W7' },
  { name: 'Weekly: Pest control check — signs reported', category: 'weekly', area_type: 'corridor', frequency: 'weekly', shifts: ['AM'], priority_weight: 60, checklist_ref: 'W8' },
];

// ═══════════════════════════════════════════════════════════════
// Sewa -> HK Task Mappings
// ═══════════════════════════════════════════════════════════════

export const SEED_SEWA_MAPPINGS: SewaMappingSeed[] = [
  { sewa_complaint_type_id: 'fac-hk01', sewa_complaint_name: 'Room not cleaned', hk_category: 'routine', auto_create_task: true, default_priority: 10 },
  { sewa_complaint_type_id: 'fac-hk02', sewa_complaint_name: 'Washroom dirty', hk_category: 'washroom', auto_create_task: true, default_priority: 10 },
  { sewa_complaint_type_id: 'fac-hk03', sewa_complaint_name: 'Waste not cleared', hk_category: 'bmw', auto_create_task: true, default_priority: 10 },
  { sewa_complaint_type_id: 'fac-hk04', sewa_complaint_name: 'Linen / bedsheet change needed', hk_category: 'routine', auto_create_task: true, default_priority: 10 },
  { sewa_complaint_type_id: 'fac-hk05', sewa_complaint_name: 'Spill / wet floor cleanup', hk_category: 'routine', auto_create_task: true, default_priority: 5 },
  { sewa_complaint_type_id: 'fac-hk06', sewa_complaint_name: 'Common area needs cleaning', hk_category: 'routine', auto_create_task: true, default_priority: 15 },
];
