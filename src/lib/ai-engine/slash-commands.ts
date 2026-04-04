/* ──────────────────────────────────────────────────────────────────
   Slash Command Engine
   Parses and routes /commands typed in FormChat threads
   ────────────────────────────────────────────────────────────────── */

import { sql } from '@vercel/postgres';
import { llm, LLM_MODELS } from '@/lib/llm';
import { analyzeDepartmentTrends, type DepartmentTrendData } from './trend-analyzer';
import { runCorrelationAnalysis } from './correlation-engine';

export interface SlashCommandResult {
  command: string;
  success: boolean;
  response: string;
  metadata?: Record<string, unknown>;
}

export interface ParsedCommand {
  command: string;
  args: string[];
  rawArgs: string;
}

const DEPT_NAMES: Record<string, string> = {
  'customer-care': 'Customer Care', 'emergency': 'Emergency', 'patient-safety': 'Patient Safety',
  'finance': 'Finance', 'billing': 'Billing', 'clinical-lab': 'Clinical Lab', 'pharmacy': 'Pharmacy',
  'supply-chain': 'Supply Chain', 'facility': 'Facility', 'nursing': 'Nursing', 'radiology': 'Radiology',
  'ot': 'OT', 'hr-manpower': 'HR & Manpower', 'diet': 'Diet', 'training': 'Training',
  'biomedical': 'Biomedical', 'it': 'IT',
};

const VALID_COMMANDS = ['briefing', 'trends', 'compare', 'predict', 'help'];

/* ── Parser ────────────────────────────────────────────────────── */

export function parseSlashCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;

  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase();
  if (!command || !VALID_COMMANDS.includes(command)) return null;

  return {
    command,
    args: parts.slice(1),
    rawArgs: parts.slice(1).join(' '),
  };
}

export function isSlashCommand(text: string): boolean {
  return parseSlashCommand(text) !== null;
}

/* ── Router ────────────────────────────────────────────────────── */

export async function executeSlashCommand(
  parsed: ParsedCommand,
  context: { slug: string; date: string }
): Promise<SlashCommandResult> {
  switch (parsed.command) {
    case 'briefing':
      return handleBriefing(context.date);
    case 'trends':
      return handleTrends(parsed.rawArgs || context.slug, context.date);
    case 'compare':
      return handleCompare(parsed.args, context.date);
    case 'predict':
      return handlePredict(context.slug, context.date);
    case 'help':
      return handleHelp();
    default:
      return { command: parsed.command, success: false, response: `Unknown command: /${parsed.command}` };
  }
}

/* ── /help ─────────────────────────────────────────────────────── */

function handleHelp(): SlashCommandResult {
  return {
    command: 'help',
    success: true,
    response: `**Available Commands:**

**/briefing** — Morning executive summary across all departments for today. Shows anomalies, cross-dept patterns, and key concerns.

**/trends** [department] — Quick trend snapshot. Use without args for current department, or specify: /trends finance, /trends emergency

**/compare** dept1 dept2 — Compare two departments side-by-side. Example: /compare finance billing

**/predict** — What to watch today — forward-looking risk assessment based on current anomalies and recent trends.

**/help** — Show this list.`,
  };
}

/* ── /briefing ─────────────────────────────────────────────────── */

