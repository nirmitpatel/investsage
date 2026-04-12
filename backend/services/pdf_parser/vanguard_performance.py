"""
Vanguard Performance Report PDF parser.

Parses the "Performance" page exported from Vanguard's website
(the monthly gain/loss table that goes back to account inception).

The PDF contains:
  - A date range: "Date Range: MM/DD/YYYY - MM/DD/YYYY"
  - Monthly rows: Month | Beginning balance | Deposits & Withdrawals |
                  Market Gain/Loss | Income returns | Personal Investment Returns |
                  Cumulative returns | Ending balance
  - A "Total" row with aggregate values across all months

We extract from the Total row:
  - Deposits & Withdrawals  → total cost basis (account started at $0)
  - Market Gain/Loss        → total unrealised market gain
  - Income returns          → total dividends/interest received
  - Personal Investment Returns → total dollar return (market + income)

Cost basis is then distributed across existing DB positions:
  - Money market positions (VMFXX-style, NAV ≈ $1): cost_basis = current_value
  - All other positions: proportional share of remaining cost by current value
"""

import io
import re
from typing import Any, Dict, List


# ---------------------------------------------------------------------------
# PDF text extraction
# ---------------------------------------------------------------------------

def _extract_text(content: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        raise RuntimeError("pypdf is required — install it with: pip install pypdf")

    try:
        reader = PdfReader(io.BytesIO(content))
    except Exception as e:
        raise ValueError(f"Could not read PDF: {e}")

    pages = []
    for page in reader.pages:
        text = page.extract_text() or ""
        pages.append(text)
    return "\n".join(pages)


def _parse_dollar(s: str) -> float:
    """Convert '$6,806.00' or '-$511.63' to float."""
    cleaned = s.strip().replace("$", "").replace(",", "")
    return float(cleaned)


def _extract_dollar_amounts(chunk: str) -> List[float]:
    """Extract all dollar amounts from a text chunk, preserving sign."""
    # Match: optional sign, optional $, digits with optional commas/decimals
    matches = re.findall(r'([+\-]?\$[\d,]+\.?\d*)', chunk)
    result = []
    for m in matches:
        try:
            result.append(_parse_dollar(m))
        except ValueError:
            pass
    return result


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_vanguard_performance_pdf(content: bytes) -> Dict[str, Any]:
    """
    Parse a Vanguard Performance Report PDF.

    Returns a dict with:
      total_deposits          – sum of all Deposits & Withdrawals (= cost basis)
      total_market_gain       – cumulative Market Gain/Loss
      total_income            – cumulative Income returns (dividends)
      total_investment_return – cumulative Personal Investment Returns
      date_range              – "MM/DD/YYYY - MM/DD/YYYY" or None
    """
    text = _extract_text(content)

    # --- Date range ----------------------------------------------------------
    date_range = None
    dr = re.search(
        r'Date Range:\s*(\d{1,2}/\d{1,2}/\d{4})\s*[-\u2013]\s*(\d{1,2}/\d{1,2}/\d{4})',
        text,
    )
    if dr:
        date_range = f"{dr.group(1)} - {dr.group(2)}"

    # --- Total row -----------------------------------------------------------
    # The Total row is the last row of the table, summarising all months.
    # Columns (in order): Deposits & Withdrawals | Market Gain/Loss |
    #                     Income returns | Personal Investment Returns
    #
    # pypdf may collapse the row onto one line or spread it across two.
    # Strategy: find "Total" in the text and grab the next 400 chars.

    total_idx = text.rfind("Total")          # rfind → last occurrence (the summary row)
    if total_idx == -1:
        raise ValueError(
            "Could not find 'Total' row — is this a Vanguard Performance Report?"
        )

    chunk = text[total_idx: total_idx + 400]
    amounts = _extract_dollar_amounts(chunk)

    if len(amounts) < 2:
        raise ValueError(
            "Could not parse dollar totals from the PDF — unexpected format. "
            "Make sure you exported the full Performance Report from Vanguard."
        )

    # The Total row always lists: Deposits | Market Gain | Income | Investment Return
    # Even if some columns are missing, deposits is first and return is last.
    total_deposits = amounts[0]
    total_market_gain = amounts[1] if len(amounts) >= 2 else None
    total_income = amounts[2] if len(amounts) >= 3 else None
    total_investment_return = amounts[3] if len(amounts) >= 4 else amounts[-1]

    if total_deposits <= 0:
        raise ValueError(
            "Total deposits is zero or negative — check that this PDF covers the full "
            "account history starting from the first deposit."
        )

    return {
        "total_deposits": total_deposits,
        "total_market_gain": total_market_gain,
        "total_income": total_income,
        "total_investment_return": total_investment_return,
        "date_range": date_range,
    }


# ---------------------------------------------------------------------------
# Cost basis distribution
# ---------------------------------------------------------------------------

# Known money market symbols (stable $1 NAV — cost basis ≈ current value)
_MONEY_MARKET_SYMBOLS = {"VMFXX", "SPAXX", "FDRXX", "FDLXX", "SWVXX", "SPRXX", "VMRXX"}


def _is_money_market(pos: Dict[str, Any]) -> bool:
    sym = (pos.get("symbol") or "").upper()
    price = pos.get("current_price") or 0.0
    if sym in _MONEY_MARKET_SYMBOLS:
        return True
    # Heuristic: symbol ends in XX and NAV is within 1 cent of $1
    if sym.endswith("XX") and 0.99 <= price <= 1.01:
        return True
    return False


def distribute_cost_basis(
    positions: List[Dict[str, Any]],
    total_deposits: float,
) -> List[Dict[str, Any]]:
    """
    Distribute total_deposits as cost basis across positions.

    Returns a list of dicts: [{symbol, total_cost_basis, total_gain_loss,
                                total_gain_loss_percent}, ...]
    """
    mm_positions = [p for p in positions if _is_money_market(p)]
    eq_positions = [p for p in positions if not _is_money_market(p)]

    # Money market value at $1 NAV is effectively its own cost basis
    mm_value = sum((p.get("current_value") or 0.0) for p in mm_positions)
    equity_cost = max(0.0, total_deposits - mm_value)
    equity_value = sum((p.get("current_value") or 0.0) for p in eq_positions)

    updates: List[Dict[str, Any]] = []
    for pos in positions:
        cv = pos.get("current_value") or 0.0

        if _is_money_market(pos):
            cost = cv
        elif equity_value > 0:
            cost = round(equity_cost * (cv / equity_value), 2)
        else:
            cost = 0.0

        gain = round(cv - cost, 2)
        gain_pct = round((gain / cost) * 100, 2) if cost > 0 else None

        updates.append({
            "symbol": pos["symbol"],
            "total_cost_basis": round(cost, 2),
            "total_gain_loss": gain,
            "total_gain_loss_percent": gain_pct,
        })

    return updates
