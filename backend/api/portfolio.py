from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, BackgroundTasks, Query
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional
import asyncio

from services.csv_parser import parse_positions, parse_transactions
from services.csv_parser.fidelity import reconstruct_tax_lots
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
    replace_tax_lots,
    update_portfolio_style,
    patch_positions_cost_basis,
)
from services.health_score import calculate_health_score
from dependencies import get_current_user

router = APIRouter()

VALID_STYLES = {"play_it_safe", "beat_the_market", "long_game"}

STYLE_TREND_PERIOD = {
    "play_it_safe": "3y",
    "beat_the_market": "3mo",
    "long_game": "10y",
}


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


MAX_CSV_BYTES = 5 * 1024 * 1024   # 5 MB
MAX_PDF_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/import/positions")
async def import_positions(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    brokerage: Optional[str] = Query(default=None),
    user_id: str = Depends(get_current_user),
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    content = await file.read(MAX_CSV_BYTES + 1)
    if len(content) > MAX_CSV_BYTES:
        raise HTTPException(status_code=413, detail="File too large — maximum size is 5 MB")
    text = content.decode("utf-8")

    try:
        positions, brokerage, embedded_transactions = parse_positions(text, brokerage)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    positions = await enrich_positions_with_prices(positions, include_sectors=True)

    portfolio = get_or_create_portfolio(user_id)
    upsert_positions(portfolio["id"], user_id, positions)

    # Vanguard and Robinhood files include transaction history — save tax lots automatically
    tax_lots_saved = 0
    if embedded_transactions:
        lots = reconstruct_tax_lots(embedded_transactions)
        replace_tax_lots(user_id, lots)
        tax_lots_saved = len(lots)

    get_supabase().table("portfolios").update({
        "last_import_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", portfolio["id"]).execute()

    health = await asyncio.to_thread(_build_health, positions, portfolio)

    return {
        "imported": len(positions),
        "brokerage": brokerage,
        "tax_lots_saved": tax_lots_saved or None,
        "positions": positions,
        "health": health,
    }


@router.post("/import/transactions")
async def import_transactions(
    file: UploadFile = File(...),
    brokerage: Optional[str] = Query(default=None),
    user_id: str = Depends(get_current_user),
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    content = await file.read(MAX_CSV_BYTES + 1)
    if len(content) > MAX_CSV_BYTES:
        raise HTTPException(status_code=413, detail="File too large — maximum size is 5 MB")
    text = content.decode("utf-8")

    try:
        transactions, brokerage = parse_transactions(text, brokerage)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    lots = reconstruct_tax_lots(transactions)

    replace_tax_lots(user_id, lots)

    return {
        "imported": len(transactions),
        "brokerage": brokerage,
        "tax_lots_reconstructed": len(lots),
        "transactions": transactions,
    }


@router.post("/import/performance-pdf")
async def import_performance_pdf(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
):
    """
    Accept a Vanguard Performance Report PDF and use it to populate cost basis
    for positions that lacked full transaction history in the CSV export.

    The PDF's "Total" row gives the cumulative deposits since account inception,
    which equals total cost basis when the account started at $0. That total is
    then distributed across existing positions: money market funds get
    cost_basis = current_value (stable $1 NAV); all other positions receive
    a proportional share of the remaining cost by current market value.

    Positions must already exist (upload the CSV first).
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    content = await file.read(MAX_PDF_BYTES + 1)
    if len(content) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="File too large — maximum size is 10 MB")

    from services.pdf_parser.vanguard_performance import (
        parse_vanguard_performance_pdf,
        distribute_cost_basis,
    )

    try:
        pdf_data = parse_vanguard_performance_pdf(content)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    portfolio = get_or_create_portfolio(user_id)
    positions = get_positions(portfolio["id"])

    if not positions:
        raise HTTPException(
            status_code=422,
            detail="Upload your positions CSV first before supplementing with a performance PDF",
        )

    updates = distribute_cost_basis(positions, pdf_data["total_deposits"])
    patch_positions_cost_basis(portfolio["id"], updates)

    positions = get_positions(portfolio["id"])
    health = await asyncio.to_thread(_build_health, positions, portfolio)

    return {
        "total_deposits": pdf_data["total_deposits"],
        "total_investment_return": pdf_data["total_investment_return"],
        "date_range": pdf_data.get("date_range"),
        "positions_updated": len(updates),
        "positions": positions,
        "health": health,
    }


@router.post("/refresh-prices")
async def refresh_prices(user_id: str = Depends(get_current_user)):
    """Manually trigger a price refresh for this user's positions."""
    from services.price_refresh import _refresh_prices_sync
    n = await asyncio.to_thread(_refresh_prices_sync, user_id)
    portfolio = get_or_create_portfolio(user_id)
    positions = get_positions(portfolio["id"])
    health = await asyncio.to_thread(_build_health, positions, portfolio)
    return {"updated": n, "positions": positions, "health": health}
