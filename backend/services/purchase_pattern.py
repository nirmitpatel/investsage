"""
Transaction pattern analysis for Sell/Hold/Buy recommendations.

Analyzes a symbol's tax lot purchase history to detect behavioral signals
that should influence the AI recommendation.

Patterns detected:
  - failed_averaging_down: bought multiple times at decreasing prices,
    current price below all purchases → high-severity alert
  - adding_to_winner: bought at progressively increasing prices → positive signal
  - high_conviction: 3+ separate purchases → sustained belief, weight toward HOLD
"""

from typing import List, Dict, Any, Optional


def analyze_purchase_pattern(
    lots: List[Dict[str, Any]],
    current_price: Optional[float],
) -> Dict[str, Any]:
    """
    Analyze purchase history for a single symbol.

    Args:
        lots: Tax lots for this symbol (each has purchase_date, purchase_price, shares).
        current_price: Current market price.

    Returns a dict with:
        purchase_count: int
        pattern: str | None  — one of the pattern names above, or None
        severity: 'high' | 'positive' | None
        description: str | None  — human-readable pattern summary for the AI prompt
    """
    if not lots or current_price is None or current_price <= 0:
        return {"purchase_count": len(lots), "pattern": None, "severity": None, "description": None}

    # Sort by purchase date ascending (oldest first)
    sorted_lots = sorted(
        [l for l in lots if l.get("purchase_price") and l.get("purchase_date")],
        key=lambda l: l["purchase_date"],
    )

    if len(sorted_lots) < 2:
        return {"purchase_count": len(sorted_lots), "pattern": None, "severity": None, "description": None}

    prices = [float(l["purchase_price"]) for l in sorted_lots]
    purchase_count = len(sorted_lots)

    # Detect: strictly decreasing purchase prices
    prices_decreasing = all(prices[i] > prices[i + 1] for i in range(len(prices) - 1))
    # Detect: strictly increasing purchase prices
    prices_increasing = all(prices[i] < prices[i + 1] for i in range(len(prices) - 1))
    # Failed averaging down: also requires current price below ALL purchases
    below_all = current_price < min(prices)

    if prices_decreasing and below_all:
        return {
            "purchase_count": purchase_count,
            "pattern": "failed_averaging_down",
            "severity": "high",
            "description": (
                f"FAILED AVERAGING DOWN ALERT: bought {purchase_count} times at "
                f"decreasing prices (${prices[0]:,.2f} → ${prices[-1]:,.2f}); "
                f"current price ${current_price:,.2f} is below all purchase prices. "
                f"This is a high-severity signal — the thesis may be broken."
            ),
        }

    if prices_increasing:
        base = (
            f"Added to position at progressively higher prices "
            f"(${prices[0]:,.2f} → ${prices[-1]:,.2f}), indicating rising conviction"
        )
        if purchase_count >= 3:
            return {
                "purchase_count": purchase_count,
                "pattern": "adding_to_winner_high_conviction",
                "severity": "positive",
                "description": (
                    base + f" across {purchase_count} purchases. "
                    f"Strong behavioral signal — weight toward HOLD or BUY_MORE."
                ),
            }
        return {
            "purchase_count": purchase_count,
            "pattern": "adding_to_winner",
            "severity": "positive",
            "description": base + ". Weight toward HOLD.",
        }

    if purchase_count >= 3:
        return {
            "purchase_count": purchase_count,
            "pattern": "high_conviction",
            "severity": "positive",
            "description": (
                f"Purchased {purchase_count} times across multiple dates, "
                f"demonstrating sustained conviction. Weight toward HOLD."
            ),
        }

    return {"purchase_count": purchase_count, "pattern": None, "severity": None, "description": None}
