import os
import asyncio
import httpx
import numpy as np
import yfinance as yf
import time
import smtplib
from email.mime.text import MIMEText
from datetime import date, timedelta
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

# Port 5173 is the default for Vite
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    os.getenv("FRONTEND_URL"),
]

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

# High-discussion tickers for social score diagnostics
HIGH_DISCUSSION_TICKERS = {"GME", "AMC", "TSLA", "NVDA", "AAPL", "COIN", "PLTR", "HOOD"}

CLIENT = httpx.AsyncClient(follow_redirects=True)

# --- API KEYS ---
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")

# --- SMTP CONFIG ---
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASS = os.getenv("SMTP_PASS")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER or "")

# --- RATE LIMIT & DATE ---
FINNHUB_CALL_DELAY = 0.5 # Delay increased to respect Finnhub limits

TODAY = date.today()
SEVEN_DAYS_AGO = (TODAY - timedelta(days=7)).isoformat()
TODAY_STR = TODAY.isoformat()

# --- TICKERS (Separated for better normalization) ---
STOCK_TICKERS = [
    "AAPL", "MSFT", "AMZN", "GOOG", "META",
    "NVDA", "TSLA", "PLTR", "AMD", "NFLX", "SNAP", "RBLX",
    "GME", "AMC", "HOOD", "COIN", "SOFI"
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
        try:
            print("AUTO-UPDATE: Starting background fetch...")
            # This calls your existing logic
            await trending_hype()
            print("AUTO-UPDATE: Success. Sleeping for 1 hour.")
        except Exception as e:
            print(f"AUTO-UPDATE ERROR: {e}")
        
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

async def async_news_sentiment_and_volume(ticker: str) -> Dict[str, Union[str, int, float]]:
    """
    Fetches news, calculates sentiment, and counts volume using Finnhub.
    """
    await asyncio.sleep(FINNHUB_CALL_DELAY)
    
    ticker = ticker.upper()
    url = (
        f"https://finnhub.io/api/v1/company-news?symbol={ticker}&"
        f"from={SEVEN_DAYS_AGO}&to={TODAY_STR}&token={FINNHUB_API_KEY}"
    )
    
    try:
        response = await CLIENT.get(url, timeout=10)
        response.raise_for_status()
        news_data = response.json()
        article_count = len(news_data)
        
        combined_text = ' '.join([
            (article.get('headline', '') + ' ' + article.get('summary', ''))
            for article in news_data if article.get('headline')
        ])
        
        sentiment_score = calculate_sentiment(combined_text)
        
        return {
            "ticker": ticker,
            "news_raw": article_count,
            "social_raw": sentiment_score
        }
        
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            print(f"Finnhub API Error: Rate Limit exceeded for {ticker}.")
        else:
            print(f"Finnhub API Status Error for {ticker}: {e.response.status_code}.")
        return {"ticker": ticker, "news_raw": 0, "social_raw": 0.0}
    except Exception as e:
        print(f"Finnhub API General Error for {ticker}: {type(e).__name__}: {e}")
        return {"ticker": ticker, "news_raw": 0, "social_raw": 0.0}

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
            supabase.table('predicted_movers').upsert(records, on_conflict='ticker').execute()
            print(f"Saved {len(records)} predicted movers to database")
        except Exception as e:
            print(f"predicted_movers save error: {e}")

    return results

# ==========================================
# NEW MEME STOCK ALERT ENDPOINTS
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
        
        # === FINTECH & PAYMENTS (7) ===
        "V", "MA", "PYPL", "SQ", "COIN", "HOOD", "SOFI",
        
        # === MEME STOCKS (5) ===
        "GME", "AMC", "PLTR", "SNAP", "RBLX",
        
        # === GROWTH TECH (6) ===
        "UBER", "LYFT", "AIRBNB", "DASH", "SPOT", "ZM",
        
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
    for item in results:
        ticker = item["ticker"]
        
        # Add sentiment
        try:
            sentiment_data = await async_news_sentiment_and_volume(ticker)
            item["sentiment_score"] = sentiment_data.get("social_raw", 0.0)
            item["news_count"] = sentiment_data.get("news_raw", 0)
        except Exception as e:
            item["sentiment_score"] = 0.0
            item["news_count"] = 0
        
        # Add price
        try:
            stock = yf.Ticker(ticker)
            info = stock.info
            item["current_price"] = info.get("regularMarketPrice", 0)
            item["price_change_pct"] = info.get("regularMarketChangePercent", 0)
        except Exception as e:
            item["current_price"] = 0
            item["price_change_pct"] = 0
    
    # Save to Supabase
    if supabase:
        try:
            records = []
            for item in results:
                records.append({
                    "ticker": item["ticker"],
                    "alert_score": item["early_warning_score"],
                    "alert_level": item["alert_level"],
                    "signals_triggered": item["signals_triggered"],
                    "options_score": item["options_signal"]["score"],
                    "volume_score": item["volume_signal"]["score"],
                    "social_score": item["social_signal"]["score"],
                    "sentiment_score": item.get("sentiment_score", 0),
                    "news_count": item.get("news_count", 0),
                    "current_price": item.get("current_price", 0),
                    "price_change_pct": item.get("price_change_pct", 0),
                })
            
            response = supabase.table('meme_alerts').upsert(records, on_conflict='ticker').execute()
            print(f"Saved {len(records)} unified alerts to database")

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
            f"Check the Foega Market Scanner for details."
        )

        msg = MIMEText(body)
        msg["Subject"] = f"Foega Alert: {ticker_list} hit CRITICAL"
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


@app.on_event("shutdown")
async def shutdown():
    """Cleanup on shutdown"""
    global detector
    if detector:
        await detector.close()
