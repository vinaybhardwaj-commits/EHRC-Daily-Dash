import { NextResponse } from 'next/server';
import { sendWhatsApp } from '@/lib/whatsapp';

/**
 * GET /api/whatsapp/test?to=+916362191675&msg=Hello
 *
 * Quick test endpoint to verify the WaSenderAPI WhatsApp integration.
 * Only works when WASENDER_API_KEY is set and a WhatsApp session is connected.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const to = url.searchParams.get('to') || '+916362191675';
  const msg = url.searchParams.get('msg') || `*EHRC Dashboard Test*\n\nWhatsApp integration is working!\nTimestamp: ${new Date().toISOString()}`;

  const result = await sendWhatsApp(to, msg);

  return NextResponse.json({
    ...result,
    to,
    message: msg,
    timestamp: new Date().toISOString(),
  });
}
