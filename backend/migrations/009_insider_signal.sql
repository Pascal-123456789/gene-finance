-- Add insider buying signal columns to meme_alerts
ALTER TABLE meme_alerts
  ADD COLUMN IF NOT EXISTS insider_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insider_purchases_30d INT DEFAULT 0;
