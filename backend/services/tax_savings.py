"""
Tax-loss harvesting opportunity finder.

For each open tax lot at a loss:
  - Calculates unrealized loss and estimated tax savings
  - Flags short-term lots (held < 1 year) vs long-term
  - Notes days until a short-term loss becomes long-term (worth waiting if close)
  - Suggests a replacement ETF to maintain market exposure (wash-sale safe)
"""

from datetime import date, timedelta
from typing import List, Dict, Any, Optional

# Federal tax rates used for estimate (marginal)
SHORT_TERM_RATE = 0.37    # short-term capital gains = ordinary income (top bracket)
LONG_TERM_RATE = 0.20     # long-term capital gains (top bracket)

DAYS_IN_YEAR = 365

# Broad replacement ETFs by sector (wash-sale safe alternatives)
SECTOR_REPLACEMENTS: Dict[str, str] = {
    "Technology": "VGT (Vanguard IT ETF)",
    "Healthcare": "VHT (Vanguard Health Care ETF)",
    "Financial Services": "VFH (Vanguard Financials ETF)",
    "Consumer Cyclical": "VCR (Vanguard Consumer Disc. ETF)",
    "Consumer Defensive": "VDC (Vanguard Consumer Staples ETF)",
    "Industrials": "VIS (Vanguard Industrials ETF)",
    "Energy": "VDE (Vanguard Energy ETF)",
    "Utilities": "VPU (Vanguard Utilities ETF)",
    "Real Estate": "VNQ (Vanguard REIT ETF)",
    "Communication Services": "VOX (Vanguard Communication ETF)",
    "Basic Materials": "VAW (Vanguard Materials ETF)",
    "Fixed Income": "BND (Vanguard Total Bond ETF)",
    "ETF": "VTI (Vanguard Total Stock Market ETF)",
    "Mutual Fund": "VTI (Vanguard Total Stock Market ETF)",
}
DEFAULT_REPLACEMENT = "VTI (Vanguard Total Stock Market ETF)"


def find_tax_opportunities(
    lots: List[Dict[str, Any]],
    current_prices: Dict[str, float],
    sectors: Optional[Dict[str, str]] = None,
) -> List[Dict[str, Any]]:
    """
    Given open tax lots and current prices, find tax-loss harvesting opportunities.
    Returns list of opportunities sorted by estimated tax savings (largest first).
    """
    today = date.today()
    sectors = sectors or {}
    opportunities = []

    for lot in lots:
        symbol = lot.get("symbol", "")
        shares = lot.get("shares") or 0
        purchase_price = lot.get("purchase_price") or 0
        purchase_date_str = lot.get("purchase_date")
        cost_basis = lot.get("cost_basis") or (shares * purchase_price)

        current_price = current_prices.get(symbol)
        if not current_price or shares <= 0:
            continue

        current_value = shares * current_price
        unrealized_gain_loss = current_value - cost_basis

        # Only interested in losses
        if unrealized_gain_loss >= 0:
            continue

        unrealized_loss = abs(unrealized_gain_loss)

        # Determine holding period
        purchase_date = None
        if purchase_date_str:
            try:
                purchase_date = date.fromisoformat(purchase_date_str)
            except ValueError:
                pass

        days_held = (today - purchase_date).days if purchase_date else None
        is_short_term = (days_held is not None and days_held < DAYS_IN_YEAR)
        days_until_lt = (DAYS_IN_YEAR - days_held) if is_short_term and days_held is not None else None

        # Tax savings estimate
        rate = SHORT_TERM_RATE if is_short_term else LONG_TERM_RATE
        tax_savings = unrealized_loss * rate

        sector = sectors.get(symbol, "Unknown")
        replacement = SECTOR_REPLACEMENTS.get(sector, DEFAULT_REPLACEMENT)

        # Urgency: if close to crossing into long-term, flag it
        urgency = None
        if days_until_lt is not None:
            if days_until_lt <= 30:
                urgency = "high"   # harvest soon — short-term rate applies, about to flip
            elif days_until_lt <= 90:
                urgency = "medium"

        opportunities.append({
            "symbol": symbol,
            "sector": sector,
            "shares": round(shares, 4),
            "purchase_date": purchase_date_str,
            "purchase_price": round(purchase_price, 4),
            "current_price": round(current_price, 4),
            "cost_basis": round(cost_basis, 2),
            "current_value": round(current_value, 2),
            "unrealized_loss": round(unrealized_loss, 2),
            "tax_savings_estimate": round(tax_savings, 2),
            "is_short_term": is_short_term,
            "days_held": days_held,
            "days_until_lt": days_until_lt,
            "holding_period_label": "Short-term" if is_short_term else "Long-term",
            "tax_rate_used": rate,
            "replacement_suggestion": replacement,
            "urgency": urgency,
        })

    # Sort by tax savings descending
    opportunities.sort(key=lambda x: -x["tax_savings_estimate"])
    return opportunities


def summarize_tax_opportunities(opportunities: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Aggregate stats across all opportunities."""
    if not opportunities:
        return {
            "total_harvestable_loss": 0,
            "total_tax_savings_estimate": 0,
            "opportunity_count": 0,
            "short_term_count": 0,
            "long_term_count": 0,
            "urgent_count": 0,
        }

    return {
        "total_harvestable_loss": round(sum(o["unrealized_loss"] for o in opportunities), 2),
        "total_tax_savings_estimate": round(sum(o["tax_savings_estimate"] for o in opportunities), 2),
        "opportunity_count": len(opportunities),
        "short_term_count": sum(1 for o in opportunities if o["is_short_term"]),
        "long_term_count": sum(1 for o in opportunities if not o["is_short_term"]),
        "urgent_count": sum(1 for o in opportunities if o.get("urgency") == "high"),
    }