async function handleBriefing(date: string): Promise<SlashCommandResult> {
  try {
    // 1. Fetch all open conversations for today
    const convResult = await sql`
      SELECT form_slug, anomalies_detected, questions, status
      FROM form_conversations
      WHERE date = ${date}
    `;

    const departments = convResult.rows;

    // 2. Get cross-dept correlations
    const correlations = await runCorrelationAnalysis(date);

    // 3. Build briefing data
    const deptSummaries = departments.map(d => {
      const anomalies = Array.isArray(d.anomalies_detected) ? d.anomalies_detected : [];
      const criticals = anomalies.filter((a: Record<string, unknown>) => a.severity === 'critical').length;
      const highs = anomalies.filter((a: Record<string, unknown>) => a.severity === 'high').length;
      const name = DEPT_NAMES[d.form_slug] || d.form_slug;
      return { slug: d.form_slug, name, criticals, highs, total: anomalies.length, status: d.status };
    }).filter(d => d.total > 0);

    // 4. Try Qwen for executive narrative
    const client = llm();
    let narrative: string;

    if (client && deptSummaries.length > 0) {
      try {
        const deptLines = deptSummaries.map(d =>
          `${d.name}: ${d.total} anomalies (${d.criticals} critical, ${d.highs} high) — ${d.status}`
        ).join('\n');

        const corrLines = correlations.length > 0
          ? correlations.map(c => `⚠️ ${c.pattern_name}: ${c.matched_signals.map(s => s.label).join(', ')}`).join('\n')
          : 'No cross-department patterns detected.';

        const prompt = `You are the AI assistant for the GM at EHRC (Even Hospital Race Course Road).
Generate a concise morning briefing for ${date}. Be direct, use bullet points, and highlight what needs immediate attention.

DEPARTMENT ANOMALIES:
${deptLines}

CROSS-DEPARTMENT PATTERNS:
${corrLines}

Format: Start with a 1-line overall status (green/amber/red day), then list top 3-5 items needing GM attention, then any positive notes. Keep it under 200 words.`;

        const response = await client.chat.completions.create({
          model: LLM_MODELS.FAST,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 500,
        });

        narrative = response.choices[0]?.message?.content || '';
      } catch {
        narrative = '';
      }
    } else {
      narrative = '';
    }

    // 5. Fallback template if Qwen failed
    if (!narrative) {
      const totalAnomalies = deptSummaries.reduce((s, d) => s + d.total, 0);
      const totalCritical = deptSummaries.reduce((s, d) => s + d.criticals, 0);
      const totalHigh = deptSummaries.reduce((s, d) => s + d.highs, 0);

      const lines: string[] = [];
      lines.push(`**Morning Briefing — ${date}**`);
      lines.push('');

      if (totalCritical > 0) {
        lines.push(`🔴 **Status: RED** — ${totalCritical} critical anomalies across ${deptSummaries.filter(d => d.criticals > 0).length} departments.`);
      } else if (totalHigh > 0) {
        lines.push(`🟡 **Status: AMBER** — ${totalHigh} high-priority items across ${deptSummaries.filter(d => d.highs > 0).length} departments.`);
      } else if (totalAnomalies > 0) {
        lines.push(`🟢 **Status: GREEN** — ${totalAnomalies} minor items flagged, no critical issues.`);
      } else {
        lines.push('🟢 **Status: GREEN** — No anomalies detected today. Clean submission day.');
      }
      lines.push('');

      if (deptSummaries.length > 0) {
        lines.push('**Department Summary:**');
        for (const d of deptSummaries.sort((a, b) => b.criticals - a.criticals || b.highs - a.highs)) {
          const badges = [];
          if (d.criticals > 0) badges.push(`${d.criticals} critical`);
          if (d.highs > 0) badges.push(`${d.highs} high`);
          lines.push(`• ${d.name}: ${d.total} anomalies (${badges.join(', ') || 'medium/low'}) — ${d.status}`);
        }
        lines.push('');
      }

      if (correlations.length > 0) {
        lines.push('**System-Wide Patterns:**');
        for (const c of correlations) {
          lines.push(`• ⚠️ ${c.pattern_name} (${c.severity}) — ${c.matched_signals.map(s => DEPT_NAMES[s.department] || s.department).join(', ')}`);
        }
      }

      narrative = lines.join('\n');
    }

    return {
      command: 'briefing',
      success: true,
      response: narrative,
      metadata: {
        departments_with_anomalies: deptSummaries.length,
        total_anomalies: deptSummaries.reduce((s, d) => s + d.total, 0),
        correlations: correlations.length,
      },
    };
  } catch (err) {
    console.error('/briefing error:', err);
    return { command: 'briefing', success: false, response: 'Failed to generate briefing. Database may be unavailable.' };
  }
}

