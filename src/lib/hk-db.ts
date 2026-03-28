// src/lib/hk-db.ts
// SanitizeTrack — Database query helpers (raw SQL via @vercel/postgres)

import { sql } from '@vercel/postgres';
import {
  HKAreaRow, HKTaskTemplateRow, HKShiftRow, HKShiftTaskRow,
  HKSewaMappingRow, ShiftSummary, FloorHeatmapCell, getCurrentShiftType, getTodayIST,
} from './hk-types';

// ═══════════════════════════════════════════════════════════════
// Shift helpers
// ═══════════════════════════════════════════════════════════════

export async function getOrCreateShift(date: string, shiftType: string): Promise<HKShiftRow> {
  // Try to find existing
  const existing = await sql`
    SELECT * FROM hk_shifts WHERE date = ${date} AND shift_type = ${shiftType}
  `;
  if (existing.rows.length > 0) return existing.rows[0] as HKShiftRow;

  // Create new
  const created = await sql`
    INSERT INTO hk_shifts (date, shift_type)
    VALUES (${date}, ${shiftType})
    ON CONFLICT (date, shift_type) DO UPDATE SET date = EXCLUDED.date
    RETURNING *
  `;
  return created.rows[0] as HKShiftRow;
}

export async function getCurrentShift(): Promise<HKShiftRow | null> {
  const date = getTodayIST();
  const shiftType = getCurrentShiftType();
  const result = await sql`
    SELECT * FROM hk_shifts WHERE date = ${date} AND shift_type = ${shiftType}
  `;
  return result.rows.length > 0 ? (result.rows[0] as HKShiftRow) : null;
}

export async function updateShiftMeta(
  shiftId: number,
  supervisorName: string,
  staffCount: number,
  maleCount: number,
  femaleCount: number,
  ipCensus: number
): Promise<HKShiftRow> {
  const result = await sql`
    UPDATE hk_shifts
    SET supervisor_name = ${supervisorName},
        staff_count = ${staffCount},
        male_count = ${maleCount},
        female_count = ${femaleCount},
        ip_census = ${ipCensus}
    WHERE id = ${shiftId}
    RETURNING *
  `;
  return result.rows[0] as HKShiftRow;
}

export async function endShift(shiftId: number): Promise<void> {
  await sql`UPDATE hk_shifts SET completed_at = NOW() WHERE id = ${shiftId}`;
}

export async function getPreviousShift(date: string, shiftType: string): Promise<HKShiftRow | null> {
  // Determine previous shift
  let prevDate = date;
  let prevType: string;
  if (shiftType === 'AM') { prevType = 'NIGHT'; prevDate = getPreviousDate(date); }
  else if (shiftType === 'PM') { prevType = 'AM'; }
  else { prevType = 'PM'; }

  const result = await sql`
    SELECT * FROM hk_shifts WHERE date = ${prevDate} AND shift_type = ${prevType!}
  `;
  return result.rows.length > 0 ? (result.rows[0] as HKShiftRow) : null;
}

function getPreviousDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
}

// ═══════════════════════════════════════════════════════════════
// Task queries
// ═══════════════════════════════════════════════════════════════

export async function getShiftTasks(shiftId: number, floor?: string, status?: string): Promise<HKShiftTaskRow[]> {
  let query = 'SELECT * FROM hk_shift_tasks WHERE shift_id = $1';
  const params: (string | number)[] = [shiftId];

  if (floor) {
    params.push(floor);
    query += ` AND floor = $${params.length}`;
  }
  if (status) {
    params.push(status);
    query += ` AND status = $${params.length}`;
  }

  query += ' ORDER BY priority ASC, area_name ASC, task_name ASC';
  const result = await sql.query(query, params);
  return result.rows as HKShiftTaskRow[];
}

export async function completeTask(taskId: number, completedBy: string): Promise<HKShiftTaskRow> {
  const result = await sql`
    UPDATE hk_shift_tasks
    SET status = 'done', completed_at = NOW(), completed_by = ${completedBy}
    WHERE id = ${taskId}
    RETURNING *
  `;
  return result.rows[0] as HKShiftTaskRow;
}

export async function completeRoomTasks(areaId: number, shiftId: number, completedBy: string): Promise<number> {
  const result = await sql`
    UPDATE hk_shift_tasks
    SET status = 'done', completed_at = NOW(), completed_by = ${completedBy}
    WHERE area_id = ${areaId} AND shift_id = ${shiftId} AND status = 'pending'
  `;
  return result.rowCount || 0;
}

export async function skipTask(taskId: number, reason: string): Promise<HKShiftTaskRow> {
  const result = await sql`
    UPDATE hk_shift_tasks
    SET status = 'skipped', skip_reason = ${reason}
    WHERE id = ${taskId}
    RETURNING *
  `;
  return result.rows[0] as HKShiftTaskRow;
}

export async function addManualTask(
  shiftId: number, areaId: number, taskName: string, category: string, priority: number
): Promise<HKShiftTaskRow> {
  // Get area info for denormalization
  const area = await sql`SELECT * FROM hk_areas WHERE id = ${areaId}`;
  if (area.rows.length === 0) throw new Error('Area not found: ' + areaId);
  const a = area.rows[0] as HKAreaRow;

  const result = await sql`
    INSERT INTO hk_shift_tasks (shift_id, area_id, task_name, task_category, floor, area_name, source, priority)
    VALUES (${shiftId}, ${areaId}, ${taskName}, ${category}, ${a.floor}, ${a.name}, 'manual', ${priority})
    RETURNING *
  `;
  return result.rows[0] as HKShiftTaskRow;
}

