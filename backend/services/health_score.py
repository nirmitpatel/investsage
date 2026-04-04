"""
Portfolio Health Score calculator.

Scores 0-100 based on:
  - Diversification across sectors (40 pts)
  - Position sizing — no single position too large (35 pts)
  - Number of positions (15 pts)
  - Overall performance (10 pts)
"""

from typing import List, Dict, Any, Optional
from collections import defaultdict

InvestmentStyle = Optional[str]  # 'play_it_safe' | 'beat_the_market' | 'long_game'

STYLE_LABELS = {
    "play_it_safe": "Play it safe",
    "beat_the_market": "Beat the market",
    "long_game": "Long game",
}

# Sectors considered high-volatility (relevant for play_it_safe warnings)
HIGH_VOLATILITY_SECTORS = {"Technology", "Energy", "Consumer Cyclical", "Communication Services"}


def build_effective_sector_values(
    positions: List[Dict[str, Any]],
    fund_weightings: Optional[Dict[str, Dict[str, float]]] = None,
) -> Dict[str, float]:
    """
    Build a sector → dollar_value map that expands ETF/mutual fund positions
    into their underlying sector weightings.

    For stocks: full position value goes to their sector.
    For funds with known weightings: value is distributed proportionally.
    For funds without weightings: value goes to "ETF" or "Mutual Fund" bucket.
    """
    sector_values: Dict[str, float] = defaultdict(float)
    fund_weightings = fund_weightings or {}

    for p in positions:
        val = p.get("current_value") or 0
        sector = p.get("sector") or "Unknown"
        sym = p.get("symbol", "")

        if sector in ("ETF", "Mutual Fund"):
            if sym in fund_weightings:
                # Expand into underlying sectors
                for sec_name, weight in fund_weightings[sym].items():
                    sector_values[sec_name] += val * weight
            # If no weightings data, skip — don't penalize for unknown fund composition
        else:
            sector_values[sector] += val

    return dict(sector_values)


