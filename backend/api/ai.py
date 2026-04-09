"""
AI analysis endpoints.
"""

import asyncio
from fastapi import APIRouter, HTTPException, Depends

from services.db.supabase_client import get_or_create_portfolio, get_positions, get_tax_lots
from services.market_data.yfinance_client import fetch_prices
from services.health_score import calculate_health_score, build_effective_sector_values
from services.market_data.yfinance_client import fetch_fund_sector_weightings, fetch_sector_etf_performance, SECTOR_NAME_NORMALIZE
from services.tax_savings import find_tax_opportunities, summarize_tax_opportunities
from services.ai.claude_client import analyze_portfolio, generate_sell_hold_buy
from api.portfolio import STYLE_TREND_PERIOD
from dependencies import get_current_user

router = APIRouter()


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


def _recommend_sync(symbol: str, portfolio: dict, positions: list) -> dict:
    position = next((p for p in positions if p["symbol"] == symbol), None)
    if not position:
        return {}

    total_value = sum(p.get("current_value") or 0 for p in positions)
    investment_style = portfolio.get("investment_style")
    period = STYLE_TREND_PERIOD.get(investment_style, "3mo")

    # Fetch sector trend for this position's sector
    raw_sector = position.get("sector") or "Unknown"
    sector = SECTOR_NAME_NORMALIZE.get(raw_sector, raw_sector)
    sector_trend = None
    if sector not in ("ETF", "Mutual Fund", "Unknown"):
        trends = fetch_sector_etf_performance([sector], period=period)
        sector_trend = trends.get(sector)

    trend_period_label = {
        "3y": "3-year", "3mo": "3-month", "10y": "10-year"
    }.get(period, period)

    portfolio_context = {
        "total_value": total_value,
        "position_count": len(positions),
        "investment_style": investment_style,
        "sector_trend": sector_trend,
        "trend_period": trend_period_label,
    }
    return generate_sell_hold_buy(position, portfolio_context)


@router.post("/position/{symbol}/recommend")
async def recommend_position(symbol: str, user_id: str = Depends(get_current_user)):
    """Get a Sell/Hold/Buy recommendation for a specific position."""
    portfolio = get_or_create_portfolio(user_id)
    positions = get_positions(portfolio["id"])
    if not any(p["symbol"] == symbol for p in positions):
        raise HTTPException(status_code=404, detail=f"Position {symbol} not found")
    result = await asyncio.to_thread(_recommend_sync, symbol, portfolio, positions)
    return result
