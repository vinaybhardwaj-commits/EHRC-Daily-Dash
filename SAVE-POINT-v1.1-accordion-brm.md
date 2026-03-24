# SAVE POINT — v1.1-accordion-brm

**Created**: 2026-03-24
**Tag**: `v1.1-accordion-brm`
**Commit**: `ecb5cda` — "Replace Department Deep Dive cards with accordion layout"
**Full SHA**: `ecb5cda1c778e9e21e73178ec26580d1932c84f2`

## Vercel Deployment
- **Deployment ID**: `4162196915`
- **Environment**: Production
- **Deployed at**: 2026-03-24T15:20:30Z
- **Live URL**: https://ehrc-daily-dash.vercel.app
- **Vercel ID**: `bom1::fz24j-1774366816327-e43ba5a9c4a1`

## What's in this save point

### Stage 1 Complete (from v1.0)
- Web forms for 17 department standups
- Daily Dashboard with department panels
- Monthly Overview with KPI cards, trends, heatmap
- Form portal at /form
- Email notifications for missing submissions
- WhatsApp Insights tab

### New in v1.1: BRM + Accordion Redesign
1. **BRM Data Ingestion** — Parsed 7 monthly BRM Excel files (Aug 2025 – Feb 2026), extracted financial metrics (Revenue, EBITDAR, Occupancy, ARPOB, IP Admissions, OPD Footfall, Avg Occupied Beds, ALOS, etc.), stored in Postgres `brm_monthly` table as JSONB.

2. **Finance Department Overview** — Full dual-track display:
   - BRM Official track: Hero cards, 12-metric × 7-month progression table with MoM deltas, BRM vs Daily Tracker comparison bar charts
   - Daily Tracker track: Sparklines, monthly trends from Google Form submissions
   - Toggle between BRM Official and Daily Tracker views

3. **Accordion Navigation** — Replaced confusing card grid with collapsible accordion:
   - Finance sorted to top with green "Overview" badge
   - Expands inline to show full BRM overview (no page navigation)
   - Other 16 departments listed alphabetically with "Coming soon" placeholder
   - Each row shows icon, KPI, submission progress bar

### Database
- `brm_monthly` table: 7 rows (2025-08 through 2026-02)
- All P&L, Counts, and Highlights metrics extracted
- `avg_occupied_beds` fixed (parser matched "Average" not just "Avg")

### Key commits since v1.0
- `73bee64` Add Finance Department Overview with deep dive cards
- `a27a782` Fix Finance data extraction for historical field name eras
- `b7cc63e` Add BRM dual-track display to Finance Overview
- `8aa03a9` Fix Finance Overview crash: null safety for BRM data
- `2ecff66` Fix NaN% display in BRM table for undefined/null MoM deltas
- `ecb5cda` Replace Department Deep Dive cards with accordion layout

## How to restore
```bash
git checkout v1.1-accordion-brm
# or
git checkout ecb5cda
```

To redeploy this exact version on Vercel:
```bash
git push -f origin v1.1-accordion-brm:main
```