def calculate_health_score(
    positions: List[Dict[str, Any]],
    fund_weightings: Optional[Dict[str, Dict[str, float]]] = None,
    investment_style: InvestmentStyle = None,
    market_trends: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    if not positions:
        return {
            "score": 0,
            "grade": "N/A",
            "total_value": 0,
            "total_gain_loss": 0,
            "position_count": 0,
            "issues": [],
            "sector_breakdown": [],
            "investment_style": investment_style,
        }

    total_value = sum(p.get("current_value") or 0 for p in positions)
    total_gain_loss = sum(p.get("total_gain_loss") or 0 for p in positions)
    issues = []
    deductions = 0

    # Style-based thresholds
    is_safe = investment_style == "play_it_safe"
    is_long = investment_style == "long_game"

    # Sector concentration thresholds
    sector_high_pct = 40 if is_safe else 50
    sector_med_pct = 28 if is_safe else 35
    sector_high_ded = 25
    sector_med_ded = 12

    # Position concentration thresholds
    pos_high_pct = 15 if is_safe else 20
    pos_med_pct = 8 if is_safe else 12
    pos_high_ded = 15
    pos_med_ded = 7

    # ── Sector concentration (expands ETF/fund holdings into underlying sectors) ──
    fund_weightings = fund_weightings or {}
    unknown_funds = [
        p["symbol"] for p in positions
        if p.get("sector") in ("ETF", "Mutual Fund") and p.get("symbol") not in fund_weightings
    ]
    if unknown_funds:
        issues.append({
            "type": "fund_composition_unknown",
            "severity": "low",
            "message": f"Sector breakdown unavailable for {', '.join(unknown_funds)} — sector concentration analysis excludes these holdings.",
        })
    sector_values = build_effective_sector_values(positions, fund_weightings)

    if total_value > 0:
        for sector, val in sector_values.items():
            pct = (val / total_value) * 100
            if pct > sector_high_pct:
                deductions += sector_high_ded
                if is_safe:
                    msg = f"{sector} makes up {pct:.0f}% of your portfolio — for a safety-focused strategy, heavy sector concentration is a significant risk."
                else:
                    msg = f"{sector} makes up {pct:.0f}% of your portfolio — heavy concentration in one sector increases risk significantly."
                issues.append({"type": "sector_concentration", "severity": "high", "message": msg})
            elif pct > sector_med_pct:
                deductions += sector_med_ded
                if is_safe:
                    msg = f"{sector} makes up {pct:.0f}% of your portfolio. A play-it-safe strategy benefits from broader diversification."
                else:
                    msg = f"{sector} makes up {pct:.0f}% of your portfolio. Consider spreading across more sectors."
                issues.append({"type": "sector_concentration", "severity": "medium", "message": msg})

    # ── Play-it-safe: warn if heavy in high-volatility sectors ──────────────
    if is_safe and total_value > 0:
        hv_val = sum(v for s, v in sector_values.items() if s in HIGH_VOLATILITY_SECTORS)
        hv_pct = (hv_val / total_value) * 100
        if hv_pct > 50:
            deductions += 8
            hv_names = ", ".join(s for s in HIGH_VOLATILITY_SECTORS if s in sector_values)
            issues.append({
                "type": "high_volatility_exposure",
                "severity": "medium",
                "message": f"{hv_pct:.0f}% of your portfolio is in high-volatility sectors ({hv_names}). For a play-it-safe approach, consider adding defensive holdings.",
            })

    # ── Individual position sizing ────────────────────────────────────
    for p in positions:
        val = p.get("current_value") or 0
        if total_value > 0:
            pct = (val / total_value) * 100
            if pct > pos_high_pct:
                deductions += pos_high_ded
                if is_safe:
                    msg = f"{p['symbol']} is {pct:.0f}% of your portfolio. For a conservative strategy, no single position should exceed {pos_high_pct}%."
                else:
                    msg = f"{p['symbol']} is {pct:.0f}% of your portfolio. A single position this large creates significant downside risk."
                issues.append({"type": "position_concentration", "severity": "high", "message": msg})
            elif pct > pos_med_pct:
                deductions += pos_med_ded
                if is_safe:
                    msg = f"{p['symbol']} is {pct:.0f}% of your portfolio. Consider trimming to stay within your safety target."
                else:
                    msg = f"{p['symbol']} is {pct:.0f}% of your portfolio. Consider trimming to reduce concentration."
                issues.append({"type": "position_concentration", "severity": "medium", "message": msg})

    # ── Number of positions ───────────────────────────────────────────
    n = len(positions)
    few_threshold = 8 if is_long else 5
    very_few_threshold = 4 if is_long else (5 if not is_long else 5)

    if n < few_threshold and n >= (very_few_threshold if is_long else 5):
        deductions += 5
        if is_long:
            issues.append({
                "type": "few_positions",
                "severity": "low",
                "message": f"You hold {n} positions. Long-game investors typically hold 10–20+ positions to weather market cycles.",
            })
    elif n < 5:
        deductions += 12
        issues.append({
            "type": "too_few_positions",
            "severity": "medium",
            "message": f"You hold only {n} position{'s' if n != 1 else ''}. Spreading across more positions and sectors reduces single-stock risk.",
        })
    elif n < 10:
        deductions += 5
        issues.append({
            "type": "few_positions",
            "severity": "low",
            "message": f"You hold {n} positions. Aiming for 10–20 positions is generally considered well-diversified.",
        })

    # ── Overall performance ───────────────────────────────────────────
    losing = [p for p in positions if (p.get("total_gain_loss") or 0) < 0]
    if len(losing) > len(positions) * 0.6 and len(positions) >= 3:
        deductions += 8
        if is_long:
            msg = f"{len(losing)} of {n} positions are at a loss. Long-game investors stay the course, but reviewing persistent underperformers is worthwhile."
        else:
            msg = f"{len(losing)} of {n} positions are at a loss. Consider reviewing underperformers."
        issues.append({"type": "majority_losing", "severity": "medium", "message": msg})

    score = max(0, min(100, 100 - deductions))

    if score >= 85:
        grade = "A"
    elif score >= 70:
        grade = "B"
    elif score >= 55:
        grade = "C"
    elif score >= 40:
        grade = "D"
    else:
        grade = "F"

    # ── Build sector breakdown list ───────────────────────────────────
    sector_breakdown = []
    if total_value > 0 and sector_values:
        for sector, val in sorted(sector_values.items(), key=lambda x: -x[1]):
            pct = round((val / total_value) * 100, 1)
            item: Dict[str, Any] = {
                "sector": sector,
                "value": round(val, 2),
                "pct": pct,
            }
            if market_trends and sector in market_trends:
                item["market_trend"] = market_trends[sector]
            sector_breakdown.append(item)

    return {
        "score": score,
        "grade": grade,
        "total_value": round(total_value, 2),
        "total_gain_loss": round(total_gain_loss, 2),
        "position_count": n,
        "issues": issues,
        "sector_breakdown": sector_breakdown,
        "investment_style": investment_style,
    }
