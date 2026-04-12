"""
Market data via yfinance (free, no API key required).
Prices are fetched in small batches to avoid Yahoo Finance rate limits.
"""

import asyncio
import logging
import time
import yfinance as yf
from typing import List, Dict, Any, Optional

logging.getLogger("yfinance").setLevel(logging.CRITICAL)

BATCH_SIZE = 10  # Yahoo Finance tolerates ~10 tickers per request reliably


def _fetch_prices_batch(symbols: List[str]) -> Dict[str, Dict[str, Optional[float]]]:
    """Fetch current price and previous close for up to BATCH_SIZE symbols.
    Returns {symbol: {"price": float, "prev_close": float | None}}"""
    if not symbols:
        return {}
    try:
        data = yf.download(symbols, period="5d", auto_adjust=True, progress=False, threads=False)
        if data.empty:
            return {}
        close = data["Close"] if "Close" in data.columns else data
        result: Dict[str, Dict[str, Optional[float]]] = {}
        if len(symbols) == 1:
            sym = symbols[0]
            try:
                series = close.dropna()
                result[sym] = {
                    "price": round(float(series.iloc[-1]), 4),
                    "prev_close": round(float(series.iloc[-2]), 4) if len(series) >= 2 else None,
                }
            except Exception:
                pass
        else:
            for sym in symbols:
                try:
                    col = close[sym] if sym in close.columns else None
                    if col is not None:
                        series = col.dropna()
                        result[sym] = {
                            "price": round(float(series.iloc[-1]), 4),
                            "prev_close": round(float(series.iloc[-2]), 4) if len(series) >= 2 else None,
                        }
                except Exception:
                    pass
        return result
    except Exception:
        return {}


def fetch_prices(symbols: List[str]) -> Dict[str, float]:
    """Fetch current prices for all symbols in batches."""
    all_prices: Dict[str, float] = {}
    for i in range(0, len(symbols), BATCH_SIZE):
        batch = symbols[i: i + BATCH_SIZE]
        batch_result = _fetch_prices_batch(batch)
        for sym, data in batch_result.items():
            if data.get("price") is not None:
                all_prices[sym] = data["price"]
        if i + BATCH_SIZE < len(symbols):
            time.sleep(0.5)
    return all_prices


def fetch_prices_with_prev_close(symbols: List[str]) -> Dict[str, Dict[str, Optional[float]]]:
    """Fetch current price and previous close for all symbols in batches."""
    all_data: Dict[str, Dict[str, Optional[float]]] = {}
    for i in range(0, len(symbols), BATCH_SIZE):
        batch = symbols[i: i + BATCH_SIZE]
        all_data.update(_fetch_prices_batch(batch))
        if i + BATCH_SIZE < len(symbols):
            time.sleep(0.5)
    return all_data


FUND_SECTOR_NAME_MAP = {
    "technology": "Technology",
    "healthcare": "Healthcare",
    "financial_services": "Financial Services",
    "consumer_cyclical": "Consumer Cyclical",
    "consumer_defensive": "Consumer Defensive",
    "industrials": "Industrials",
    "basic_materials": "Basic Materials",
    "real_estate": "Real Estate",
    "realestate": "Real Estate",
    "communication_services": "Communication Services",
    "energy": "Energy",
    "utilities": "Utilities",
}


def fetch_sectors(symbols: List[str]) -> Dict[str, str]:
    """Fetch sector for each symbol. Returns sector string for stocks,
    'ETF' or 'Mutual Fund' for funds (use fetch_fund_sector_weightings for breakdown)."""
    sectors: Dict[str, str] = {}
    for i in range(0, len(symbols), BATCH_SIZE):
        batch = symbols[i: i + BATCH_SIZE]
        for sym in batch:
            try:
                info = yf.Ticker(sym).info
                sector = info.get("sector")
                if not sector:
                    quote_type = info.get("quoteType", "")
                    if quote_type == "ETF":
                        sector = "ETF"
                    elif quote_type == "MUTUALFUND":
                        sector = "Mutual Fund"
                if sector:
                    sectors[sym] = SECTOR_NAME_NORMALIZE.get(sector, sector)
            except Exception:
                pass
        if i + BATCH_SIZE < len(symbols):
            time.sleep(0.5)
    return sectors


