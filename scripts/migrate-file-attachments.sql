-- File attachments table for form engine file uploads
-- Run: psql $DATABASE_URL < scripts/migrate-file-attachments.sql

CREATE TABLE IF NOT EXISTS file_attachments (
  id            SERIAL PRIMARY KEY,
  form_slug     TEXT NOT NULL,
  field_id      TEXT NOT NULL,
  date          TEXT NOT NULL,               -- YYYY-MM-DD
  file_name     TEXT NOT NULL,
  file_url      TEXT NOT NULL,
  file_size     INTEGER,
  mime_type     TEXT,
  uploaded_at   TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by   TEXT                          -- optional: user identifier
);

CREATE INDEX IF NOT EXISTS idx_file_attachments_form_date
  ON file_attachments (form_slug, date);

CREATE INDEX IF NOT EXISTS idx_file_attachments_field
  ON file_attachments (field_id, date);
