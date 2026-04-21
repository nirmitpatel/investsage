"""
Smart Money endpoints — congressional trades, hedge fund 13F, insider Form 4.
"""

import asyncio
import logging
from fastapi import APIRouter, HTTPException, Depends, Query

from services.db.supabase_client import (
    get_or_create_portfolio,
    get_positions,
    get_smart_money_trades,
    get_smart_money_overlap,
    upsert_smart_money_trades,
    get_trade_by_id,
    get_smart_money_follows,
    follow_trader,
    unfollow_trader,
)
from dependencies import get_current_user

log = logging.getLogger(__name__)
router = APIRouter()


# ── Read endpoints ──────────────────────────────────────────────────────────

@router.get("/congress")
async def get_congress_trades(
    days_back: int = Query(90, ge=1, le=365),
    limit: int = Query(100, ge=1, le=500),
    _: str = Depends(get_current_user),
):
    """Return recent congressional STOCK Act disclosures."""
    def _fetch():
        return get_smart_money_trades(trader_type="congress", limit=limit, days_back=days_back)
    return {"trades": await asyncio.to_thread(_fetch)}


@router.get("/hedge-funds")
async def get_hedge_fund_trades(
    days_back: int = Query(120, ge=1, le=365),
    limit: int = Query(200, ge=1, le=500),
    _: str = Depends(get_current_user),
):
    """Return latest 13F position disclosures from top hedge funds."""
    def _fetch():
        return get_smart_money_trades(trader_type="hedge_fund", limit=limit, days_back=days_back)
    return {"trades": await asyncio.to_thread(_fetch)}


@router.get("/insider")
async def get_insider_trades(
    days_back: int = Query(30, ge=1, le=180),
    limit: int = Query(100, ge=1, le=500),
    _: str = Depends(get_current_user),
):
    """Return recent executive Form 4 insider transactions."""
    def _fetch():
        return get_smart_money_trades(trader_type="insider", limit=limit, days_back=days_back)
    return {"trades": await asyncio.to_thread(_fetch)}


@router.get("/overlap")
async def get_overlap(
    days_back: int = Query(90, ge=1, le=365),
    user_id: str = Depends(get_current_user),
):
    """Return smart money trades that overlap with the user's current holdings."""
    def _fetch():
        portfolio = get_or_create_portfolio(user_id)
        positions = get_positions(portfolio["id"])
        symbols = [p["symbol"] for p in positions if p.get("symbol")]
        if not symbols:
            return {"trades": [], "held_symbols": []}
        trades = get_smart_money_overlap(symbols, days_back=days_back)
        return {"trades": trades, "held_symbols": symbols}
    return await asyncio.to_thread(_fetch)


# ── Follow/unfollow endpoints ───────────────────────────────────────────────

@router.get("/follows")
async def get_follows(user_id: str = Depends(get_current_user)):
    """Return the list of traders the user follows."""
    def _fetch():
        return get_smart_money_follows(user_id)
    return {"follows": await asyncio.to_thread(_fetch)}


@router.post("/follow/{trade_id}", status_code=201)
async def follow_trade(trade_id: str, user_id: str = Depends(get_current_user)):
    """Follow the trader associated with a specific trade."""
    def _do():
        trade = get_trade_by_id(trade_id)
        if not trade:
            raise HTTPException(status_code=404, detail="Trade not found")
        trader_name = trade.get("trader_name") or "Unknown"
        trader_type = trade.get("trader_type") or "unknown"
        ok = follow_trader(user_id, trader_name, trader_type)
        if not ok:
            raise HTTPException(status_code=500, detail="Failed to follow trader")
        return {"trader_name": trader_name, "trader_type": trader_type}
    return await asyncio.to_thread(_do)


@router.delete("/follow/{trade_id}", status_code=200)
async def unfollow_trade(trade_id: str, user_id: str = Depends(get_current_user)):
    """Unfollow the trader associated with a specific trade."""
    def _do():
        trade = get_trade_by_id(trade_id)
        if not trade:
            raise HTTPException(status_code=404, detail="Trade not found")
        trader_name = trade.get("trader_name") or "Unknown"
        unfollow_trader(user_id, trader_name)
        return {"trader_name": trader_name, "unfollowed": True}
    return await asyncio.to_thread(_do)


# ── Ingest endpoint ─────────────────────────────────────────────────────────

@router.post("/ingest")
async def trigger_ingest(
    source: str = Query("congress", regex="^(congress|hedge_funds|insider|all)$"),
    _: str = Depends(get_current_user),
):
    """Trigger a data ingestion run. Returns counts of records upserted."""
    async def _run():
        results = {}
        if source in ("congress", "all"):
            try:
                from services.smart_money.congress import fetch_congress_trades
                trades = await asyncio.to_thread(fetch_congress_trades)
                count = await asyncio.to_thread(upsert_smart_money_trades, trades, "congress")
                results["congress"] = count
            except Exception as e:
                log.warning(f"Congress ingest failed: {e}")
                results["congress"] = f"error: {e}"

        if source in ("hedge_funds", "all"):
            try:
                from services.smart_money.hedge_funds import fetch_hedge_fund_trades
                trades = await asyncio.to_thread(fetch_hedge_fund_trades)
                count = await asyncio.to_thread(upsert_smart_money_trades, trades, "hedge_fund")
                results["hedge_funds"] = count
            except Exception as e:
                log.warning(f"Hedge fund ingest failed: {e}")
                results["hedge_funds"] = f"error: {e}"

        if source in ("insider", "all"):
            try:
                from services.smart_money.insider import fetch_insider_trades
                trades = await asyncio.to_thread(fetch_insider_trades)
                count = await asyncio.to_thread(upsert_smart_money_trades, trades, "insider")
                results["insider"] = count
            except Exception as e:
                log.warning(f"Insider ingest failed: {e}")
                results["insider"] = f"error: {e}"

        return {"ingested": results}

    return await _run()
