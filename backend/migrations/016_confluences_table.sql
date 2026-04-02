-- Migration 016: Dedicated confluences table for persistent signal × catalyst storage
-- Confluences accumulate over time; each detection is a timestamped event.
-- Rows expire after 6 hours but are never deleted automatically.

CREATE TABLE IF NOT EXISTS confluences (
  id SERIAL PRIMARY KEY,
  ticker TEXT NOT NULL,
  type TEXT NOT NULL,
  signal_score FLOAT,
  direction TEXT,
  headline TEXT,
  signal_context TEXT,
  insight TEXT,
  confidence TEXT,
  detected_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '6 hours'
);

CREATE INDEX IF NOT EXISTS idx_confluences_expires ON confluences (expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_confluences_ticker ON confluences (ticker);
