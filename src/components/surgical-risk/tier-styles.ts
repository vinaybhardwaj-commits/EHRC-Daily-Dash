/**
 * Shared Tailwind class tokens for surgical risk tier visuals.
 * Per PRD v2 §14.2 risk tier color mapping.
 */

import type { RiskTier } from '@/lib/surgical-risk/types';

export interface TierStyle {
  bg: string;       // card body fill (the -50 shade)
  border: string;   // card border (the -300/-400 shade)
  text: string;     // tier label text + composite-score text
  badge: string;    // pill badge bg + text classes
  bar: string;      // left-edge color bar (the -500/-600 shade)
  glow: string;     // box-shadow glow (CRITICAL only)
}

export const TIER_STYLES: Record<RiskTier, TierStyle> = {
  GREEN:    { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500', glow: '' },
  AMBER:    { bg: 'bg-amber-50',   border: 'border-amber-300',   text: 'text-amber-700',   badge: 'bg-amber-100 text-amber-800',   bar: 'bg-amber-500',   glow: '' },
  RED:      { bg: 'bg-rose-50',    border: 'border-rose-300',    text: 'text-rose-700',    badge: 'bg-rose-100 text-rose-800',    bar: 'bg-rose-500',    glow: '' },
  CRITICAL: { bg: 'bg-red-50',     border: 'border-red-400',     text: 'text-red-700',     badge: 'bg-red-100 text-red-800',      bar: 'bg-red-600',     glow: 'shadow-[0_0_15px_rgba(239,68,68,0.3)]' },
};

export const TIER_ORDER: RiskTier[] = ['CRITICAL', 'RED', 'AMBER', 'GREEN'];
