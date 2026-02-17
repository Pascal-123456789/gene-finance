# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gene Finance is a financial market analysis platform that detects unusual stock/crypto activity via options flow, volume spikes, and sentiment signals. Monorepo with a React frontend and Python FastAPI backend.

## Development Commands

### Frontend (React 19 + Vite)
```bash
cd frontend
npm install
npm run dev        # Dev server at http://localhost:5173
npm run build      # Production build to dist/
npm run lint       # ESLint
npm run preview    # Preview production build
```

### Backend (FastAPI + Supabase)
```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
python main.py     # Uvicorn server at http://localhost:8000
```

Both servers must run simultaneously for full functionality. The frontend reads the API base URL from `import.meta.env.VITE_API_URL` (falls back to `http://127.0.0.1:8000`). See `frontend/.env.example`.

## Required Environment Variables (backend/.env)
- `SUPABASE_URL` / `SUPABASE_KEY` — Supabase project credentials
- `FINNHUB_API_KEY` — News sentiment data
- `FRONTEND_URL` — Optional, for CORS in production
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` — Optional, for email alerts on CRITICAL tickers

## Architecture

### Backend (backend/)
- **main.py** — FastAPI app with all API endpoints, CORS config, Supabase integration, caching, and a background loop that refreshes data every hour
- **meme_detector.py** — Three-signal early warning system (options flow, volume spikes, Reddit/WSB social buzz via ApeWisdom) that scores tickers 0-10 and assigns alert levels (CRITICAL/HIGH/MEDIUM/LOW). ApeWisdom data is cached for 10 minutes. Logs warnings when high-discussion tickers (GME, AMC, TSLA, NVDA, AAPL, COIN, PLTR, HOOD) return 0 social score or when ApeWisdom returns empty data.

Key API endpoints:
- `/alerts/scan` — Full 50-ticker scan (expensive, triggers API calls)
- `/alerts/cached` — Fast cached alerts from Supabase (used by frontend)
- `/trending/hype` — Z-score hype analysis across all tickers
- `/trending/cached_hype` — Fast cached hype data
- `/movers/predicted` — Composite mover score (40% early_warning + 40% z-score momentum + 20% price level bonus), labels BREAKOUT (>=4.0) / WATCH (>=2.0) / NEUTRAL, saves to `predicted_movers` table
- `/premium/walk_forward/{ticker}` — Returns 501 Not Implemented (stub); frontend shows Coming Soon placeholder instead of calling this
- `/stock/{ticker}` — Single stock info via yfinance
- `POST /subscribe` — Upserts email + tickers array into `alert_subscriptions` table for CRITICAL-level email alerts
- `/polymarket/events` — Macro-relevant prediction market events from Polymarket's Gamma API, mapped to genuinely sensitive tickers via specific keyword phrases. 10-minute in-memory cache. Ticker mapping: fed rate/interest rate/fed chair/fed decision → SOFI, HOOD, COIN, BAC, JPM, GS, MS, WFC; recession → AAPL, MSFT, AMZN, GOOGL, META, NVDA; crypto regulation/ban/sec → COIN, HOOD; earnings → dynamically matched by ticker mention in question text only.
- `/debug/social` — Debug endpoint returning raw ApeWisdom response: top 20 trending tickers, exact matches with our watchlist, name-field fallback matches, and list of our tickers missing from ApeWisdom data

Caching: 5-minute in-memory TTL for expensive endpoints; 10-minute TTL for Polymarket; background task updates Supabase every hour. Finnhub calls have 0.5s rate-limit delays. After each scan, `send_critical_alert_emails()` sends SMTP emails to subscribed users for any CRITICAL-level tickers.

### Frontend (frontend/src/)
- **App.jsx** — Main shell with collapsible sidebar navigation, view routing (landing/dashboard/movers/heatmap/watchlist/premium), ticker detail modal (includes Polymarket section), Coming Soon premium placeholder, persistent "?" help FAB (bottom-right, all pages) that opens a HelpModal explaining alert levels, three signals with weights, predicted movers labels, heatmap, Polymarket badges, and a disclaimer. Landing page includes a 3-step "How It Works" section (scan → score → act).
- **MarketScanner.jsx** — Primary dashboard showing 50-ticker watchlist with sorting, auto-refresh from `/alerts/cached`, empty state handling, last-scanned timestamp, social score bar, Polymarket odds badge on matching cards, Watch button per card, signal bar hover tooltips (options/volume/social explanations), and info icon next to alert score showing weighted formula
- **HeatmapView.jsx** — Market heatmap grid of ticker tiles colored by mover_score signal strength (teal gradient), with CRITICAL alert pulsing red border and HIGH alert orange border. Tile size proportional to mover_score. Shows ticker symbol, price change %, signal score, and fire icon for high options/volume activity (>=6/10)
- **PredictedMovers.jsx** — Predicted Big Movers view with cards showing mover score, label, 5-day momentum, and price level flags (52-week high, round numbers)
- **WatchlistView.jsx** — Filtered view of watched tickers (stored in localStorage under `foega_watchlist`) with remove button and email alert subscription form
- **AlertDashboard.jsx** — Alert summary cards with detail modals

State management is local React hooks only (useState/useEffect). No router library — views are toggled via state.

### Supabase Tables
- **ticker_hype** — Stores hype scores per ticker
- **meme_alerts** — Stores alert scores, levels, and signal breakdowns per ticker
- **predicted_movers** — Stores mover scores, labels, momentum, and price level flags per ticker
- **alert_subscriptions** — Email alert subscriptions with email (unique), tickers array, and created_at timestamp (migration: `003_email_alerts.sql`)

### Styling
Dark theme with green (#00ff84) and amber (#ff9900) accents. CSS files are colocated with their components. Sidebar collapses from 250px to 70px.

## Tech Notes
- No TypeScript — plain JavaScript (JSX)
- No test suite or testing framework configured
- No CI/CD pipelines
- Alert scoring weights: 40% options + 35% volume + 25% social (Reddit/WSB via ApeWisdom)
- Data sources: yfinance (free, no key), Finnhub (free tier with rate limits), ApeWisdom (free, no key), Polymarket Gamma API (free, no key)
