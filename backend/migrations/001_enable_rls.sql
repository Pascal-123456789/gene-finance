-- Enable Row Level Security on all tables
-- Read access: everyone (anon role)
-- Write access: service role only

-- ticker_hype
ALTER TABLE ticker_hype ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on ticker_hype"
  ON ticker_hype FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow service role write access on ticker_hype"
  ON ticker_hype FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- meme_alerts
ALTER TABLE meme_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on meme_alerts"
  ON meme_alerts FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow service role write access on meme_alerts"
  ON meme_alerts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- predicted_movers
ALTER TABLE predicted_movers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on predicted_movers"
  ON predicted_movers FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow service role write access on predicted_movers"
  ON predicted_movers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- critical_alerts
ALTER TABLE critical_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on critical_alerts"
  ON critical_alerts FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow service role write access on critical_alerts"
  ON critical_alerts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
