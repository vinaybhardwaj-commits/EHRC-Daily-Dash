import { NextResponse } from 'next/server';
import {
  notifyAdmins,
  notifyDeptHead,
  buildNewComplaintMessage,
  buildBlockedComplaintMessage,
  buildResolutionMessage,
} from '@/lib/whatsapp';

/**
 * POST /api/sewa/notify
 *
 * Sends WhatsApp notifications for Sewa complaint events.
 * Called internally by the update-status and requests APIs.
 *
 * Body: { event, data }
 * Events: 'new_complaint', 'status_blocked', 'status_resolved'
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { event, data } = body;

    if (!event || !data) {
      return NextResponse.json({ error: 'Missing event or data' }, { status: 400 });
    }

    let results;

    switch (event) {
      case 'new_complaint': {
        const msg = buildNewComplaintMessage(
          data.complaintType || 'Unknown',
          data.targetDept || 'Unknown',
          data.description || '',
          data.requesterName || 'Anonymous',
          data.requesterDept || 'Unknown',
          data.urgency || 'normal',
          data.requestId || '—'
        );
        // Notify target department head
        results = await notifyDeptHead(data.targetDeptSlug || '', msg);
        break;
      }

      case 'status_blocked': {
        const msg = buildBlockedComplaintMessage(
          data.complaintType || 'Unknown',
          data.targetDept || 'Unknown',
          data.blockingDept || '',
          data.blockedReason || 'No reason given',
          data.requestId || '—'
        );
        // Always escalate blocked complaints to admin
        results = await notifyAdmins(msg);
        break;
      }

      case 'status_resolved': {
        const msg = buildResolutionMessage(
          data.complaintType || 'Unknown',
          data.targetDept || 'Unknown',
          data.resolvedBy || 'Unknown',
          data.resolutionNote || '',
          data.requestId || '—'
        );
        results = await notifyAdmins(msg);
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown event: ${event}` }, { status: 400 });
    }

    const anySuccess = results.some(r => r.success);
    return NextResponse.json({
      event,
      sent: anySuccess,
      results,
    });
  } catch (err) {
    console.error('[sewa/notify] Error:', err);
    return NextResponse.json(
      { error: 'Internal error', details: String(err) },
      { status: 500 }
    );
  }
}
