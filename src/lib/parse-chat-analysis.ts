/**
 * Parser for structured WhatsApp Chat Analysis Markdown files.
 *
 * Reads the output format defined in the EHRC-WhatsApp-Chat-Analysis-Rubric.md
 * and converts it into DepartmentEntry objects ready for upsert into Postgres.
 *
 * Each entry gets metadata fields prefixed with `_` to distinguish them from
 * regular form fields:
 *   _source: "whatsapp"
 *   _source_group: "Group Name"
 *   _source_sender: "Person Name"
 *   _confidence: "high" | "medium" | "low"
 *   _context: "Original chat context"
 */

import { DepartmentData, DepartmentEntry, DEPARTMENTS } from './types';

interface ParsedChatEntry {
  date: string;          // YYYY-MM-DD
  slug: string;          // department slug
  fieldLabel: string;    // exact field label from rubric
  value: string | number;
  sourceGroup: string;
  sourceTime: string;
  sourceSender: string;
  context: string;
  confidence: 'high' | 'medium' | 'low';
}

interface ParsedGlobalIssue {
  date: string;
  issueId: string;
  issueLabel: string;
  details: string;
  sourceGroup: string;
  sourceTime: string;
  sourceSender: string;
  severity: 'red' | 'amber';
}

export interface ChatAnalysisResult {
  period: string;
  sourceGroups: string[];
  totalMessagesAnalyzed: number;
  totalIssuesExtracted: number;
  entries: ParsedChatEntry[];
  globalIssues: ParsedGlobalIssue[];
  /** Map of date -> slug -> DepartmentData ready for upsert */
  departmentDataByDateSlug: Map<string, Map<string, DepartmentData>>;
}

/**
 * Parse a chat analysis markdown file into structured data.
 */
