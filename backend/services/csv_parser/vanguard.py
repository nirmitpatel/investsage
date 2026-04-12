"""
Vanguard combined CSV parser (OfxDownload.csv format).

The file exported from Vanguard contains TWO sections separated by blank lines:

  Section 1 — Positions:
    Account Number,Investment Name,Symbol,Shares,Share Price,Total Value,
    <data rows>

  Section 2 — Transactions:
    Account Number,Trade Date,Settlement Date,Transaction Type,
    Transaction Description,Investment Name,Symbol,Shares,Share Price,
    Principal Amount,Commissions and Fees,Net Amount,Accrued Interest,Account Type,
    <data rows>

Positions section has no cost basis column, so we compute it from the
transactions section when available.

Transaction Types:
  Buy              → BUY
  Sell             → SELL
  Reinvestment     → BUY  (dividend reinvestment — acquires shares)
  Dividend         → DIVIDEND
  Funds Received   → skipped (cash transfer, no symbol/shares)
"""

import csv
import io
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple


def _clean_number(value: str) -> float | None:
    if not value or value.strip() in ("", "--", "N/A", "n/a"):
        return None
    cleaned = value.strip().replace("$", "").replace(",", "").replace("%", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def _find_header_index(lines: List[str], required: List[str]) -> int | None:
    """Return index of first line containing ALL required substrings."""
    for i, line in enumerate(lines):
        if all(col in line for col in required):
            return i
    return None


def _parse_transactions_section(lines: List[str]) -> List[Dict[str, Any]]:
    """Parse the transactions section from a list of lines."""
    header_index = _find_header_index(lines, ["Trade Date", "Transaction Type"])
    if header_index is None:
        return []

    reader = csv.DictReader(io.StringIO("\n".join(lines[header_index:])))
    transactions = []

    for row in reader:
        symbol = (row.get("Symbol") or "").strip()
        txn_type = (row.get("Transaction Type") or "").strip()
        date_str = (row.get("Trade Date") or "").strip()

        if not date_str or not txn_type:
            continue

        t = txn_type.lower()
        if "buy" in t or "purchase" in t:
            action = "BUY"
        elif "sell" in t or "redemption" in t:
            action = "SELL"
        elif "reinvest" in t:
            # Dividend reinvestment — Vanguard buys shares with dividend proceeds
            action = "BUY"
        elif "dividend" in t:
            action = "DIVIDEND"
        else:
            action = txn_type.upper()

        # Skip cash-only rows (Funds Received, etc.) with no symbol
        if not symbol and action not in ("DIVIDEND",):
            continue

        trade_date = None
        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"):
            try:
                trade_date = datetime.strptime(date_str, fmt).date()
                break
            except ValueError:
                continue

        shares = _clean_number(row.get("Shares", ""))
        price = _clean_number(row.get("Share Price", ""))
        # Use abs(Principal Amount) as cost when shares/price are zero
        principal = _clean_number(row.get("Principal Amount", ""))

        transactions.append({
            "trade_date": trade_date.isoformat() if trade_date else None,
            "action": action,
            "symbol": symbol,
            "description": (row.get("Investment Name") or row.get("Transaction Description") or "").strip(),
            "quantity": shares,
            "price": price if price and price > 0 else None,
            "amount": abs(principal) if principal else None,
            "settlement_date": (row.get("Settlement Date") or "").strip(),
        })

    return transactions


def _cost_basis_map(
    transactions: List[Dict[str, Any]],
) -> Dict[str, Dict[str, float]]:
    """
    Compute cost basis per symbol from BUY transactions.
    Returns {symbol: {total_cost, shares_seen}}.
    shares_seen lets callers detect truncated history (shares_seen << actual shares).
    """
    holdings: Dict[str, Dict] = {}

    for txn in sorted(transactions, key=lambda x: x.get("trade_date") or ""):
        symbol = txn.get("symbol", "")
        if not symbol:
            continue
        qty = txn.get("quantity") or 0
        price = txn.get("price") or 0
        action = txn.get("action", "")

        if action == "BUY" and qty > 0 and price > 0:
            h = holdings.setdefault(symbol, {"shares": 0.0, "total_cost": 0.0})
            h["shares"] += qty
            h["total_cost"] += qty * price

        elif action == "SELL" and qty:
            h = holdings.get(symbol)
            if h and h["shares"] > 0:
                sell_qty = abs(qty)
                cost_per_share = h["total_cost"] / h["shares"]
                h["total_cost"] -= cost_per_share * min(sell_qty, h["shares"])
                h["shares"] = max(0.0, h["shares"] - sell_qty)

    return {sym: h for sym, h in holdings.items() if h["total_cost"] > 0}


def parse_vanguard_positions(csv_text: str) -> List[Dict[str, Any]]:
    lines = csv_text.splitlines()

    # Find positions header: has Symbol + Shares + Total Value but NOT Trade Date
    pos_header = None
    for i, line in enumerate(lines):
        if "Symbol" in line and "Shares" in line and "Total Value" in line and "Trade Date" not in line:
            pos_header = i
            break

    if pos_header is None:
        raise ValueError("Could not find positions header in Vanguard CSV")

    # Collect positions rows until a blank line or next section header
    pos_lines = [lines[pos_header]]
    for line in lines[pos_header + 1:]:
        if line.strip() == "" or "Trade Date" in line:
            break
        pos_lines.append(line)

    reader = csv.DictReader(io.StringIO("\n".join(pos_lines)))

    # Try to compute cost basis from the transactions section
    transactions = _parse_transactions_section(lines)
    cost_map = _cost_basis_map(transactions) if transactions else {}

    positions = []
    for row in reader:
        symbol = (row.get("Symbol") or "").strip()
        if not symbol or symbol.isdigit() or len(symbol) > 6:
            continue

        shares = _clean_number(row.get("Shares", ""))
        share_price = _clean_number(row.get("Share Price", ""))
        total_value = _clean_number(row.get("Total Value", ""))

        entry = cost_map.get(symbol)
        gain_loss = None
        gain_loss_pct = None
        avg_cost = None
        total_cost = None

        if entry:
            shares_seen = entry["shares"]
            raw_cost = entry["total_cost"]
            # If transaction history covers less than 90% of current shares,
            # the export window is truncated — cost basis would be understated.
            # Leave gain/loss as None rather than show misleading numbers.
            history_complete = shares and shares_seen >= shares * 0.90
            if history_complete:
                total_cost = raw_cost
                if total_value is not None:
                    gain_loss = round(total_value - total_cost, 2)
                    if total_cost != 0:
                        gain_loss_pct = round((gain_loss / total_cost) * 100, 2)
                avg_cost = round(total_cost / shares, 4)

        description = (row.get("Investment Name") or row.get("Fund Name") or "").strip()

        positions.append({
            "symbol": symbol,
            "description": description,
            "total_shares": shares,
            "current_price": share_price,
            "current_value": total_value,
            "total_cost_basis": round(total_cost, 2) if total_cost is not None else None,
            "total_gain_loss": gain_loss,
            "total_gain_loss_percent": gain_loss_pct,
            "percent_of_account": None,
            "average_cost_basis": avg_cost,
        })

    return positions


def parse_vanguard_transactions(csv_text: str) -> List[Dict[str, Any]]:
    """Parse the transactions section from a Vanguard CSV (combined or transactions-only)."""
    lines = csv_text.splitlines()
    transactions = _parse_transactions_section(lines)
    if not transactions:
        raise ValueError("Could not find transactions header in Vanguard CSV")
    return transactions