/* ── /trends ───────────────────────────────────────────────────── */

async function handleTrends(deptArg: string, date: string): Promise<SlashCommandResult> {
  // Resolve department slug from arg
  const slug = resolveDeptSlug(deptArg);
  if (!slug) {
    return {
      command: 'trends',
      success: false,
      response: `Unknown department: "${deptArg}". Try: /trends finance, /trends emergency, /trends nursing, etc.`,
    };
  }

  try {
    const trendData: DepartmentTrendData = await analyzeDepartmentTrends(slug, date, 14);

    if (trendData.trends.length === 0) {
      return {
        command: 'trends',
        success: true,
        response: `**${DEPT_NAMES[slug] || slug} — Trend Snapshot (${trendData.data_days_available} days)**\n\nNo numeric trend data available for this department. This may mean the department hasn't been submitting regularly, or its form doesn't have trackable numeric fields.`,
      };
    }

    const lines: string[] = [];
    lines.push(`**${DEPT_NAMES[slug] || slug} — Trend Snapshot (${trendData.data_days_available} days)**`);
    lines.push('');

    for (const t of trendData.trends) {
      const arrow = t.direction === 'rising' ? '📈' : t.direction === 'falling' ? '📉' : t.direction === 'volatile' ? '📊' : '➡️';
      const pct = t.change_pct !== 0 ? ` (${t.change_pct > 0 ? '+' : ''}${t.change_pct}%)` : '';
      const streak = Math.abs(t.streak) >= 3 ? ` · ${Math.abs(t.streak)}-day streak` : '';
      lines.push(`${arrow} **${t.label}**: ${t.direction}${pct}${streak} — current: ${t.current}, avg: ${t.avg}`);
    }

    return {
      command: 'trends',
      success: true,
      response: lines.join('\n'),
      metadata: { slug, data_days: trendData.data_days_available, trend_count: trendData.trends.length },
    };
  } catch (err) {
    console.error('/trends error:', err);
    return { command: 'trends', success: false, response: 'Failed to analyze trends.' };
  }
}

/* ── /compare ──────────────────────────────────────────────────── */

async function handleCompare(args: string[], date: string): Promise<SlashCommandResult> {
  if (args.length < 2) {
    return {
      command: 'compare',
      success: false,
      response: 'Usage: /compare dept1 dept2\nExample: /compare finance billing\n\nAvailable: finance, emergency, customer-care, nursing, billing, pharmacy, radiology, ot, it, clinical-lab, diet, hr-manpower, biomedical, facility, training, supply-chain, patient-safety',
    };
  }

  const slug1 = resolveDeptSlug(args[0]);
  const slug2 = resolveDeptSlug(args[1]);

  if (!slug1) return { command: 'compare', success: false, response: `Unknown department: "${args[0]}"` };
  if (!slug2) return { command: 'compare', success: false, response: `Unknown department: "${args[1]}"` };

  try {
    const [trends1, trends2, conv1, conv2] = await Promise.all([
      analyzeDepartmentTrends(slug1, date, 14),
      analyzeDepartmentTrends(slug2, date, 14),
      sql`SELECT anomalies_detected, status FROM form_conversations WHERE form_slug = ${slug1} AND date = ${date}`,
      sql`SELECT anomalies_detected, status FROM form_conversations WHERE form_slug = ${slug2} AND date = ${date}`,
    ]);

    const name1 = DEPT_NAMES[slug1] || slug1;
    const name2 = DEPT_NAMES[slug2] || slug2;

    const anom1 = conv1.rows[0]?.anomalies_detected;
    const anom2 = conv2.rows[0]?.anomalies_detected;
    const anomCount1 = Array.isArray(anom1) ? anom1.length : 0;
    const anomCount2 = Array.isArray(anom2) ? anom2.length : 0;

    const lines: string[] = [];
    lines.push(`**${name1} vs ${name2} — ${date}**`);
    lines.push('');

    // Anomalies comparison
    lines.push('**Today\'s Anomalies:**');
    lines.push(`• ${name1}: ${anomCount1} anomalies${conv1.rows[0]?.status ? ` (${conv1.rows[0].status})` : ' (no data)'}`);
    lines.push(`• ${name2}: ${anomCount2} anomalies${conv2.rows[0]?.status ? ` (${conv2.rows[0].status})` : ' (no data)'}`);
    lines.push('');

    // Trend comparison
    lines.push('**14-Day Trends:**');
    lines.push(`• ${name1} (${trends1.data_days_available}d data):`);
    if (trends1.trends.length === 0) {
      lines.push('  No trend data available');
    } else {
      for (const t of trends1.trends.slice(0, 3)) {
        const arrow = t.direction === 'rising' ? '↑' : t.direction === 'falling' ? '↓' : '→';
        lines.push(`  ${arrow} ${t.label}: ${t.change_pct > 0 ? '+' : ''}${t.change_pct}% (${t.current})`);
      }
    }

    lines.push(`• ${name2} (${trends2.data_days_available}d data):`);
    if (trends2.trends.length === 0) {
      lines.push('  No trend data available');
    } else {
      for (const t of trends2.trends.slice(0, 3)) {
        const arrow = t.direction === 'rising' ? '↑' : t.direction === 'falling' ? '↓' : '→';
        lines.push(`  ${arrow} ${t.label}: ${t.change_pct > 0 ? '+' : ''}${t.change_pct}% (${t.current})`);
      }
    }

    return {
      command: 'compare',
      success: true,
      response: lines.join('\n'),
      metadata: { dept1: slug1, dept2: slug2 },
    };
  } catch (err) {
    console.error('/compare error:', err);
    return { command: 'compare', success: false, response: 'Failed to compare departments.' };
  }
}