log = logging.getLogger(__name__)


# Normalize yfinance sector names to canonical names used throughout the app
SECTOR_NAME_NORMALIZE: Dict[str, str] = {
    "Health Care": "Healthcare",
    "Financial Services": "Financial Services",
    "Consumer Discretionary": "Consumer Cyclical",
    "Consumer Staples": "Consumer Defensive",
    "Materials": "Basic Materials",
    "Real Estate": "Real Estate",
    "Communication Services": "Communication Services",
    "Information Technology": "Technology",
}

SECTOR_ETFS: Dict[str, str] = {
    "Technology": "XLK",
    "Healthcare": "XLV",
    "Financial Services": "XLF",
    "Consumer Cyclical": "XLY",
    "Consumer Defensive": "XLP",
    "Industrials": "XLI",
    "Basic Materials": "XLB",
    "Real Estate": "XLRE",
    "Communication Services": "XLC",
    "Energy": "XLE",
    "Utilities": "XLU",
}


def fetch_sector_etf_performance(sectors: List[str], period: str = "3mo") -> Dict[str, float]:
    """Fetch % change over `period` for SPDR sector ETFs matching the given sectors.
    Returns {sector_name: percent_change}"""
    # Normalize aliases from DB (e.g. "Health Care" → "Healthcare") before lookup
    sectors = [SECTOR_NAME_NORMALIZE.get(s, s) for s in sectors]
    etf_to_sector = {v: k for k, v in SECTOR_ETFS.items()}
    relevant_etfs = [SECTOR_ETFS[s] for s in sectors if s in SECTOR_ETFS]
    if not relevant_etfs:
        return {}
    result: Dict[str, float] = {}
    try:
        data = yf.download(relevant_etfs, period=period, auto_adjust=True, progress=False, threads=False)
        if data.empty:
            return {}
        # data["Close"] is always a DataFrame with ticker as column (yfinance MultiIndex)
        close = data["Close"] if "Close" in data.columns else data
        for etf in relevant_etfs:
            try:
                col = close[etf] if etf in close.columns else None
                if col is None:
                    continue
                series = col.dropna()
                if len(series) >= 2:
                    pct = ((float(series.iloc[-1]) - float(series.iloc[0])) / float(series.iloc[0])) * 100
                    result[etf_to_sector[etf]] = round(pct, 2)
            except Exception:
                pass
    except Exception as e:
        log.warning(f"Failed to fetch sector ETF performance: {e}")
    return result


BOND_CATEGORY_KEYWORDS = [
    'bond', 'fixed income', 'treasury', 'credit', 'inflation',
    'cash', 'money market', 'ultra-short', 'mortgage', 'debt', 'municipal',
]

FUND_CATEGORY_TO_SECTOR = [
    ('technology', 'Technology'),
    ('science', 'Technology'),
    ('health', 'Healthcare'),
    ('biotech', 'Healthcare'),
    ('pharma', 'Healthcare'),
    ('financial', 'Financial Services'),
    ('bank', 'Financial Services'),
    ('energy', 'Energy'),
    ('real estate', 'Real Estate'),
    ('reit', 'Real Estate'),
    ('utilities', 'Utilities'),
    ('industrial', 'Industrials'),
    ('communication', 'Communication Services'),
    ('material', 'Basic Materials'),
    ('natural resources', 'Basic Materials'),
    ('climate', 'Energy'),
]


