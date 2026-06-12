-- gv-001 — Governance × Daily Dash dynamic questions (GV module)
-- All additive. See EHRC-GOVERNANCE-DYNAMIC-FORMS-PRD-v1.0.md §7.

CREATE TABLE IF NOT EXISTS ot_case_log (
  id SERIAL PRIMARY KEY,
  case_date DATE NOT NULL,
  case_ref TEXT NOT NULL,
  hospital_code TEXT NOT NULL DEFAULT 'EHRC',
  ot_room TEXT,
  sl_no TEXT,
  scheduled_time TEXT,
  patient_name TEXT,
  uhid TEXT,
  procedure_name TEXT,
  surgeon_raw TEXT,
  surgeon_physician_id TEXT,
  anaesthetist_raw TEXT,
  anaesthesia TEXT,
  remarks TEXT,
  cancelled BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'sheet',
  source_tab TEXT,
  row_hash TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_date, case_ref)
);
CREATE INDEX IF NOT EXISTS idx_ot_case_log_date ON ot_case_log(case_date);
CREATE INDEX IF NOT EXISTS idx_ot_case_log_surgeon ON ot_case_log(surgeon_physician_id);

CREATE TABLE IF NOT EXISTS governance_question_sets (
  id SERIAL PRIMARY KEY,
  for_date DATE NOT NULL,
  hospital_code TEXT NOT NULL DEFAULT 'EHRC',
  slug TEXT NOT NULL,
  sections JSONB NOT NULL,
  context JSONB,
  generator_version TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (for_date, slug)
);

CREATE TABLE IF NOT EXISTS governance_responses (
  id SERIAL PRIMARY KEY,
  for_date DATE NOT NULL,
  slug TEXT NOT NULL,
  question_set_id INTEGER,
  template_id TEXT NOT NULL,
  physician_id TEXT,
  physician_name_raw TEXT,
  case_ref TEXT,
  metric TEXT NOT NULL,
  value TEXT,
  filler_name TEXT,
  filler_device_id TEXT,
  match_status TEXT NOT NULL DEFAULT 'matched',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gov_resp_phys ON governance_responses(physician_id, for_date);
CREATE INDEX IF NOT EXISTS idx_gov_resp_date ON governance_responses(for_date, slug);

CREATE TABLE IF NOT EXISTS governance_outbox (
  id SERIAL PRIMARY KEY,
  payload JSONB NOT NULL,
  dedup_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS governance_watchlist (
  id SERIAL PRIMARY KEY,
  hospital_code TEXT NOT NULL DEFAULT 'EHRC',
  patient_ref TEXT NOT NULL,
  patient_name TEXT,
  procedure_name TEXT,
  surgeon_physician_id TEXT,
  surgeon_raw TEXT,
  surgery_date DATE NOT NULL,
  window_days INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  UNIQUE (patient_ref, surgery_date)
);

CREATE TABLE IF NOT EXISTS governance_watchlist_checks (
  id SERIAL PRIMARY KEY,
  watchlist_id INTEGER NOT NULL REFERENCES governance_watchlist(id),
  check_date DATE NOT NULL,
  pod INTEGER,
  wound_status TEXT,
  notes TEXT,
  escalated BOOLEAN NOT NULL DEFAULT false,
  filler_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (watchlist_id, check_date)
);

CREATE TABLE IF NOT EXISTS gv_name_aliases (
  id SERIAL PRIMARY KEY,
  alias_norm TEXT NOT NULL UNIQUE,
  physician_id TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gv_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