// ═══════════════════════════════════════════════════════════════
// Dashboard / summary queries
// ═══════════════════════════════════════════════════════════════

export async function getShiftSummary(shiftId: number): Promise<ShiftSummary | null> {
  const shift = await sql`SELECT * FROM hk_shifts WHERE id = ${shiftId}`;
  if (shift.rows.length === 0) return null;
  const s = shift.rows[0] as HKShiftRow;

  const counts = await sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'done') as done,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
      COUNT(*) FILTER (WHERE source = 'carryover' AND status = 'pending') as overdue
    FROM hk_shift_tasks WHERE shift_id = ${shiftId}
  `;
  const c = counts.rows[0];
  const total = Number(c.total);

  return {
    shiftId: s.id,
    date: s.date,
    shiftType: s.shift_type,
    supervisorName: s.supervisor_name,
    staffCount: s.staff_count,
    maleCount: s.male_count,
    femaleCount: s.female_count,
    ipCensus: s.ip_census,
    totalTasks: total,
    doneTasks: Number(c.done),
    pendingTasks: Number(c.pending),
    skippedTasks: Number(c.skipped),
    overdueTasks: Number(c.overdue),
    completionPct: total > 0 ? Math.round((Number(c.done) / total) * 100) : 0,
  };
}

export async function getFloorHeatmap(shiftId: number): Promise<FloorHeatmapCell[]> {
  const result = await sql`
    SELECT
      t.floor,
      a.area_type,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE t.status = 'done') as done
    FROM hk_shift_tasks t
    JOIN hk_areas a ON a.id = t.area_id
    WHERE t.shift_id = ${shiftId}
    GROUP BY t.floor, a.area_type
    ORDER BY t.floor, a.area_type
  `;
  return result.rows.map(r => ({
    floor: r.floor,
    areaType: r.area_type,
    total: Number(r.total),
    done: Number(r.done),
    pct: Number(r.total) > 0 ? Math.round((Number(r.done) / Number(r.total)) * 100) : 0,
  }));
}

export async function getOverdueItems(shiftId: number): Promise<HKShiftTaskRow[]> {
  const result = await sql`
    SELECT * FROM hk_shift_tasks
    WHERE shift_id = ${shiftId}
    AND (source = 'carryover' OR source = 'sewa' OR status = 'skipped')
    AND status != 'done'
    ORDER BY priority ASC, created_at ASC
  `;
  return result.rows as HKShiftTaskRow[];
}

// ═══════════════════════════════════════════════════════════════
// Shift history
// ═══════════════════════════════════════════════════════════════

export async function getShiftHistory(days: number = 7): Promise<ShiftSummary[]> {
  const result = await sql`
    SELECT s.id,
      s.date, s.shift_type, s.supervisor_name, s.staff_count, s.male_count, s.female_count, s.ip_census,
      COUNT(t.id) as total,
      COUNT(t.id) FILTER (WHERE t.status = 'done') as done,
      COUNT(t.id) FILTER (WHERE t.status = 'pending') as pending,
      COUNT(t.id) FILTER (WHERE t.status = 'skipped') as skipped,
      COUNT(t.id) FILTER (WHERE t.source = 'carryover' AND t.status = 'pending') as overdue
    FROM hk_shifts s
    LEFT JOIN hk_shift_tasks t ON t.shift_id = s.id
    WHERE s.date >= (CURRENT_DATE - ${days}::integer)::text
    GROUP BY s.id
    ORDER BY s.date DESC, CASE s.shift_type WHEN 'NIGHT' THEN 1 WHEN 'PM' THEN 2 WHEN 'AM' THEN 3 END
  `;
  return result.rows.map(r => {
    const total = Number(r.total);
    return {
      shiftId: r.id, date: r.date, shiftType: r.shift_type,
      supervisorName: r.supervisor_name, staffCount: r.staff_count,
      maleCount: r.male_count, femaleCount: r.female_count, ipCensus: r.ip_census,
      totalTasks: total, doneTasks: Number(r.done), pendingTasks: Number(r.pending),
      skippedTasks: Number(r.skipped), overdueTasks: Number(r.overdue),
      completionPct: total > 0 ? Math.round((Number(r.done) / total) * 100) : 0,
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// Area + Template admin queries
// ═══════════════════════════════════════════════════════════════

export async function getAreas(floor?: string, areaType?: string, activeOnly?: boolean): Promise<HKAreaRow[]> {
  let query = 'SELECT * FROM hk_areas WHERE 1=1';
  const params: string[] = [];
  if (floor) { params.push(floor); query += ` AND floor = $${params.length}`; }
  if (areaType) { params.push(areaType); query += ` AND area_type = $${params.length}`; }
  if (activeOnly !== false) { query += ' AND active = TRUE'; }
  query += ' ORDER BY floor, name';
  const result = await sql.query(query, params);
  return result.rows as HKAreaRow[];
}

export async function getTemplates(category?: string, activeOnly?: boolean): Promise<HKTaskTemplateRow[]> {
  let query = 'SELECT * FROM hk_task_templates WHERE 1=1';
  const params: string[] = [];
  if (category) { params.push(category); query += ` AND category = $${params.length}`; }
  if (activeOnly !== false) { query += ' AND active = TRUE'; }
  query += ' ORDER BY priority_weight ASC, name ASC';
  const result = await sql.query(query, params);
  return result.rows as HKTaskTemplateRow[];
}

export async function getSewaMappings(): Promise<HKSewaMappingRow[]> {
  const result = await sql`SELECT * FROM hk_sewa_mappings ORDER BY sewa_complaint_type_id`;
  return result.rows as HKSewaMappingRow[];
}
