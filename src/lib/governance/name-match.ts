// src/lib/governance/name-match.ts
// GV.2 — surgeon-name → EPI roster matching.
//
// Sheet names are messy: "DR.NAYAR SAJEET" (reversed), "PRABHUDEV SOLANKI"
// (no title, misspelt — roster says Salanki), bare "DR.PRASHANTH" (three
// Prashanths on the roster). Strategy, in order:
//   1. admin-curated alias table (gv_name_aliases) — once mapped, always wins
//   2. exact normalised match
//   3. token-subset match (raw tokens ⊆ roster tokens, order-free)
//   4. fuzzy per-token match (Damerau-Levenshtein ≤ 2 on tokens ≥ 4 chars)
// Anything ambiguous (>1 candidate) or unmatched NEVER auto-files — it goes
// to the unmatched queue for manual mapping.

export interface RosterPhysician { id: string; full_name: string; }
export interface MatchResult {
  status: 'matched' | 'ambiguous' | 'unmatched';
  physicianId?: string;
  physicianName?: string;
  candidates?: string[];
}

const TITLES = new Set(['dr', 'mr', 'mrs', 'ms', 'prof']);

export function normName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter(t => t && !TITLES.has(t))
    .join(' ')
    .trim();
}

function tokens(raw: string): string[] {
  return normName(raw).split(' ').filter(Boolean);
}

/** Split a multi-surgeon cell ("DR.PRABHUDEV/ Dr Uday Ravi") into segments. */
export function splitSurgeons(raw: string): string[] {
  return raw.split(/\/|,|&| and /i).map(s => s.trim()).filter(s => normName(s).length > 1);
}

// Damerau-Levenshtein (optimal string alignment) — handles KRUPA↔Kurpad
function dlev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

function tokenMatches(rawTok: string, rosterToks: string[]): boolean {
  if (rosterToks.includes(rawTok)) return true;
  if (rawTok.length >= 4) {
    return rosterToks.some(rt => rt.length >= 4 && dlev(rawTok, rt) <= 2);
  }
  return false;
}

/** Match ONE surgeon name segment against the roster (+ aliases). */
export function matchSurgeon(
  raw: string,
  roster: RosterPhysician[],
  aliases: Map<string, string>, // alias_norm -> physician_id
): MatchResult {
  const norm = normName(raw);
  if (!norm) return { status: 'unmatched' };

  const aliasId = aliases.get(norm);
  if (aliasId) {
    const p = roster.find(r => r.id === aliasId);
    return { status: 'matched', physicianId: aliasId, physicianName: p?.full_name };
  }

  const rawToks = tokens(raw);
  const exact: RosterPhysician[] = [];
  const subset: RosterPhysician[] = [];
  const fuzzy: RosterPhysician[] = [];

  for (const p of roster) {
    const pNorm = normName(p.full_name);
    const pToks = pNorm.split(' ');
    if (pNorm === norm) { exact.push(p); continue; }
    if (rawToks.every(t => pToks.includes(t))) { subset.push(p); continue; }
    if (rawToks.every(t => tokenMatches(t, pToks))) fuzzy.push(p);
  }

  for (const pool of [exact, subset, fuzzy]) {
    if (pool.length === 1) return { status: 'matched', physicianId: pool[0].id, physicianName: pool[0].full_name };
    if (pool.length > 1) return { status: 'ambiguous', candidates: pool.map(p => p.full_name) };
  }
  return { status: 'unmatched' };
}
