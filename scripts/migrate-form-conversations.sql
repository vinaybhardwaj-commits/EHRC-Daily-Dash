-- AI Question Engine — Conversation Tables
-- Run: python3 -c "import psycopg2; ..." (psql not available in sandbox)

CREATE TABLE IF NOT EXISTS form_conversations (
  id SERIAL PRIMARY KEY,
  form_slug TEXT NOT NULL,
  date TEXT NOT NULL,
  session_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  anomalies_detected JSONB NOT NULL DEFAULT '[]'::jsonb,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  UNIQUE(form_slug, date)
);

CREATE TABLE IF NOT EXISTS form_conversation_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES form_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fc_slug_date ON form_conversations(form_slug, date);
CREATE INDEX IF NOT EXISTS idx_fc_status ON form_conversations(status);
CREATE INDEX IF NOT EXISTS idx_fcm_conversation ON form_conversation_messages(conversation_id);
