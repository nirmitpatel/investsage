"""
Congressional trade ingestion via Capitol Trades public API.
Fetches STOCK Act disclosures and normalizes into smart_money_trades.
"""

import logging
import requests
from datetime import date, timedelta
from typing import List, Dict, Any

log = logging.getLogger(__name__)

CAPITOL_TRADES_URL = "https://www.capitoltrades.com/api/trades"
HEADERS = {
    "User-Agent": "InvestSage/1.0 (portfolio analytics)",
    "Accept": "application/json",
}


def _normalize_trade_type(raw: str) -> str:
    raw = (raw or "").lower()
    if "purchase" in raw or "buy" in raw:
        return "buy"
    if "sale" in raw or "sell" in raw:
        return "sell"
    return raw


def fetch_congress_trades(days_back: int = 90) -> List[Dict[str, Any]]:
    """Fetch recent congressional trades from Capitol Trades API."""
    start_date = (date.today() - timedelta(days=days_back)).isoformat()
    trades: List[Dict[str, Any]] = []
    page = 0

    while True:
        try:
            resp = requests.get(
                CAPITOL_TRADES_URL,
                params={"pageSize": 100, "page": page, "txDateStart": start_date},
                headers=HEADERS,
                timeout=15,
            )
            resp.raise_for_status()
            body = resp.json()
        except Exception as e:
            log.warning(f"Capitol Trades fetch failed (page {page}): {e}")
            break

        raw_trades = body.get("data", {}).get("trades") or body.get("trades") or []
        if not raw_trades:
            break

        for t in raw_trades:
            politician = t.get("politician") or {}
            issuer = t.get("issuer") or {}
            ticker = (issuer.get("ticker") or "").upper().strip()
            if not ticker or ticker in ("N/A", ""):
                continue

            trades.append({
                "trader_type": "congress",
                "trader_name": politician.get("name") or "Unknown",
                "trader_detail": {
                    "party": politician.get("party"),
                    "state": politician.get("state"),
                    "chamber": politician.get("chamber"),
                    "committee": politician.get("committees"),
                },
                "symbol": ticker,
                "trade_type": _normalize_trade_type(t.get("type", "")),
                "trade_date": t.get("txDate"),
                "disclosure_date": t.get("filingDate") or t.get("publishedDate"),
                "amount_range": t.get("size"),
                "shares": None,
                "price": None,
                "source": "capitol_trades",
            })

        pagination = body.get("data", {}).get("paginationData") or {}
        total = pagination.get("total") or pagination.get("totalCount") or 0
        fetched_so_far = (page + 1) * 100
        if fetched_so_far >= total or len(raw_trades) < 100:
            break
        page += 1
        if page > 9:  # cap at 1000 records per run
            break

    log.info(f"Fetched {len(trades)} congressional trades from Capitol Trades")
    return trades
