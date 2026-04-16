"""
Market intelligence layer for AI recommendations.
Pulls from three free/cheap sources and merges into a single signal dict:

  Finnhub (free, 60 req/min)  → analyst consensus, price target, earnings surprises
  FMP     (free, 250 req/day) → key metrics TTM, revenue growth, profit margin, ROE
  Alpha Vantage (free, 25/day)→ news sentiment (bullish/bearish/neutral)

All functions fail silently — missing API keys or failed calls return partial data.
The AI recommendation still works without any of these; each key just adds signal.
"""

import logging
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from config import settings

logger = logging.getLogger(__name__)

_TIMEOUT = 4  # seconds per request


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def _get(url: str, params: dict) -> list | dict | None:
    try:
        r = requests.get(url, params=params, timeout=_TIMEOUT)
        if r.status_code == 200:
            return r.json()
        if r.status_code not in (402, 403, 429):
            logger.debug("HTTP %s → %s %s", url, r.status_code, r.text[:80])
        return None
    except Exception as e:
        logger.debug("Request failed %s: %s", url, e)
        return None


# ---------------------------------------------------------------------------
# Finnhub — analyst ratings, price target, earnings calendar
# ---------------------------------------------------------------------------

def _finnhub(path: str, params: dict = None) -> list | dict | None:
    if not settings.FINNHUB_API_KEY:
        return None
    p = {"token": settings.FINNHUB_API_KEY, **(params or {})}
    return _get(f"https://finnhub.io/api/v1{path}", p)


def _fetch_finnhub(symbol: str) -> dict:
    result = {}

    # --- Analyst recommendation trends ---
    recs = _finnhub("/stock/recommendation", {"symbol": symbol})
    if recs and isinstance(recs, list) and len(recs) > 0:
        # Finnhub returns most recent period first
        latest = recs[0]
        strong_buy = latest.get("strongBuy", 0) or 0
        buy = latest.get("buy", 0) or 0
        hold = latest.get("hold", 0) or 0
        sell = latest.get("sell", 0) or 0
        strong_sell = latest.get("strongSell", 0) or 0
        total = strong_buy + buy + hold + sell + strong_sell
        if total > 0:
            result["analyst_buy_count"] = strong_buy + buy
            result["analyst_hold_count"] = hold
            result["analyst_sell_count"] = sell + strong_sell
            buy_pct = (strong_buy + buy) / total
            sell_pct = (sell + strong_sell) / total
            if strong_buy / total >= 0.5:
                result["analyst_consensus"] = "Strong Buy"
            elif buy_pct >= 0.6:
                result["analyst_consensus"] = "Buy"
            elif sell_pct >= 0.5:
                result["analyst_consensus"] = "Sell"
            elif hold / total >= 0.5:
                result["analyst_consensus"] = "Hold"
            else:
                result["analyst_consensus"] = "Mixed"

    # --- Price target ---
    pt = _finnhub("/stock/price-target", {"symbol": symbol})
    if pt and isinstance(pt, dict):
        if pt.get("targetMedian"):
            result["price_target"] = round(float(pt["targetMedian"]), 2)
        if pt.get("targetHigh"):
            result["price_target_high"] = round(float(pt["targetHigh"]), 2)
        if pt.get("targetLow"):
            result["price_target_low"] = round(float(pt["targetLow"]), 2)

    # --- Earnings surprises ---
    earnings = _finnhub("/stock/earnings", {"symbol": symbol, "limit": 2})
    if earnings and isinstance(earnings, list) and len(earnings) > 0:
        last = earnings[0]
        actual = last.get("actual")
        estimate = last.get("estimate")
        if actual is not None and estimate and abs(estimate) > 0.001:
            surprise_pct = ((actual - estimate) / abs(estimate)) * 100
            result["last_earnings_surprise_pct"] = round(surprise_pct, 1)

    return result


# ---------------------------------------------------------------------------
# FMP — fundamentals (key metrics, revenue growth) — free tier
# ---------------------------------------------------------------------------

