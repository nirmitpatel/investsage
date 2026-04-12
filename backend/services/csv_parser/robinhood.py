"""
Robinhood CSV parser.

Robinhood does not offer a dedicated positions export. Instead, users export
their full account history from Account → Statements & History → Download.

Transaction history CSV format (starts directly with column headers, no preamble):
  Columns: Activity Date, Process Date, Settle Date, Instrument, Description,
           Trans Code, Quantity, Price, Amount

Trans codes used:
  BUY  — purchase
  SELL — sale
  DIV  — cash dividend
  CDIV — qualified dividend
  DTAX — dividend tax withheld
  REC  — receive (transfer-in, stock split credit)
  SLIP — stock lending income
  OAEX — options exercise
  OEXP — options expiration
  ACH  — cash movement (no symbol)

Positions are reconstructed by aggregating BUY/SELL/REC quantities per symbol.
"""

import csv
import io
from datetime import datetime
from typing import List, Dict, Any


def _clean_number(value: str) -> float | None:
    if not value or value.strip() in ("", "--", "N/A", "n/a"):
        return None
    cleaned = value.strip().replace("$", "").replace(",", "").replace("(", "-").replace(")", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_robinhood_transactions(csv_text: str) -> List[Dict[str, Any]]:
    lines = csv_text.splitlines()

    # Find the header row — contains "Activity Date" and "Trans Code"
    header_index = None
    for i, line in enumerate(lines):
        if "Activity Date" in line and "Trans Code" in line:
            header_index = i
            break

    if header_index is None:
        raise ValueError("Could not find header row in Robinhood transactions CSV")

    data_lines = lines[header_index:]
    reader = csv.DictReader(io.StringIO("\n".join(data_lines)))

    transactions = []
    for row in reader:
        symbol = (row.get("Instrument") or "").strip()
        trans_code = (row.get("Trans Code") or "").strip().upper()
        date_str = (row.get("Activity Date") or "").strip()

        if not date_str or not trans_code:
            continue
        # Skip non-equity rows (cash movements, tax withholdings with no symbol)
        if trans_code in ("ACH", "DTAX", "SLIP") and not symbol:
            continue

        code_upper = trans_code
        if code_upper == "BUY":
            normalized_action = "BUY"
        elif code_upper == "SELL":
            normalized_action = "SELL"
        elif code_upper in ("DIV", "CDIV"):
            normalized_action = "DIVIDEND"
        elif code_upper == "REC":
            normalized_action = "BUY"  # transfer-in / split credit treated as acquisition
        elif code_upper in ("OAEX",):
            normalized_action = "BUY"  # options exercise → share acquisition
        elif code_upper in ("OEXP",):
            continue  # expired options, no share movement
        else:
            normalized_action = code_upper

        trade_date = None
        for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y"):
            try:
                trade_date = datetime.strptime(date_str, fmt).date()
                break
            except ValueError:
                continue

        transactions.append({
            "trade_date": trade_date.isoformat() if trade_date else None,
            "action": normalized_action,
            "symbol": symbol,
            "description": (row.get("Description") or "").strip(),
            "quantity": _clean_number(row.get("Quantity", "")),
            "price": _clean_number(row.get("Price", "")),
            "amount": _clean_number(row.get("Amount", "")),
            "settlement_date": (row.get("Settle Date") or "").strip(),
        })

    return transactions


def reconstruct_positions_from_transactions(
    transactions: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Derive current holdings from transaction history.
    Uses weighted-average cost basis and nets BUY/SELL quantities per symbol.
    """
    # symbol → {shares, total_cost}
    holdings: Dict[str, Dict] = {}

    for txn in sorted(transactions, key=lambda x: x.get("trade_date") or ""):
        symbol = txn.get("symbol", "")
        if not symbol:
            continue

        qty = txn.get("quantity")
        price = txn.get("price")
        action = txn.get("action", "")

        if action == "BUY" and qty and qty > 0:
            h = holdings.setdefault(symbol, {"shares": 0.0, "total_cost": 0.0, "description": ""})
            cost = (price or 0) * qty
            h["shares"] += qty
            h["total_cost"] += cost
            if txn.get("description"):
                h["description"] = txn["description"]

        elif action == "SELL" and qty:
            h = holdings.get(symbol)
            if h and h["shares"] > 0:
                sell_qty = abs(qty)
                # Reduce cost basis proportionally (average cost method)
                if h["shares"] > 0:
                    cost_per_share = h["total_cost"] / h["shares"]
                    h["total_cost"] -= cost_per_share * min(sell_qty, h["shares"])
                h["shares"] = max(0.0, h["shares"] - sell_qty)

    positions = []
    for symbol, h in holdings.items():
        if h["shares"] <= 0:
            continue
        avg_cost = h["total_cost"] / h["shares"] if h["shares"] > 0 else None
        positions.append({
            "symbol": symbol,
            "description": h.get("description", ""),
            "total_shares": round(h["shares"], 6),
            "current_price": None,       # enriched later by yfinance
            "current_value": None,
            "total_cost_basis": round(h["total_cost"], 2),
            "total_gain_loss": None,
            "total_gain_loss_percent": None,
            "percent_of_account": None,
            "average_cost_basis": round(avg_cost, 4) if avg_cost else None,
        })

    return positions
