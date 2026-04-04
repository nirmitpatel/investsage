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


def fetch_sectors(symbols: List[str]) -> Dict[str, str]:
    """Fetch sector for each symbol via ticker.info, in small batches with delays."""
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
