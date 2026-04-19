"""
AI analysis endpoints.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from fastapi import APIRouter, HTTPException, Depends, Body

from services.db.supabase_client import (
    get_or_create_portfolio, get_positions, get_tax_lots,
    save_recommendation_snapshot, update_recommendation_action,
)
from services.purchase_pattern import analyze_purchase_pattern
from services.market_data.yfinance_client import fetch_prices, fetch_price_performance
from services.health_score import calculate_health_score, build_effective_sector_values, check_symbol_portfolio_fit
from services.market_data.yfinance_client import fetch_fund_sector_weightings, fetch_sector_etf_performance, SECTOR_NAME_NORMALIZE
from services.tax_savings import find_tax_opportunities, summarize_tax_opportunities
from services.ai.claude_client import analyze_portfolio, generate_sell_hold_buy, generate_rebalance_suggestion
from services.market_data.fmp_client import fetch_analyst_fundamentals
from services.csv_parser.fidelity import RETIREMENT_ACCOUNT_TYPES
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
        federal = portfolio.get("federal_tax_bracket")
        state = portfolio.get("state_tax_bracket")
        opps = find_tax_opportunities(lots, prices, sectors, federal, state)
        tax_summary = summarize_tax_opportunities(opps)

    summary = analyze_portfolio(positions, health, tax_summary or None)
    return {"summary": summary, "health": health, "tax_summary": tax_summary}


@router.post("/analyze")
async def analyze(user_id: str = Depends(get_current_user)):
    """Generate a holistic AI portfolio analysis."""
    result = await asyncio.to_thread(_build_analysis_sync, user_id)
    return result


def _compute_tax_timing(symbol_lots: list) -> dict:
    """Derive tax timing signals from tax lots for a single symbol."""
    today = date.today()
    result = {"short_term_lots": 0, "long_term_lots": 0, "days_to_long_term": None}
    if not symbol_lots:
        return result
    min_days_to_lt = None
    for lot in symbol_lots:
        term = lot.get("term")
        if term == "long":
            result["long_term_lots"] += 1
        elif term == "short":
            result["short_term_lots"] += 1
            acq = lot.get("acquisition_date")
            if acq:
                try:
                    acq_date = date.fromisoformat(str(acq)[:10])
                    days_to_lt = max(0, 365 - (today - acq_date).days)
                    if min_days_to_lt is None or days_to_lt < min_days_to_lt:
                        min_days_to_lt = days_to_lt
                except (ValueError, TypeError):
                    pass
    if min_days_to_lt is not None:
        result["days_to_long_term"] = min_days_to_lt
    return result


def _recommend_sync(symbol: str, portfolio: dict, positions: list) -> dict:
    position = next((p for p in positions if p["symbol"] == symbol), None)
    if not position:
        return {}

    total_value = sum(p.get("current_value") or 0 for p in positions)
    investment_style = portfolio.get("investment_style")
    period = STYLE_TREND_PERIOD.get(investment_style, "3mo")

    raw_sector = position.get("sector") or "Unknown"
    sector = SECTOR_NAME_NORMALIZE.get(raw_sector, raw_sector)
    sector_trend = None
    if sector not in ("ETF", "Mutual Fund", "Unknown"):
        trends = fetch_sector_etf_performance([sector], period=period)
        sector_trend = trends.get(sector)

    trend_period_label = {
        "3y": "3-year", "3mo": "3-month", "10y": "10-year"
    }.get(period, period)

    account_type = position.get("account_type", "individual")

    # Fetch FMP fundamentals + 30d/90d price performance in parallel (non-retirement stocks)
    fmp_data: dict = {}
    price_performance: dict = {}
    if account_type not in RETIREMENT_ACCOUNT_TYPES and raw_sector not in ("ETF", "Mutual Fund"):
        with ThreadPoolExecutor(max_workers=2) as ex:
            fmp_future = ex.submit(fetch_analyst_fundamentals, symbol)
            perf_future = ex.submit(fetch_price_performance, symbol)
            fmp_data = fmp_future.result()
            price_performance = perf_future.result()

    # Purchase pattern + tax timing from tax lots
    purchase_pattern: dict = {}
    tax_timing: dict = {}
    tax_opportunity: dict = {}
    if account_type not in RETIREMENT_ACCOUNT_TYPES:
        user_id = portfolio.get("user_id")
        if user_id:
            all_lots = get_tax_lots(user_id)
            symbol_lots = [l for l in all_lots if l.get("symbol") == symbol]
            current_price = position.get("current_price")
            purchase_pattern = analyze_purchase_pattern(symbol_lots, current_price)
            tax_timing = _compute_tax_timing(symbol_lots)
            # Compute quantified tax savings for this symbol (used to boost SELL signal)
            if current_price and symbol_lots:
                federal = portfolio.get("federal_tax_bracket")
                state = portfolio.get("state_tax_bracket")
                sector_map = {symbol: position.get("sector")}
                opps = find_tax_opportunities(symbol_lots, {symbol: current_price}, sector_map, federal, state)
                if opps:
                    tax_opportunity = {
                        "tax_savings_estimate": round(sum(o["tax_savings_estimate"] for o in opps), 2),
                        "unrealized_loss": round(sum(o["unrealized_loss"] for o in opps), 2),
                        "has_short_term": any(o["is_short_term"] for o in opps),
                        "urgency": (
                            "high" if any(o.get("urgency") == "high" for o in opps)
                            else "medium" if any(o.get("urgency") == "medium" for o in opps)
                            else None
                        ),
                    }

    # Portfolio fit: conflicts and redundancies for this symbol
    portfolio_fit = check_symbol_portfolio_fit(symbol, positions)

    portfolio_context = {
        "total_value": total_value,
        "position_count": len(positions),
        "investment_style": investment_style,
        "sector_trend": sector_trend,
        "trend_period": trend_period_label,
        "account_type": account_type,
        "fmp": fmp_data,
        "purchase_pattern": purchase_pattern,
        "price_performance": price_performance,
        "portfolio_fit": portfolio_fit,
        "tax_timing": tax_timing,
        "tax_opportunity": tax_opportunity,
    }

    if account_type in RETIREMENT_ACCOUNT_TYPES:
        return generate_rebalance_suggestion(position, portfolio_context)
    result = generate_sell_hold_buy(position, portfolio_context)
    if result.get("recommendation") == "SELL":
        opp = _compute_opportunity_cost(symbol, positions, period, trend_period_label)
        if opp:
            result["opportunity_cost"] = opp
    return result


def _compute_opportunity_cost(symbol: str, positions: list, period: str, trend_period_label: str) -> dict:
    """Compute what freed capital from selling `symbol` could earn if redeployed."""
    position = next((p for p in positions if p["symbol"] == symbol), None)
    if not position:
        return {}
    freed_capital = position.get("current_value") or 0
    if freed_capital <= 0:
        return {}

    others = [
        p for p in positions
        if p["symbol"] != symbol
        and p.get("account_type", "individual") not in RETIREMENT_ACCOUNT_TYPES
    ]

    result: dict = {"freed_capital": round(freed_capital, 2)}

    # Best position by all-time total return %
    performers = [p for p in others if (p.get("total_gain_loss_percent") or 0) > 0]
    if performers:
        best = max(performers, key=lambda p: p.get("total_gain_loss_percent") or 0)
        result["best_position"] = {
            "symbol": best["symbol"],
            "name": best.get("name") or best["symbol"],
            "return_pct": round(best.get("total_gain_loss_percent") or 0, 2),
        }

    # Best sector by ETF trend (batch fetch for all portfolio sectors)
    try:
        sectors = list({
            SECTOR_NAME_NORMALIZE.get(p.get("sector") or "", p.get("sector") or "")
            for p in others
            if p.get("sector") not in (None, "", "ETF", "Mutual Fund", "Unknown")
        } - {"ETF", "Mutual Fund", "Unknown", ""})
        if sectors:
            sector_trends = fetch_sector_etf_performance(sectors, period=period)
            positive_trends = {s: v for s, v in sector_trends.items() if v and v > 0}
            if positive_trends:
                best_sector = max(positive_trends, key=positive_trends.get)
                result["best_sector"] = {
                    "name": best_sector,
                    "return_pct": round(positive_trends[best_sector], 2),
                    "period": trend_period_label,
                }
    except Exception:
        pass

    return result if len(result) > 1 else {}


@router.post("/position/{symbol}/recommend")
async def recommend_position(symbol: str, user_id: str = Depends(get_current_user)):
    """Get a Sell/Hold/Buy recommendation for a specific position."""
    portfolio = get_or_create_portfolio(user_id)
    positions = get_positions(portfolio["id"])
    position = next((p for p in positions if p["symbol"] == symbol), None)
    if not position:
        raise HTTPException(status_code=404, detail=f"Position {symbol} not found")
    result = await asyncio.to_thread(_recommend_sync, symbol, portfolio, positions)
    # Persist snapshot and include id in response
    if result.get("recommendation") and position:
        snapshot_id = await asyncio.to_thread(
            save_recommendation_snapshot, user_id, symbol, result, position
        )
        if snapshot_id:
            result["snapshot_id"] = snapshot_id
    return result


@router.patch("/position/{symbol}/action")
async def set_recommendation_action(
    symbol: str,
    snapshot_id: str = Body(..., embed=True),
    action: str = Body(..., embed=True),
    user_id: str = Depends(get_current_user),
):
    """Mark a recommendation snapshot as 'followed' or 'ignored'."""
    if action not in ("followed", "ignored", "pending"):
        raise HTTPException(status_code=400, detail="action must be followed, ignored, or pending")
    updated = await asyncio.to_thread(update_recommendation_action, snapshot_id, user_id, action)
    if not updated:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return {"ok": True}
