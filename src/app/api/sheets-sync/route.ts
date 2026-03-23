import { NextRequest, NextResponse } from 'next/server';
import { csvToDepartmentDataByDate } from '@/lib/parse-csv';
import { upsertDepartmentData } from '@/lib/storage';

// Google Sheets public CSV export URL format:
// https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet={TAB_NAME}
// Configure these in environment variables

interface SheetConfig {
  department: string;
  sheetId: string;
  tabName: string;
}

function getSheetConfigs(): SheetConfig[] {
  const configStr = process.env.GOOGLE_SHEETS_CONFIG;
  if (!configStr) return [];
  try {
    return JSON.parse(configStr);
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  // Webhook endpoint — can be called by Google Apps Script on form submit
  // Or by a cron job
  try {
    const configs = getSheetConfigs();
    if (configs.length === 0) {
      return NextResponse.json({ error: 'No Google Sheets configured. Set GOOGLE_SHEETS_CONFIG env var.' }, { status: 400 });
    }

    const results = [];
    for (const config of configs) {
      const url = `https://docs.google.com/spreadsheets/d/${config.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(config.tabName)}`;
      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          results.push({ department: config.department, error: `HTTP ${resp.status}` });
          continue;
        }
        const csvText = await resp.text();
        const { byDate } = csvToDepartmentDataByDate(csvText, `${config.department}.csv`);
        const dates: string[] = [];
        for (const [date, deptData] of byDate) {
          upsertDepartmentData(date, deptData);
          dates.push(date);
        }
        results.push({ department: config.department, datesUpdated: dates });
      } catch (e: unknown) {
        results.push({ department: config.department, error: e instanceof Error ? e.message : 'fetch failed' });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

export async function GET() {
  // Manual sync trigger or health check
  return NextResponse.json({
    message: 'POST to this endpoint to sync Google Sheets data. Configure GOOGLE_SHEETS_CONFIG env var.',
    format: '[{"department":"Emergency","sheetId":"YOUR_SHEET_ID","tabName":"ED"}]',
  });
}