def _classify_fund_by_category(info: dict) -> Optional[Dict[str, float]]:
    """Classify a fund into a sector based on its yfinance category + name when sector weightings aren't available."""
    category = (info.get('category') or '').lower()
    fund_name = (info.get('longName') or info.get('shortName') or '').lower()
    text = f"{category} {fund_name}"

    if any(kw in text for kw in BOND_CATEGORY_KEYWORDS):
        return {'Fixed Income': 1.0}

    for keyword, sector in FUND_CATEGORY_TO_SECTOR:
        if keyword in text:
            return {sector: 1.0}

    return None


def fetch_fund_sector_weightings(symbols: List[str]) -> Dict[str, Dict[str, float]]:
    """For ETFs and mutual funds, fetch their sector weightings.
    Returns {symbol: {sector_name: weight_0_to_1, ...}}
    Falls back to category-based classification when detailed weightings aren't available."""
    weightings: Dict[str, Dict[str, float]] = {}
    log.info(f"Fetching fund sector weightings for: {symbols}")
    for sym in symbols:
        try:
            ticker = yf.Ticker(sym)
            info = ticker.info
            if info.get("quoteType") not in ("ETF", "MUTUALFUND"):
                time.sleep(0.3)
                continue

            # Attempt 1: funds_data.sector_weightings (works for many ETFs)
            fund_sectors = None
            try:
                if hasattr(ticker, 'funds_data') and ticker.funds_data is not None:
                    fund_sectors = ticker.funds_data.sector_weightings
            except Exception:
                pass

            # Attempt 2: info-level sectorWeightings
            if not fund_sectors:
                raw = info.get("sectorWeightings", [])
                if isinstance(raw, list) and raw:
                    merged: Dict[str, float] = {}
                    for entry in raw:
                        merged.update(entry)
                    fund_sectors = merged if merged else None

            if isinstance(fund_sectors, dict) and fund_sectors:
                normalized = {
                    FUND_SECTOR_NAME_MAP.get(k, k.replace("_", " ").title()): float(v)
                    for k, v in fund_sectors.items()
                    if float(v) > 0.01
                }
                if normalized:
                    weightings[sym] = normalized
                    log.info(f"Fund weightings for {sym}: {normalized}")
                    time.sleep(0.3)
                    continue

            # Attempt 3: category/name-based classification
            classified = _classify_fund_by_category(info)
            if classified:
                weightings[sym] = classified
                log.info(f"Fund {sym} classified by category as: {classified}")
            else:
                log.warning(f"No weightings or category found for {sym}")

        except Exception as e:
            log.warning(f"Failed to fetch fund weightings for {sym}: {e}")
        time.sleep(0.3)
    log.info(f"Fund weightings result: {list(weightings.keys())}")
    return weightings


def _enrich_sync(positions: List[Dict[str, Any]], include_sectors: bool = False) -> List[Dict[str, Any]]:
    symbols = [p["symbol"] for p in positions if p.get("symbol")]
    price_data = fetch_prices_with_prev_close(symbols)
    sectors = fetch_sectors(symbols) if include_sectors else {}

    for position in positions:
        symbol = position.get("symbol")
        if not symbol:
            continue
        pdata = price_data.get(symbol, {})
        # Use live price if we got one, otherwise keep price already on the position (from CSV)
        price = pdata.get("price") or position.get("current_price")
        if price:
            position["current_price"] = price
            shares = position.get("total_shares")
            cost_basis = position.get("total_cost_basis")
            if shares and cost_basis:
                current_val = shares * price
                position["current_value"] = round(current_val, 4)
                position["total_gain_loss"] = round(current_val - cost_basis, 4)
                position["total_gain_loss_percent"] = round(
                    ((current_val - cost_basis) / cost_basis) * 100, 2
                )
        if pdata.get("prev_close") is not None:
            position["previous_close"] = pdata["prev_close"]
        if symbol in sectors:
            position["sector"] = sectors[symbol]

    return positions


async def enrich_positions_with_prices(positions: List[Dict[str, Any]], include_sectors: bool = False) -> List[Dict[str, Any]]:
    return await asyncio.to_thread(_enrich_sync, positions, include_sectors)
