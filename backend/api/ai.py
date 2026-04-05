"""
AI analysis endpoints.
"""

import asyncio
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from services.db.supabase_client import get_supabase, get_or_create_portfolio, get_positions, get_tax_lots
from services.market_data.yfinance_client import fetch_prices
from services.health_score import calculate_health_score, build_effective_sector_values
from services.market_data.yfinance_client import fetch_fund_sector_weightings, fetch_sector_etf_performance
from services.tax_savings import find_tax_opportunities, summarize_tax_opportunities
from services.ai.claude_client import analyze_portfolio
from api.portfolio import STYLE_TREND_PERIOD

router = APIRouter()
security = HTTPBearer()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    try:
        sb = get_supabase()
        result = sb.auth.get_user(credentials.credentials)
        return result.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def _build_analysis_sync(user_id: str) -> dict:
    portfolio = get_or_create_portfolio(user_id)
    positions = get_positions(portfolio["id"])
    lots = get_tax_lots(user_id)
    investment_style = portfolio.get("investment_style")

    # Build health
    fund_symbols = [p["symbol"] for p in positions if p.get("sector") in ("ETF", "Mutual Fund")]
    fund_weightings = fetch_fund_sector_weightings(fund_symbols) if fund_symbols else {}
    period = STYLE_TREND_PERIOD.get(investment_style, "3mo")
    sector_values = build_effective_sector_values(positions, fund_weightings)
    market_trends = fetch_sector_etf_performance(list(sector_values.keys()), period=period)
    health = calculate_health_score(positions, fund_weightings, investment_style, market_trends)

    # Tax summary
    tax_summary = {}
    if lots:
        symbols = list({lot["symbol"] for lot in lots if lot.get("symbol")})
        prices = fetch_prices(symbols)
        sectors = {p["symbol"]: p.get("sector") for p in positions if p.get("sector")}
        opps = find_tax_opportunities(lots, prices, sectors)
        tax_summary = summarize_tax_opportunities(opps)

    summary = analyze_portfolio(positions, health, tax_summary or None)
    return {"summary": summary, "health": health, "tax_summary": tax_summary}


@router.post("/analyze")
async def analyze(user_id: str = Depends(get_current_user)):
    """Generate a holistic AI portfolio analysis."""
    result = await asyncio.to_thread(_build_analysis_sync, user_id)
    return result
