"""
Meme Stock Early Warning System
Detects unusual activity before stocks go viral

Three-Signal System:
1. Options Activity (unusual call volume)
2. Volume Spikes (trading volume vs 30-day average)
3. Social Buzz (StockTwits mentions & sentiment)
"""

import yfinance as yf
import numpy as np
import requests
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import asyncio
import httpx


class MemeStockDetector:

    def __init__(self):
        self.client = httpx.AsyncClient(timeout=10)
        self._apewisdom_cache = None
        self._apewisdom_ts = None
        self._options_cache = {}  # ticker -> {"data": {...}, "ts": datetime}
        self._options_cache_ttl = 4 * 3600  # 4 hours in seconds
    
    # ==========================================
    # SIGNAL 1: UNUSUAL OPTIONS ACTIVITY
    # ==========================================
    
    def get_options_signal(self, ticker: str) -> Dict:
        """
        Detects unusual options activity (free via yfinance).
        Cached for 4 hours per ticker — options flow doesn't change minute-to-minute.

        Key indicators:
        - High call/put ratio (bullish bets)
        - Volume vs open interest (new positions being opened)
        - Near-term expiry activity (short-term bets)

        Returns score 0-10
        """
        # Check cache
        ticker_upper = ticker.upper()
        cached = self._options_cache.get(ticker_upper)
        if cached:
            age = (datetime.now() - cached["ts"]).total_seconds()
            if age < self._options_cache_ttl:
                return cached["data"]

        result = self._fetch_options_signal(ticker_upper)
        self._options_cache[ticker_upper] = {"data": result, "ts": datetime.now()}
        return result

    def _fetch_options_signal(self, ticker: str) -> Dict:
        """Actual yfinance options fetch (called by get_options_signal when cache misses)."""
        try:
            stock = yf.Ticker(ticker)
            
            # Get available expiration dates
            expirations = stock.options
            if not expirations or len(expirations) == 0:
                return {
                    "score": 0,
                    "signal": "NO_DATA",
                    "call_put_ratio": 0,
                    "unusual_activity": False
                }
            
            # Get the nearest two expiration dates (short-term bets)
            near_expirations = expirations[:2] if len(expirations) >= 2 else expirations[:1]
            
            total_call_volume = 0
            total_put_volume = 0
            total_call_oi = 0
            total_put_oi = 0
            
            for exp_date in near_expirations:
                try:
                    chain = stock.option_chain(exp_date)
                    
                    # Sum up volumes and open interest
                    call_volume = chain.calls['volume'].fillna(0).sum()
                    put_volume = chain.puts['volume'].fillna(0).sum()
                    call_oi = chain.calls['openInterest'].fillna(0).sum()
                    put_oi = chain.puts['openInterest'].fillna(0).sum()
                    
                    total_call_volume += call_volume
                    total_put_volume += put_volume
                    total_call_oi += call_oi
                    total_put_oi += put_oi
                    
                except Exception as e:
                    print(f"Error processing options chain for {ticker} exp {exp_date}: {e}")
                    continue
            
            # Calculate metrics
            call_put_ratio = total_call_volume / (total_put_volume + 1)  # Avoid div by 0
            
            # Volume vs Open Interest ratio (high = new positions being opened)
            call_volume_oi_ratio = total_call_volume / (total_call_oi + 1)
            
            # Scoring logic
            score = 0
            unusual_activity = False
            
            # Heavy call buying (ratio > 2.0 is bullish)
            if call_put_ratio > 3.0:
                score += 5
                unusual_activity = True
            elif call_put_ratio > 2.0:
                score += 3
            
            # High volume vs OI (> 0.5 means lots of new positions)
            if call_volume_oi_ratio > 0.5:
                score += 3
                unusual_activity = True
            elif call_volume_oi_ratio > 0.3:
                score += 2
            
            # Cap at 10
            score = min(score, 10)
            
            return {
                "score": score,
                "signal": "STRONG" if score >= 7 else "MODERATE" if score >= 4 else "WEAK",
                "call_put_ratio": round(call_put_ratio, 2),
                "volume_oi_ratio": round(call_volume_oi_ratio, 2),
                "unusual_activity": unusual_activity,
                "total_call_volume": int(total_call_volume),
                "total_put_volume": int(total_put_volume)
            }
            
        except Exception as e:
            print(f"Options signal error for {ticker}: {e}")
            return {
                "score": 0,
                "signal": "ERROR",
                "call_put_ratio": 0,
                "unusual_activity": False,
                "error": str(e)
            }
    
    # ==========================================
    # SIGNAL 2: VOLUME SPIKES
    # ==========================================
    
    def get_volume_signal(self, ticker: str) -> Dict:
        """
        Detects unusual trading volume (free via yfinance)
        
        Key indicators:
        - Today's volume vs 30-day average
        - Volume trend over last 5 days
        - Price volatility (high vol often accompanies meme moves)
        
        Returns score 0-10
        """
        try:
            stock = yf.Ticker(ticker)
            
            # Get 60 days of history to calculate baseline
            hist = stock.history(period="60d")
            
            if hist.empty or len(hist) < 5:
                return {
                    "score": 0,
                    "signal": "NO_DATA",
                    "volume_ratio": 0,
                    "unusual_volume": False
                }
            
            # Get recent data
            recent_5d = hist.tail(5)
            baseline_30d = hist.head(30)
            
            # Calculate metrics
            avg_volume_30d = baseline_30d['Volume'].mean()
            recent_volume = recent_5d['Volume'].mean()
            today_volume = hist['Volume'].iloc[-1]
            
            # Volume ratios
            volume_ratio_today = today_volume / (avg_volume_30d + 1)
            volume_ratio_5d = recent_volume / (avg_volume_30d + 1)
            
            # Price volatility (standard deviation of returns)
            returns = hist['Close'].pct_change().dropna()
            volatility = returns.tail(5).std()
            baseline_volatility = returns.head(30).std()
            volatility_ratio = volatility / (baseline_volatility + 0.0001)
            
            # Scoring logic
            score = 0
            unusual_volume = False
            
            # Today's volume spike
            if volume_ratio_today > 3.0:
                score += 5
                unusual_volume = True
            elif volume_ratio_today > 2.0:
                score += 3
            elif volume_ratio_today > 1.5:
                score += 1
            
            # Sustained elevated volume
            if volume_ratio_5d > 2.0:
                score += 3
                unusual_volume = True
            elif volume_ratio_5d > 1.5:
                score += 2
            
            # Elevated volatility
            if volatility_ratio > 2.0:
                score += 2
            
            # Cap at 10
            score = min(score, 10)
            
            return {
                "score": score,
                "signal": "STRONG" if score >= 7 else "MODERATE" if score >= 4 else "WEAK",
                "volume_ratio_today": round(volume_ratio_today, 2),
                "volume_ratio_5d": round(volume_ratio_5d, 2),
                "volatility_ratio": round(volatility_ratio, 2),
                "unusual_volume": unusual_volume,
                "avg_volume_30d": int(avg_volume_30d),
                "today_volume": int(today_volume)
            }
            
        except Exception as e:
            print(f"Volume signal error for {ticker}: {e}")
            return {
                "score": 0,
                "signal": "ERROR",
                "volume_ratio": 0,
                "unusual_volume": False,
                "error": str(e)
            }
    
    # ==========================================
    # SIGNAL 3: SOCIAL BUZZ (ApeWisdom / Reddit)
    # ==========================================

    async def fetch_apewisdom_data(self) -> List[Dict]:
        """
        Fetches the full trending list from ApeWisdom (free, no key).
        Caches for 10 minutes to avoid hammering the API.
        """
        now = datetime.now()
        if (
            self._apewisdom_cache is not None
            and self._apewisdom_ts is not None
            and (now - self._apewisdom_ts).total_seconds() < 600
        ):
            return self._apewisdom_cache

        try:
            url = "https://apewisdom.io/api/v1.0/filter/all-stocks"
            response = await self.client.get(url)
            if response.status_code != 200:
                print(f"ApeWisdom API error: {response.status_code}")
                return self._apewisdom_cache or []

            data = response.json()
            results = data.get("results", [])
            if not results:
                print(f"SOCIAL WARNING: ApeWisdom returned 200 but 'results' is empty or missing")
            else:
                top_tickers = [r.get("ticker", "?") for r in results[:20]]
                print(f"ApeWisdom: fetched {len(results)} trending tickers. Top 20: {top_tickers}")
            self._apewisdom_cache = results
            self._apewisdom_ts = now
            return results
        except Exception as e:
            print(f"ApeWisdom fetch error: {e}")
            return self._apewisdom_cache or []

    async def get_social_signal(self, ticker: str) -> Dict:
        """
        Detects social media buzz via ApeWisdom (Reddit/WSB mentions).

        Key indicators:
        - Mention count (24h)
        - Rank among all tickers
        - Upvotes

        Returns score 0-10
        """
        HIGH_DISCUSSION = {"GME", "AMC", "TSLA", "NVDA", "AAPL", "COIN", "PLTR", "HOOD"}
        try:
            all_tickers = await self.fetch_apewisdom_data()

            if not all_tickers:
                print(f"SOCIAL WARNING: ApeWisdom returned empty data — all tickers will get social score 0")

            # Find this ticker in the list — exact match first
            match = None
            for item in all_tickers:
                if item.get("ticker", "").upper() == ticker.upper():
                    match = item
                    break

            if not match:
                if ticker.upper() in HIGH_DISCUSSION:
                    top_10 = [f"{r.get('ticker')}({r.get('mentions', 0)})" for r in all_tickers[:10]]
                    print(
                        f"SOCIAL WARNING: {ticker} not found in ApeWisdom data "
                        f"(expected high discussion). {len(all_tickers)} tickers available. "
                        f"Top 10: {top_10}. Social score will be 0."
                    )
                return {
                    "score": 0,
                    "signal": "NO_DATA",
                    "mentions": 0,
                    "rank": 0,
                    "upvotes": 0,
                    "unusual_buzz": False
                }

            mentions = match.get("mentions", 0)
            rank = match.get("rank", 999)
            upvotes = match.get("upvotes", 0)

            # Scoring logic
            score = 0
            unusual_buzz = False

            # Rank-based scoring (top of Reddit = high signal)
            if rank <= 5:
                score += 5
                unusual_buzz = True
            elif rank <= 15:
                score += 3
            elif rank <= 30:
                score += 2
            elif rank <= 50:
                score += 1

            # Mention count scoring
            if mentions >= 100:
                score += 4
                unusual_buzz = True
            elif mentions >= 50:
                score += 3
            elif mentions >= 20:
                score += 2
            elif mentions >= 10:
                score += 1

            # Cap at 10
            score = min(score, 10)

            return {
                "score": score,
                "signal": "STRONG" if score >= 7 else "MODERATE" if score >= 4 else "WEAK",
                "mentions": mentions,
                "rank": rank,
                "upvotes": upvotes,
                "unusual_buzz": unusual_buzz
            }

        except Exception as e:
            print(f"Social signal error for {ticker}: {e}")
            return {
                "score": 0,
                "signal": "ERROR",
                "mentions": 0,
                "rank": 0,
                "upvotes": 0,
                "unusual_buzz": False,
                "error": str(e)
            }
    
    # ==========================================
    # COMBINED EARLY WARNING SCORE
    # ==========================================
    
    async def get_early_warning_score(self, ticker: str) -> Dict:
        """
        Combines three signals into final early warning score

        Weighting:
        - Options: 40% (institutional money flow)
        - Volume: 35% (confirms unusual activity)
        - Social: 25% (Reddit/WSB buzz via ApeWisdom)

        Returns:
        - early_warning_score: 0-10
        - alert_level: CRITICAL/HIGH/MEDIUM/LOW
        - signals_triggered: number of strong signals
        """
        ticker = ticker.upper()

        # Get all three signals
        options_data = self.get_options_signal(ticker)
        volume_data = self.get_volume_signal(ticker)
        social_data = await self.get_social_signal(ticker)

        # Calculate weighted score
        options_score = options_data['score']
        volume_score = volume_data['score']
        social_score = social_data['score']

        weighted_score = (
            0.40 * options_score +
            0.35 * volume_score +
            0.25 * social_score
        )

        # Count strong signals
        signals_triggered = sum([
            options_data.get('unusual_activity', False),
            volume_data.get('unusual_volume', False),
            social_data.get('unusual_buzz', False)
        ])
    
        # Determine alert level
        if weighted_score >= 7.5 and signals_triggered >= 2:
            alert_level = "CRITICAL"
        elif weighted_score >= 6.0 or signals_triggered >= 2:
            alert_level = "HIGH"
        elif weighted_score >= 4.0:
            alert_level = "MEDIUM"
        else:
            alert_level = "LOW"
    
        return {
            "ticker": ticker,
            "early_warning_score": round(weighted_score, 2),
            "alert_level": alert_level,
            "signals_triggered": signals_triggered,
            "options_signal": options_data,
            "volume_signal": volume_data,
            "social_signal": social_data,
            "timestamp": datetime.now().isoformat()
        }
    
    async def scan_watchlist(self, tickers: List[str]) -> List[Dict]:
        """
        Scans entire watchlist and returns sorted by early warning score
        """
        results = []
        
        for ticker in tickers:
            try:
                result = await self.get_early_warning_score(ticker)
                results.append(result)
                
                # Small delay to respect rate limits
                await asyncio.sleep(0.2)
                
            except Exception as e:
                print(f"Error scanning {ticker}: {e}")
                continue
        
        # Sort by early warning score (highest first)
        results_sorted = sorted(results, key=lambda x: x['early_warning_score'], reverse=True)
        
        return results_sorted
    
    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()


