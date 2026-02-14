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

Both servers must run simultaneously for full functionality. The frontend hardcodes the API base URL as `http://127.0.0.1:8000`.

## Required Environment Variables (backend/.env)
- `SUPABASE_URL` / `SUPABASE_KEY` — Supabase project credentials
- `FINNHUB_API_KEY` — News sentiment data
- `FRONTEND_URL` — Optional, for CORS in production

## Architecture

### Backend (backend/)
- **main.py** — FastAPI app with all API endpoints, CORS config, Supabase integration, caching, and a background loop that refreshes data every hour
- **meme_detector.py** — Three-signal early warning system (options flow, volume spikes, social sentiment) that scores tickers 0-10 and assigns alert levels (CRITICAL/HIGH/MEDIUM/LOW)

Key API endpoints:
- `/alerts/scan` — Full 50-ticker scan (expensive, triggers API calls)
- `/alerts/cached` — Fast cached alerts from Supabase (used by frontend)
- `/trending/hype` — Z-score hype analysis across all tickers
- `/trending/cached_hype` — Fast cached hype data
- `/premium/walk_forward/{ticker}` — Mock walk-forward analysis
- `/strategies/thematic` — Hardcoded sector groupings
- `/stock/{ticker}` — Single stock info via yfinance

Caching: 5-minute in-memory TTL for expensive endpoints; background task updates Supabase every hour. Finnhub calls have 0.5s rate-limit delays.

### Frontend (frontend/src/)
- **App.jsx** — Main shell with collapsible sidebar navigation, view routing (landing/dashboard/thematic/modeler/premium), growth modeler, and ticker detail modal
- **MarketScanner.jsx** — Primary dashboard showing 50-ticker watchlist with sorting and auto-refresh from `/alerts/cached`
- **AlertDashboard.jsx** — Alert summary cards with detail modals

State management is local React hooks only (useState/useEffect). No router library — views are toggled via state.

### Supabase Tables
- **ticker_hype** — Stores hype scores per ticker
- **meme_alerts** — Stores alert scores, levels, and signal breakdowns per ticker

### Styling
Dark theme with green (#00ff84) and amber (#ff9900) accents. CSS files are colocated with their components. Sidebar collapses from 250px to 70px.

## Tech Notes
- No TypeScript — plain JavaScript (JSX)
- No test suite or testing framework configured
- No CI/CD pipelines
- Alert scoring weights: 55% options + 45% volume (social signal disabled due to StockTwits API limits)
- Data sources: yfinance (free, no key), Finnhub (free tier with rate limits)