export function parseChatAnalysisMd(content: string): ChatAnalysisResult {
  const lines = content.split('\n');

  // Parse frontmatter
  let period = '';
  const sourceGroups: string[] = [];
  let totalMessagesAnalyzed = 0;
  let totalIssuesExtracted = 0;

  let inFrontmatter = false;
  let frontmatterCount = 0;
  let i = 0;

  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '---') {
      frontmatterCount++;
      if (frontmatterCount === 1) { inFrontmatter = true; continue; }
      if (frontmatterCount === 2) { inFrontmatter = false; i++; break; }
    }
    if (inFrontmatter) {
      const periodMatch = line.match(/^period:\s*(.+)/);
      if (periodMatch) period = periodMatch[1].trim();

      const totalMsgMatch = line.match(/^total_messages_analyzed:\s*(\d+)/);
      if (totalMsgMatch) totalMessagesAnalyzed = parseInt(totalMsgMatch[1]);

      const totalIssueMatch = line.match(/^total_issues_extracted:\s*(\d+)/);
      if (totalIssueMatch) totalIssuesExtracted = parseInt(totalIssueMatch[1]);

      if (line.startsWith('- "') || line.startsWith("- '")) {
        const groupName = line.replace(/^-\s*["']/, '').replace(/["']\s*$/, '');
        sourceGroups.push(groupName);
      }
    }
  }

  // Parse sections
  const entries: ParsedChatEntry[] = [];
  const globalIssues: ParsedGlobalIssue[] = [];

  let currentSection = '';
  let currentEntry: Partial<ParsedChatEntry> | null = null;
  let currentIssue: Partial<ParsedGlobalIssue> | null = null;

  for (; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect section headers
    if (trimmed.startsWith('## EXTRACTED ENTRIES')) {
      currentSection = 'entries';
      continue;
    }
    if (trimmed.startsWith('## GLOBAL ISSUES FLAGGED')) {
      // Flush any pending entry
      if (currentEntry && currentEntry.date && currentEntry.slug && currentEntry.fieldLabel) {
        entries.push(currentEntry as ParsedChatEntry);
      }
      currentEntry = null;
      currentSection = 'global-issues';
      continue;
    }
    if (trimmed.startsWith('## UNATTRIBUTED ITEMS')) {
      if (currentIssue && currentIssue.date && currentIssue.issueId) {
        globalIssues.push(currentIssue as ParsedGlobalIssue);
      }
      currentIssue = null;
      currentSection = 'unattributed';
      continue;
    }
    if (trimmed.startsWith('## ANALYSIS SUMMARY')) {
      currentSection = 'summary';
      continue;
    }

    // Parse entry headers: ### YYYY-MM-DD | slug | field-label
    if (trimmed.startsWith('### ') && currentSection === 'entries') {
      // Flush previous entry
      if (currentEntry && currentEntry.date && currentEntry.slug && currentEntry.fieldLabel) {
        entries.push(currentEntry as ParsedChatEntry);
      }
      const parts = trimmed.substring(4).split('|').map(s => s.trim());
      if (parts.length >= 3) {
        currentEntry = {
          date: parts[0],
          slug: parts[1],
          fieldLabel: parts.slice(2).join('|').trim(), // field label might contain pipes
          sourceGroup: '',
          sourceTime: '',
          sourceSender: '',
          context: '',
          confidence: 'medium',
        };
      }
      continue;
    }

    // Parse global issue headers: ### YYYY-MM-DD | issue-id | issue-label
    if (trimmed.startsWith('### ') && currentSection === 'global-issues') {
      if (currentIssue && currentIssue.date && currentIssue.issueId) {
        globalIssues.push(currentIssue as ParsedGlobalIssue);
      }
      const parts = trimmed.substring(4).split('|').map(s => s.trim());
      if (parts.length >= 3) {
        currentIssue = {
          date: parts[0],
          issueId: parts[1],
          issueLabel: parts.slice(2).join('|').trim(),
          details: '',
          sourceGroup: '',
          sourceTime: '',
          sourceSender: '',
          severity: 'amber',
        };
      }
      continue;
    }

    // Parse bullet fields for entries
    if (currentSection === 'entries' && currentEntry) {
      const valueMatch = trimmed.match(/^-\s*\*\*value:\*\*\s*(.+)/);
      if (valueMatch) {
        const raw = valueMatch[1].trim();
        // Try to parse as number
        const num = parseFloat(raw);
        currentEntry.value = !isNaN(num) && raw.match(/^-?[\d.]+$/) ? num : raw;
        continue;
      }
      const groupMatch = trimmed.match(/^-\s*\*\*source_group:\*\*\s*(.+)/);
      if (groupMatch) { currentEntry.sourceGroup = groupMatch[1].trim(); continue; }
      const timeMatch = trimmed.match(/^-\s*\*\*source_time:\*\*\s*(.+)/);
      if (timeMatch) { currentEntry.sourceTime = timeMatch[1].trim(); continue; }
      const senderMatch = trimmed.match(/^-\s*\*\*source_sender:\*\*\s*(.+)/);
      if (senderMatch) { currentEntry.sourceSender = senderMatch[1].trim(); continue; }
      const contextMatch = trimmed.match(/^-\s*\*\*context:\*\*\s*(.+)/);
      if (contextMatch) { currentEntry.context = contextMatch[1].trim(); continue; }
      const confMatch = trimmed.match(/^-\s*\*\*confidence:\*\*\s*(.+)/);
      if (confMatch) { currentEntry.confidence = confMatch[1].trim().toLowerCase() as 'high' | 'medium' | 'low'; continue; }
    }

    // Parse bullet fields for global issues
    if (currentSection === 'global-issues' && currentIssue) {
      const detailsMatch = trimmed.match(/^-\s*\*\*details:\*\*\s*(.+)/);
      if (detailsMatch) { currentIssue.details = detailsMatch[1].trim(); continue; }
      const groupMatch = trimmed.match(/^-\s*\*\*source_group:\*\*\s*(.+)/);
      if (groupMatch) { currentIssue.sourceGroup = groupMatch[1].trim(); continue; }
      const timeMatch = trimmed.match(/^-\s*\*\*source_time:\*\*\s*(.+)/);
      if (timeMatch) { currentIssue.sourceTime = timeMatch[1].trim(); continue; }
      const senderMatch = trimmed.match(/^-\s*\*\*source_sender:\*\*\s*(.+)/);
      if (senderMatch) { currentIssue.sourceSender = senderMatch[1].trim(); continue; }
      const sevMatch = trimmed.match(/^-\s*\*\*severity:\*\*\s*(.+)/);
      if (sevMatch) { currentIssue.severity = sevMatch[1].trim().toLowerCase() as 'red' | 'amber'; continue; }
    }
  }

  // Flush last pending entry/issue
  if (currentEntry && currentEntry.date && currentEntry.slug && currentEntry.fieldLabel) {
    entries.push(currentEntry as ParsedChatEntry);
  }
  if (currentIssue && currentIssue.date && currentIssue.issueId) {
    globalIssues.push(currentIssue as ParsedGlobalIssue);
  }

  // Build departmentDataByDateSlug map
  const departmentDataByDateSlug = new Map<string, Map<string, DepartmentData>>();

  // Look up department info
  const deptLookup = new Map(DEPARTMENTS.map(d => [d.slug as string, d]));

  for (const entry of entries) {
    if (!departmentDataByDateSlug.has(entry.date)) {
      departmentDataByDateSlug.set(entry.date, new Map());
    }
    const dateMap = departmentDataByDateSlug.get(entry.date)!;

    if (!dateMap.has(entry.slug)) {
      const deptInfo = deptLookup.get(entry.slug);
      dateMap.set(entry.slug, {
        name: deptInfo?.name || entry.slug,
        slug: entry.slug,
        tab: deptInfo?.tab || entry.slug,
        entries: [{
          timestamp: `${entry.date}T${entry.sourceTime || '00:00'}:00.000Z`,
          date: entry.date,
          fields: {},
        }],
      });
    }

    const deptData = dateMap.get(entry.slug)!;
    const deptEntry = deptData.entries[0];

    // Store the actual field value
    deptEntry.fields[entry.fieldLabel] = entry.value;

    // Store metadata (prefixed with _)
    deptEntry.fields['_source'] = 'whatsapp';
    deptEntry.fields['_source_group'] = entry.sourceGroup;

    // Store per-field metadata as JSON-encoded string
    const fieldMeta = JSON.parse(
      (deptEntry.fields['_field_metadata'] as string) || '{}'
    );
    fieldMeta[entry.fieldLabel] = {
      source_sender: entry.sourceSender,
      source_time: entry.sourceTime,
      source_group: entry.sourceGroup,
      confidence: entry.confidence,
      context: entry.context,
    };
    deptEntry.fields['_field_metadata'] = JSON.stringify(fieldMeta);
  }

  // Also inject global issues as entries in their source departments
  for (const issue of globalIssues) {
    if (!departmentDataByDateSlug.has(issue.date)) {
      departmentDataByDateSlug.set(issue.date, new Map());
    }
    const dateMap = departmentDataByDateSlug.get(issue.date)!;

    // Global issues map to specific departments via the issue definitions
    // We'll store them as special _global_issue fields
    const issueSlug = getIssueDeptSlug(issue.issueId);
    if (!issueSlug) continue;

    if (!dateMap.has(issueSlug)) {
      const deptInfo = deptLookup.get(issueSlug);
      dateMap.set(issueSlug, {
        name: deptInfo?.name || issueSlug,
        slug: issueSlug,
        tab: deptInfo?.tab || issueSlug,
        entries: [{
          timestamp: `${issue.date}T${issue.sourceTime || '00:00'}:00.000Z`,
          date: issue.date,
          fields: { '_source': 'whatsapp' },
        }],
      });
    }

    const deptData = dateMap.get(issueSlug)!;
    const deptEntry = deptData.entries[0];
    const globalIssueKey = `_global_issue_${issue.issueId}`;
    deptEntry.fields[globalIssueKey] = issue.details;
    deptEntry.fields['_source'] = 'whatsapp';
  }

  return {
    period,
    sourceGroups,
    totalMessagesAnalyzed,
    totalIssuesExtracted,
    entries,
    globalIssues,
    departmentDataByDateSlug,
  };
}

/**
 * Maps global issue IDs to their department slugs.
 */
function getIssueDeptSlug(issueId: string): string | null {
  const map: Record<string, string> = {
    'deaths': 'emergency',
    'sentinel': 'patient-safety',
    'adverse': 'patient-safety',
    'falls': 'patient-safety',
    'med-errors': 'patient-safety',
    'equipment-down': 'biomedical',
    'stockout': 'supply-chain',
    'dama-lama': 'billing',
    'pending-complaints': 'customer-care',
    'overdue-rca': 'patient-safety',
    'open-nabh': 'patient-safety',
    'lwbs': 'emergency',
    'doctor-delays': 'customer-care',
    'pending-tickets': 'it',
    'pending-repairs': 'biomedical',
  };
  return map[issueId] || null;
}
