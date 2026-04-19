"""
Schwab positions CSV parser.

Schwab positions CSV format:
  - Row 0: "Positions for account XXXX-XXXX as of HH:MM AM/PM ET, MM/DD/YYYY"
  - Row 1: blank
  - Row 2: column headers
  - Row 3+: data rows
  - Footer rows: "Cash & Cash Investments", "Account Total", blank lines

Schwab transaction history CSV format (Activity):
  - Row 0: "Transactions for account ..."
  - Row 1: blank
  - Row 2: column headers
  - Data rows
  - Footer: "Transactions Total"
"""

import csv
import io
from datetime import datetime
from typing import List, Dict, Any


def _clean_number(value: str) -> float | None:
    if not value or value.strip() in ("", "--", "N/A", "n/a"):
        return None
    cleaned = value.strip().replace("$", "").replace(",", "").replace("%", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def _detect_schwab_account_type(header_line: str) -> str:
    """Detect account type from Schwab's first header line."""
    s = header_line.upper()
    if "ROTH" in s and "401" in s:
        return "roth_401k"
    if "401" in s:
        return "401k"
    if "ROTH" in s and "IRA" in s:
        return "roth_ira"
    if "SEP" in s and "IRA" in s:
        return "sep_ira"
    if "ROLLOVER" in s and "IRA" in s:
        return "rollover_ira"
    if "IRA" in s:
        return "ira"
    if "HSA" in s or "HEALTH SAVINGS" in s:
        return "hsa"
    return "individual"


def parse_schwab_positions(csv_text: str) -> List[Dict[str, Any]]:
    lines = csv_text.splitlines()

    # Detect account type from the first line (e.g. "Positions for Roth IRA account XXXX as of ...")
    account_type = _detect_schwab_account_type(lines[0]) if lines else "individual"

    # Find the header row — contains "Symbol" and "Market Value"
    header_index = None
    for i, line in enumerate(lines):
        if "Symbol" in line and "Market Value" in line:
            header_index = i
            break

    if header_index is None:
        raise ValueError("Could not find header row in Schwab positions CSV")

    data_lines = lines[header_index:]
    reader = csv.DictReader(io.StringIO("\n".join(data_lines)))

    positions = []
    for row in reader:
        symbol = (row.get("Symbol") or "").strip().strip('"')

        # Skip footer / summary rows
        if not symbol or symbol in ("", "--", "Account Total", "Cash & Cash Investments"):
            continue
        if "Total" in symbol or "Cash" in symbol:
            continue
        # Skip money market / long symbols
        if len(symbol) > 6:
            continue

        # Schwab stores price in "Price" column
        price = _clean_number(row.get("Price", ""))
        market_value = _clean_number(row.get("Market Value", ""))
        cost_basis = _clean_number(row.get("Cost Basis", ""))
        gain_loss = _clean_number(row.get("Gain/Loss $", ""))
        gain_loss_pct = _clean_number(row.get("Gain/Loss %", ""))
        pct_of_account = _clean_number(row.get("% Of Account", ""))
        quantity = _clean_number(row.get("Quantity", ""))

        # Compute average cost basis if possible
        avg_cost = None
        if cost_basis is not None and quantity and quantity != 0:
            avg_cost = cost_basis / quantity

        positions.append({
            "symbol": symbol,
            "description": (row.get("Description") or "").strip().strip('"'),
            "total_shares": quantity,
            "current_price": price,
            "current_value": market_value,
            "total_cost_basis": cost_basis,
            "total_gain_loss": gain_loss,
            "total_gain_loss_percent": gain_loss_pct,
            "percent_of_account": pct_of_account,
            "average_cost_basis": avg_cost,
            "account_type": account_type,
        })

    return positions


def parse_schwab_transactions(csv_text: str) -> List[Dict[str, Any]]:
    lines = csv_text.splitlines()

    # Find the header row — contains "Date" and "Action"
    header_index = None
    for i, line in enumerate(lines):
        if "Date" in line and "Action" in line and "Symbol" in line:
            header_index = i
            break

    if header_index is None:
        raise ValueError("Could not find header row in Schwab transactions CSV")

    data_lines = lines[header_index:]
    reader = csv.DictReader(io.StringIO("\n".join(data_lines)))

    transactions = []
    for row in reader:
        symbol = (row.get("Symbol") or "").strip().strip('"')
        action = (row.get("Action") or "").strip()
        date_str = (row.get("Date") or "").strip().strip('"')

        if not date_str or not action:
            continue
        # Skip footer totals row
        if "Total" in action or "Total" in date_str:
            continue

        action_lower = action.lower()
        if "buy" in action_lower:
            normalized_action = "BUY"
        elif "sell" in action_lower:
            normalized_action = "SELL"
        elif "dividend" in action_lower:
            normalized_action = "DIVIDEND"
        elif "reinvest" in action_lower:
            normalized_action = "REINVESTMENT"
        else:
            normalized_action = action.upper()

        trade_date = None
        for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y"):
            try:
                trade_date = datetime.strptime(date_str, fmt).date()
                break
            except ValueError:
                continue

        quantity_raw = row.get("Quantity", "")
        price_raw = row.get("Price", "")
        amount_raw = row.get("Amount", "")

        transactions.append({
            "trade_date": trade_date.isoformat() if trade_date else None,
            "action": normalized_action,
            "symbol": symbol,
            "description": (row.get("Description") or "").strip().strip('"'),
            "quantity": _clean_number(quantity_raw),
            "price": _clean_number(price_raw),
            "amount": _clean_number(amount_raw),
            "settlement_date": (row.get("Settlement Date") or "").strip(),
        })

    return transactions
