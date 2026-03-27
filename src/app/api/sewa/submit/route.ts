import { sql } from '@vercel/postgres';
import { notifyDeptHead, buildNewComplaintMessage } from '@/lib/whatsapp';
import { getDepartment } from '@/lib/sewa-config';

interface SubmitBody {
  requestorName: string;
  requestorDept: string;
  requestorEmpId?: string;
  targetDept: string;
  complaintTypeId: string;
  complaintTypeName: string;
  subMenu?: string;
  priority: 'normal' | 'urgent';
  location?: string;
  description: string;
  patientName?: string;
  patientUhid?: string;
  extraFields?: Record<string, string | number>;
  responseSlaMin: number;
  resolutionSlaMin: number;
}

export async function POST(request: Request) {
  try {
    const body: SubmitBody = await request.json();

    // Validate required fields
    if (!body.requestorName || !body.requestorDept || !body.targetDept ||
        !body.complaintTypeId || !body.complaintTypeName || !body.description) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Generate next ID atomically
    const counterResult = await sql`
      UPDATE sewa_id_counter
      SET counter = counter + 1
      WHERE id = 'global'
      RETURNING counter;
    `;
    const seqNum = counterResult.rows[0].counter;
    const requestId = `SEW-${String(seqNum).padStart(4, '0')}`;

    // Insert the complaint
    await sql`
      INSERT INTO sewa_requests (
        id, requestor_name, requestor_dept, requestor_emp_id,
        target_dept, complaint_type_id, complaint_type_name, sub_menu,
        priority, status, location, description,
        patient_name, patient_uhid, extra_fields,
        response_sla_min, resolution_sla_min,
        created_at, escalation_level, comments
      ) VALUES (
        ${requestId},
        ${body.requestorName},
        ${body.requestorDept},
        ${body.requestorEmpId || null},
        ${body.targetDept},
        ${body.complaintTypeId},
        ${body.complaintTypeName},
        ${body.subMenu || null},
        ${body.priority},
        'NEW',
        ${body.location || null},
        ${body.description},
        ${body.patientName || null},
        ${body.patientUhid || null},
        ${JSON.stringify(body.extraFields || {})}::jsonb,
        ${body.responseSlaMin},
        ${body.resolutionSlaMin},
        NOW(),
        0,
        '[]'::jsonb
      );
    `;

    // Upsert user for quick lookup
    await sql`
      INSERT INTO sewa_users (name, department, employee_id)
      VALUES (${body.requestorName}, ${body.requestorDept}, ${body.requestorEmpId || null})
      ON CONFLICT DO NOTHING;
    `;

    // Fire-and-forget WhatsApp notification for new complaint
    const deptConfig = getDepartment(body.targetDept);
    const msg = buildNewComplaintMessage(
      body.complaintTypeName,
      deptConfig?.name || body.targetDept,
      body.description,
      body.requestorName,
      body.requestorDept,
      body.priority,
      requestId
    );
    notifyDeptHead(body.targetDept, msg).catch(err =>
      console.error('[WhatsApp] New complaint notification failed:', err)
    );

    return Response.json({ success: true, id: requestId });
  } catch (error) {
    console.error('Sewa submit error:', error);
    return Response.json(
      { error: 'Failed to submit complaint', details: String(error) },
      { status: 500 }
    );
  }
}
