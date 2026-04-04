from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional
import asyncio

from services.csv_parser.fidelity import (
    parse_fidelity_positions,
    parse_fidelity_transactions,
    reconstruct_tax_lots,
)
from services.market_data.yfinance_client import (
    enrich_positions_with_prices,
    fetch_sectors,
    fetch_fund_sector_weightings,
    fetch_sector_etf_performance,
)
from services.db.supabase_client import (
    get_supabase,
    get_or_create_portfolio,
    upsert_positions,
    get_positions,
    save_tax_lots,
    update_portfolio_style,
)
from services.health_score import calculate_health_score

router = APIRouter()
security = HTTPBearer()

VALID_STYLES = {"play_it_safe", "beat_the_market", "long_game"}

STYLE_TREND_PERIOD = {
    "play_it_safe": "1y",
    "beat_the_market": "3mo",
    "long_game": "2y",
}


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    try:
        sb = get_supabase()
        result = sb.auth.get_user(credentials.credentials)
        return result.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def _get_fund_weightings(positions):
    """Fetch fund sector weightings for any ETF/mutual fund positions."""
    fund_symbols = [
        p["symbol"] for p in positions
        if p.get("sector") in ("ETF", "Mutual Fund") and p.get("symbol")
    ]
    return fetch_fund_sector_weightings(fund_symbols) if fund_symbols else {}



def _build_health(positions, portfolio, include_trends: bool = True):
    """Sync helper: fetch fund weightings + market trends, then calculate health."""
    from services.health_score import build_effective_sector_values
    fund_weightings = _get_fund_weightings(positions)
    investment_style = portfolio.get("investment_style")
    period = STYLE_TREND_PERIOD.get(investment_style, "3mo")

    market_trends = {}
    if include_trends:
        sector_values = build_effective_sector_values(positions, fund_weightings)
        market_trends = fetch_sector_etf_performance(list(sector_values.keys()), period=period)

    return calculate_health_score(positions, fund_weightings, investment_style, market_trends)


@router.get("")
async def get_portfolio(user_id: str = Depends(get_current_user)):
    portfolio = get_or_create_portfolio(user_id)
    positions = get_positions(portfolio["id"])
    health = await asyncio.to_thread(_build_health, positions, portfolio)
    return {
        "portfolio": portfolio,
        "positions": positions,
        "health": health,
    }


class StyleUpdate(BaseModel):
    investment_style: str


@router.patch("")
async def update_investment_style(
    body: StyleUpdate,
    user_id: str = Depends(get_current_user),
):
    if body.investment_style not in VALID_STYLES:
        raise HTTPException(status_code=400, detail=f"investment_style must be one of {VALID_STYLES}")
    portfolio = get_or_create_portfolio(user_id)
    update_portfolio_style(portfolio["id"], body.investment_style)
    # Re-run health score with new style
    positions = get_positions(portfolio["id"])
    portfolio["investment_style"] = body.investment_style
    health = await asyncio.to_thread(_build_health, positions, portfolio)
    return {"investment_style": body.investment_style, "health": health}


@router.post("/import/positions")
async def import_positions(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    user_id: str = Depends(get_current_user),
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    content = await file.read()
    text = content.decode("utf-8")

    positions = parse_fidelity_positions(text)
    positions = await enrich_positions_with_prices(positions, include_sectors=True)

    portfolio = get_or_create_portfolio(user_id)
    upsert_positions(portfolio["id"], user_id, positions)

    get_supabase().table("portfolios").update({
        "last_import_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", portfolio["id"]).execute()

    health = await asyncio.to_thread(_build_health, positions, portfolio)

    return {
        "imported": len(positions),
        "positions": positions,
        "health": health,
    }


@router.post("/import/transactions")
async def import_transactions(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    content = await file.read()
    text = content.decode("utf-8")

    transactions = parse_fidelity_transactions(text)
    lots = reconstruct_tax_lots(transactions)

    return {
        "imported": len(transactions),
        "tax_lots_reconstructed": len(lots),
        "transactions": transactions,
    }


@router.post("/refresh-prices")
async def refresh_prices(user_id: str = Depends(get_current_user)):
    """Manually trigger a price refresh for this user's positions."""
    from services.price_refresh import _refresh_prices_sync
    n = await asyncio.to_thread(_refresh_prices_sync)
    portfolio = get_or_create_portfolio(user_id)
    positions = get_positions(portfolio["id"])
    health = await asyncio.to_thread(_build_health, positions, portfolio)
    return {"updated": n, "positions": positions, "health": health}
