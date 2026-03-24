import { NextRequest, NextResponse } from 'next/server';
import { listAvailableDays, loadDaySnapshot } from '@/lib/storage';

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');

  if (date) {
    const snapshot = await loadDaySnapshot(date);
    if (!snapshot) return NextResponse.json({ error: 'No data for this date' }, { status: 404 });
    return NextResponse.json(snapshot);
  }

  const days = await listAvailableDays();
  return NextResponse.json({ days });
}
