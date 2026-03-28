import { NextResponse } from 'next/server';
import { getShiftHistory } from '@/lib/hk-db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get('days') || '7');
    const history = await getShiftHistory(days);
    return NextResponse.json({ history, days });
  } catch (error) {
    console.error('Shift history error:', error);
    return NextResponse.json({ error: 'Failed to load history', details: String(error) }, { status: 500 });
  }
}
