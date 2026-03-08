-- Premium feature waitlist
CREATE TABLE IF NOT EXISTS premium_waitlist (
    email TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
