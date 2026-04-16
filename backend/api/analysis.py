"""
Analysis endpoints — execution plan generator.
"""

import asyncio
from datetime import date, timedelta
from fastapi import APIRouter, Depends

from services.db.supabase_client import get_or_create_portfolio, get_positions, get_tax_lots
from services.market_data.yfinance_client import fetch_prices
from services.tax_savings import find_tax_opportunities
from dependencies import get_current_user

router = APIRouter()

WASH_SALE_WINDOW_DAYS = 30


def _build_execution_plan_sync(user_id: str) -> dict:
    portfolio = get_or_create_portfolio(user_id)
    lots = get_tax_lots(user_id)

    if not lots:
        return {"steps": [], "summary": _empty_summary(), "has_lots": False}

    symbols = list({lot["symbol"] for lot in lots if lot.get("symbol")})
    current_prices = fetch_prices(symbols)

    positions = get_positions(portfolio["id"])
    sectors = {p["symbol"]: p.get("sector") for p in positions if p.get("sector")}

    federal = portfolio.get("federal_tax_bracket")
    state = portfolio.get("state_tax_bracket")

    # Tax-loss harvest opportunities, sorted by tax savings descending
    opportunities = find_tax_opportunities(lots, current_prices, sectors, federal, state)

    if not opportunities:
        return {"steps": [], "summary": _empty_summary(), "has_lots": True}

    today = date.today()
    wash_sale_end = (today + timedelta(days=WASH_SALE_WINDOW_DAYS)).isoformat()

    steps = []
    running_cash = 0.0
    step_num = 0

    # ── SELL steps (ranked by tax savings, already sorted) ─────────────────
    sell_steps = []
    for opp in opportunities:
        step_num += 1
        proceeds = opp["current_value"]
        running_cash += proceeds

        holding_deadline_note = None
        if opp.get("days_until_lt") is not None and opp["days_until_lt"] <= 30:
            deadline = (today + timedelta(days=opp["days_until_lt"])).isoformat()
            holding_deadline_note = (
                f"Harvest before {deadline} to keep the short-term rate "
                f"({opp['days_until_lt']}d remaining)"
            )

        sell_steps.append({
            "step": step_num,
            "action": "SELL",
            "symbol": opp["symbol"],
            "sector": opp["sector"],
            "shares": opp["shares"],
            "estimated_proceeds": round(proceeds, 2),
            "unrealized_loss": opp["unrealized_loss"],
            "tax_savings": opp["tax_savings_estimate"],
            "holding_period": opp["holding_period_label"],
            "is_short_term": opp["is_short_term"],
            "days_until_lt": opp.get("days_until_lt"),
            "urgency": opp.get("urgency"),
            "holding_deadline_note": holding_deadline_note,
            "wash_sale_window_end": wash_sale_end,
            "replacement_symbol": opp["replacement_suggestion"],
            "rationale": (
                f"Harvest ${opp['unrealized_loss']:,.2f} "
                f"{'short' if opp['is_short_term'] else 'long'}-term loss → "
                f"est. ${opp['tax_savings_estimate']:,.2f} tax savings"
            ),
            "running_cash_balance": round(running_cash, 2),
        })

    steps.extend(sell_steps)

    # ── BUY steps (one replacement per sell, same order) ───────────────────
    buy_steps = []
    for sell in sell_steps:
        step_num += 1
        cost = sell["estimated_proceeds"]
        running_cash -= cost

        buy_steps.append({
            "step": step_num,
            "action": "BUY",
            "symbol": sell["replacement_symbol"],
            "sector": sell["sector"],
            "estimated_cost": round(cost, 2),
            "paired_sell": sell["symbol"],
            "wash_sale_warning": (
                f"Do not repurchase {sell['symbol']} or a substantially identical security "
                f"until after {sell['wash_sale_window_end']} to avoid the wash-sale rule."
            ),
            "wash_sale_safe_after": sell["wash_sale_window_end"],
            "rationale": (
                f"Replace {sell['symbol']} ({sell['sector']}) exposure with a "
                f"wash-sale safe sector ETF"
            ),
            "running_cash_balance": round(running_cash, 2),
        })

    steps.extend(buy_steps)

    total_proceeds = sum(s["estimated_proceeds"] for s in sell_steps)
    total_savings = sum(s["tax_savings"] for s in sell_steps)
    total_cost = sum(s["estimated_cost"] for s in buy_steps)

    summary = {
        "total_proceeds": round(total_proceeds, 2),
        "total_tax_savings": round(total_savings, 2),
        "total_reinvestment_cost": round(total_cost, 2),
        "final_cash_balance": round(total_proceeds - total_cost, 2),
        "sell_count": len(sell_steps),
        "buy_count": len(buy_steps),
        "wash_sale_warnings": len(buy_steps),
        "holding_period_deadlines": sum(
            1 for s in sell_steps if s.get("holding_deadline_note")
        ),
    }

    return {"steps": steps, "summary": summary, "has_lots": True}


def _empty_summary() -> dict:
    return {
        "total_proceeds": 0,
        "total_tax_savings": 0,
        "total_reinvestment_cost": 0,
        "final_cash_balance": 0,
        "sell_count": 0,
        "buy_count": 0,
        "wash_sale_warnings": 0,
        "holding_period_deadlines": 0,
    }


@router.get("/execution-plan")
async def get_execution_plan(user_id: str = Depends(get_current_user)):
    """Ordered execution plan: tax-loss harvest sells then replacement buys."""
    result = await asyncio.to_thread(_build_execution_plan_sync, user_id)
    return result
