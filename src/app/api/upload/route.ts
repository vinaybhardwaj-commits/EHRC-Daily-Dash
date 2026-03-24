import { NextRequest, NextResponse } from 'next/server';
import { csvToDepartmentDataByDate } from '@/lib/parse-csv';
import { upsertDepartmentData, loadDaySnapshot, saveDaySnapshot, saveHuddleSummary } from '@/lib/storage';
import { HuddleSummary } from '@/lib/types';
import { parseChatAnalysisMd } from '@/lib/parse-chat-analysis';
import { sql } from '@vercel/postgres';
import * as XLSX from 'xlsx';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const uploadType = formData.get('type') as string; // 'department-data', 'huddle-summary', or 'chat-analysis'
    const targetDate = formData.get('date') as string; // for huddle summaries

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const filename = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    // ── Chat Analysis Upload ───────────────────────────────────────────
    if (uploadType === 'chat-analysis') {
      if (!filename.endsWith('.md') && !filename.endsWith('.txt')) {
        return NextResponse.json({ error: 'Chat analysis must be a .md or .txt file' }, { status: 400 });
      }

      const content = buffer.toString('utf-8');
      const result = parseChatAnalysisMd(content);

      if (result.entries.length === 0) {
        return NextResponse.json({ error: 'No data entries found in the analysis file. Check the format matches the rubric output specification.' }, { status: 400 });
      }

      const datesUpdated: string[] = [];
      const deptsUpdated = new Set<string>();
      let entriesSkipped = 0;
      let entriesMerged = 0;

      for (const [date, slugMap] of result.departmentDataByDateSlug) {
        for (const [slug, chatDeptData] of slugMap) {
          // Check if form data already exists for this (date, slug)
          const existing = await sql`
            SELECT entries FROM department_data WHERE date = ${date} AND slug = ${slug};
          `;

          if (existing.rows.length > 0) {
            // Form data exists — merge chat entries alongside existing entries
            const existingEntries = existing.rows[0].entries as Array<Record<string, unknown>>;

            // Check if chat data was already uploaded (avoid re-uploading duplicates)
            const hasWhatsappEntry = existingEntries.some(
              (e: Record<string, unknown>) => {
                const fields = e.fields as Record<string, unknown> | undefined;
                return fields && fields['_source'] === 'whatsapp';
              }
            );

            if (hasWhatsappEntry) {
              // Replace existing whatsapp entries with new ones
              const nonWhatsappEntries = existingEntries.filter(
                (e: Record<string, unknown>) => {
                  const fields = e.fields as Record<string, unknown> | undefined;
                  return !fields || fields['_source'] !== 'whatsapp';
                }
              );
              const merged = [...nonWhatsappEntries, ...chatDeptData.entries];

              await sql`
                UPDATE department_data
                SET entries = ${JSON.stringify(merged)}::jsonb
                WHERE date = ${date} AND slug = ${slug};
              `;
            } else {
              // Append chat entries to existing form entries
              const merged = [...existingEntries, ...chatDeptData.entries];

              await sql`
                UPDATE department_data
                SET entries = ${JSON.stringify(merged)}::jsonb
                WHERE date = ${date} AND slug = ${slug};
              `;
            }
            entriesMerged++;
          } else {
            // No existing data — insert chat data as a new record
            await upsertDepartmentData(date, chatDeptData);
          }

          datesUpdated.push(date);
          deptsUpdated.add(slug);
        }
      }

      const uniqueDates = [...new Set(datesUpdated)].sort();

      return NextResponse.json({
        success: true,
        type: 'chat-analysis',
        period: result.period,
        sourceGroups: result.sourceGroups,
        totalEntriesExtracted: result.entries.length,
        globalIssuesFlagged: result.globalIssues.length,
        datesUpdated: uniqueDates,
        departmentsUpdated: [...deptsUpdated],
        entriesMerged,
        entriesSkipped,
      });
    }

    // ── Huddle Summary Upload ──────────────────────────────────────────
    if (uploadType === 'huddle-summary') {
      if (!targetDate) return NextResponse.json({ error: 'Date required for huddle summary' }, { status: 400 });

      let content = '';
      if (filename.endsWith('.md') || filename.endsWith('.txt')) {
        content = buffer.toString('utf-8');
      } else if (filename.endsWith('.docx')) {
        const mammoth = await import('mammoth');
        const result = await mammoth.convertToHtml({ buffer });
        content = result.value;
      } else if (filename.endsWith('.pdf')) {
        content = `[PDF file: ${file.name}]`;
      }

      const ext = filename.split('.').pop() || '';
      const fileType: HuddleSummary['type'] = (ext === 'md' || ext === 'txt') ? 'md' : ext === 'docx' ? 'docx' : 'pdf';

      const summary: HuddleSummary = {
        filename: file.name,
        content,
        uploadedAt: new Date().toISOString(),
        type: fileType,
      };

      await saveHuddleSummary(targetDate, summary);

      return NextResponse.json({ success: true, date: targetDate, filename: file.name });
    }

    // ── Department Data Upload (CSV or XLSX) ───────────────────────────
    let csvText = '';
    if (filename.endsWith('.csv')) {
      csvText = buffer.toString('utf-8');
    } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      csvText = XLSX.utils.sheet_to_csv(sheet);
    } else {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    const { deptName, slug, tab, byDate } = csvToDepartmentDataByDate(csvText, file.name);
    const dates: string[] = [];
    for (const [date, deptData] of byDate) {
      await upsertDepartmentData(date, deptData);
      dates.push(date);
    }

    return NextResponse.json({ success: true, department: deptName, datesUpdated: dates.sort() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