/* ── /predict ──────────────────────────────────────────────────── */

async function handlePredict(slug: string, date: string): Promise<SlashCommandResult> {
  try {
    // Gather: today's anomalies + trends + correlations
    const [trends, correlations, convResult] = await Promise.all([
      analyzeDepartmentTrends(slug, date, 14),
      runCorrelationAnalysis(date),
      sql`SELECT anomalies_detected FROM form_conversations WHERE form_slug = ${slug} AND date = ${date}`,
    ]);

    const anomalies = convResult.rows[0]?.anomalies_detected;
    const anomCount = Array.isArray(anomalies) ? anomalies.length : 0;
    const deptCorrelations = correlations.filter(c =>
      c.matched_signals.some(s => s.department === slug)
    );

    const name = DEPT_NAMES[slug] || slug;

    // Try Qwen for prediction
    const client = llm();
    let prediction: string = '';

    if (client) {
      try {
        const trendLines = trends.trends.map(t =>
          `${t.label}: ${t.direction} (${t.change_pct > 0 ? '+' : ''}${t.change_pct}%), streak=${t.streak}d, current=${t.current}, avg=${t.avg}`
        ).join('\n') || 'No trend data available';

        const corrLines = deptCorrelations.map(c =>
          `${c.pattern_name}: ${c.insight}`
        ).join('\n') || 'No cross-department patterns involving this dept';

        const prompt = `You are the AI operations analyst at EHRC hospital.
Based on the data below for ${name}, predict what the GM should watch for in the next 24-48 hours. Be specific and actionable.

TODAY'S ANOMALIES: ${anomCount} detected
14-DAY TRENDS:
${trendLines}

CROSS-DEPARTMENT CONTEXT:
${corrLines}

Format: 3-5 bullet predictions, each starting with a risk level emoji (🔴 high risk, 🟡 watch, 🟢 positive). Keep under 150 words.`;

        const response = await client.chat.completions.create({
          model: LLM_MODELS.FAST,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 400,
        });

        prediction = response.choices[0]?.message?.content || '';
      } catch {
        prediction = '';
      }
    }

    // Template fallback
    if (!prediction) {
      const lines: string[] = [];
      lines.push(`**${name} — What to Watch**`);
      lines.push('');

      if (anomCount > 0) {
        lines.push(`🟡 ${anomCount} anomalies flagged today — ensure department head has responded to all AI follow-ups.`);
      }

      const concerns = trends.trends.filter(t =>
        (t.direction === 'falling' && ['revenue', 'revenueMtd', 'arpob', 'cases', 'opdTotal', 'starRating', 'bca', 'ipRevenue'].includes(t.field)) ||
        (t.direction === 'rising' && ['noShows', 'complaints', 'pendingComplaints', 'lwbs', 'lamaDama', 'delay', 'tickets', 'otBacklog', 'pending'].includes(t.field))
      );

      for (const c of concerns.slice(0, 3)) {
        const streakNote = Math.abs(c.streak) >= 3 ? ` (${Math.abs(c.streak)}-day streak)` : '';
        lines.push(`🔴 ${c.label} has been ${c.direction} ${c.change_pct > 0 ? '+' : ''}${c.change_pct}%${streakNote} — may continue tomorrow.`);
      }

      if (deptCorrelations.length > 0) {
        for (const dc of deptCorrelations.slice(0, 2)) {
          lines.push(`🟡 Part of system-wide ${dc.pattern_name} — coordinate with other affected departments.`);
        }
      }

      const positives = trends.trends.filter(t =>
        (t.direction === 'rising' && ['revenue', 'cases', 'opdTotal', 'bca'].includes(t.field)) ||
        (t.direction === 'falling' && ['complaints', 'delay', 'tickets'].includes(t.field))
      );

      for (const p of positives.slice(0, 2)) {
        lines.push(`🟢 ${p.label} trending positively — maintain current trajectory.`);
      }

      if (lines.length <= 2) {
        lines.push('🟢 No significant risks detected. Normal operations expected.');
      }

      prediction = lines.join('\n');
    }

    return {
      command: 'predict',
      success: true,
      response: prediction,
      metadata: { slug, anomalies_today: anomCount, trends: trends.trends.length, correlations: deptCorrelations.length },
    };
  } catch (err) {
    console.error('/predict error:', err);
    return { command: 'predict', success: false, response: 'Failed to generate predictions.' };
  }
}

