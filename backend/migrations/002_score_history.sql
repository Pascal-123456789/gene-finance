-- Score history table for tracking alert scores over time
CREATE TABLE score_history (
    id SERIAL PRIMARY KEY,
    ticker TEXT NOT NULL,
    early_warning_score NUMERIC,
    mover_score NUMERIC,
    alert_level TEXT,
    recorded_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient per-ticker lookups
CREATE INDEX idx_score_history_ticker_date ON score_history (ticker, recorded_at DESC);
