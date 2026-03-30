// src/lib/hk-engine.ts
// SanitizeTrack — Task generation engine
// Runs at shift start: generates scheduled tasks, pulls Sewa requests, carries over incomplete work

import { sql } from '@vercel/postgres';
import { HKShiftRow, HKTaskTemplateRow, HKAreaRow, ShiftType } from './hk-types';
import { getOrCreateShift, getPreviousShift } from './hk-db';

interface GenerateResult {
  shiftId: number;
  scheduled: number;
  sewa: number;
  carryover: number;
  total: number;
  alreadyGenerated: boolean;
}

export async function generateShift(date: string, shiftType: ShiftType): Promise<GenerateResult> {
  // Step 1: Get or create shift row
  const shift = await getOrCreateShift(date, shiftType);

  // Check if tasks already generated for this shift
  const existingTasks = await sql`
    SELECT COUNT(*) as count FROM hk_shift_tasks
    WHERE shift_id = ${shift.id} AND source = 'scheduled'
  `;
  if (Number(existingTasks.rows[0].count) > 0) {
    // Already generated — just count and return
    const totalCount = await sql`SELECT COUNT(*) as count FROM hk_shift_tasks WHERE shift_id = ${shift.id}`;
    return {
      shiftId: shift.id,
      scheduled: Number(existingTasks.rows[0].count),
      sewa: 0,
      carryover: 0,
      total: Number(totalCount.rows[0].count),
      alreadyGenerated: true,
    };
  }

  let scheduledCount = 0;
  let sewaCount = 0;
  let carryoverCount = 0;

  // Step 2: Generate scheduled tasks from templates
  const templates = await getApplicableTemplates(shiftType, date);
  const activeAreas = await sql`SELECT * FROM hk_areas WHERE active = TRUE`;
  const areaMap = new Map<number, HKAreaRow>();
  const areasByType = new Map<string, HKAreaRow[]>();

  for (const row of activeAreas.rows) {
    const area = row as HKAreaRow;
    areaMap.set(area.id, area);
    if (!areasByType.has(area.area_type)) areasByType.set(area.area_type, []);
    areasByType.get(area.area_type)!.push(area);
  }

  // Collect all task rows first, then batch INSERT (avoids 100+ individual round-trips)
  const taskRows: { templateId: number; areaId: number; taskName: string; taskCategory: string; disinfectant: string | null; floor: string; areaName: string; priority: number }[] = [];

  for (const template of templates) {
    const areas: HKAreaRow[] = [];

    if (template.area_id) {
      const area = areaMap.get(template.area_id);
      if (area) areas.push(area);
    } else if (template.area_type) {
      const matching = areasByType.get(template.area_type) || [];
      areas.push(...matching);
    }

    for (const area of areas) {
      taskRows.push({
        templateId: template.id,
        areaId: area.id,
        taskName: template.name,
        taskCategory: template.category,
        disinfectant: template.disinfectant || null,
        floor: area.floor,
        areaName: area.name,
        priority: template.priority_weight,
      });
    }
  }

  // Batch insert in chunks of 50 rows (Postgres param limit is ~65535, 10 params per row = safe at 50)
  const BATCH_SIZE = 50;
  for (let i = 0; i < taskRows.length; i += BATCH_SIZE) {
    const batch = taskRows.slice(i, i + BATCH_SIZE);
    const params: (string | number | null)[] = [];
    const valueClauses: string[] = [];

    for (const row of batch) {
      const offset = params.length;
      params.push(shift.id, row.templateId, row.areaId, row.taskName, row.taskCategory, row.disinfectant, row.floor, row.areaName, 'scheduled', row.priority);
      valueClauses.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`);
    }

    await sql.query(
      `INSERT INTO hk_shift_tasks (shift_id, template_id, area_id, task_name, task_category, disinfectant, floor, area_name, source, priority) VALUES ${valueClauses.join(', ')}`,
      params
    );
  }
  scheduledCount = taskRows.length;

  // Step 3: Pull unresolved Sewa HK requests
  sewaCount = await pullSewaRequests(shift.id);

  // Step 4: Carry over incomplete tasks from previous shift
  carryoverCount = await carryOverTasks(shift, date, shiftType);

  return {
    shiftId: shift.id,
    scheduled: scheduledCount,
    sewa: sewaCount,
    carryover: carryoverCount,
    total: scheduledCount + sewaCount + carryoverCount,
    alreadyGenerated: false,
  };
}

async function getApplicableTemplates(shiftType: ShiftType, date: string): Promise<HKTaskTemplateRow[]> {
  const dayOfWeek = new Date(date + 'T00:00:00Z').getUTCDay(); // 0 = Sunday
  const isWeeklyDay = dayOfWeek === 0; // Sunday

  // Get all active templates where this shift is in the shifts array
  const result = await sql`
    SELECT * FROM hk_task_templates
    WHERE active = TRUE
    AND ${shiftType} = ANY(shifts)
  `;

  return (result.rows as HKTaskTemplateRow[]).filter(t => {
    // Filter by frequency rules
    if (t.frequency === 'per_event') return false; // Never auto-generated
    if (t.frequency === 'per_shift') return true;
    if (t.frequency === 'twice_daily') return shiftType === 'AM' || shiftType === 'PM';
    if (t.frequency === 'daily') return shiftType === 'AM';
    if (t.frequency === 'weekly') return isWeeklyDay && shiftType === 'AM';
    return false;
  });
}

export async function pullSewaRequests(shiftId: number): Promise<number> {
  // Find HK Sewa requests not yet linked to any HK task
  const sewaRequests = await sql`
    SELECT sr.id, sr.complaint_type_id, sr.complaint_type_name, sr.location, sr.description,
           sr.extra_fields, sr.created_at,
           m.hk_category, m.default_priority
    FROM sewa_requests sr
    JOIN hk_sewa_mappings m ON sr.complaint_type_id = m.sewa_complaint_type_id
    WHERE sr.status IN ('NEW', 'ACKNOWLEDGED', 'IN_PROGRESS')
    AND m.auto_create_task = TRUE
    AND sr.id NOT IN (SELECT sewa_request_id FROM hk_shift_tasks WHERE sewa_request_id IS NOT NULL)
  `;

  let count = 0;
  for (const sr of sewaRequests.rows) {
    // Try to resolve area from location or extra_fields
    const areaId = await resolveAreaFromSewa(sr.location, sr.extra_fields);
    if (!areaId) continue; // Can't determine area, skip

    const area = await sql`SELECT * FROM hk_areas WHERE id = ${areaId}`;
    if (area.rows.length === 0) continue;
    const a = area.rows[0] as HKAreaRow;

    const taskName = sr.complaint_type_name || 'Sewa request';

    await sql`
      INSERT INTO hk_shift_tasks
        (shift_id, area_id, task_name, task_category, floor, area_name, source, sewa_request_id, priority)
      VALUES
        (${shiftId}, ${areaId}, ${taskName}, ${sr.hk_category}, ${a.floor}, ${a.name},
         'sewa', ${sr.id}, ${sr.default_priority})
    `;
    count++;
  }
  return count;
}

async function resolveAreaFromSewa(location: string | null, extraFields: Record<string, unknown> | null): Promise<number | null> {
  // Try to match by room number from extra_fields
  const room = extraFields?.room || extraFields?.roomNumber;
  if (room) {
    const result = await sql`
      SELECT id FROM hk_areas WHERE room_number = ${String(room)} AND active = TRUE LIMIT 1
    `;
    if (result.rows.length > 0) return result.rows[0].id;
  }

  // Try to match by location text (fuzzy — check if location contains area name)
  if (location) {
    const result = await sql`
      SELECT id FROM hk_areas WHERE LOWER(name) = LOWER(${location}) AND active = TRUE LIMIT 1
    `;
    if (result.rows.length > 0) return result.rows[0].id;

    // Try partial match
    const partial = await sql`
      SELECT id FROM hk_areas
      WHERE active = TRUE AND (LOWER(name) LIKE LOWER(${'%' + location + '%'}) OR LOWER(${location}) LIKE LOWER('%' || name || '%'))
      LIMIT 1
    `;
    if (partial.rows.length > 0) return partial.rows[0].id;
  }

  // Fallback: return first GF corridor as generic area
  const fallback = await sql`
    SELECT id FROM hk_areas WHERE area_type = 'corridor' AND floor = 'GF' AND active = TRUE LIMIT 1
  `;
  return fallback.rows.length > 0 ? fallback.rows[0].id : null;
}

async function carryOverTasks(currentShift: HKShiftRow, date: string, shiftType: ShiftType): Promise<number> {
  const prevShift = await getPreviousShift(date, shiftType);
  if (!prevShift) return 0;

  // Get all pending tasks from previous shift
  const pendingTasks = await sql`
    SELECT * FROM hk_shift_tasks
    WHERE shift_id = ${prevShift.id} AND status = 'pending'
  `;

  if (pendingTasks.rows.length === 0) return 0;

  // Batch insert carryover tasks
  const params: (string | number | null)[] = [];
  const valueClauses: string[] = [];
  const taskIds: number[] = [];

  for (const task of pendingTasks.rows) {
    const offset = params.length;
    params.push(
      currentShift.id, task.template_id, task.area_id, task.task_name,
      task.task_category, task.disinfectant, task.floor, task.area_name,
      'carryover', task.sewa_request_id, task.id, 1
    );
    valueClauses.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12})`);
    taskIds.push(task.id);
  }

  await sql.query(
    `INSERT INTO hk_shift_tasks (shift_id, template_id, area_id, task_name, task_category, disinfectant, floor, area_name, source, sewa_request_id, carryover_from_id, priority) VALUES ${valueClauses.join(', ')}`,
    params
  );

  // Mark all originals as skipped in one query
  await sql.query(
    `UPDATE hk_shift_tasks SET status = 'skipped', skip_reason = 'Carried over to next shift' WHERE id = ANY($1::int[])`,
    [taskIds]
  );

  return pendingTasks.rows.length;
}
