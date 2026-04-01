import os
import json
import asyncio
import httpx
import numpy as np
import yfinance as yf
import time
import smtplib
from email.mime.text import MIMEText
from datetime import date, datetime, timedelta
from typing import List, Dict, Union, Any, Optional
from pydantic import BaseModel
from meme_detector import MemeStockDetector

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi import BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from textblob import TextBlob
import nltk

# Ensure NLTK data is available
nltk.download('punkt')
nltk.download('brown')

load_dotenv() # Loads SUPABASE_URL and KEY from your .env file

app = FastAPI(title="GenZ Finance API")

# CORS: dev origins + production FRONTEND_URL
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://gene-finance.vercel.app",
    "https://earlybell.app",
    "https://www.earlybell.app",
]
if os.getenv("FRONTEND_URL"):
    origins.append(os.getenv("FRONTEND_URL"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Supabase Globals
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = None

# --- Caching Variables ---
CACHE = {"timestamp": None, "data": None}
CACHE_TTL_SECONDS = 300 # Time To Live: 5 minutes (300 seconds)

# --- Polymarket Caching ---
POLYMARKET_CACHE = {"timestamp": None, "data": None}
POLYMARKET_CACHE_TTL = 600  # 10 minutes

POLYMARKET_TICKER_MAP = {
    "fed rate": ["SOFI", "HOOD", "COIN", "BAC", "JPM", "GS", "MS", "WFC"],
    "interest rate": ["SOFI", "HOOD", "COIN", "BAC", "JPM", "GS", "MS", "WFC"],
    "fed chair": ["SOFI", "HOOD", "COIN", "BAC", "JPM", "GS", "MS", "WFC"],
    "fed decision": ["SOFI", "HOOD", "COIN", "BAC", "JPM", "GS", "MS", "WFC"],
    "recession": ["AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA"],
    "crypto regulation": ["COIN", "HOOD"],
    "crypto ban": ["COIN", "HOOD"],
    "sec crypto": ["COIN", "HOOD"],
    "earnings": [],  # dynamically matched by ticker mention in question
}


CLIENT = httpx.AsyncClient(follow_redirects=True)

# --- API KEYS ---
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# --- NEWS INTELLIGENCE ---
_article_cache: list = []  # Populated by scan_for_alerts(), consumed by collect_top_headlines()

# --- SMTP CONFIG ---
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASS = os.getenv("SMTP_PASS")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER or "")

# --- RATE LIMIT ---
FINNHUB_CALL_DELAY = 1.5 # ~40 calls/min, safely under Finnhub's 60/min limit

# --- TICKERS (Separated for better normalization) ---
STOCK_TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "NFLX",
    "AMD", "INTC", "AVGO", "QCOM", "TSM", "MU",
    "V", "MA", "PYPL", "COIN", "HOOD", "SOFI",
    "GME", "AMC", "PLTR", "SNAP", "RBLX",
    "UBER", "LYFT", "DASH", "SPOT", "ZM",
    "JPM", "BAC", "GS", "MS", "WFC",
    "JNJ", "UNH", "PFE", "ABBV", "LLY",
    "XOM", "CVX", "COP", "SLB",
    "WMT", "HD", "NKE", "MCD",
]
CRYPTO_TICKERS = [
    "BTC-USD", "ETH-USD", "SOL-USD", "AVAX-USD", "DOGE-USD"
]
TICKER_LIST = STOCK_TICKERS + CRYPTO_TICKERS

# ---------------------------
# DATABASE LIFESPAN EVENTS
# ---------------------------

@app.on_event("startup")
async def startup_event():
    """
    AWS-Safe Startup: Starts the background loop only once.
    """
    # Initialize Supabase
    global supabase
    if SUPABASE_URL and SUPABASE_KEY:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("Supabase client initialized successfully.")
    
    # Log API key status
    if FINNHUB_API_KEY:
        print(f"Finnhub API key loaded ({len(FINNHUB_API_KEY)} chars)")
    else:
        print("WARNING: FINNHUB_API_KEY not set — sentiment_score and news_count will be 0")

    # Start the Background Loop
    asyncio.create_task(scheduled_update_loop())
    
    # Initialize the meme detector
    global detector
    detector = MemeStockDetector()
    
async def scheduled_update_loop():
    """
    This runs forever in the background.
    On AWS, it ensures the database stays fresh even if no one visits the site.
    """
    while True:
        print(f"AUTO-UPDATE: Loop tick at {datetime.now()}")

        try:
            print("AUTO-UPDATE: Starting alert scan...")
            await scan_for_alerts()
            print("AUTO-UPDATE: Alert scan complete.")
        except Exception as e:
            print(f"AUTO-UPDATE: scan_for_alerts() FAILED: {e}")

        try:
            print("AUTO-UPDATE: Starting hype fetch...")
            await trending_hype()
            print("AUTO-UPDATE: Hype data updated.")
        except Exception as e:
            print(f"AUTO-UPDATE: trending_hype() FAILED: {e}")

        try:
            print("AUTO-UPDATE: Updating predicted movers...")
            movers_result = await predicted_movers()
            movers_count = len(movers_result) if isinstance(movers_result, list) else 0
            print(f"AUTO-UPDATE: Predicted movers complete — {movers_count} tickers processed.")
        except Exception as e:
            print(f"AUTO-UPDATE: predicted_movers() FAILED: {e}")

        try:
            print("AUTO-UPDATE: Running news intelligence analysis...")
            headlines = collect_top_headlines()
            analysis = await analyze_headlines_with_ai(headlines)
            if supabase:
                supabase.table('news_intelligence').insert({
                    **analysis,
                    "headline_count": len(headlines),
                    "headlines": headlines,
                }).execute()
            print(f"AUTO-UPDATE: News intelligence saved ({len(headlines)} headlines analyzed)")
        except Exception as e:
            print(f"AUTO-UPDATE: news intelligence FAILED: {e}")

        print("AUTO-UPDATE: All tasks complete. Sleeping for 1 hour.")
        # Wait for 1 hour (3600 seconds)
        await asyncio.sleep(3600)
        

# ---------------------------
# HELPER FUNCTIONS (ASYNC DATA COLLECTION)
# ---------------------------

def calculate_sentiment(text: str) -> float:
    """Calculates the TextBlob sentiment polarity score (-1.0 to 1.0) for a given text."""
    if not text:
        return 0.0
    
    analysis = TextBlob(text)
    return analysis.sentiment.polarity

