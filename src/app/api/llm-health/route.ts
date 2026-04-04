// src/app/api/llm-health/route.ts
// Health check for local LLM connection via Cloudflare Tunnel

import { NextResponse } from 'next/server';
import { llm, LLM_MODELS } from '@/lib/llm';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();
  const client = llm();

  if (!client) {
    return NextResponse.json({
      status: 'not_configured',
      error: 'LLM_BASE_URL environment variable is not set',
      hint: 'Set LLM_BASE_URL in Vercel project settings to your Cloudflare Tunnel URL + /v1',
    }, { status: 503 });
  }

  try {
    // Quick inference test with fast model
    const testResponse = await client.chat.completions.create({
      model: LLM_MODELS.FAST,
      messages: [{ role: 'user', content: 'Say OK' }],
      max_tokens: 5,
    });

    const latency = Date.now() - startTime;

    return NextResponse.json({
      status: 'healthy',
      latency_ms: latency,
      test_response: testResponse.choices[0]?.message?.content,
      tunnel_url: process.env.LLM_BASE_URL,
      models: [LLM_MODELS.PRIMARY, LLM_MODELS.FAST],
    });
  } catch (error: unknown) {
    const latency = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : String(error);

    return NextResponse.json({
      status: 'unreachable',
      latency_ms: latency,
      error: errMsg,
      tunnel_url: process.env.LLM_BASE_URL,
      hint: 'Is your Mac Mini on? Is cloudflared running? Is Ollama started?',
    }, { status: 503 });
  }
}
