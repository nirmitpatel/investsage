"""
Vanguard positions CSV parser.

Vanguard holdings CSV format (from "Portfolio Watch" or holdings export):
  - Header rows with account metadata
  - Column headers row containing "Symbol" and "Shares"
  - Data rows
  - Footer notes (lines starting with "*" or blank)

Vanguard transaction history CSV format:
  - Column headers: Account Number, Trade Date, Settlement Date, Transaction Type,
                    Transaction Description, Investment Name, Symbol, Shares,
                    Share Price, Principal Amount, Commission, Net Amount,
                    Accrued Interest, Account Type
"""

import csv
import io
from datetime import datetime
from typing import List, Dict, Any


def _clean_number(value: str) -> float | None:
    if not value or value.strip() in ("", "--", "N/A", "n/a", "$0.00"):
        return None
    cleaned = value.strip().replace("$", "").replace(",", "").replace("%", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_vanguard_positions(csv_text: str) -> List[Dict[str, Any]]:
    lines = csv_text.splitlines()

    # Find the header row — contains "Symbol" and "Shares" (or "Share Price")
    header_index = None
    for i, line in enumerate(lines):
        if "Symbol" in line and ("Shares" in line or "Share Price" in line):
            header_index = i
            break

    if header_index is None:
        raise ValueError("Could not find header row in Vanguard positions CSV")

    data_lines = lines[header_index:]
    reader = csv.DictReader(io.StringIO("\n".join(data_lines)))

    positions = []
    for row in reader:
        symbol = (row.get("Symbol") or "").strip().strip('"')

        # Skip blank, footer, or note rows
        if not symbol or symbol.startswith("*") or symbol in ("", "--"):
            continue
        # Skip money market / long symbols
        if len(symbol) > 6:
            continue
        # Skip rows where symbol looks like a note or account number
        if symbol.isdigit():
            continue

        shares = _clean_number(row.get("Shares", ""))
        share_price = _clean_number(row.get("Share Price", ""))
        total_value = _clean_number(row.get("Total Value", ""))

        # Some Vanguard exports use "Current Value" instead of "Total Value"
        if total_value is None:
            total_value = _clean_number(row.get("Current Value", ""))

        # Vanguard positions export may not include cost basis
        cost_basis = _clean_number(row.get("Cost Basis", ""))
        pct_of_account = _clean_number(row.get("% of Account", "") or row.get("% Of Account", ""))

        # Compute gain/loss if cost basis available
        gain_loss = None
        gain_loss_pct = None
        if total_value is not None and cost_basis is not None:
            gain_loss = total_value - cost_basis
            if cost_basis != 0:
                gain_loss_pct = (gain_loss / cost_basis) * 100

        avg_cost = None
        if cost_basis is not None and shares and shares != 0:
            avg_cost = cost_basis / shares

        description = (
            row.get("Investment Name")
            or row.get("Fund Name")
            or row.get("Description")
            or ""
        ).strip().strip('"')

        positions.append({
            "symbol": symbol,
            "description": description,
            "total_shares": shares,
            "current_price": share_price,
            "current_value": total_value,
            "total_cost_basis": cost_basis,
            "total_gain_loss": gain_loss,
            "total_gain_loss_percent": gain_loss_pct,
            "percent_of_account": pct_of_account,
            "average_cost_basis": avg_cost,
        })

    return positions


def parse_vanguard_transactions(csv_text: str) -> List[Dict[str, Any]]:
    lines = csv_text.splitlines()

    # Find the header row — contains "Trade Date" and "Transaction Type"
    header_index = None
    for i, line in enumerate(lines):
        if "Trade Date" in line and "Transaction Type" in line:
            header_index = i
            break

    if header_index is None:
        raise ValueError("Could not find header row in Vanguard transactions CSV")

    data_lines = lines[header_index:]
    reader = csv.DictReader(io.StringIO("\n".join(data_lines)))

    transactions = []
    for row in reader:
        symbol = (row.get("Symbol") or "").strip().strip('"')
        txn_type = (row.get("Transaction Type") or "").strip()
        date_str = (row.get("Trade Date") or "").strip().strip('"')

        if not date_str or not txn_type:
            continue

        txn_lower = txn_type.lower()
        if "buy" in txn_lower or "purchase" in txn_lower:
            normalized_action = "BUY"
        elif "sell" in txn_lower or "redemption" in txn_lower:
            normalized_action = "SELL"
        elif "dividend" in txn_lower:
            normalized_action = "DIVIDEND"
        elif "reinvest" in txn_lower:
            normalized_action = "REINVESTMENT"
        else:
            normalized_action = txn_type.upper()

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
            "description": (row.get("Investment Name") or row.get("Transaction Description") or "").strip(),
            "quantity": _clean_number(row.get("Shares", "")),
            "price": _clean_number(row.get("Share Price", "")),
            "amount": _clean_number(row.get("Net Amount") or row.get("Principal Amount", "")),
            "settlement_date": (row.get("Settlement Date") or "").strip(),
        })

    return transactions