async def async_news_sentiment_and_volume(ticker: str, debug: bool = False) -> Dict[str, Union[str, int, float]]:
    """
    Fetches news, calculates sentiment, and counts volume using Finnhub.
    Finnhub company-news only works for stock symbols, not crypto (BTC-USD etc).
    """
    ticker = ticker.upper()

    # Skip crypto tickers — Finnhub company-news doesn't support them
    if "-" in ticker:
        if debug:
            print(f"FINNHUB [{ticker}]: Skipping — crypto ticker not supported by company-news endpoint")
        return {"ticker": ticker, "news_raw": 0, "social_raw": 0.0, "articles": []}

    if not FINNHUB_API_KEY:
        print(f"FINNHUB [{ticker}]: No API key set — skipping")
        return {"ticker": ticker, "news_raw": 0, "social_raw": 0.0, "articles": []}

    await asyncio.sleep(FINNHUB_CALL_DELAY)

    # Compute dates dynamically (not at module load) so long-running servers stay current
    today_str = date.today().isoformat()
    seven_days_ago = (date.today() - timedelta(days=7)).isoformat()
    url = (
        f"https://finnhub.io/api/v1/company-news?symbol={ticker}&"
        f"from={seven_days_ago}&to={today_str}&token={FINNHUB_API_KEY}"
    )

    if debug:
        masked_key = FINNHUB_API_KEY[:4] + "..." + FINNHUB_API_KEY[-4:] if len(FINNHUB_API_KEY) > 8 else "***"
        print(f"FINNHUB [{ticker}]: URL=https://finnhub.io/api/v1/company-news?symbol={ticker}&from={seven_days_ago}&to={today_str}&token={masked_key}")

    try:
        response = await CLIENT.get(url, timeout=10)

        if debug:
            print(f"FINNHUB [{ticker}]: HTTP {response.status_code}, content-type={response.headers.get('content-type', 'unknown')}, body_length={len(response.content)}")

        response.raise_for_status()
        news_data = response.json()

        if not isinstance(news_data, list):
            print(f"FINNHUB [{ticker}]: Unexpected response type: {type(news_data).__name__} — {str(news_data)[:200]}")
            return {"ticker": ticker, "news_raw": 0, "social_raw": 0.0, "articles": []}

        article_count = len(news_data)

        if debug:
            print(f"FINNHUB [{ticker}]: {article_count} articles returned")
            if article_count > 0:
                first = news_data[0]
                print(f"FINNHUB [{ticker}]: First article: headline={first.get('headline', '')[:80]}")

        combined_text = ' '.join([
            (article.get('headline', '') + ' ' + article.get('summary', ''))
            for article in news_data if article.get('headline')
        ])

        sentiment_score = calculate_sentiment(combined_text)

        if debug:
            print(f"FINNHUB [{ticker}]: TextBlob sentiment={sentiment_score:.4f}, text_length={len(combined_text)}")

        return {
            "ticker": ticker,
            "news_raw": article_count,
            "social_raw": sentiment_score,
            "articles": news_data,
        }

    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            print(f"FINNHUB [{ticker}]: Rate limit exceeded (429)")
        elif e.response.status_code in (401, 403):
            print(f"FINNHUB [{ticker}]: Auth error (status {e.response.status_code}) — check FINNHUB_API_KEY")
            if debug:
                print(f"FINNHUB [{ticker}]: Response body: {e.response.text[:300]}")
        else:
            print(f"FINNHUB [{ticker}]: HTTP {e.response.status_code}")
            if debug:
                print(f"FINNHUB [{ticker}]: Response body: {e.response.text[:300]}")
        return {"ticker": ticker, "news_raw": 0, "social_raw": 0.0, "articles": []}
    except Exception as e:
        print(f"FINNHUB [{ticker}]: {type(e).__name__}: {e}")
        return {"ticker": ticker, "news_raw": 0, "social_raw": 0.0, "articles": []}

# ---------------------------
# EARNINGS CALENDAR (FINNHUB)
# ---------------------------

async def fetch_earnings_calendar() -> Dict[str, Dict[str, str]]:
    """
    Fetch upcoming earnings for the next 14 days via Finnhub bulk endpoint.
    Returns dict mapping ticker -> {"date": "YYYY-MM-DD", "time": "bmo"|"amc"|None}
    Single API call — not per-ticker.
    """
    if not FINNHUB_API_KEY:
        print("EARNINGS: Skipped — no FINNHUB_API_KEY")
        return {}

    today_str = date.today().isoformat()
    end_str = (date.today() + timedelta(days=14)).isoformat()
    url = f"https://finnhub.io/api/v1/calendar/earnings?from={today_str}&to={end_str}&token={FINNHUB_API_KEY}"

    try:
        await asyncio.sleep(FINNHUB_CALL_DELAY)
        response = await CLIENT.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()
        earnings_list = data.get("earningsCalendar", [])

        result = {}
        for entry in earnings_list:
            symbol = entry.get("symbol", "")
            if not symbol:
                continue
            # Keep first occurrence per ticker (earliest date)
            if symbol not in result:
                hour = entry.get("hour", "")
                result[symbol] = {
                    "date": entry.get("date", ""),
                    "time": hour if hour in ("bmo", "amc") else None,
                }

        print(f"EARNINGS CALENDAR: {len(earnings_list)} entries, {len(result)} unique tickers in next 14 days")
        return result

    except Exception as e:
        print(f"EARNINGS CALENDAR ERROR: {type(e).__name__}: {e}")
        return {}

# ---------------------------
# HELPER FUNCTIONS (DATA PROCESSING)
# ---------------------------

