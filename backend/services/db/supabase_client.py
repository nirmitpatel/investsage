"""
Supabase database operations.
Uses the service key (bypasses RLS) since auth is verified at the API layer.
"""

from supabase import create_client, Client
from config import settings
from datetime import datetime
from typing import List, Dict, Any

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


def save_tax_lots(user_id: str, position_rows: List[Dict[str, Any]], lots: List[Dict[str, Any]]) -> None:
    """Match lots to their saved positions by symbol, then insert."""
    sb = get_supabase()
    pos_by_symbol = {p["symbol"]: p["id"] for p in position_rows}
    rows = []
    for lot in lots:
        position_id = pos_by_symbol.get(lot["symbol"])
        if not position_id:
            continue
        rows.append({
            "position_id": position_id,
            "user_id": user_id,
            "symbol": lot["symbol"],
            "shares": lot["shares"],
            "purchase_date": lot["purchase_date"],
            "purchase_price": lot["purchase_price"],
            "cost_basis": lot["cost_basis"],
        })
    if rows:
        sb.table("tax_lots").insert(rows).execute()
