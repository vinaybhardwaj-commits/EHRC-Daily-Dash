import { sql } from '@vercel/postgres';

/**
 * GET /api/sewa/requests
 * Query params:
 *   - requestor: filter by requestor name (for "My Complaints")
 *   - dept: filter by target department slug (for responder queue)
 *   - status: filter by status (NEW, ACKNOWLEDGED, IN_PROGRESS, RESOLVED)
 *   - since: ISO date string, only return requests created after this date
 *   - limit: max results (default 100)
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestor = url.searchParams.get('requestor');
    const dept = url.searchParams.get('dept');
    const status = url.searchParams.get('status');
    const since = url.searchParams.get('since');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);

    // Build dynamic query with conditions
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (requestor) {
      conditions.push(`requestor_name = $${paramIdx++}`);
      params.push(requestor);
    }
    if (dept) {
      conditions.push(`target_dept = $${paramIdx++}`);
      params.push(dept);
    }
    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }
    if (since) {
      conditions.push(`created_at >= $${paramIdx++}::timestamptz`);
      params.push(since);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT * FROM sewa_requests ${where} ORDER BY created_at DESC LIMIT $${paramIdx}`;
    params.push(limit);

    const result = await sql.query(query, params);

    // Map snake_case to camelCase for frontend
    const requests = result.rows.map(row => ({
      id: row.id,
      requestorName: row.requestor_name,
      requestorDept: row.requestor_dept,
      requestorEmpId: row.requestor_emp_id,
      targetDept: row.target_dept,
      complaintTypeId: row.complaint_type_id,
      complaintTypeName: row.complaint_type_name,
      subMenu: row.sub_menu,
      priority: row.priority,
      status: row.status,
      location: row.location,
      description: row.description,
      patientName: row.patient_name,
      patientUhid: row.patient_uhid,
      extraFields: row.extra_fields || {},
      responseSlaMin: row.response_sla_min,
      resolutionSlaMin: row.resolution_sla_min,
      createdAt: row.created_at,
      acknowledgedAt: row.acknowledged_at,
      resolvedAt: row.resolved_at,
      acknowledgedBy: row.acknowledged_by,
      resolvedBy: row.resolved_by,
      escalationLevel: row.escalation_level,
      comments: row.comments || [],
    }));

    return Response.json({ requests, count: requests.length });
  } catch (error) {
    console.error('Sewa requests query error:', error);
    return Response.json(
      { error: 'Failed to fetch requests', details: String(error) },
      { status: 500 }
    );
  }
}