def _fmp(path: str, params: dict = None) -> list | dict | None:
    if not settings.FMP_API_KEY:
        return None
    p = {"apikey": settings.FMP_API_KEY, **(params or {})}
    return _get(f"https://financialmodelingprep.com/api/v3{path}", p)


def _fetch_fmp(symbol: str) -> dict:
    result = {}

    km = _fmp(f"/key-metrics-ttm/{symbol}")
    if km and isinstance(km, list) and len(km) > 0:
        m = km[0]
        if m.get("peRatioTTM"):
            result["pe_ratio_ttm"] = round(float(m["peRatioTTM"]), 1)
        if m.get("netProfitMarginTTM"):
            result["profit_margin"] = round(float(m["netProfitMarginTTM"]) * 100, 1)
        if m.get("roeTTM"):
            result["roe"] = round(float(m["roeTTM"]) * 100, 1)

    growth = _fmp(f"/financial-growth/{symbol}", {"limit": 1})
    if growth and isinstance(growth, list) and len(growth) > 0:
        g = growth[0]
        if g.get("revenueGrowth") is not None:
            result["revenue_growth_yoy"] = round(float(g["revenueGrowth"]) * 100, 1)

    return result


# ---------------------------------------------------------------------------
# Alpha Vantage — news sentiment
# ---------------------------------------------------------------------------

def _fetch_alpha_vantage_sentiment(symbol: str) -> dict:
    if not settings.ALPHA_VANTAGE_API_KEY:
        return {}
    data = _get("https://www.alphavantage.co/query", {
        "function": "NEWS_SENTIMENT",
        "tickers": symbol,
        "limit": 5,
        "apikey": settings.ALPHA_VANTAGE_API_KEY,
    })
    if not data or "feed" not in data:
        return {}

    feed = data["feed"]
    if not feed:
        return {}

    # Collect sentiment scores for articles where this ticker is relevant
    scores = []
    for article in feed[:5]:
        for ticker_info in article.get("ticker_sentiment", []):
            if ticker_info.get("ticker") == symbol:
                try:
                    relevance = float(ticker_info.get("relevance_score", 0))
                    score = float(ticker_info.get("ticker_sentiment_score", 0))
                    if relevance >= 0.3:  # only include articles that are actually about this ticker
                        scores.append(score)
                except (TypeError, ValueError):
                    pass

    if not scores:
        return {}

    avg = sum(scores) / len(scores)
    if avg >= 0.15:
        label = "Bullish"
    elif avg <= -0.15:
        label = "Bearish"
    else:
        label = "Neutral"

    return {
        "news_sentiment_label": label,
        "news_sentiment_score": round(avg, 2),
        "news_article_count": len(scores),
    }


# ---------------------------------------------------------------------------
# Public interface — fetch all sources in parallel
# ---------------------------------------------------------------------------

def fetch_analyst_fundamentals(symbol: str) -> dict:
    """
    Fetch and merge signals from Finnhub + FMP + Alpha Vantage in parallel.

    Returns a dict with any combination of:
      analyst_consensus        str   "Strong Buy" / "Buy" / "Hold" / "Sell" / "Mixed"
      analyst_buy_count        int
      analyst_hold_count       int
      analyst_sell_count       int
      price_target             float  consensus median
      price_target_high        float
      price_target_low         float
      last_earnings_surprise_pct float  positive = beat, negative = miss
      pe_ratio_ttm             float
      profit_margin            float  %
      roe                      float  %
      revenue_growth_yoy       float  %
      news_sentiment_label     str   "Bullish" / "Neutral" / "Bearish"
      news_sentiment_score     float  -1 to +1
      news_article_count       int
    """
    result = {}

    with ThreadPoolExecutor(max_workers=3) as ex:
        futures = {
            ex.submit(_fetch_finnhub, symbol): "finnhub",
            ex.submit(_fetch_fmp, symbol): "fmp",
            ex.submit(_fetch_alpha_vantage_sentiment, symbol): "av",
        }
        for future in as_completed(futures):
            try:
                result.update(future.result())
            except Exception as e:
                logger.debug("Intelligence fetch failed (%s): %s", futures[future], e)

    return result
