import { sql } from '@vercel/postgres';

interface UpdateBody {
  requestId: string;
  action: 'acknowledge' | 'resolve' | 'in_progress' | 'blocked' | 'unblock';
  responderName: string;
  comment: string;
  blockingDept?: string;
}

export async function POST(request: Request) {
  try {
    const body: UpdateBody = await request.json();

    if (!body.requestId || !body.action || !body.responderName) {
      return Response.json({ error: 'Missing requestId, action, or responderName' }, { status: 400 });
    }

    // Comment is required for all actions now
    if (!body.comment || !body.comment.trim()) {
      return Response.json({ error: 'A comment/explanation is required for all actions' }, { status: 400 });
    }

    const now = new Date().toISOString();

    if (body.action === 'acknowledge') {
      await sql`
        UPDATE sewa_requests
        SET status = 'ACKNOWLEDGED',
            acknowledged_at = ${now}::timestamptz,
            acknowledged_by = ${body.responderName}
        WHERE id = ${body.requestId}
          AND status = 'NEW';
      `;
    } else if (body.action === 'in_progress') {
      await sql`
        UPDATE sewa_requests
        SET status = 'IN_PROGRESS',
            blocked_at = NULL,
            blocking_dept = NULL,
            blocked_reason = NULL
        WHERE id = ${body.requestId}
          AND status IN ('NEW', 'ACKNOWLEDGED', 'BLOCKED');
      `;
    } else if (body.action === 'blocked') {
      await sql`
        UPDATE sewa_requests
        SET status = 'BLOCKED',
            blocked_at = ${now}::timestamptz,
            blocking_dept = ${body.blockingDept || null},
            blocked_reason = ${body.comment}
        WHERE id = ${body.requestId}
          AND status IN ('NEW', 'ACKNOWLEDGED', 'IN_PROGRESS');
      `;
    } else if (body.action === 'unblock') {
      await sql`
        UPDATE sewa_requests
        SET status = 'IN_PROGRESS',
            blocked_at = NULL,
            blocking_dept = NULL,
            blocked_reason = NULL
        WHERE id = ${body.requestId}
          AND status = 'BLOCKED';
      `;
    } else if (body.action === 'resolve') {
      await sql`
        UPDATE sewa_requests
        SET status = 'RESOLVED',
            resolved_at = ${now}::timestamptz,
            resolved_by = ${body.responderName},
            blocked_at = NULL,
            blocking_dept = NULL,
            blocked_reason = NULL
        WHERE id = ${body.requestId}
          AND status IN ('NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'BLOCKED');
      `;
    } else {
      return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Always add comment to thread
    const commentEntry = JSON.stringify([{
      user: body.responderName,
      text: body.comment,
      time: now,
      action: body.action,
      ...(body.action === 'blocked' && body.blockingDept ? { blockingDept: body.blockingDept } : {}),
    }]);

    await sql`
      UPDATE sewa_requests
      SET comments = COALESCE(comments, '[]'::jsonb) || ${commentEntry}::jsonb
      WHERE id = ${body.requestId};
    `;

    return Response.json({ success: true, requestId: body.requestId, action: body.action });
  } catch (error) {
    console.error('Sewa update-status error:', error);
    return Response.json(
      { error: 'Failed to update status', details: String(error) },
      { status: 500 }
    );
  }
}