# ==========================================
# USAGE EXAMPLE
# ==========================================

async def main():
    detector = MemeStockDetector()
    
    # Your watchlist
    watchlist = [
        "GME", "AMC", "PLTR", "TSLA", "NVDA",
        "AMD", "SNAP", "HOOD", "COIN", "SOFI"
    ]
    
    print("🚨 Meme Stock Early Warning System 🚨\n")
    print("Scanning watchlist for unusual activity...\n")
    
    results = await detector.scan_watchlist(watchlist)
    
    # Display results
    print("=" * 80)
    print(f"{'TICKER':<8} {'SCORE':<8} {'ALERT':<12} {'OPTIONS':<10} {'VOLUME':<10} {'SOCIAL':<10}")
    print("=" * 80)
    
    for r in results:
        ticker = r['ticker']
        score = r['early_warning_score']
        alert = r['alert_level']
        opt_sig = r['options_signal']['signal']
        vol_sig = r['volume_signal']['signal']
        soc_sig = r['social_signal']['signal']
        
        print(f"{ticker:<8} {score:<8.2f} {alert:<12} {opt_sig:<10} {vol_sig:<10} {soc_sig:<10}")
    
    print("=" * 80)
    
    # Show detailed breakdown for top 3
    print("\n🔍 DETAILED BREAKDOWN (Top 3):\n")
    
    for i, r in enumerate(results[:3], 1):
        print(f"{i}. {r['ticker']} - Score: {r['early_warning_score']}")
        print(f"   Alert Level: {r['alert_level']}")
        print(f"   Signals Triggered: {r['signals_triggered']}/3")
        
        opt = r['options_signal']
        print(f"   📊 Options: Call/Put Ratio = {opt.get('call_put_ratio', 0)}")
        
        vol = r['volume_signal']
        print(f"   📈 Volume: {vol.get('volume_ratio_today', 0)}x average")
        
        soc = r['social_signal']
        print(f"   💬 Social: {soc.get('mentions', 0)} mentions, rank #{soc.get('rank', 'N/A')}")
        print()
    
    await detector.close()

if __name__ == "__main__":
    asyncio.run(main())
