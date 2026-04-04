/* ──────────────────────────────────────────────────────────────────
   Trend Narrator — Qwen generates human-readable trend briefings
   Falls back to template-based narratives if LLM unavailable
   ────────────────────────────────────────────────────────────────── */

import { llm, LLM_MODELS } from '@/lib/llm';
import type { DepartmentTrendData, FieldTrend } from './trend-analyzer';

export interface TrendNarrative {
  slug: string;
  department_name: string;
  summary: string;          // 1-2 sentence overview
  highlights: TrendHighlight[];
  data_days: number;
  generated_by: 'qwen' | 'template';
}

export interface TrendHighlight {
  field: string;
  label: string;
  direction: string;
  severity: 'good' | 'warning' | 'concern' | 'neutral';
  text: string;
}

/**
 * Determine severity of a trend based on direction and good_direction context.
 */
function classifyHighlightSeverity(trend: FieldTrend): 'good' | 'warning' | 'concern' | 'neutral' {
  if (trend.direction === 'stable' || trend.direction === 'insufficient') return 'neutral';
  if (trend.direction === 'volatile') return 'warning';

  // For known metric patterns, we know what's good/bad
  const riskyRising = ['noShows', 'complaints', 'pendingComplaints', 'lwbs', 'lamaDama', 'delay', 'tickets', 'otBacklog', 'pending'];
  const riskyFalling = ['revenue', 'revenueMtd', 'census', 'arpob', 'surgeries', 'edRevenue', 'ipRevenue', 'opRevenue', 'opdTotal', 'starRating', 'cases', 'bca', 'xray', 'ct', 'usg'];

  if (trend.direction === 'rising') {
    if (riskyRising.includes(trend.field)) return 'concern';
    if (riskyFalling.includes(trend.field)) return 'good';
    return 'neutral';
  }
  if (trend.direction === 'falling') {
    if (riskyFalling.includes(trend.field)) return 'concern';
    if (riskyRising.includes(trend.field)) return 'good';
    return 'neutral';
  }
  return 'neutral';
}

/**
 * Generate template-based narrative (no LLM needed).
 */
function generateTemplateNarrative(data: DepartmentTrendData): TrendNarrative {
  const highlights: TrendHighlight[] = data.trends
    .filter(t => t.direction !== 'stable' && t.direction !== 'insufficient')
    .map(t => {
      const severity = classifyHighlightSeverity(t);
      const arrow = t.direction === 'rising' ? '↑' : t.direction === 'falling' ? '↓' : '~';
      const pctStr = Math.abs(t.change_pct) > 0 ? ` (${t.change_pct > 0 ? '+' : ''}${t.change_pct}%)` : '';
      const streakStr = Math.abs(t.streak) >= 3 ? ` · ${Math.abs(t.streak)}-day streak` : '';

      let text: string;
      if (t.direction === 'rising') {
        text = `${t.label} trending up${pctStr}${streakStr}. Current: ${t.current}, avg: ${t.avg}`;
      } else if (t.direction === 'falling') {
        text = `${t.label} trending down${pctStr}${streakStr}. Current: ${t.current}, avg: ${t.avg}`;
      } else {
        text = `${t.label} is volatile${pctStr}. Current: ${t.current}, avg: ${t.avg}`;
      }

      return {
        field: t.field,
        label: `${arrow} ${t.label}`,
        direction: t.direction,
        severity,
        text,
      };
    });

  // Sort: concerns first, then warnings, then good, then neutral
  const severityOrder: Record<string, number> = { concern: 0, warning: 1, good: 2, neutral: 3 };
  highlights.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

  const concerns = highlights.filter(h => h.severity === 'concern');
  const goods = highlights.filter(h => h.severity === 'good');

  let summary: string;
  if (highlights.length === 0) {
    summary = `${data.department_name}: Insufficient trend data (${data.data_days_available} days available).`;
  } else if (concerns.length > 0) {
    summary = `${data.department_name}: ${concerns.length} concern${concerns.length !== 1 ? 's' : ''} — ${concerns.map(c => c.text.split('.')[0]).join('; ')}.`;
  } else if (goods.length > 0) {
    summary = `${data.department_name}: Positive trends — ${goods.map(g => g.text.split('.')[0]).join('; ')}.`;
  } else {
    summary = `${data.department_name}: All tracked metrics are stable or volatile over ${data.data_days_available} days.`;
  }

  return {
    slug: data.slug,
    department_name: data.department_name,
    summary,
    highlights,
    data_days: data.data_days_available,
    generated_by: 'template',
  };
}

