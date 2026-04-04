/* ──────────────────────────────────────────────────────────────────
   Cross-Department Correlation Engine
   Reads all department anomalies for a date and matches patterns
   ────────────────────────────────────────────────────────────────── */

import { sql } from '@vercel/postgres';
import { CORRELATION_PATTERNS, type CorrelationPattern } from './correlation-patterns';
import type { RuleSeverity } from './types';

/** A single department's anomaly data from form_conversations */
interface DepartmentAnomalies {
  slug: string;
  anomalies: Array<{ rule_id: string; severity: string; rule_name: string }>;
}

/** A matched signal within a correlation */
export interface MatchedSignal {
  department: string;
  label: string;
  matched_rule_ids: string[];
}

/** Result of a correlation pattern match */
export interface CorrelationResult {
  pattern_id: string;
  pattern_name: string;
  description: string;
  severity: RuleSeverity;
  category: string;
  matched_signals: MatchedSignal[];
  matched_count: number;
  total_signals: number;
  insight: string;
  recommendation: string;
}

/**
 * Run correlation analysis for a specific date.
 * Fetches all department anomalies from form_conversations and matches
 * them against the defined correlation patterns.
 */
export async function runCorrelationAnalysis(date: string): Promise<CorrelationResult[]> {
  // 1. Fetch all conversations (and their anomalies) for this date
  const deptAnomalies = await fetchAllAnomalies(date);

  if (deptAnomalies.length === 0) {
    return [];
  }

  // 2. Build a lookup: department → set of triggered rule IDs
  const rulesByDept = new Map<string, Set<string>>();
  for (const dept of deptAnomalies) {
    const ruleIds = new Set(dept.anomalies.map(a => a.rule_id));
    rulesByDept.set(dept.slug, ruleIds);
  }

  // 3. Match each pattern
  const results: CorrelationResult[] = [];

  for (const pattern of CORRELATION_PATTERNS) {
    const matchedSignals: MatchedSignal[] = [];

    for (const signal of pattern.signals) {
      const deptRules = rulesByDept.get(signal.department);
      if (!deptRules) continue;

      // Check if any of the signal's rule_ids were triggered
      const matchedRuleIds = signal.rule_ids.filter(rid => deptRules.has(rid));
      if (matchedRuleIds.length > 0) {
        matchedSignals.push({
          department: signal.department,
          label: signal.label,
          matched_rule_ids: matchedRuleIds,
        });
      }
    }

    // Check threshold
    if (matchedSignals.length >= pattern.min_signals) {
      const signalDetails = matchedSignals.map(s => s.label).join('; ');
      const insight = pattern.insight_template
        .replace('{matched_count}', String(matchedSignals.length))
        .replace('{signal_details}', signalDetails);

      results.push({
        pattern_id: pattern.id,
        pattern_name: pattern.name,
        description: pattern.description,
        severity: pattern.severity,
        category: pattern.category,
        matched_signals: matchedSignals,
        matched_count: matchedSignals.length,
        total_signals: pattern.signals.length,
        insight,
        recommendation: pattern.recommendation,
      });
    }
  }

  // 4. Sort by severity (critical first, then high, etc.)
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  results.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

  return results;
}

/**
 * Fetch all department anomalies for a given date from form_conversations.
 */
async function fetchAllAnomalies(date: string): Promise<DepartmentAnomalies[]> {
  try {
    const result = await sql`
      SELECT form_slug, anomalies_detected
      FROM form_conversations
      WHERE date = ${date}
        AND anomalies_detected IS NOT NULL
    `;

    return result.rows
      .filter(row => row.anomalies_detected && Array.isArray(row.anomalies_detected))
      .map(row => ({
        slug: row.form_slug,
        anomalies: (row.anomalies_detected as Array<Record<string, unknown>>).map(a => ({
          rule_id: String(a.rule_id || ''),
          severity: String(a.severity || 'medium'),
          rule_name: String(a.rule_name || ''),
        })),
      }));
  } catch {
    return [];
  }
}

/**
 * Get cross-department context notes for a specific department.
 * Returns patterns that include this department as a matched signal.
 */
export async function getCrossDeptContext(
  slug: string,
  date: string
): Promise<Array<{ pattern_name: string; severity: RuleSeverity; other_depts: string[]; insight: string }>> {
  const allResults = await runCorrelationAnalysis(date);

  return allResults
    .filter(r => r.matched_signals.some(s => s.department === slug))
    .map(r => ({
      pattern_name: r.pattern_name,
      severity: r.severity,
      other_depts: r.matched_signals
        .filter(s => s.department !== slug)
        .map(s => s.department),
      insight: r.insight,
    }));
}
