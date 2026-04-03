-- Form analytics events table
-- Stores interaction events for completion rates, drop-off, time-to-complete
-- Run: psql $DATABASE_URL < scripts/migrate-form-analytics.sql

CREATE TABLE IF NOT EXISTS form_analytics_events (
  id            SERIAL PRIMARY KEY,
  session_id    TEXT NOT NULL,                -- unique per form-fill session
  form_slug     TEXT NOT NULL,
  event_type    TEXT NOT NULL,                -- form_start, field_focus, field_blur, section_enter, form_submit, form_abandon, validation_error
  field_id      TEXT,                         -- which field (null for form-level events)
  section_id    TEXT,                         -- which section
  duration_ms   INTEGER,                      -- time spent (field_blur, form_submit)
  metadata      JSONB,                        -- extra context
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by form + time period (the main analytics query)
CREATE INDEX IF NOT EXISTS idx_fa_events_slug_time
  ON form_analytics_events (form_slug, created_at);

-- Index for session-level queries (reconstruct a single form-fill)
CREATE INDEX IF NOT EXISTS idx_fa_events_session
  ON form_analytics_events (session_id);

-- Index for event type filtering
CREATE INDEX IF NOT EXISTS idx_fa_events_type
  ON form_analytics_events (event_type, form_slug);

-- Materialized summary view (refreshed by cron or on-demand)
-- This avoids expensive aggregation on every dashboard load
CREATE TABLE IF NOT EXISTS form_analytics_daily (
  id            SERIAL PRIMARY KEY,
  form_slug     TEXT NOT NULL,
  date          TEXT NOT NULL,                -- YYYY-MM-DD
  total_starts  INTEGER DEFAULT 0,
  total_submits INTEGER DEFAULT 0,
  total_abandons INTEGER DEFAULT 0,
  avg_completion_ms INTEGER,
  median_completion_ms INTEGER,
  field_stats   JSONB,                        -- [{fieldId, avgTimeMs, skipRate, errorCount}]
  section_stats JSONB,                        -- [{sectionId, reachRate, avgTimeMs}]
  drop_off_points JSONB,                      -- [{fieldId, dropOffCount, dropOffRate}]
  computed_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(form_slug, date)
);

CREATE INDEX IF NOT EXISTS idx_fa_daily_slug_date
  ON form_analytics_daily (form_slug, date);