/**
 * Generate Qwen-powered narrative with template fallback.
 */
export async function generateTrendNarrative(data: DepartmentTrendData): Promise<TrendNarrative> {
  // If very little data, skip LLM
  if (data.trends.length === 0) {
    return generateTemplateNarrative(data);
  }

  const client = llm();
  if (!client) {
    return generateTemplateNarrative(data);
  }

  try {
    const trendSummaries = data.trends.map(t => {
      const arrow = t.direction === 'rising' ? '↑' : t.direction === 'falling' ? '↓' : t.direction === 'volatile' ? '~' : '→';
      return `${t.label}: ${arrow} ${t.direction} (${t.change_pct > 0 ? '+' : ''}${t.change_pct}%), current=${t.current}, avg=${t.avg}, streak=${t.streak}d, values=[${t.values.join(',')}]`;
    }).join('\n');

    const prompt = `You are a hospital operations analyst at EHRC (Even Hospital Race Course Road).
Analyze these ${data.data_days_available}-day trends for ${data.department_name} and generate a JSON response.

TREND DATA:
${trendSummaries}

Respond with ONLY a JSON object (no markdown fences):
{
  "summary": "1-2 sentence executive summary of what these trends mean for the GM",
  "highlights": [
    {
      "field": "fieldId",
      "label": "↑ or ↓ Field Label",
      "severity": "good|warning|concern|neutral",
      "text": "Brief insight about this specific trend and its operational impact"
    }
  ]
}

Rules:
- severity "concern" = metric moving in a bad direction for the hospital
- severity "good" = metric moving in a positive direction
- severity "warning" = volatile or needs watching
- severity "neutral" = stable or unclear impact
- Sort highlights with concerns first
- Max 5 highlights, skip stable/insufficient metrics
- Be specific about numbers and percentages
- Write for a hospital GM who needs actionable insights`;

    const response = await client.chat.completions.create({
      model: LLM_MODELS.FAST,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 600,
    });

    const content = response.choices[0]?.message?.content || '';

    // Parse JSON
    let cleaned = content.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '').trim();
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) cleaned = objMatch[0];

    const parsed = JSON.parse(cleaned);

    if (parsed.summary && Array.isArray(parsed.highlights)) {
      return {
        slug: data.slug,
        department_name: data.department_name,
        summary: String(parsed.summary),
        highlights: parsed.highlights.slice(0, 5).map((h: Record<string, unknown>) => ({
          field: String(h.field || ''),
          label: String(h.label || ''),
          direction: data.trends.find(t => t.field === h.field)?.direction || 'stable',
          severity: ['good', 'warning', 'concern', 'neutral'].includes(String(h.severity))
            ? String(h.severity) as TrendHighlight['severity']
            : 'neutral',
          text: String(h.text || ''),
        })),
        data_days: data.data_days_available,
        generated_by: 'qwen',
      };
    }

    return generateTemplateNarrative(data);
  } catch (err) {
    console.error('[TrendNarrator] Qwen failed, falling back to template:', err);
    return generateTemplateNarrative(data);
  }
}

/**
 * Generate narratives for all departments with trend data.
 */
export async function generateAllNarratives(
  trendData: DepartmentTrendData[]
): Promise<TrendNarrative[]> {
  // Run in parallel but with a small batch size to not overwhelm Qwen
  const results: TrendNarrative[] = [];
  const batchSize = 3;

  for (let i = 0; i < trendData.length; i += batchSize) {
    const batch = trendData.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(d => generateTrendNarrative(d)));
    results.push(...batchResults);
  }

  return results;
}
