"""
Portfolio analytics endpoint.
Returns performance breakdown, best/worst performers, and S&P 500 comparison.
"""

import asyncio
from fastapi import APIRouter, HTTPException, Depends

from services.db.supabase_client import get_or_create_portfolio, get_positions, get_snapshots
from services.market_data.yfinance_client import fetch_sector_etf_performance
from services.health_score import build_effective_sector_values, calculate_health_score
from services.market_data.yfinance_client import fetch_fund_sector_weightings
from api.portfolio import STYLE_TREND_PERIOD
from dependencies import get_current_user
import yfinance as yf
import time
import logging

log = logging.getLogger(__name__)
router = APIRouter()


def _fetch_spy_performance() -> dict:
    """Fetch SPY 1-month and 1-year returns."""
    result = {}
    try:
        ticker = yf.Ticker("SPY")
        for period, key in [("1mo", "spy_1mo"), ("1y", "spy_1y"), ("ytd", "spy_ytd")]:
            try:
                hist = ticker.history(period=period)
                if len(hist) >= 2:
                    start = float(hist["Close"].dropna().iloc[0])
                    end = float(hist["Close"].dropna().iloc[-1])
                    result[key] = round(((end - start) / start) * 100, 2)
                time.sleep(0.2)
            except Exception as e:
                log.warning(f"SPY {period} fetch failed: {e}")
    except Exception as e:
        log.warning(f"SPY fetch failed: {e}")
    return result


def _build_analytics_sync(user_id: str) -> dict:
    portfolio = get_or_create_portfolio(user_id)
    positions = get_positions(portfolio["id"])
    if not positions:
        return {"empty": True}

    investment_style = portfolio.get("investment_style")
    total_value = sum(p.get("current_value") or 0 for p in positions)
    total_cost = sum(p.get("total_cost_basis") or 0 for p in positions)

    # Best/worst performers by gain %
    ranked = sorted(
        [p for p in positions if p.get("total_gain_loss_percent") is not None],
        key=lambda p: p["total_gain_loss_percent"],
        reverse=True,
    )
    top_performers = [
        {
            "symbol": p["symbol"],
            "sector": p.get("sector") or "Unknown",
            "gain_loss_pct": p["total_gain_loss_percent"],
            "gain_loss": p.get("total_gain_loss") or 0,
            "current_value": p.get("current_value") or 0,
        }
        for p in ranked[:5]
    ]
    worst_performers = [
        {
            "symbol": p["symbol"],
            "sector": p.get("sector") or "Unknown",
            "gain_loss_pct": p["total_gain_loss_percent"],
            "gain_loss": p.get("total_gain_loss") or 0,
            "current_value": p.get("current_value") or 0,
        }
        for p in ranked[-5:][::-1] if p["total_gain_loss_percent"] < 0
    ]

    # Sector P&L — group gain/loss by sector
    sector_pnl: dict = {}
    for p in positions:
        sector = p.get("sector") or "Unknown"
        if sector in ("ETF", "Mutual Fund"):
            sector = p.get("sector", "Fund")
        gl = p.get("total_gain_loss") or 0
        val = p.get("current_value") or 0
        if sector not in sector_pnl:
            sector_pnl[sector] = {"gain_loss": 0, "value": 0, "count": 0}
        sector_pnl[sector]["gain_loss"] += gl
        sector_pnl[sector]["value"] += val
        sector_pnl[sector]["count"] += 1

    sector_breakdown = sorted(
        [
            {
                "sector": k,
                "gain_loss": round(v["gain_loss"], 2),
                "value": round(v["value"], 2),
                "pct_of_portfolio": round(v["value"] / total_value * 100, 1) if total_value else 0,
                "count": v["count"],
            }
            for k, v in sector_pnl.items()
        ],
        key=lambda x: -x["value"],
    )

    # Market trends for sector exposure
    fund_symbols = [p["symbol"] for p in positions if p.get("sector") in ("ETF", "Mutual Fund")]
    fund_weightings = fetch_fund_sector_weightings(fund_symbols) if fund_symbols else {}
    period = STYLE_TREND_PERIOD.get(investment_style, "3mo")
    sector_values = build_effective_sector_values(positions, fund_weightings)
    market_trends = fetch_sector_etf_performance(list(sector_values.keys()), period=period)

    # SPY comparison
    spy = _fetch_spy_performance()

    # Portfolio return %
    portfolio_return_pct = round(((total_value - total_cost) / total_cost) * 100, 2) if total_cost else None

    return {
        "empty": False,
        "summary": {
            "total_value": round(total_value, 2),
            "total_cost": round(total_cost, 2),
            "total_gain_loss": round(total_value - total_cost, 2),
            "total_return_pct": portfolio_return_pct,
            "position_count": len(positions),
        },
        "spy_comparison": spy,
        "top_performers": top_performers,
        "worst_performers": worst_performers,
        "sector_breakdown": sector_breakdown,
        "market_trends": market_trends,
        "trends_period": period,
    }


@router.get("")
async def get_analytics(user_id: str = Depends(get_current_user)):
    return await asyncio.to_thread(_build_analytics_sync, user_id)


@router.get("/snapshots")
async def get_portfolio_snapshots(user_id: str = Depends(get_current_user)):
    def _fetch():
        portfolio = get_or_create_portfolio(user_id)
        return get_snapshots(portfolio["id"])
    return await asyncio.to_thread(_fetch)
