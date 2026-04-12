"""
CSV parser package — auto-detects brokerage and dispatches to the right parser.
"""

from typing import List, Dict, Any

from .fidelity import parse_fidelity_positions, parse_fidelity_transactions, reconstruct_tax_lots
from .schwab import parse_schwab_positions, parse_schwab_transactions
from .vanguard import parse_vanguard_positions, parse_vanguard_transactions
from .robinhood import (
    parse_robinhood_transactions,
    reconstruct_positions_from_transactions as robinhood_reconstruct_positions,
)


def detect_brokerage(csv_text: str) -> str:
    """
    Inspect the first few lines of a CSV to identify the brokerage.
    Returns one of: "fidelity", "schwab", "vanguard", "robinhood".
    Raises ValueError if unrecognized.
    """
    header = csv_text[:2000].lower()

    # Fidelity: starts with "brokerage" account block, or has "account name/number" column
    if "fidelity" in header or "account name/number" in header:
        return "fidelity"

    # Schwab: first line is "Positions for account ..." or has "Market Value" column
    if "schwab" in header or "positions for account" in header or "transactions for account" in header:
        return "schwab"
    # Schwab column signature: both "market value" and "gain/loss $"
    if "market value" in header and "gain/loss $" in header:
        return "schwab"

    # Vanguard: mentions vanguard, or has "Investment Name" + "Share Price" columns
    if "vanguard" in header:
        return "vanguard"
    if "investment name" in header and "share price" in header:
        return "vanguard"
    if "transaction type" in header and "share price" in header:
        return "vanguard"

    # Robinhood: transaction history has "activity date" + "trans code" + "instrument"
    if "activity date" in header and "trans code" in header and "instrument" in header:
        return "robinhood"

    raise ValueError(
        "Could not detect brokerage from CSV. "
        "Supported brokerages: Fidelity, Charles Schwab, Vanguard, Robinhood."
    )


_BROKERAGE_ALIASES = {
    "fidelity": "fidelity",
    "schwab": "schwab",
    "charles schwab": "schwab",
    "vanguard": "vanguard",
    "robinhood": "robinhood",
}


def parse_positions(csv_text: str, brokerage: str | None = None) -> tuple[List[Dict[str, Any]], str]:
    """
    Parse positions CSV for the given brokerage (or auto-detect if not provided).
    For Robinhood (transactions-only export), reconstructs positions from history.
    Returns (positions, brokerage_name).
    """
    if brokerage:
        brokerage = _BROKERAGE_ALIASES.get(brokerage.lower())
        if not brokerage:
            raise ValueError(
                "Unrecognized brokerage. Supported: Fidelity, Charles Schwab, Vanguard, Robinhood."
            )
    else:
        brokerage = detect_brokerage(csv_text)
    if brokerage == "fidelity":
        return parse_fidelity_positions(csv_text), "Fidelity"
    elif brokerage == "schwab":
        return parse_schwab_positions(csv_text), "Charles Schwab"
    elif brokerage == "vanguard":
        return parse_vanguard_positions(csv_text), "Vanguard"
    elif brokerage == "robinhood":
        txns = parse_robinhood_transactions(csv_text)
        positions = robinhood_reconstruct_positions(txns)
        return positions, "Robinhood"
    raise ValueError(f"Unknown brokerage: {brokerage}")


def parse_transactions(csv_text: str, brokerage: str | None = None) -> tuple[List[Dict[str, Any]], str]:
    """
    Parse transactions CSV for the given brokerage (or auto-detect if not provided).
    Returns (transactions, brokerage_name).
    """
    if brokerage:
        brokerage = _BROKERAGE_ALIASES.get(brokerage.lower())
        if not brokerage:
            raise ValueError(
                "Unrecognized brokerage. Supported: Fidelity, Charles Schwab, Vanguard, Robinhood."
            )
    else:
        brokerage = detect_brokerage(csv_text)
    if brokerage == "fidelity":
        return parse_fidelity_transactions(csv_text), "Fidelity"
    elif brokerage == "schwab":
        return parse_schwab_transactions(csv_text), "Charles Schwab"
    elif brokerage == "vanguard":
        return parse_vanguard_transactions(csv_text), "Vanguard"
    elif brokerage == "robinhood":
        return parse_robinhood_transactions(csv_text), "Robinhood"
    raise ValueError(f"Unknown brokerage: {brokerage}")
