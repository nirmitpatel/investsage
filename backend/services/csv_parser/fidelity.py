"""
Fidelity CSV parser.

Fidelity positions CSV format:
  - Row 0: "Brokerage" (account type header)
  - Row 1: Account name/number
  - Row 2+: Blank or metadata rows
  - Then: column headers row
  - Then: data rows
  - Then: footer rows with totals/cash lines (no Symbol or with "Pending Activity")

Fidelity transaction history CSV format:
  - Starts directly with column headers
  - Columns: Run Date, Action, Symbol, Security Description,
             Security Type, Quantity, Price ($), Commission ($),
             Fees ($), Accrued Interest ($), Amount ($), Settlement Date
"""

import csv
import io
from datetime import datetime
from typing import List, Dict, Any


POSITIONS_COLUMNS = [
    "Account Name/Number",
    "Symbol",
    "Description",
    "Quantity",
    "Last Price",
    "Last Price Change",
    "Current Value",
    "Today's Gain/Loss Dollar",
    "Today's Gain/Loss Percent",
    "Total Gain/Loss Dollar",
    "Total Gain/Loss Percent",
    "Percent Of Account",
    "Cost Basis Total",
    "Average Cost Basis",
    "Type",
]


def _clean_number(value: str) -> float | None:
    if not value or value.strip() in ("", "--", "N/A"):
        return None
    cleaned = value.strip().replace("$", "").replace(",", "").replace("%", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_fidelity_positions(csv_text: str) -> List[Dict[str, Any]]:
    lines = csv_text.splitlines()

    # Find the header row — it contains "Symbol"
    header_index = None
    for i, line in enumerate(lines):
        if "Symbol" in line and "Description" in line:
            header_index = i
            break

    if header_index is None:
        raise ValueError("Could not find header row in Fidelity positions CSV")

    data_lines = lines[header_index:]
    reader = csv.DictReader(io.StringIO("\n".join(data_lines)))

    positions = []
    for row in reader:
        symbol = (row.get("Symbol") or "").strip()

        # Skip footer rows (no symbol, cash, or pending activity rows)
        if not symbol or symbol in ("", "Pending Activity") or symbol.startswith("XX"):
            continue
        # Skip money market / cash positions
        if len(symbol) > 6:
            continue

        positions.append({
            "symbol": symbol,
            "description": (row.get("Description") or "").strip(),
            "total_shares": _clean_number(row.get("Quantity", "")),
            "current_price": _clean_number(row.get("Last Price", "")),
            "current_value": _clean_number(row.get("Current Value", "")),
            "total_cost_basis": _clean_number(row.get("Cost Basis Total", "")),
            "total_gain_loss": _clean_number(row.get("Total Gain/Loss Dollar", "")),
            "total_gain_loss_percent": _clean_number(row.get("Total Gain/Loss Percent", "")),
            "percent_of_account": _clean_number(row.get("Percent Of Account", "")),
            "average_cost_basis": _clean_number(row.get("Average Cost Basis", "")),
        })

    return positions


def parse_fidelity_transactions(csv_text: str) -> List[Dict[str, Any]]:
    lines = csv_text.splitlines()

    # Find the header row — it contains "Run Date"
    header_index = None
    for i, line in enumerate(lines):
        if "Run Date" in line and "Action" in line:
            header_index = i
            break

    if header_index is None:
        raise ValueError("Could not find header row in Fidelity transactions CSV")

    data_lines = lines[header_index:]
    reader = csv.DictReader(io.StringIO("\n".join(data_lines)))

    transactions = []
    for row in reader:
        symbol = (row.get("Symbol") or "").strip()
        action = (row.get("Action") or "").strip()
        run_date = (row.get("Run Date") or "").strip()

        if not run_date or not action:
            continue

        # Normalize action to buy/sell/dividend
        action_lower = action.lower()
        if "bought" in action_lower or "buy" in action_lower:
            normalized_action = "BUY"
        elif "sold" in action_lower or "sell" in action_lower:
            normalized_action = "SELL"
        elif "dividend" in action_lower:
            normalized_action = "DIVIDEND"
        elif "reinvestment" in action_lower:
            normalized_action = "REINVESTMENT"
        else:
            normalized_action = action.upper()

        try:
            trade_date = datetime.strptime(run_date, "%m/%d/%Y").date()
        except ValueError:
            trade_date = None

        transactions.append({
            "trade_date": trade_date.isoformat() if trade_date else None,
            "action": normalized_action,
            "symbol": symbol,
            "description": row.get("Security Description", "").strip(),
            "quantity": _clean_number(row.get("Quantity", "")),
            "price": _clean_number(row.get("Price ($)", "")),
            "amount": _clean_number(row.get("Amount ($)", "")),
            "settlement_date": row.get("Settlement Date", "").strip(),
        })

    return transactions


def reconstruct_tax_lots(transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Build tax lots from transaction history.
    Groups BUY transactions by symbol, each buy = one lot.
    Marks lots as closed when matched with a SELL (FIFO).
    """
    # Group buys by symbol
    lots_by_symbol: Dict[str, List[Dict]] = {}

    for txn in sorted(transactions, key=lambda x: x["trade_date"] or ""):
        symbol = txn.get("symbol", "")
        if not symbol:
            continue

        if txn["action"] in ("BUY", "REINVESTMENT") and txn["quantity"] and txn["quantity"] > 0 and txn["price"]:
            lot = {
                "symbol": symbol,
                "shares": txn["quantity"],
                "purchase_date": txn["trade_date"],
                "purchase_price": txn["price"],
                "cost_basis": txn["quantity"] * txn["price"],
                "is_open": True,
            }
            lots_by_symbol.setdefault(symbol, []).append(lot)

        elif txn["action"] in ("SELL", "REINVESTMENT") and txn["quantity"] and txn["quantity"] < 0:
            # FIFO: reduce shares from oldest lot first
            remaining_to_sell = abs(txn["quantity"])
            for lot in lots_by_symbol.get(symbol, []):
                if not lot["is_open"] or remaining_to_sell <= 0:
                    continue
                if lot["shares"] <= remaining_to_sell:
                    remaining_to_sell -= lot["shares"]
                    lot["is_open"] = False
                else:
                    lot["shares"] -= remaining_to_sell
                    lot["cost_basis"] = lot["shares"] * lot["purchase_price"]
                    remaining_to_sell = 0

    # Flatten to open lots only
    open_lots = []
    for symbol_lots in lots_by_symbol.values():
        for lot in symbol_lots:
            if lot["is_open"] and lot["shares"] > 0:
                open_lots.append(lot)

    return open_lots