/* ── Helpers ───────────────────────────────────────────────────── */

function resolveDeptSlug(input: string): string | null {
  const lower = input.toLowerCase().trim();

  // Direct slug match
  if (DEPT_NAMES[lower]) return lower;

  // Alias matching
  const aliases: Record<string, string> = {
    'cc': 'customer-care', 'customercare': 'customer-care', 'customer care': 'customer-care',
    'er': 'emergency', 'ed': 'emergency',
    'ps': 'patient-safety', 'patientsafety': 'patient-safety', 'quality': 'patient-safety',
    'fin': 'finance', 'accounts': 'finance',
    'bill': 'billing',
    'lab': 'clinical-lab', 'clinicallab': 'clinical-lab', 'pathology': 'clinical-lab',
    'pharm': 'pharmacy', 'rx': 'pharmacy',
    'sc': 'supply-chain', 'supplychain': 'supply-chain', 'procurement': 'supply-chain',
    'fms': 'facility', 'facilities': 'facility', 'maintenance': 'facility',
    'nsg': 'nursing', 'nurse': 'nursing', 'nurses': 'nursing',
    'rad': 'radiology', 'xray': 'radiology', 'imaging': 'radiology',
    'theatre': 'ot', 'operation': 'ot', 'surgery': 'ot',
    'hr': 'hr-manpower', 'manpower': 'hr-manpower', 'human resources': 'hr-manpower',
    'nutrition': 'diet', 'food': 'diet', 'kitchen': 'diet',
    'bme': 'biomedical', 'biomed': 'biomedical',
    'info': 'it', 'tech': 'it', 'systems': 'it',
    'train': 'training', 'education': 'training',
  };

  if (aliases[lower]) return aliases[lower];

  // Fuzzy: check if input is contained in any department name
  for (const [slug, name] of Object.entries(DEPT_NAMES)) {
    if (name.toLowerCase().includes(lower) || slug.includes(lower)) {
      return slug;
    }
  }

  return null;
}
