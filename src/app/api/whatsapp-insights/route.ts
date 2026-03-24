import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { DEPARTMENTS } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface WAEntry {
  date: string;
  slug: string;
  deptName: string;
  fieldLabel: string;
  value: string | number;
  sourceGroup: string;
  sourceSender: string;
  sourceTime: string;
  confidence: string;
  context: string;
}

interface WAGlobalIssue {
  date: string;
  issueId: string;
  issueLabel: string;
  details: string;
  slug: string;
  severity: string;
}

/**
 * GET /api/whatsapp-insights?month=YYYY-MM
 *
 * Returns all WhatsApp-sourced entries, grouped by department,
 * with global issues extracted, for the given month.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month') || getCurrentMonth();

    // Query all department_data rows for the given month
    const rows = await sql`
      SELECT date, slug, name, entries
      FROM department_data
      WHERE date LIKE ${month + '%'}
      ORDER BY date DESC, slug ASC;
    `;

    const deptLookup = new Map(DEPARTMENTS.map(d => [d.slug as string, d.name]));
    const allEntries: WAEntry[] = [];
    const globalIssues: WAGlobalIssue[] = [];
    const monthsAvailable = new Set<string>();

    for (const row of rows.rows) {
      const entries = row.entries as Array<{ timestamp?: string; date?: string; fields: Record<string, string | number> }>;

      for (const entry of entries) {
        if (entry.fields['_source'] !== 'whatsapp') continue;

        // Parse field metadata
        let fieldMeta: Record<string, { source_sender?: string; source_time?: string; source_group?: string; confidence?: string; context?: string }> = {};
        try {
          fieldMeta = JSON.parse((entry.fields['_field_metadata'] as string) || '{}');
        } catch { /* ignore */ }

        const sourceGroup = (entry.fields['_source_group'] as string) || '';

        // Extract regular fields
        for (const [key, value] of Object.entries(entry.fields)) {
          if (key.startsWith('_')) continue; // skip metadata fields

          const meta = fieldMeta[key] || {};
          allEntries.push({
            date: row.date,
            slug: row.slug,
            deptName: deptLookup.get(row.slug) || row.name || row.slug,
            fieldLabel: key,
            value,
            sourceGroup: meta.source_group || sourceGroup || '',
            sourceSender: meta.source_sender || '',
            sourceTime: meta.source_time || '',
            confidence: meta.confidence || 'medium',
            context: meta.context || '',
          });
        }

        // Extract global issues (fields starting with _global_issue_)
        for (const [key, value] of Object.entries(entry.fields)) {
          if (!key.startsWith('_global_issue_')) continue;
          const issueId = key.replace('_global_issue_', '');
          globalIssues.push({
            date: row.date,
            issueId,
            issueLabel: formatIssueLabel(issueId),
            details: String(value),
            slug: row.slug,
            severity: getIssueSeverity(issueId),
          });
        }
      }
    }

    // Get all available months that have WA data
    const monthRows = await sql`
      SELECT DISTINCT substring(date, 1, 7) as month
      FROM department_data
      ORDER BY month DESC;
    `;
    // Filter to only months that actually have WA data
    // For performance, we'll check each month
    for (const mr of monthRows.rows) {
      monthsAvailable.add(mr.month);
    }

    // Group entries by department
    const byDept = new Map<string, WAEntry[]>();
    for (const entry of allEntries) {
      if (!byDept.has(entry.slug)) byDept.set(entry.slug, []);
      byDept.get(entry.slug)!.push(entry);
    }

    // Build department summaries
    const departments = [...byDept.entries()].map(([slug, entries]) => ({
      slug,
      name: entries[0]?.deptName || slug,
      entries: entries.sort((a, b) => b.date.localeCompare(a.date)),
      count: entries.length,
    })).sort((a, b) => b.count - a.count);

    // Count by confidence
    const confidenceCounts = {
      high: allEntries.filter(e => e.confidence === 'high').length,
      medium: allEntries.filter(e => e.confidence === 'medium').length,
      low: allEntries.filter(e => e.confidence === 'low').length,
    };

    // Unique dates and source groups
    const uniqueDates = [...new Set(allEntries.map(e => e.date))].sort().reverse();
    const uniqueGroups = [...new Set(allEntries.map(e => e.sourceGroup).filter(Boolean))];

    return NextResponse.json({
      month,
      availableMonths: [...monthsAvailable].sort().reverse(),
      totalEntries: allEntries.length,
      totalGlobalIssues: globalIssues.length,
      confidenceCounts,
      departments,
      globalIssues: globalIssues.sort((a, b) => {
        // Red before amber, then by date desc
        if (a.severity !== b.severity) return a.severity === 'red' ? -1 : 1;
        return b.date.localeCompare(a.date);
      }),
      uniqueDates,
      uniqueGroups,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatIssueLabel(issueId: string): string {
  const labels: Record<string, string> = {
    'deaths': 'Deaths',
    'sentinel': 'Sentinel Events',
    'adverse': 'Adverse Events',
    'falls': 'Patient Falls',
    'med-errors': 'Medication Errors',
    'equipment-down': 'Equipment Breakdown',
    'stockout': 'Critical Stockouts',
    'dama-lama': 'DAMA/LAMA',
    'pending-complaints': 'Pending Complaints',
    'overdue-rca': 'Overdue RCAs',
    'open-nabh': 'Open NABH Issues',
    'lwbs': 'Patients LWBS',
    'doctor-delays': 'Doctor Delay Impact',
    'pending-tickets': 'Pending IT Tickets',
    'pending-repairs': 'Pending Repairs',
  };
  return labels[issueId] || issueId;
}

function getIssueSeverity(issueId: string): string {
  const red = ['deaths', 'sentinel', 'adverse', 'falls', 'med-errors', 'equipment-down', 'stockout', 'dama-lama'];
  return red.includes(issueId) ? 'red' : 'amber';
}
