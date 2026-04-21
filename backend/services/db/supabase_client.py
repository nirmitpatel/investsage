"""
Supabase database operations.
Uses the service key (bypasses RLS) since auth is verified at the API layer.
"""

from supabase import create_client, Client
from config import settings
from datetime import datetime
from typing import List, Dict, Any, Optional

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    return _client


def get_or_create_portfolio(user_id: str) -> Dict[str, Any]:
    sb = get_supabase()
    result = sb.table("portfolios").select("*").eq("user_id", user_id).limit(1).execute()
    if result.data:
        return result.data[0]
    created = sb.table("portfolios").insert({
        "user_id": user_id,
        "name": "My Portfolio",
        "brokerage": "fidelity",
    }).execute()
    return created.data[0]


def update_portfolio_style(portfolio_id: str, investment_style: str) -> None:
    get_supabase().table("portfolios").update(
        {"investment_style": investment_style}
    ).eq("id", portfolio_id).execute()


def update_portfolio_tax_bracket(
    portfolio_id: str,
    federal_tax_bracket: Optional[float],
    state_tax_bracket: Optional[float],
) -> None:
    update: Dict[str, Any] = {}
    if federal_tax_bracket is not None:
        update["federal_tax_bracket"] = federal_tax_bracket
    if state_tax_bracket is not None:
        update["state_tax_bracket"] = state_tax_bracket
    if update:
        get_supabase().table("portfolios").update(update).eq("id", portfolio_id).execute()


