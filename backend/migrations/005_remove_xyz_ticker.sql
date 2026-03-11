-- Remove XYZ (Block/SQ rebrand) ticker data from Supabase tables.
-- XYZ was already removed from the scanned watchlist but stale rows may remain.

DELETE FROM meme_alerts WHERE ticker = 'XYZ';
DELETE FROM predicted_movers WHERE ticker = 'XYZ';
