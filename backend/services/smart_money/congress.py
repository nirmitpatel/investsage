"""
Congressional trade ingestion via mcp-capitol-trades MCP server.
Requires: npm install -g @anguslin/mcp-capitol-trades
"""

import json
import logging
from datetime import date, timedelta
from typing import List, Dict, Any

log = logging.getLogger(__name__)


def _normalize_trade_type(raw: str) -> str:
    raw = (raw or "").lower()
    if "purchase" in raw or "buy" in raw:
        return "buy"
    if "sale" in raw or "sell" in raw:
        return "sell"
    return raw


def _parse_trade(t: Dict[str, Any]) -> Dict[str, Any] | None:
    """Normalize a raw Capitol Trades record into smart_money_trades shape."""
    politician = t.get("politician") or {}
    issuer = t.get("issuer") or {}
    ticker = (issuer.get("ticker") or t.get("ticker") or "").upper().strip()
    if not ticker or ticker == "N/A":
        return None
    return {
        "trader_type": "congress",
        "trader_name": politician.get("name") or t.get("politicianName") or "Unknown",
        "trader_detail": {
            "party": politician.get("party") or t.get("party"),
            "state": politician.get("state") or t.get("state"),
            "chamber": politician.get("chamber") or t.get("chamber"),
        },
        "symbol": ticker,
        "trade_type": _normalize_trade_type(t.get("type") or t.get("transactionType") or ""),
        "trade_date": t.get("txDate") or t.get("transactionDate"),
        "disclosure_date": t.get("filingDate") or t.get("publishedDate") or t.get("disclosureDate"),
        "amount_range": t.get("size") or t.get("amount"),
        "shares": None,
        "price": None,
        "source": "capitol_trades",
    }


async def fetch_congress_trades(days_back: int = 90) -> List[Dict[str, Any]]:
    """Fetch recent congressional trades via mcp-capitol-trades MCP server."""
    try:
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.stdio import stdio_client
    except ImportError:
        log.warning("mcp package not installed; congress trades unavailable")
        return []

    cutoff = (date.today() - timedelta(days=days_back)).isoformat()
    trades: List[Dict[str, Any]] = []

    try:
        server_params = StdioServerParameters(
            command="npx",
            args=["@anguslin/mcp-capitol-trades"],
            env=None,
        )
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()

                tools_result = await session.list_tools()
                tool_names = [t.name for t in (tools_result.tools or [])]
                log.info(f"Capitol Trades MCP tools available: {tool_names}")

                # Prefer a bulk tool; fall back to get_trades without a ticker filter
                tool = next((n for n in tool_names if "recent" in n or "all" in n), None)
                if tool is None and "get_trades" in tool_names:
                    tool = "get_trades"
                if tool is None:
                    log.warning(f"No usable tool found in mcp-capitol-trades: {tool_names}")
                    return []

                response = await session.call_tool(tool, arguments={})

                raw: List[Any] = []
                for item in response.content or []:
                    text = getattr(item, "text", None)
                    if not text:
                        continue
                    try:
                        parsed = json.loads(text)
                        if isinstance(parsed, list):
                            raw.extend(parsed)
                        elif isinstance(parsed, dict):
                            raw.extend(
                                parsed.get("trades")
                                or parsed.get("data", {}).get("trades")
                                or [parsed]
                            )
                    except (json.JSONDecodeError, AttributeError):
                        pass

                for t in raw:
                    tx_date = t.get("txDate") or t.get("transactionDate") or ""
                    if tx_date and tx_date < cutoff:
                        continue
                    record = _parse_trade(t)
                    if record:
                        trades.append(record)

    except FileNotFoundError:
        log.warning("mcp-capitol-trades binary not found; run: npm install -g @anguslin/mcp-capitol-trades")
    except Exception as e:
        log.warning(f"Congress MCP fetch failed: {e}")

    log.info(f"Fetched {len(trades)} congressional trades via MCP")
    return trades
