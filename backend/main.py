import os
import asyncio
import httpx
import numpy as np
import yfinance as yf
import random
import time
from datetime import date, timedelta
from typing import List, Dict, Union, Any
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

CLIENT = httpx.AsyncClient(follow_redirects=True)

# --- API KEYS ---
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")

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

from pydantic import BaseModel # You may need to add this import if it's missing!

# --- Pydantic Model for Premium Analysis (Add this near the top of main.py if not present) ---
class WalkForwardResult(BaseModel):
    ticker: str
    optimal_params: Dict[str, Union[str, float]] # Added Union[str, float] to allow "Strategy" string
    performance_metrics: Dict[str, float]
    trading_periods: List[Dict[str, Any]]

# Mock Function to Simulate Heavy Walk-Forward Analysis
@app.get("/premium/walk_forward/{ticker}", response_model=WalkForwardResult)
def get_walk_forward_analysis(ticker: str):
    """
    Simulates a heavy Walk-Forward Analysis for a given ticker,
    introducing a delay to mimic complex computation.
    """
    import time
    import random

    # Simulate heavy computation delay (2-5 seconds)
    time.sleep(random.uniform(2, 5))

    # Mock Data Generation
    optimal_fast_ema = round(random.uniform(5, 15), 1)
    optimal_slow_ema = round(random.uniform(20, 50), 1)
    
    sharpe = round(random.uniform(1.2, 2.5), 2)
    cagr = round(random.uniform(0.15, 0.45), 4)
    max_drawdown = round(random.uniform(-0.10, -0.30), 4)

    periods = []
    # Generate 5 mock trading periods
    for i in range(5):
        periods.append({
            "period": f"P{i+1}",
            "start_date": f"2023-01-01 + {i} mo",
            "end_date": f"2023-03-31 + {i} mo",
            "return": round(random.uniform(-0.02, 0.15), 4) # Allow negative returns for realism
        })

    return {
        "ticker": ticker.upper(),
        "optimal_params": {
            "Fast_EMA": optimal_fast_ema,
            "Slow_EMA": optimal_slow_ema,
            "Strategy": "Dual EMA Crossover"
        },
        "performance_metrics": {
            "Sharpe_Ratio": sharpe,
            "CAGR": cagr,
            "Max_Drawdown": max_drawdown
        },
        "trading_periods": periods
    }

# Add this new endpoint to your FastAPI app
@app.get("/strategies/thematic")
async def get_thematic_sectors():
    # You can later automate this with a stock API,
    # but hardcoding the "Official" list first ensures the UI looks full.
    return {
        "Semiconductors": [
            {"symbol": "NVDA", "price": 145.20},
            {"symbol": "AMD", "price": 155.10},
            {"symbol": "TSM", "price": 190.50},
            {"symbol": "AVGO", "price": 172.30}
        ],
        "Cyber-Defense": [
            {"symbol": "CRWD", "price": 280.40},
            {"symbol": "PANW", "price": 360.15},
            {"symbol": "FTNT", "price": 75.20},
            {"symbol": "OKTA", "price": 90.10}
        ],
        "FinTech & Payments": [
            {"symbol": "PYPL", "price": 82.50},
            {"symbol": "SQ", "price": 75.10},
            {"symbol": "V", "price": 290.30},
            {"symbol": "MA", "price": 510.40}
        ],
        "Green Energy": [
            {"symbol": "TSLA", "price": 320.10},
            {"symbol": "ENPH", "price": 110.45},
            {"symbol": "FSLR", "price": 240.20},
            {"symbol": "NEE", "price": 75.15}
        ],
        "Healthcare/BioTech": [
            {"symbol": "JNJ", "price": 155.30},
            {"symbol": "PFE", "price": 28.10},
            {"symbol": "UNH", "price": 540.20},
            {"symbol": "MRNA", "price": 45.10}
        ],
        "Consumer Luxury": [
            {"symbol": "LVMH", "price": 710.20},
            {"symbol": "NKE", "price": 78.40},
            {"symbol": "AMZN", "price": 201.10},
            {"symbol": "COST", "price": 920.50}
        ]
    }

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
            
        except Exception as e:
            print(f"Database save error: {e}")
    
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
    
@app.on_event("shutdown")
async def shutdown():
    """Cleanup on shutdown"""
    global detector
    if detector:
        await detector.close()
