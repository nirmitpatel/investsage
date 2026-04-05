"""
Tax savings endpoints.
"""

import asyncio
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from services.db.supabase_client import get_supabase, get_or_create_portfolio, get_positions, get_tax_lots
from services.market_data.yfinance_client import fetch_prices
from services.tax_savings import find_tax_opportunities, summarize_tax_opportunities
from services.ai.claude_client import explain_tax_opportunity

router = APIRouter()
security = HTTPBearer()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    try:
        sb = get_supabase()
        result = sb.auth.get_user(credentials.credentials)
        return result.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def _fetch_opportunities_sync(user_id: str):
    portfolio = get_or_create_portfolio(user_id)
    lots = get_tax_lots(user_id)
    if not lots:
        return [], {}

    # Get current prices for all symbols in lots
    symbols = list({lot["symbol"] for lot in lots if lot.get("symbol")})
    current_prices = fetch_prices(symbols)

    # Get sectors from saved positions
    positions = get_positions(portfolio["id"])
    sectors = {p["symbol"]: p.get("sector") for p in positions if p.get("sector")}

    opportunities = find_tax_opportunities(lots, current_prices, sectors)
    summary = summarize_tax_opportunities(opportunities)
    return opportunities, summary


@router.get("/opportunities")
async def get_tax_opportunities(user_id: str = Depends(get_current_user)):
    """Return tax-loss harvesting opportunities based on saved tax lots."""
    opportunities, summary = await asyncio.to_thread(_fetch_opportunities_sync, user_id)
    return {
        "summary": summary,
        "opportunities": opportunities,
        "has_lots": len(opportunities) > 0 or bool(await asyncio.to_thread(
            lambda: get_tax_lots(user_id)
        )),
    }


@router.post("/opportunities/{symbol}/explain")
async def explain_opportunity(
    symbol: str,
    user_id: str = Depends(get_current_user),
):
    """Use AI to explain a specific tax-loss harvesting opportunity."""
    opportunities, _ = await asyncio.to_thread(_fetch_opportunities_sync, user_id)
    opp = next((o for o in opportunities if o["symbol"] == symbol), None)
    if not opp:
        raise HTTPException(status_code=404, detail=f"No tax-loss opportunity found for {symbol}")

    explanation = await asyncio.to_thread(explain_tax_opportunity, opp)
    return {"symbol": symbol, "explanation": explanation}
