from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timezone

from services.csv_parser.fidelity import (
    parse_fidelity_positions,
    parse_fidelity_transactions,
    reconstruct_tax_lots,
)
from services.market_data.yfinance_client import enrich_positions_with_prices, fetch_sectors, fetch_fund_sector_weightings
from services.db.supabase_client import (
    get_supabase,
    get_or_create_portfolio,
    upsert_positions,
    get_positions,
    save_tax_lots,
)
from services.health_score import calculate_health_score

router = APIRouter()
security = HTTPBearer()


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


@router.get("")
async def get_portfolio(user_id: str = Depends(get_current_user)):
    import asyncio
    portfolio = get_or_create_portfolio(user_id)
    positions = get_positions(portfolio["id"])
    fund_weightings = await asyncio.to_thread(_get_fund_weightings, positions)
    health = calculate_health_score(positions, fund_weightings)
    return {
        "portfolio": portfolio,
        "positions": positions,
        "health": health,
    }


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

    import asyncio
    fund_weightings = await asyncio.to_thread(_get_fund_weightings, positions)
    health = calculate_health_score(positions, fund_weightings)

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
    import asyncio
    from services.price_refresh import _refresh_prices_sync
    n = await asyncio.to_thread(_refresh_prices_sync)
    portfolio = get_or_create_portfolio(user_id)
    positions = get_positions(portfolio["id"])
    fund_weightings = await asyncio.to_thread(_get_fund_weightings, positions)
    health = calculate_health_score(positions, fund_weightings)
    return {"updated": n, "positions": positions, "health": health}
