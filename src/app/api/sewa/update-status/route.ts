import { sql } from '@vercel/postgres';

interface UpdateBody {
  requestId: string;
  action: 'acknowledge' | 'resolve' | 'in_progress';
  responderName: string;
  comment?: string;
}

export async function POST(request: Request) {
  try {
    const body: UpdateBody = await request.json();

    if (!body.requestId || !body.action || !body.responderName) {
      return Response.json({ error: 'Missing requestId, action, or responderName' }, { status: 400 });
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
        SET status = 'IN_PROGRESS'
        WHERE id = ${body.requestId}
          AND status IN ('NEW', 'ACKNOWLEDGED');
      `;
    } else if (body.action === 'resolve') {
      await sql`
        UPDATE sewa_requests
        SET status = 'RESOLVED',
            resolved_at = ${now}::timestamptz,
            resolved_by = ${body.responderName}
        WHERE id = ${body.requestId}
          AND status IN ('NEW', 'ACKNOWLEDGED', 'IN_PROGRESS');
      `;
    } else {
      return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Add comment if provided
    if (body.comment) {
      await sql`
        UPDATE sewa_requests
        SET comments = comments || ${JSON.stringify([{ user: body.responderName, text: body.comment, time: now }])}::jsonb
        WHERE id = ${body.requestId};
      `;
    }

    return Response.json({ success: true, requestId: body.requestId, action: body.action });
  } catch (error) {
    console.error('Sewa update-status error:', error);
    return Response.json(
      { error: 'Failed to update status', details: String(error) },
      { status: 500 }
    );
  }
}
