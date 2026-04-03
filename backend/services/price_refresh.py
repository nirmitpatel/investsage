"""
Background price refresh.
Runs every 5 minutes, updates current_price/current_value/gain_loss for all positions in the DB.
Only runs during market hours (Mon–Fri, 9:30am–4pm ET).
"""

import asyncio
import logging
from datetime import datetime, timezone, time as dtime
from zoneinfo import ZoneInfo

from services.market_data.yfinance_client import fetch_prices
from services.db.supabase_client import get_supabase

log = logging.getLogger(__name__)

REFRESH_INTERVAL = 300  # seconds (5 minutes)
ET = ZoneInfo("America/New_York")
MARKET_OPEN = dtime(9, 25)
MARKET_CLOSE = dtime(16, 5)


def _is_market_hours() -> bool:
    now = datetime.now(ET)
    if now.weekday() >= 5:  # Saturday=5, Sunday=6
        return False
    return MARKET_OPEN <= now.time() <= MARKET_CLOSE


def _refresh_prices_sync() -> int:
    """Fetch live prices and update all positions. Returns number of positions updated."""
    sb = get_supabase()
    result = sb.table("positions").select("id, symbol, total_shares, total_cost_basis").execute()
    positions = result.data or []
    if not positions:
        return 0

    symbols = list({p["symbol"] for p in positions if p.get("symbol")})
    prices = fetch_prices(symbols)
    if not prices:
        return 0

    updated = 0
    for p in positions:
        symbol = p.get("symbol")
        price = prices.get(symbol)
        if not price:
            continue
        shares = p.get("total_shares")
        cost_basis = p.get("total_cost_basis")
        update: dict = {"current_price": price}
        if shares and cost_basis:
            current_val = round(shares * price, 4)
            update["current_value"] = current_val
            update["total_gain_loss"] = round(current_val - cost_basis, 4)
            update["total_gain_loss_percent"] = round(
                ((current_val - cost_basis) / cost_basis) * 100, 2
            )
        sb.table("positions").update(update).eq("id", p["id"]).execute()
        updated += 1

    return updated


async def price_refresh_loop():
    """Long-running background task — call from FastAPI lifespan."""
    log.info("Price refresh loop started.")
    while True:
        await asyncio.sleep(REFRESH_INTERVAL)
        if _is_market_hours():
            try:
                n = await asyncio.to_thread(_refresh_prices_sync)
                log.info(f"Price refresh: updated {n} positions.")
            except Exception as e:
                log.warning(f"Price refresh failed: {e}")
        else:
            log.debug("Market closed — skipping price refresh.")
