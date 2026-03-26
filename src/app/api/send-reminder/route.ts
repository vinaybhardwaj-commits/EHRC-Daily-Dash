import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

function getResend() {
  const { Resend } = require('resend');
  return new Resend(process.env.RESEND_API_KEY);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { department_slug, channel, date } = body;

    if (!department_slug || !channel || !date) {
      return NextResponse.json(
        { error: 'department_slug, channel, and date are required' },
        { status: 400 }
      );
    }

    // Get contact info
    const { rows } = await sql`
      SELECT * FROM department_contacts WHERE department_slug = ${department_slug}
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    }

    const contact = rows[0];
    const deptName = contact.department_name;
    const formUrl = `https://ehrc-daily-dash.vercel.app/form?dept=${department_slug}`;
    const sheetUrl = contact.google_sheet_url || null;

    const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Build message
    let messageBody = `Hi ${contact.head_name || 'Team'},\n\n`;
    messageBody += `This is a reminder that the daily standup data for *${deptName}* has not been submitted for *${formattedDate}*.\n\n`;
    messageBody += `Please fill in the data using one of these links:\n\n`;
    messageBody += `Web Form: ${formUrl}\n`;
    if (sheetUrl) {
      messageBody += `Google Sheet: ${sheetUrl}\n`;
    }
    messageBody += `\nThank you!\nEHRC Daily Dashboard`;

    if (channel === 'email') {
      if (!contact.email) {
        return NextResponse.json({ error: 'No email configured for this department. Please add it in Admin > Contacts.' }, { status: 400 });
      }

      const resend = getResend();
      const emailResult = await resend.emails.send({
        from: 'EHRC Dashboard <notifications@notifications.even.in>',
        to: contact.email,
        subject: `[Action Required] ${deptName} — Daily Standup Missing for ${formattedDate}`,
        text: messageBody.replace(/\*/g, ''),
        html: `<div style="font-family: sans-serif; line-height: 1.6;">
          <p>Hi ${contact.head_name || 'Team'},</p>
          <p>This is a reminder that the daily standup data for <strong>${deptName}</strong> has not been submitted for <strong>${formattedDate}</strong>.</p>
          <p>Please fill in the data using one of these links:</p>
          <p><a href="${formUrl}" style="display:inline-block;padding:10px 20px;background:#0ea5e9;color:white;border-radius:6px;text-decoration:none;margin:4px 0;">Open Web Form</a></p>
          ${sheetUrl ? `<p><a href="${sheetUrl}" style="display:inline-block;padding:10px 20px;background:#22c55e;color:white;border-radius:6px;text-decoration:none;margin:4px 0;">Open Google Sheet</a></p>` : ''}
          <p style="color:#666;margin-top:20px;font-size:13px;">— EHRC Daily Dashboard</p>
        </div>`,
      });

      return NextResponse.json({ success: true, channel: 'email', to: contact.email, result: emailResult });

    } else if (channel === 'whatsapp') {
      if (!contact.phone) {
        return NextResponse.json({ error: 'No phone number configured for this department. Please add it in Admin > Contacts.' }, { status: 400 });
      }

      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
      const twilioFrom = process.env.TWILIO_WHATSAPP_FROM;

      if (!twilioSid || !twilioAuth || !twilioFrom) {
        return NextResponse.json({ error: 'Twilio WhatsApp not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM in environment variables.' }, { status: 500 });
      }

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
      const twilioBody = new URLSearchParams({
        From: `whatsapp:${twilioFrom}`,
        To: `whatsapp:${contact.phone}`,
        Body: messageBody.replace(/\*/g, ''),
      });

      const twilioRes = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: twilioBody.toString(),
      });

      const twilioResult = await twilioRes.json();

      if (!twilioRes.ok) {
        return NextResponse.json({ error: 'WhatsApp send failed', details: twilioResult }, { status: 500 });
      }

      return NextResponse.json({ success: true, channel: 'whatsapp', to: contact.phone, sid: twilioResult.sid });

    } else {
      return NextResponse.json({ error: 'Invalid channel. Use "email" or "whatsapp".' }, { status: 400 });
    }
  } catch (error) {
    console.error('Send reminder error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