def upsert_positions(portfolio_id: str, user_id: str, positions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    sb = get_supabase()
    sb.table("positions").delete().eq("portfolio_id", portfolio_id).execute()
    rows = [
        {
            "portfolio_id": portfolio_id,
            "user_id": user_id,
            "symbol": p["symbol"],
            "description": p.get("description"),
            "total_shares": p.get("total_shares"),
            "current_price": p.get("current_price"),
            "current_value": p.get("current_value"),
            "total_cost_basis": p.get("total_cost_basis"),
            "total_gain_loss": p.get("total_gain_loss"),
            "total_gain_loss_percent": p.get("total_gain_loss_percent"),
            "percent_of_account": p.get("percent_of_account"),
            "sector": p.get("sector"),
            "previous_close": p.get("previous_close"),
            "account_type": p.get("account_type") or "individual",
        }
        for p in positions
    ]
    if not rows:
        return []
    result = sb.table("positions").insert(rows).execute()
    return result.data or []


def get_positions(portfolio_id: str) -> List[Dict[str, Any]]:
    sb = get_supabase()
    result = sb.table("positions").select("*").eq("portfolio_id", portfolio_id).execute()
    return result.data or []


def get_tax_lots(user_id: str) -> List[Dict[str, Any]]:
    sb = get_supabase()
    result = sb.table("tax_lots").select("*").eq("user_id", user_id).execute()
    return result.data or []


def replace_tax_lots(user_id: str, lots: List[Dict[str, Any]]) -> None:
    """Delete existing lots for user and insert fresh set."""
    sb = get_supabase()
    sb.table("tax_lots").delete().eq("user_id", user_id).execute()
    rows = [
        {
            "user_id": user_id,
            "symbol": lot["symbol"],
            "shares": lot["shares"],
            "purchase_date": lot["purchase_date"],
            "purchase_price": lot["purchase_price"],
            "cost_basis": lot["cost_basis"],
        }
        for lot in lots
        if lot.get("symbol") and lot.get("shares", 0) > 0
    ]
    if rows:
        sb.table("tax_lots").insert(rows).execute()


def save_tax_lots(user_id: str, position_rows: List[Dict[str, Any]], lots: List[Dict[str, Any]]) -> None:
    """Legacy: Match lots to their saved positions by symbol, then insert."""
    replace_tax_lots(user_id, lots)


def upsert_snapshot(portfolio_id: str, user_id: str, total_value: float, total_cost: float | None) -> None:
    """Insert or update today's portfolio value snapshot (one row per day)."""
    from datetime import date
    sb = get_supabase()
    sb.table("portfolio_snapshots").upsert({
        "portfolio_id": portfolio_id,
        "user_id": user_id,
        "snapshot_date": date.today().isoformat(),
        "total_value": round(total_value, 4),
        "total_cost": round(total_cost, 4) if total_cost is not None else None,
    }, on_conflict="portfolio_id,snapshot_date").execute()


def get_snapshots(portfolio_id: str, limit: int = 365) -> List[Dict[str, Any]]:
    """Return up to `limit` daily snapshots ordered oldest-first."""
    sb = get_supabase()
    result = (
        sb.table("portfolio_snapshots")
        .select("snapshot_date,total_value,total_cost")
        .eq("portfolio_id", portfolio_id)
        .order("snapshot_date", desc=False)
        .limit(limit)
        .execute()
    )
    return result.data or []


def create_share_token(portfolio_id: str, user_id: str) -> str:
    import secrets
    token = secrets.token_hex(16)  # 32-char hex string
    get_supabase().table("share_tokens").insert({
        "token": token,
        "portfolio_id": portfolio_id,
        "user_id": user_id,
    }).execute()
    return token


def get_share_token_row(token: str) -> Dict[str, Any] | None:
    result = get_supabase().table("share_tokens").select("portfolio_id,user_id").eq("token", token).limit(1).execute()
    return result.data[0] if result.data else None


def delete_share_token(token: str, user_id: str) -> bool:
    result = get_supabase().table("share_tokens").delete().eq("token", token).eq("user_id", user_id).execute()
    return bool(result.data)


def get_user_share_tokens(portfolio_id: str) -> List[Dict[str, Any]]:
    result = get_supabase().table("share_tokens").select("token,created_at").eq("portfolio_id", portfolio_id).order("created_at", desc=True).execute()
    return result.data or []


def save_recommendation_snapshot(
    user_id: str,
    symbol: str,
    result: Dict[str, Any],
    position: Dict[str, Any],
) -> Optional[str]:
    """Persist a recommendation to recommendation_snapshots. Returns the new row id."""
    from datetime import date as _date
    factor_scores = result.get("factor_scores") or {}
    combined_score: Optional[float] = None
    if factor_scores:
        vals = [v for v in factor_scores.values() if isinstance(v, (int, float))]
        if vals:
            combined_score = round(sum(vals) / len(vals), 2)
    try:
        row = get_supabase().table("recommendation_snapshots").insert({
            "user_id": user_id,
            "symbol": symbol,
            "recommendation_type": result.get("recommendation"),
            "confidence": result.get("confidence"),
            "reasoning": result.get("reasoning"),
            "snapshot_date": _date.today().isoformat(),
            "price_at_recommendation": position.get("current_price"),
            "shares_at_recommendation": position.get("total_shares"),
            "value_at_recommendation": position.get("current_value"),
            "factors_at_time": factor_scores or None,
            "combined_score": combined_score,
            "user_action": "pending",
        }).execute()
        return row.data[0]["id"] if row.data else None
    except Exception:
        return None


def update_recommendation_action(snapshot_id: str, user_id: str, action: str) -> bool:
    """Mark a recommendation as 'followed' or 'ignored'."""
    if action not in ("followed", "ignored", "pending"):
        return False
    result = get_supabase().table("recommendation_snapshots").update(
        {"user_action": action}
    ).eq("id", snapshot_id).eq("user_id", user_id).execute()
    return bool(result.data)


def get_recommendation_snapshots(user_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    """Return user's recommendation history, newest first."""
    result = (
        get_supabase()
        .table("recommendation_snapshots")
        .select("*")
        .eq("user_id", user_id)
        .order("snapshot_date", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


def track_recommendation_outcomes(
    user_id: str, positions: List[Dict[str, Any]]
) -> None:
    """Upsert recommendation_outcomes for all due checkpoints."""
    import yfinance as yf
    from datetime import date as _date, timedelta

    snapshots = get_recommendation_snapshots(user_id, limit=200)
    if not snapshots:
        return

    today = _date.today()
    CHECKPOINTS = [30, 60, 90, 180, 365]

    # Fetch existing outcomes to avoid redundant work
    existing = (
        get_supabase()
        .table("recommendation_outcomes")
        .select("recommendation_id,checkpoint_days")
        .eq("user_id", user_id)
        .execute()
    )
    done: set = {
        (r["recommendation_id"], r["checkpoint_days"])
        for r in (existing.data or [])
    }

    # Current position value by symbol (for actual_value computation)
    pos_value: Dict[str, float] = {
        p["symbol"]: (p.get("current_value") or 0) for p in positions
    }

    # Gather symbols needing price fetch
    due_rows = []
    for snap in snapshots:
        snap_date = _date.fromisoformat(str(snap["snapshot_date"])[:10])
        shares = snap.get("shares_at_recommendation")
        if not shares:
            continue
        for cp in CHECKPOINTS:
            if (snap["id"], cp) in done:
                continue
            if (today - snap_date).days >= cp:
                due_rows.append((snap, cp))

    if not due_rows:
        return

    # Batch-fetch current prices for all due symbols
    symbols_needed = list({snap["symbol"] for snap, _ in due_rows})
    prices: Dict[str, Optional[float]] = {}
    try:
        tickers = yf.download(
            symbols_needed, period="1d", auto_adjust=True, progress=False
        )
        close = tickers["Close"] if "Close" in tickers else tickers
        for sym in symbols_needed:
            try:
                val = close[sym].dropna().iloc[-1] if sym in close else None
                prices[sym] = float(val) if val is not None else None
            except Exception:
                prices[sym] = None
    except Exception:
        for sym in symbols_needed:
            prices[sym] = None

    # Build outcome rows
    rows = []
    for snap, cp in due_rows:
        sym = snap["symbol"]
        current_price = prices.get(sym)
        if current_price is None:
            continue
        shares = float(snap.get("shares_at_recommendation") or 0)
        shadow_value = round(shares * current_price, 4)
        # actual_value: 0 if followed a SELL, else current position value
        if snap.get("user_action") == "followed" and snap.get("recommendation_type") == "SELL":
            actual_value = 0.0
        else:
            actual_value = round(pos_value.get(sym) or 0, 4)
        rows.append({
            "recommendation_id": snap["id"],
            "user_id": user_id,
            "checkpoint_days": cp,
            "actual_value": actual_value,
            "shadow_value": shadow_value,
            "price_at_checkpoint": round(current_price, 4),
        })

    if rows:
        get_supabase().table("recommendation_outcomes").upsert(
            rows, on_conflict="recommendation_id,checkpoint_days"
        ).execute()


def get_value_stats(user_id: str, positions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Aggregate recommendation history into value dashboard stats."""
    snapshots = get_recommendation_snapshots(user_id, limit=200)
    outcomes_res = (
        get_supabase()
        .table("recommendation_outcomes")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    outcomes_by_rec: Dict[str, List[Dict[str, Any]]] = {}
    for o in (outcomes_res.data or []):
        outcomes_by_rec.setdefault(o["recommendation_id"], []).append(o)

    pos_value: Dict[str, float] = {
        p["symbol"]: (p.get("current_value") or 0) for p in positions
    }
    pos_price: Dict[str, Optional[float]] = {
        p["symbol"]: p.get("current_price") for p in positions
    }

    followed, ignored, pending = 0, 0, 0
    total_value_impact = 0.0  # sum of (value_at_rec - shadow_now) for followed SELLs
    summary_rows = []

    for snap in snapshots:
        action = snap.get("user_action", "pending")
        rec_type = snap.get("recommendation_type", "")
        if action == "followed":
            followed += 1
        elif action == "ignored":
            ignored += 1
        else:
            pending += 1

        # Compute value impact from most recent outcome
        snap_outcomes = sorted(
            outcomes_by_rec.get(snap["id"], []),
            key=lambda x: x["checkpoint_days"],
            reverse=True,
        )
        value_impact: Optional[float] = None
        checkpoint_days: Optional[int] = None
        if snap_outcomes:
            o = snap_outcomes[0]
            shadow = o.get("shadow_value") or 0
            actual = o.get("actual_value") or 0
            checkpoint_days = o.get("checkpoint_days")
            if action == "followed" and rec_type == "SELL":
                # value_protected = what position is worth now vs what you sold for
                value_impact = round((snap.get("value_at_recommendation") or 0) - shadow, 2)
                total_value_impact += value_impact
            else:
                # gain/loss vs value at recommendation date
                value_impact = round(actual - (snap.get("value_at_recommendation") or 0), 2)

        # Current price from live positions or checkpoint
        current_price = pos_price.get(snap["symbol"])
        if current_price is None and snap_outcomes:
            current_price = snap_outcomes[0].get("price_at_checkpoint")

        summary_rows.append({
            "id": snap["id"],
            "symbol": snap["symbol"],
            "recommendation_type": rec_type,
            "confidence": snap.get("confidence"),
            "user_action": action,
            "snapshot_date": snap.get("snapshot_date"),
            "price_at_recommendation": snap.get("price_at_recommendation"),
            "current_price": current_price,
            "value_at_recommendation": snap.get("value_at_recommendation"),
            "value_impact": value_impact,
            "checkpoint_days": checkpoint_days,
        })

    return {
        "total_recommendations": len(snapshots),
        "followed_count": followed,
        "ignored_count": ignored,
        "pending_count": pending,
        "total_value_impact": round(total_value_impact, 2),
        "recommendations": summary_rows,
    }


def get_smart_money_trades(
    trader_type: Optional[str] = None,
    limit: int = 100,
    days_back: int = 90,
) -> List[Dict[str, Any]]:
    from datetime import date, timedelta
    sb = get_supabase()
    cutoff = (date.today() - timedelta(days=days_back)).isoformat()
    q = sb.table("smart_money_trades").select("*").gte("disclosure_date", cutoff).order("disclosure_date", desc=True).limit(limit)
    if trader_type:
        q = q.eq("trader_type", trader_type)
    return q.execute().data or []


def get_smart_money_overlap(symbols: List[str], days_back: int = 90) -> List[Dict[str, Any]]:
    from datetime import date, timedelta
    if not symbols:
        return []
    sb = get_supabase()
    cutoff = (date.today() - timedelta(days=days_back)).isoformat()
    result = (
        sb.table("smart_money_trades")
        .select("*")
        .in_("symbol", symbols)
        .gte("disclosure_date", cutoff)
        .order("disclosure_date", desc=True)
        .limit(200)
        .execute()
    )
    return result.data or []


def upsert_smart_money_trades(trades: List[Dict[str, Any]], trader_type: str) -> int:
    """Delete recent records for trader_type then bulk-insert fresh batch. Returns count inserted."""
    from datetime import date, timedelta
    if not trades:
        return 0
    sb = get_supabase()
    cutoff = (date.today() - timedelta(days=95)).isoformat()
    sb.table("smart_money_trades").delete().eq("trader_type", trader_type).gte("disclosure_date", cutoff).execute()
    sb.table("smart_money_trades").insert(trades).execute()
    return len(trades)


def get_trade_by_id(trade_id: str) -> Optional[Dict[str, Any]]:
    result = get_supabase().table("smart_money_trades").select("*").eq("id", trade_id).limit(1).execute()
    return result.data[0] if result.data else None


def get_smart_money_follows(user_id: str) -> List[Dict[str, Any]]:
    result = (
        get_supabase()
        .table("smart_money_follows")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def follow_trader(user_id: str, trader_name: str, trader_type: str) -> bool:
    try:
        get_supabase().table("smart_money_follows").upsert(
            {"user_id": user_id, "trader_name": trader_name, "trader_type": trader_type},
            on_conflict="user_id,trader_name",
        ).execute()
        return True
    except Exception:
        return False


def unfollow_trader(user_id: str, trader_name: str) -> bool:
    result = (
        get_supabase()
        .table("smart_money_follows")
        .delete()
        .eq("user_id", user_id)
        .eq("trader_name", trader_name)
        .execute()
    )
    return bool(result.data)


def patch_positions_cost_basis(portfolio_id: str, updates: List[Dict[str, Any]]) -> None:
    """Update cost basis and gain/loss fields for existing positions by symbol."""
    sb = get_supabase()
    for update in updates:
        sb.table("positions").update({
            "total_cost_basis": update["total_cost_basis"],
            "total_gain_loss": update["total_gain_loss"],
            "total_gain_loss_percent": update["total_gain_loss_percent"],
        }).eq("portfolio_id", portfolio_id).eq("symbol", update["symbol"]).execute()