def calculate_z_scores(raw_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Calculates the Z-score for Social Sentiment (70%) and News (30%) data.
    """
    if len(raw_results) < 2:
        return raw_results

    social_scores = np.array([r["social_raw"] for r in raw_results])
    news_counts = np.array([r["news_raw"] for r in raw_results])
    
    # Calculate Z-score for Social Sentiment (social_z)
    if np.std(social_scores) == 0:
        social_z = np.zeros_like(social_scores, dtype=float)
    else:
        social_z = (social_scores - np.mean(social_scores)) / np.std(social_scores)

    # Calculate Z-score for News Volume (news_z)
    if np.std(news_counts) == 0:
        news_z = np.zeros_like(news_counts, dtype=float)
    else:
        news_z = (news_counts - np.mean(news_counts)) / np.std(news_counts)

    for i, r in enumerate(raw_results):
        r["social_z"] = float(social_z[i])
        r["news_z"] = float(news_z[i])
        
        # Hype Score Calculation: 70% Social Sentiment, 30% News Volume
        r["hype_score"] = (0.7 * r["social_z"]) + (0.3 * r["news_z"])
        
    return raw_results

# ---------------------------
# FASTAPI ENDPOINTS
# ---------------------------

@app.get("/")
def status():
    return {"status": "ok"}

@app.get("/stock/{ticker}")
def get_stock(ticker: str):
    ticker = ticker.upper()
    stock = yf.Ticker(ticker)
    info = stock.info
    
    return {
        "ticker": ticker,
        "price": info.get("regularMarketPrice"),
        "marketCap": info.get("marketCap"),
        "sector": info.get("sector"),
        "summary": info.get("longBusinessSummary"),
    }


@app.get("/hype/{ticker}")
async def get_hype_raw(ticker: str):
    ticker_upper = ticker.upper()
    result = await async_news_sentiment_and_volume(ticker_upper)
    
    social_raw = result.get("social_raw", 0.0)
    news_raw = result.get("news_raw", 0)
    
    return {
        "ticker": ticker_upper,
        "social_raw": social_raw,
        "news_raw": news_raw,
        "google_trends_raw": 0, # Keep for consistent external schema
    }


@app.get("/trending/hype")
async def trending_hype():
    global CACHE, supabase
    
    # 1. Check Cache
    current_time = time.time()
    
    if CACHE["data"] is not None and (current_time - CACHE["timestamp"]) < CACHE_TTL_SECONDS:
        print(f"Serving data from cache. Expires in {int(CACHE_TTL_SECONDS - (current_time - CACHE['timestamp']))}s.")
        return CACHE["data"]

    # 2. Cache Miss: Proceed with expensive API calls
    print(f"Cache miss or expired. Starting sequential data collection for {len(TICKER_LIST)} tickers...")
    
    raw_results = []
    
    # Use a sequential loop with delays to respect Finnhub's rate limit
    for ticker in TICKER_LIST:
        try:
            # We call the FastAPI endpoint for a single ticker, which calls the Finnhub API
            result = await get_hype_raw(ticker)
            if result:
                raw_results.append(result)
            
            # The async_news_sentiment_and_volume already contains a sleep of 0.5s.
            # We will add another 0.5s here just to be completely safe, totaling 1s per ticker.
            # This is safer than relying on only the sleep inside the inner function.
            await asyncio.sleep(0.5)
            
        except Exception as e:
            print(f"Error during sequential fetch for {ticker}: {type(e).__name__}: {e}")
            continue # Continue to the next ticker
    
    successful_results = [r for r in raw_results if isinstance(r, dict) and "ticker" in r]
    
    # --- Separate and Score Data ---
    stock_results = [r for r in successful_results if r["ticker"] in STOCK_TICKERS]
    crypto_results = [r for r in successful_results if r["ticker"] in CRYPTO_TICKERS]
    
    scored_stocks = calculate_z_scores(stock_results)
    scored_crypto = calculate_z_scores(crypto_results)
    
    results_scored = scored_stocks + scored_crypto
    results_sorted = sorted(results_scored, key=lambda x: x["hype_score"], reverse=True)
    # --- End Data Collection Logic ---

    # 3. Update Database and Cache
    
    if supabase:
        print("Attempting to save results to database via HTTP client...")
        records = []
        for item in results_sorted:
            records.append({
                "ticker": item["ticker"],
                "hype_score": item["hype_score"],
                "social_raw": item["social_raw"],
                "news_raw": item["news_raw"],
            })

        try:
            # Upsert using the Supabase Python SDK
            # This requires 'ticker' to be set as the Primary Key in the Supabase table.
            response = supabase.table('ticker_hype').upsert(records, on_conflict='ticker').execute()
            
            # Check for errors in the response
            if hasattr(response, 'data') and len(response.data) > 0:
                print(f"Results saved to Supabase successfully (Count: {len(response.data)}).")
            else:
                print(f"Supabase WRITE ERROR: Upsert failed or returned empty data.")
        except Exception as e:
            print(f"Supabase WRITE ERROR: {type(e).__name__}: {e}")

    # Update in-memory cache
    CACHE["data"] = results_sorted
    CACHE["timestamp"] = current_time
    print(f"Data collected and cached successfully.")
    
    return results_sorted

@app.get("/trending/cached_hype")
async def trending_cached_hype():
    global supabase

    if not supabase:
        return {"error": "Supabase connection not available."}, 500

    print("Fetching cached hype data from Supabase...")
    try:
        # 1. Fetch all data WITHOUT attempting to sort via the SDK
        response = supabase.table('ticker_hype').select('*').execute()
        results = response.data

        if not results:
            print("Supabase table 'ticker_hype' is empty.")
            return []
        
        # 2. Sort the data using Python's standard sort function
        # Sorts by 'hype_score' (which is a float) in descending order.
        results_sorted = sorted(results, key=lambda x: x.get('hype_score', -999.0), reverse=True)
        
        print(f"Successfully fetched and sorted {len(results_sorted)} records from Supabase cache.")
        return results_sorted

    except Exception as e:
        print(f"Supabase READ ERROR: {type(e).__name__}: {e}")
        return {"error": f"Failed to read from database: {e}"}, 500

from fastapi.responses import JSONResponse

@app.get("/premium/walk_forward/{ticker}")
def get_walk_forward_analysis(ticker: str):
    """Walk-forward analysis is not yet implemented."""
    return JSONResponse(
        status_code=501,
        content={"detail": "Walk-forward analysis is not yet implemented."}
    )

# ==========================================
# PREDICTED BIG MOVERS
# ==========================================

ROUND_NUMBERS = [50, 100, 150, 200, 250, 300, 500]

@app.get("/movers/predicted")
async def predicted_movers():
    """
    Composite mover score using early_warning_score, 5-day momentum,
    and proximity to key price levels (52-week high, round numbers).
    """
    if not supabase:
        return {"error": "Database not configured"}

    # 1. Fetch existing alert scores from Supabase
    try:
        response = supabase.table('meme_alerts').select('ticker, alert_score').execute()
        alert_rows = response.data or []
    except Exception as e:
        print(f"Supabase read error: {e}")
        alert_rows = []

    alert_map = {r["ticker"]: r.get("alert_score", 0) for r in alert_rows}
    tickers = list(alert_map.keys())

    if not tickers:
        print("predicted_movers: meme_alerts is empty — no tickers to process. Run scan_for_alerts first.")
        return []

    results = []

    for ticker in tickers:
        try:
            stock = yf.Ticker(ticker)
            hist = stock.history(period="10d")

            if hist.empty or len(hist) < 2:
                continue

            close_today = float(hist["Close"].iloc[-1])

            # 5-day momentum
            if len(hist) >= 6:
                close_5d_ago = float(hist["Close"].iloc[-6])
            else:
                close_5d_ago = float(hist["Close"].iloc[0])
            momentum = (close_today - close_5d_ago) / close_5d_ago if close_5d_ago != 0 else 0.0

            # 52-week high proximity
            info = stock.info
            week_high_52 = info.get("fiftyTwoWeekHigh", 0)
            near_52w_high = (
                week_high_52 > 0
                and close_today >= week_high_52 * 0.98
            )

            # Round number proximity (within 1%)
            near_round = False
            for rn in ROUND_NUMBERS:
                if abs(close_today - rn) / rn <= 0.01:
                    near_round = True
                    break

            # Price level bonus (0–10 scale)
            price_level_bonus = 0.0
            if near_52w_high:
                price_level_bonus += 6.0
            if near_round:
                price_level_bonus += 4.0

            early_warning = alert_map.get(ticker, 0)

            results.append({
                "ticker": ticker,
                "momentum_raw": momentum,
                "momentum_pct": round(momentum * 100, 2),
                "near_52w_high": near_52w_high,
                "near_round_number": near_round,
                "price_level_bonus": price_level_bonus,
                "current_price": round(close_today, 2),
                "early_warning_score": early_warning,
            })

        except Exception as e:
            print(f"Error processing {ticker} for movers: {e}")
            continue

    # Z-score normalise momentum across the batch
    if len(results) >= 2:
        momentums = np.array([r["momentum_raw"] for r in results])
        std = np.std(momentums)
        if std == 0:
            momentum_z_scores = np.zeros_like(momentums, dtype=float)
        else:
            momentum_z_scores = (momentums - np.mean(momentums)) / std
    else:
        momentum_z_scores = np.zeros(len(results), dtype=float)

    for i, r in enumerate(results):
        momentum_z = float(momentum_z_scores[i])
        # Scale z-score to 0-10 range (cap at ±3 std devs = ±10 pts)
        momentum_z_scaled = max(min(momentum_z * (10 / 3), 10), -10)

        mover_score = (
            0.4 * r["early_warning_score"]
            + 0.4 * momentum_z_scaled
            + 0.2 * r["price_level_bonus"]
        )

        label = "NEUTRAL"
        if mover_score >= 4.0:
            label = "BREAKOUT"
        elif mover_score >= 2.0:
            label = "WATCH"

        r["mover_score"] = round(mover_score, 2)
        r["label"] = label
        # Clean up internal fields
        del r["momentum_raw"]
        del r["price_level_bonus"]

    results.sort(key=lambda x: x["mover_score"], reverse=True)

    # Save to Supabase
    if supabase and results:
        try:
            from datetime import datetime
            records = [
                {
                    "ticker": r["ticker"],
                    "mover_score": r["mover_score"],
                    "label": r["label"],
                    "momentum_pct": r["momentum_pct"],
                    "near_52w_high": r["near_52w_high"],
                    "near_round_number": r["near_round_number"],
                    "current_price": r["current_price"],
                    "early_warning_score": r["early_warning_score"],
                }
                for r in results
            ]
            print(f"Writing {len(records)} movers to predicted_movers table at {datetime.now().isoformat()}")
            supabase.table('predicted_movers').upsert(records, on_conflict='ticker').execute()
            print(f"Saved {len(records)} predicted movers to database")
        except Exception as e:
            print(f"predicted_movers save error: {e}")

    return results


@app.get("/movers/cached")
async def get_cached_movers():
    """Get predicted movers from database (fast)"""
    if not supabase:
        return {"error": "Database not configured"}

    try:
        response = supabase.table('predicted_movers').select('*').execute()
        results = response.data

        if not results:
            return []

        results_sorted = sorted(results, key=lambda x: x.get('mover_score', 0), reverse=True)
        return results_sorted

    except Exception as e:
        print(f"predicted_movers read error: {e}")
        return {"error": str(e)}


# ==========================================
# NEW MEME STOCK ALERT ENDPOINTS
# ==========================================

# ---------------------------
# NEWS INTELLIGENCE HELPERS
# ---------------------------

def collect_top_headlines() -> list:
    """
    Deduplicate and return the 30 most recent headlines from _article_cache.
    _article_cache is populated by scan_for_alerts() during the Finnhub loop.
    """
    seen_headlines: set = set()
    unique: list = []
    sorted_articles = sorted(_article_cache, key=lambda x: x.get("datetime", 0), reverse=True)
    for article in sorted_articles:
        headline = (article.get("headline") or "").strip()
        if not headline or headline in seen_headlines:
            continue
        seen_headlines.add(headline)
        unique.append({
            "headline": headline,
            "summary": (article.get("summary") or "")[:300],
            "ticker": article.get("ticker", ""),
            "datetime": article.get("datetime", 0),
        })
        if len(unique) >= 30:
            break
    return unique


async def analyze_headlines_with_ai(headlines: list) -> dict:
    """
    Send deduplicated headlines to OpenRouter (meta-llama/llama-3.3-70b-instruct) and
    return structured JSON with macro_summary, sector_impacts, ticker_impacts, etc.
    Returns a safe empty structure on any failure.
    """
    default = {
        "macro_summary": "",
        "macro_themes": [],
        "sector_impacts": [],
        "ticker_impacts": [],
        "overall_sentiment": "NEUTRAL",
    }

    if not OPENROUTER_API_KEY:
        print("NEWS INTELLIGENCE: Skipped — OPENROUTER_API_KEY not set")
        return default

    if not headlines:
        print("NEWS INTELLIGENCE: Skipped — no headlines collected")
        return default

    headlines_text = "\n".join(
        f"[{h['ticker']}] {h['headline']}" for h in headlines
    )

    prompt = f"""You are a financial market analyst. Analyze these recent news headlines and return a JSON object with exactly this structure:
{{
  "macro_summary": "2-3 sentence summary of the dominant market narrative this week",
  "macro_themes": ["theme1", "theme2", "theme3"],
  "sector_impacts": [
    {{"sector": "Technology", "direction": "POSITIVE|NEGATIVE|NEUTRAL|MIXED", "reason": "one sentence", "confidence": "HIGH|MEDIUM|LOW"}}
  ],
  "ticker_impacts": [
    {{"ticker": "NVDA", "direction": "POSITIVE|NEGATIVE|NEUTRAL", "reason": "one sentence", "magnitude": 1}}
  ],
  "overall_sentiment": "BULLISH|BEARISH|NEUTRAL|MIXED"
}}
Only include sectors and tickers that are meaningfully impacted. Do not include tickers not mentioned in the headlines. magnitude is an integer 1-10.

Headlines:
{headlines_text}"""

    try:
        await asyncio.sleep(0)  # yield to event loop
        response = await CLIENT.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://earlybell.app",
                "X-Title": "EarlyBell",
            },
            json={
                "model": "meta-llama/llama-3.3-70b-instruct",
                "messages": [
                    {"role": "system", "content": "Respond ONLY in valid JSON, no markdown, no code blocks, no preamble."},
                    {"role": "user", "content": prompt},
                ],
            },
            timeout=30,
        )
        response.raise_for_status()
        raw_content = response.json()["choices"][0]["message"]["content"]
        print(f"NEWS INTELLIGENCE RAW RESPONSE ({len(raw_content)} chars): {raw_content[:600]}")

        # Strip markdown code fences — Llama often adds them despite being told not to
        text = raw_content.strip()
        if text.startswith("```"):
            parts = text.split("```")
            text = parts[1] if len(parts) > 1 else text
            if text.startswith("json"):
                text = text[4:]
        text = text.strip()

        parsed = json.loads(text)
        print(f"NEWS INTELLIGENCE PARSED: sentiment={parsed.get('overall_sentiment')}, "
              f"{len(parsed.get('sector_impacts', []))} sectors, "
              f"{len(parsed.get('ticker_impacts', []))} tickers, "
              f"themes={parsed.get('macro_themes', [])}")
        return parsed

    except Exception as e:
        print(f"NEWS INTELLIGENCE: analyze_headlines_with_ai failed: {type(e).__name__}: {e}")
        return default


# ==========================================

@app.get("/alerts/scan")
async def scan_for_alerts():
    """
    Main endpoint - scans for unified alerts
    NOW INCLUDES: Options + Volume + Sentiment + Price
    """
    global detector
    
    if not detector:
        detector = MemeStockDetector()
    
    # Expanded 50-ticker watchlist organized by sector
    watchlist = [
        # === MEGA CAP TECH (8) ===
        "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "NFLX",
        
        # === SEMICONDUCTORS (6) ===
        "AMD", "INTC", "AVGO", "QCOM", "TSM", "MU",
        
        # === FINTECH & PAYMENTS (6) ===
        "V", "MA", "PYPL", "COIN", "HOOD", "SOFI",
        
        # === MEME STOCKS (5) ===
        "GME", "AMC", "PLTR", "SNAP", "RBLX",
        
        # === GROWTH TECH (6) ===
        "UBER", "LYFT", "DASH", "SPOT", "ZM",
        
        # === FINANCE (5) ===
        "JPM", "BAC", "GS", "MS", "WFC",
        
        # === HEALTHCARE (5) ===
        "JNJ", "UNH", "PFE", "ABBV", "LLY",
        
        # === ENERGY (4) ===
        "XOM", "CVX", "COP", "SLB",
        
        # === CONSUMER (4) ===
        "WMT", "HD", "NKE", "MCD",
    ]
    
    print(f"Scanning {len(watchlist)} tickers for unified alerts...")
    
    # Get alert data (options + volume)
    results = await detector.scan_watchlist(watchlist)
    
    # ADD: Sentiment + Price for each ticker
    finnhub_errors = 0
    for idx, item in enumerate(results):
        ticker = item["ticker"]

        # Add sentiment (with rate-limit tracking)
        try:
            debug_this = (ticker == "AVGO")  # Debug one ticker to diagnose Finnhub issues
            sentiment_data = await async_news_sentiment_and_volume(ticker, debug=debug_this)
            item["sentiment_score"] = sentiment_data.get("social_raw", 0.0)
            item["news_count"] = sentiment_data.get("news_raw", 0)
            item["_articles"] = sentiment_data.get("articles", [])
            if item["news_count"] > 0:
                print(f"  [{idx+1}/{len(results)}] {ticker}: {item['news_count']} articles, sentiment={item['sentiment_score']:.3f}")
        except Exception as e:
            item["sentiment_score"] = 0.0
            item["news_count"] = 0
            finnhub_errors += 1
            print(f"  [{idx+1}/{len(results)}] {ticker}: EXCEPTION {type(e).__name__}: {e}")

        # Add price — try info first, fall back to history()
        try:
            stock = yf.Ticker(ticker)
            info = stock.info
            price = info.get("regularMarketPrice", 0) or 0
            pct = info.get("regularMarketChangePercent", 0) or 0
            # Fallback: if info didn't return price, use recent history
            if price <= 0:
                hist = stock.history(period="2d")
                if not hist.empty:
                    price = float(hist["Close"].iloc[-1])
                    if len(hist) >= 2:
                        prev = float(hist["Close"].iloc[-2])
                        pct = ((price - prev) / prev * 100) if prev > 0 else 0
            item["current_price"] = price
            item["price_change_pct"] = pct
        except Exception as e:
            print(f"yfinance error for {ticker}: {e}")
            item["current_price"] = 0
            item["price_change_pct"] = 0

        # Fetch insider signal AFTER price (avoids 48 SEC EDGAR calls exhausting yfinance)
        try:
            insider_data = await detector.get_insider_signal(ticker)
        except Exception as e:
            print(f"Insider signal failed for {ticker}: {e}")
            insider_data = {"score": 0, "signal": "NO_DATA", "purchases_30d": 0,
                            "total_buy_volume_usd": 0, "unusual_insider_buying": False}
        item["insider_signal"] = insider_data

        # Insider is supplementary only — does not affect the core score or alert level.
        # Core score is already final from meme_detector: 40% options + 35% volume + 25% social.
        score = item["early_warning_score"]
        if score >= 7.0:
            item["alert_level"] = "CRITICAL"
        elif score >= 5.0:
            item["alert_level"] = "HIGH"
        elif score >= 3.0:
            item["alert_level"] = "MEDIUM"
        else:
            item["alert_level"] = "LOW"

        await asyncio.sleep(0.5)

    # Populate article cache for news intelligence (consumed after this function returns)
    global _article_cache
    _article_cache = []
    for item in results:
        for article in item.get("_articles", []):
            if article.get("headline"):
                _article_cache.append({**article, "ticker": item["ticker"]})

    # Log sentiment results summary
    with_news = [i for i in results if i.get("news_count", 0) > 0]
    print(f"FINNHUB SUMMARY: {len(with_news)}/{len(results)} tickers had news articles, {finnhub_errors} errors")
    if with_news:
        top = sorted(with_news, key=lambda x: x.get("news_count", 0), reverse=True)[:3]
        for t in top:
            print(f"  {t['ticker']}: {t['news_count']} articles, sentiment={t['sentiment_score']:.3f}")

    # Fetch upcoming earnings calendar (single bulk API call)
    earnings_map = await fetch_earnings_calendar()
    for item in results:
        ticker = item["ticker"]
        if ticker in earnings_map:
            item["earnings_date"] = earnings_map[ticker]["date"]
            item["earnings_time"] = earnings_map[ticker]["time"]
        else:
            item["earnings_date"] = None
            item["earnings_time"] = None

    # Save to Supabase — write all tickers; store None for price if yfinance returned 0/None
    if supabase:
        try:
            records = []
            no_price = []
            for item in results:
                price = item.get("current_price", 0) or 0
                price_val = price if price > 0 else None
                if price_val is None:
                    no_price.append(item["ticker"])
                records.append({
                    "ticker": item["ticker"],
                    "updated_at": datetime.now().isoformat(),
                    "alert_score": item["early_warning_score"],
                    "alert_level": item["alert_level"],
                    "signals_triggered": item["signals_triggered"],
                    "options_score": item["options_signal"]["score"],
                    "volume_score": item["volume_signal"]["score"],
                    "social_score": item["social_signal"].get("score") or 0,
                    "sentiment_score": item.get("sentiment_score", 0),
                    "news_count": item.get("news_count", 0),
                    "current_price": price_val,
                    "price_change_pct": item.get("price_change_pct", 0),
                    # Signal detail breakdowns
                    "options_call_put_ratio": item["options_signal"].get("call_put_ratio", 0),
                    "options_volume_oi_ratio": item["options_signal"].get("volume_oi_ratio", 0),
                    "options_total_call_volume": item["options_signal"].get("total_call_volume", 0),
                    "options_total_put_volume": item["options_signal"].get("total_put_volume", 0),
                    "volume_ratio_today": item["volume_signal"].get("volume_ratio_today", 0),
                    "volume_ratio_5d": item["volume_signal"].get("volume_ratio_5d", 0),
                    "volume_volatility_ratio": item["volume_signal"].get("volatility_ratio", 0),
                    "volume_avg_30d": item["volume_signal"].get("avg_volume_30d", 0),
                    "volume_today": item["volume_signal"].get("today_volume", 0),
                    "volume_direction": item["volume_signal"].get("volume_direction", "NEUTRAL"),
                    "volume_price_change_pct": item["volume_signal"].get("price_change_pct", 0),
                    "social_mentions": item["social_signal"].get("mentions") or 0,
                    "social_rank": item["social_signal"].get("rank") or 0,
                    "social_upvotes": item["social_signal"].get("upvotes") or 0,
                    "insider_score": item.get("insider_signal", {}).get("score", 0),
                    "insider_purchases_30d": item.get("insider_signal", {}).get("purchases_30d", 0),
                    "earnings_date": item.get("earnings_date"),
                    "earnings_time": item.get("earnings_time"),
                })

            if no_price:
                print(f"WARNING: {len(no_price)} tickers had no price from yfinance (stored as NULL): {no_price}")

            insider_nonzero = [(r["ticker"], r["insider_score"]) for r in records if r.get("insider_score", 0) > 0]
            print(f"INSIDER DEBUG: {len(insider_nonzero)} tickers with non-zero insider score: {insider_nonzero}")

            response = supabase.table('meme_alerts').upsert(records, on_conflict='ticker').execute()
            print(f"SCAN COMPLETE: {len(records)} tickers written to meme_alerts | {len(no_price)} with NULL price | {len(results) - len(records)} failed to produce a result")

            # Send email alerts for CRITICAL tickers
            critical_tickers = [r["ticker"] for r in records if r.get("alert_level") == "CRITICAL"]
            if critical_tickers:
                send_critical_alert_emails(critical_tickers)

        except Exception as e:
            print(f"Database save error: {e}")

        # Append to score_history (always insert, never upsert)
        try:
            history_records = [
                {
                    "ticker": item["ticker"],
                    "early_warning_score": item["early_warning_score"],
                    "alert_level": item["alert_level"],
                }
                for item in results
            ]
            supabase.table('score_history').insert(history_records).execute()
            print(f"Appended {len(history_records)} records to score_history")
        except Exception as e:
            print(f"score_history insert error: {e}")

    return results

@app.get("/alerts/cached")
async def get_cached_alerts():
    """Get alerts from database (fast)"""
    if not supabase:
        return {"error": "Database not configured"}
    
    try:
        response = supabase.table('meme_alerts').select('*').execute()
        results = response.data
        
        if not results:
            return []
        
        # Rename alert_score to early_warning_score for frontend compatibility
        for item in results:
            if 'alert_score' in item:
                item['early_warning_score'] = item['alert_score']
        
        # Sort by alert_score
        results_sorted = sorted(results, key=lambda x: x.get('alert_score', 0), reverse=True)
        
        return results_sorted
        
    except Exception as e:
        print(f"Database read error: {e}")
        return {"error": str(e)}
        
@app.get("/alerts/{ticker}")
async def get_alert_for_ticker(ticker: str):
    """Get detailed alert info for one ticker"""
    global detector
    
    if not detector:
        detector = MemeStockDetector()
    
    result = await detector.get_early_warning_score(ticker.upper())
    return result
    
@app.get("/history/all")
async def get_all_score_history():
    """Returns last 7 days of score_history for all tickers, grouped by ticker.
    Must be defined before /history/{ticker} or FastAPI routes 'all' as a ticker name."""
    if not supabase:
        return {"error": "Database not configured"}

    try:
        seven_days_ago = (date.today() - timedelta(days=7)).isoformat()
        response = (
            supabase.table('score_history')
            .select('ticker,early_warning_score,alert_level,recorded_at')
            .gte('recorded_at', seven_days_ago)
            .order('recorded_at')
            .execute()
        )
        grouped = {}
        for row in response.data:
            grouped.setdefault(row['ticker'], []).append(row)
        return grouped
    except Exception as e:
        print(f"score_history bulk read error: {e}")
        return {"error": str(e)}

@app.get("/history/{ticker}")
async def get_score_history(ticker: str):
    """Returns last 7 days of score_history for a ticker."""
    if not supabase:
        return {"error": "Database not configured"}

    try:
        seven_days_ago = (date.today() - timedelta(days=7)).isoformat()
        response = (
            supabase.table('score_history')
            .select('*')
            .eq('ticker', ticker.upper())
            .gte('recorded_at', seven_days_ago)
            .order('recorded_at')
            .execute()
        )
        return response.data or []
    except Exception as e:
        print(f"score_history read error for {ticker}: {e}")
        return {"error": str(e)}

# ==========================================
# NEWS INTELLIGENCE ENDPOINTS
# ==========================================

@app.get("/news/intelligence")
async def get_news_intelligence():
    """Returns the single most recent news intelligence analysis."""
    if not supabase:
        return {"error": "Database not configured"}
    try:
        response = (
            supabase.table('news_intelligence')
            .select('*')
            .order('recorded_at', desc=True)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        if not rows:
            return {"error": "No news intelligence data yet — run a scan first"}
        return rows[0]
    except Exception as e:
        print(f"news_intelligence read error: {e}")
        return {"error": str(e)}


@app.get("/news/history")
async def get_news_history():
    """Returns the last 24 news intelligence analyses (24 hours), newest first."""
    if not supabase:
        return {"error": "Database not configured"}
    try:
        response = (
            supabase.table('news_intelligence')
            .select('id,recorded_at,overall_sentiment,macro_summary,headline_count')
            .order('recorded_at', desc=True)
            .limit(24)
            .execute()
        )
        return response.data or []
    except Exception as e:
        print(f"news_history read error: {e}")
        return {"error": str(e)}


# ==========================================
# POLYMARKET INTEGRATION
# ==========================================

async def fetch_polymarket_events():
    """Fetch macro-relevant prediction market events from Polymarket's Gamma API."""
    global POLYMARKET_CACHE

    current_time = time.time()
    if (
        POLYMARKET_CACHE["data"] is not None
        and (current_time - POLYMARKET_CACHE["timestamp"]) < POLYMARKET_CACHE_TTL
    ):
        return POLYMARKET_CACHE["data"]

    url = (
        "https://gamma-api.polymarket.com/events"
        "?active=true&closed=false&limit=50"
        "&order=volume24hr&ascending=false"
    )

    try:
        response = await CLIENT.get(url, timeout=15)
        response.raise_for_status()
        raw_events = response.json()
    except Exception as e:
        print(f"Polymarket API error: {e}")
        return POLYMARKET_CACHE["data"] or []

    results = []
    # Sort keywords longest-first so "fed rate" matches before "fed"
    keywords = sorted(POLYMARKET_TICKER_MAP.keys(), key=len, reverse=True)

    for event in raw_events:
        title = (event.get("title") or "").lower()
        description = (event.get("description") or "").lower()
        question_text = title + " " + description

        matched_category = None
        for kw in keywords:
            if kw in question_text:
                matched_category = kw
                break

        if not matched_category:
            continue

        # Determine affected tickers — only use the mapped list
        affected = list(POLYMARKET_TICKER_MAP.get(matched_category, []))

        # For "earnings" category only, dynamically match ticker mentions in the question
        if matched_category == "earnings":
            for ticker in STOCK_TICKERS:
                if ticker.lower() in question_text and ticker not in affected:
                    affected.append(ticker)

        if not affected:
            continue

        # Extract probability from the first market's outcomePrices
        markets = event.get("markets", [])
        probability = 0.0
        if markets and markets[0].get("outcomePrices"):
            try:
                prices = markets[0]["outcomePrices"]
                if isinstance(prices, str):
                    import json as _json
                    prices = _json.loads(prices)
                if isinstance(prices, list) and len(prices) > 0:
                    probability = float(prices[0])
            except (ValueError, IndexError, TypeError):
                pass

        volume_24h = 0.0
        try:
            volume_24h = float(event.get("volume24hr") or 0)
        except (ValueError, TypeError):
            pass

        results.append({
            "question": event.get("title", ""),
            "probability": round(probability, 4),
            "volume_24h": round(volume_24h, 2),
            "end_date": event.get("endDate"),
            "slug": event.get("slug", ""),
            "category": matched_category,
            "affected_tickers": affected,
        })

    # Sort by volume descending
    results.sort(key=lambda x: x["volume_24h"], reverse=True)

    POLYMARKET_CACHE["data"] = results
    POLYMARKET_CACHE["timestamp"] = current_time
    print(f"Polymarket: cached {len(results)} macro-relevant events")
    return results


def get_polymarket_odds_for_ticker(ticker: str, events: list):
    """Return the highest-volume Polymarket event affecting a given ticker, or None."""
    ticker = ticker.upper()
    for event in events:
        if ticker in event.get("affected_tickers", []):
            return {
                "question": event["question"],
                "probability": event["probability"],
            }
    return None


@app.get("/polymarket/events")
async def polymarket_events():
    """Return macro-relevant Polymarket prediction market events."""
    events = await fetch_polymarket_events()
    return events


# ==========================================
# EMAIL ALERT SUBSCRIPTIONS
# ==========================================

class SubscribeRequest(BaseModel):
    email: str
    tickers: List[str]

@app.post("/subscribe")
async def subscribe(req: SubscribeRequest):
    """Subscribe an email to alerts for specific tickers."""
    if not supabase:
        return {"error": "Database not configured"}

    tickers_upper = [t.upper() for t in req.tickers]
    try:
        response = (
            supabase.table('alert_subscriptions')
            .upsert(
                {"email": req.email, "tickers": tickers_upper},
                on_conflict="email",
            )
            .execute()
        )
        return {"status": "subscribed", "email": req.email, "tickers": tickers_upper}
    except Exception as e:
        print(f"Subscribe error: {e}")
        return {"error": str(e)}


class WaitlistRequest(BaseModel):
    email: str

@app.post("/waitlist/premium")
async def waitlist_premium(req: WaitlistRequest):
    """Add an email to the premium feature waitlist."""
    if not supabase:
        return {"error": "Database not configured"}

    if not req.email:
        return {"error": "Email is required"}

    try:
        supabase.table('premium_waitlist').upsert(
            {"email": req.email},
            on_conflict="email",
        ).execute()
        return {"status": "joined", "email": req.email}
    except Exception as e:
        print(f"Waitlist error: {e}")
        return {"error": str(e)}


def send_critical_alert_emails(critical_tickers: List[str]):
    """Send email alerts for tickers that hit CRITICAL level."""
    if not supabase or not SMTP_HOST:
        return

    if not critical_tickers:
        return

    try:
        response = supabase.table('alert_subscriptions').select('email, tickers').execute()
        subscriptions = response.data or []
    except Exception as e:
        print(f"Email alert query error: {e}")
        return

    for sub in subscriptions:
        matching = [t for t in critical_tickers if t in sub.get("tickers", [])]
        if not matching:
            continue

        ticker_list = ", ".join(matching)
        body = (
            f"CRITICAL alert triggered for: {ticker_list}\n\n"
            f"These tickers in your watchlist have hit CRITICAL alert level, "
            f"indicating unusual options flow, volume spikes, or social buzz.\n\n"
            f"Check the EarlyBell Market Scanner for details."
        )

        msg = MIMEText(body)
        msg["Subject"] = f"EarlyBell Alert: {ticker_list} hit CRITICAL"
        msg["From"] = SMTP_FROM
        msg["To"] = sub["email"]

        try:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                server.starttls()
                if SMTP_USER and SMTP_PASS:
                    server.login(SMTP_USER, SMTP_PASS)
                server.send_message(msg)
            print(f"Alert email sent to {sub['email']} for {ticker_list}")
        except Exception as e:
            print(f"SMTP error sending to {sub['email']}: {e}")


@app.get("/debug/finnhub/{ticker}")
async def debug_finnhub(ticker: str):
    """Debug endpoint: test Finnhub API call for a single ticker with full logging."""
    ticker = ticker.upper()
    print(f"\n=== DEBUG FINNHUB: Testing {ticker} ===")
    print(f"FINNHUB_API_KEY present: {bool(FINNHUB_API_KEY)}")
    if FINNHUB_API_KEY:
        print(f"FINNHUB_API_KEY length: {len(FINNHUB_API_KEY)}")

    result = await async_news_sentiment_and_volume(ticker, debug=True)
    print(f"=== DEBUG FINNHUB: Result for {ticker}: {result} ===\n")
    return {
        "ticker": ticker,
        "api_key_set": bool(FINNHUB_API_KEY),
        "api_key_length": len(FINNHUB_API_KEY) if FINNHUB_API_KEY else 0,
        "result": result,
    }


@app.get("/debug/social")
async def debug_social():
    """Debug endpoint: fetch raw ApeWisdom data and show matching results for our tickers."""
    global detector
    if not detector:
        detector = MemeStockDetector()

    all_tickers = await detector.fetch_apewisdom_data()

    # Build a set of our watchlist tickers
    our_tickers = set(STOCK_TICKERS)

    # Find which of our tickers appear in ApeWisdom (exact match)
    exact_matches = {}
    for item in all_tickers:
        aw_ticker = item.get("ticker", "").upper()
        if aw_ticker in our_tickers:
            exact_matches[aw_ticker] = {
                "rank": item.get("rank"),
                "mentions": item.get("mentions", 0),
                "upvotes": item.get("upvotes", 0),
                "name": item.get("name", ""),
            }

    return {
        "apewisdom_total": len(all_tickers),
        "top_20": [
            {"ticker": r.get("ticker"), "name": r.get("name"), "mentions": r.get("mentions", 0)}
            for r in all_tickers[:20]
        ],
        "our_exact_matches": exact_matches,
        "our_tickers_not_in_apewisdom": sorted(our_tickers - set(exact_matches.keys())),
    }


@app.get("/debug/scan-status")
async def debug_scan_status():
    """Debug endpoint: show how many tickers in Supabase, last updated, and which have price=0."""
    if not supabase:
        return {"error": "Database not configured"}

    try:
        response = supabase.table('meme_alerts').select('ticker,current_price,updated_at,alert_score').execute()
        rows = response.data or []

        zero_price = [r["ticker"] for r in rows if not r.get("current_price") or r["current_price"] <= 0]
        timestamps = [r["updated_at"] for r in rows if r.get("updated_at")]
        latest = max(timestamps) if timestamps else None
        oldest = min(timestamps) if timestamps else None

        # Also check predicted_movers table
        movers_res = supabase.table('predicted_movers').select('ticker,updated_at,mover_score').execute()
        movers_rows = movers_res.data or []
        movers_timestamps = [r["updated_at"] for r in movers_rows if r.get("updated_at")]
        movers_latest = max(movers_timestamps) if movers_timestamps else None
        movers_oldest = min(movers_timestamps) if movers_timestamps else None

        return {
            "meme_alerts": {
                "total_tickers": len(rows),
                "last_updated": latest,
                "oldest_updated": oldest,
                "zero_price_tickers": sorted(zero_price),
                "zero_price_count": len(zero_price),
                "all_tickers": sorted([r["ticker"] for r in rows]),
            },
            "predicted_movers": {
                "total_tickers": len(movers_rows),
                "last_updated": movers_latest,
                "oldest_updated": movers_oldest,
                "all_tickers": sorted([r["ticker"] for r in movers_rows]),
            },
        }
    except Exception as e:
        return {"error": str(e)}


@app.on_event("shutdown")
async def shutdown():
    """Cleanup on shutdown"""
    global detector
    if detector:
        await detector.close()
