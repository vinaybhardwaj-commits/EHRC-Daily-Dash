# EHRC Daily Dashboard

Daily morning meeting dashboard for Even Hospital, Race Course Road. Aggregates data from 17 department Google Forms into a navigable, insight-rich dashboard with calendar archive.

## Features

- **Executive Summary** — Key hospital KPIs at a glance (revenue, census, surgeries, ED cases, alerts)
- **17 Department Views** — Each department's form data displayed as KPI cards + detailed tables
- **Calendar Archive** — Every day's dashboard saved and retrievable from a calendar picker
- **Manual Upload** — Upload department CSV/Excel files to populate or update any day's data
- **Huddle Summaries** — Upload PDF/DOCX/MD files of daily huddle AI summaries, viewable on each day's dashboard
- **Google Sheets Live Sync** — Connect to Google Sheets backing your forms for automatic updates on every submission

## Quick Start

```bash
npm install
npm run seed    # Load existing CSV data from the project folder
npm run dev     # Start at http://localhost:3000
```

## Deploy to Vercel

1. Push this repo to GitHub
2. Import in Vercel → it auto-detects Next.js
3. Set `GOOGLE_SHEETS_CONFIG` env var for live sync (see `.env.example`)
4. Deploy

## Google Sheets Live Sync Setup

1. Open each Google Form's linked Google Sheet
2. Share the sheet as "Anyone with the link can view"
3. Copy the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`
4. Configure the `GOOGLE_SHEETS_CONFIG` env var:
   ```json
   [
     {"department":"Emergency","sheetId":"1abc...","tabName":"Form Responses 1"},
     {"department":"Finance","sheetId":"2def...","tabName":"Form Responses 1"}
   ]
   ```
5. To auto-sync on form submission, add a Google Apps Script trigger that POSTs to `/api/sheets-sync`

## API Endpoints

- `GET /api/days` — List all available dates
- `GET /api/days?date=2026-03-23` — Get full snapshot for a specific date
- `POST /api/upload` — Upload department CSV/Excel or huddle summary files
- `POST /api/sheets-sync` — Trigger sync from Google Sheets

## Tech Stack

Next.js 15, TypeScript, Tailwind CSS v4, PapaParse, SheetJS (xlsx), Mammoth (docx)
