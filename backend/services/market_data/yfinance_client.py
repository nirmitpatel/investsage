"""
Market data via yfinance (free, no API key required).
Prices are fetched in small batches to avoid Yahoo Finance rate limits.
"""

import asyncio
import logging
import time
import yfinance as yf
from typing import List, Dict, Any

logging.getLogger("yfinance").setLevel(logging.CRITICAL)

BATCH_SIZE = 10  # Yahoo Finance tolerates ~10 tickers per request reliably


def _fetch_prices_batch(symbols: List[str]) -> Dict[str, float]:
    """Fetch prices for up to BATCH_SIZE symbols at once."""
    if not symbols:
        return {}
    try:
        data = yf.download(symbols, period="2d", auto_adjust=True, progress=False, threads=False)
        if data.empty:
            return {}
        close = data["Close"] if "Close" in data.columns else data
        prices: Dict[str, float] = {}
        if len(symbols) == 1:
            # Single ticker — close is a Series, not a DataFrame
            sym = symbols[0]
            try:
                prices[sym] = round(float(close.dropna().iloc[-1]), 4)
            except Exception:
                pass
        else:
            for sym in symbols:
                try:
                    col = close[sym] if sym in close.columns else None
                    if col is not None:
                        prices[sym] = round(float(col.dropna().iloc[-1]), 4)
                except Exception:
                    pass
        return prices
    except Exception:
        return {}


def fetch_prices(symbols: List[str]) -> Dict[str, float]:
    """Fetch prices for all symbols in batches to avoid rate limits."""
    all_prices: Dict[str, float] = {}
    for i in range(0, len(symbols), BATCH_SIZE):
        batch = symbols[i: i + BATCH_SIZE]
        prices = _fetch_prices_batch(batch)
        all_prices.update(prices)
        if i + BATCH_SIZE < len(symbols):
            time.sleep(0.5)  # brief pause between batches
    return all_prices


FUND_SECTOR_NAME_MAP = {
    "technology": "Technology",
    "healthcare": "Healthcare",
    "financial_services": "Financial Services",
    "consumer_cyclical": "Consumer Cyclical",
    "consumer_defensive": "Consumer Defensive",
    "industrials": "Industrials",
    "basic_materials": "Basic Materials",
    "real_estate": "Real Estate",
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
                    sectors[sym] = sector
            except Exception:
                pass
        if i + BATCH_SIZE < len(symbols):
            time.sleep(0.5)
    return sectors


log = logging.getLogger(__name__)


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
    etf_to_sector = {v: k for k, v in SECTOR_ETFS.items()}
    relevant_etfs = [SECTOR_ETFS[s] for s in sectors if s in SECTOR_ETFS]
    if not relevant_etfs:
        return {}
    result: Dict[str, float] = {}
    try:
        data = yf.download(relevant_etfs, period=period, auto_adjust=True, progress=False, threads=False)
        if data.empty:
            return {}
        close = data["Close"] if "Close" in data.columns else data
        for etf in relevant_etfs:
            try:
                if len(relevant_etfs) == 1:
                    series = close.dropna()
                else:
                    col = close[etf] if etf in close.columns else None
                    series = col.dropna() if col is not None else None
                if series is not None and len(series) >= 2:
                    pct = ((float(series.iloc[-1]) - float(series.iloc[0])) / float(series.iloc[0])) * 100
                    result[etf_to_sector[etf]] = round(pct, 2)
            except Exception:
                pass
    except Exception as e:
        log.warning(f"Failed to fetch sector ETF performance: {e}")
    return result


def fetch_fund_sector_weightings(symbols: List[str]) -> Dict[str, Dict[str, float]]:
    """For ETFs and mutual funds, fetch their sector weightings.
    Returns {symbol: {sector_name: weight_0_to_1, ...}}
    Only returns entries for symbols that actually have weightings data."""
    weightings: Dict[str, Dict[str, float]] = {}
    log.info(f"Fetching fund sector weightings for: {symbols}")
    for sym in symbols:
        try:
            ticker = yf.Ticker(sym)
            fund_sectors = ticker.funds_data.sector_weightings if hasattr(ticker, 'funds_data') and ticker.funds_data is not None else None
            if fund_sectors is None:
                # Fallback: try info-level sector weightings
                info = ticker.info
                if info.get("quoteType") not in ("ETF", "MUTUALFUND"):
                    continue
                fund_sectors = info.get("sectorWeightings", [])
                if isinstance(fund_sectors, list) and fund_sectors:
                    merged: Dict[str, float] = {}
                    for entry in fund_sectors:
                        merged.update(entry)
                    fund_sectors = merged
                else:
                    continue
            if isinstance(fund_sectors, dict) and fund_sectors:
                normalized = {
                    FUND_SECTOR_NAME_MAP.get(k, k.replace("_", " ").title()): float(v)
                    for k, v in fund_sectors.items()
                    if float(v) > 0.01  # ignore < 1% noise
                }
                if normalized:
                    weightings[sym] = normalized
                    log.info(f"Fund weightings for {sym}: {normalized}")
                else:
                    log.warning(f"No weightings found for {sym}")
        except Exception as e:
            log.warning(f"Failed to fetch fund weightings for {sym}: {e}")
        time.sleep(0.3)
    log.info(f"Fund weightings result: {list(weightings.keys())}")
    return weightings


def _enrich_sync(positions: List[Dict[str, Any]], include_sectors: bool = False) -> List[Dict[str, Any]]:
    symbols = [p["symbol"] for p in positions if p.get("symbol")]
    prices = fetch_prices(symbols)
    sectors = fetch_sectors(symbols) if include_sectors else {}

    for position in positions:
        symbol = position.get("symbol")
        if not symbol:
            continue
        # Use live price if we got one, otherwise keep price already on the position (from CSV)
        price = prices.get(symbol) or position.get("current_price")
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
        if symbol in sectors:
            position["sector"] = sectors[symbol]

    return positions


async def enrich_positions_with_prices(positions: List[Dict[str, Any]], include_sectors: bool = False) -> List[Dict[str, Any]]:
    return await asyncio.to_thread(_enrich_sync, positions, include_sectors)
