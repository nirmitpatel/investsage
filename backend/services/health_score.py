"""
Portfolio Health Score calculator.

Scores 0-100 based on:
  - Diversification across sectors (40 pts)
  - Position sizing — no single position too large (35 pts)
  - Number of positions (15 pts)
  - Overall performance (10 pts)
"""

from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict

InvestmentStyle = Optional[str]  # 'play_it_safe' | 'beat_the_market' | 'long_game'

HIGH_VOLATILITY_SECTORS = {"Technology", "Energy", "Consumer Cyclical", "Communication Services"}

STYLE_REBALANCE_TIP = {
    "play_it_safe": "Consider rebalancing into diversified bond funds or defensive sectors like Healthcare, Utilities, or Consumer Defensive.",
    "beat_the_market": "Consider rebalancing into high-conviction positions across multiple growth sectors.",
    "long_game": "Consider spreading across 10–20 positions for steady long-term compounding.",
    None: "Consider rebalancing to reduce concentration risk.",
}

STYLE_TREND_PERIOD = {
    "play_it_safe": ("1y", "1-year"),
    "beat_the_market": ("3mo", "3-month"),
    "long_game": ("2y", "2-year"),
}


def build_effective_sector_values(
    positions: List[Dict[str, Any]],
    fund_weightings: Optional[Dict[str, Dict[str, float]]] = None,
    unknown_as_other: bool = False,
) -> Dict[str, float]:
    """
    Build a sector → dollar_value map, expanding ETF/fund positions into
    their underlying sectors where data is available.

    If unknown_as_other=True, funds without breakdown data AND stocks with
    unknown sectors are grouped under "Other" so the total sums to 100%.
    """
    sector_values: Dict[str, float] = defaultdict(float)
    fund_weightings = fund_weightings or {}

    for p in positions:
        val = p.get("current_value") or 0
        sector = p.get("sector") or "Unknown"
        sym = p.get("symbol", "")

        if sector in ("ETF", "Mutual Fund"):
            if sym in fund_weightings:
                for sec_name, weight in fund_weightings[sym].items():
                    sector_values[sec_name] += val * weight
            elif unknown_as_other:
                sector_values["Other"] += val
        elif sector == "Unknown":
            if unknown_as_other:
                sector_values["Other"] += val
            # When not unknown_as_other, skip unknown stocks (same as unknown funds)
        else:
            sector_values[sector] += val

    return dict(sector_values)


def calculate_health_score(
    positions: List[Dict[str, Any]],
    fund_weightings: Optional[Dict[str, Dict[str, float]]] = None,
    investment_style: InvestmentStyle = None,
    market_trends: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    trend_period_code, trend_period_label = STYLE_TREND_PERIOD.get(
        investment_style, ("3mo", "3-month")
    )

    if not positions:
        return {
            "score": 0,
            "grade": "N/A",
            "total_value": 0,
            "total_gain_loss": 0,
            "position_count": 0,
            "issues": [],
            "notes": [],
            "sector_breakdown": [],
            "investment_style": investment_style,
            "market_trends_period": trend_period_label,
        }

    total_value = sum(p.get("current_value") or 0 for p in positions)
    total_gain_loss = sum(p.get("total_gain_loss") or 0 for p in positions)
    issues: List[Dict[str, Any]] = []
    notes: List[str] = []
    deductions = 0

    is_safe = investment_style == "play_it_safe"
    is_long = investment_style == "long_game"
    rebalance_tip = STYLE_REBALANCE_TIP.get(investment_style, STYLE_REBALANCE_TIP[None])

    # Concentration thresholds
    sector_high_pct = 40 if is_safe else 50
    sector_med_pct = 28 if is_safe else 35
    pos_high_pct = 15 if is_safe else 20
    pos_med_pct = 8 if is_safe else 12

    fund_weightings = fund_weightings or {}

    # Identify funds with no sector breakdown
    unknown_funds = [
        p for p in positions
        if p.get("sector") in ("ETF", "Mutual Fund") and p.get("symbol") not in fund_weightings
    ]
    unknown_fund_syms = [p["symbol"] for p in unknown_funds]
    unknown_fund_value = sum(p.get("current_value") or 0 for p in unknown_funds)

    if unknown_funds:
        unknown_pct = (unknown_fund_value / total_value * 100) if total_value > 0 else 0
        notes.append(
            f"Sector composition data isn't available for {', '.join(unknown_fund_syms)} "
            f"({unknown_pct:.0f}% of portfolio). These are likely broadly diversified funds — "
            f"check their fund page (e.g. on Morningstar) to see their underlying holdings."
        )

    # Sector values for concentration analysis (unknown funds excluded)
    sector_values_analysis = build_effective_sector_values(positions, fund_weightings, unknown_as_other=False)
    # Sector values for display (unknown funds shown as "Other" to fill the donut to 100%)
    sector_values_display = build_effective_sector_values(positions, fund_weightings, unknown_as_other=True)

    # ── Sector concentration ──────────────────────────────────────────
    if total_value > 0:
        for sector, val in sector_values_analysis.items():
            pct = (val / total_value) * 100
            if pct > sector_high_pct:
                deductions += 25
                if is_safe:
                    msg = f"{sector} makes up {pct:.0f}% of your portfolio. For a safety-focused strategy, this concentration significantly increases your risk exposure. {rebalance_tip}"
                else:
                    msg = f"{sector} makes up {pct:.0f}% of your portfolio — heavy concentration in one sector increases risk significantly. {rebalance_tip}"
                issues.append({"type": "sector_concentration", "severity": "high", "message": msg})
            elif pct > sector_med_pct:
                deductions += 12
                if is_safe:
                    msg = f"{sector} makes up {pct:.0f}% of your portfolio. A play-it-safe strategy benefits from broader diversification. {rebalance_tip}"
                else:
                    msg = f"{sector} makes up {pct:.0f}% of your portfolio. Consider spreading across more sectors to reduce concentration risk."
                issues.append({"type": "sector_concentration", "severity": "medium", "message": msg})

    # ── Play-it-safe: high-volatility sector warning ──────────────────
    if is_safe and total_value > 0:
        hv_val = sum(v for s, v in sector_values_analysis.items() if s in HIGH_VOLATILITY_SECTORS)
        hv_pct = (hv_val / total_value) * 100
        if hv_pct > 50:
            deductions += 8
            hv_names = ", ".join(s for s in HIGH_VOLATILITY_SECTORS if s in sector_values_analysis)
            issues.append({
                "type": "high_volatility_exposure",
                "severity": "medium",
                "message": f"{hv_pct:.0f}% of your portfolio (excluding unknown funds) is in high-volatility sectors ({hv_names}). For a play-it-safe approach, consider adding defensive holdings in Utilities, Healthcare, or Consumer Defensive.",
            })

    # ── Individual position sizing ────────────────────────────────────
    # Skip ALL ETFs and mutual funds — they are internally diversified instruments.
    # Their sector contribution is already captured in the sector concentration analysis.
    for p in positions:
        sym = p["symbol"]
        sector = p.get("sector") or "Unknown"

        if sector in ("ETF", "Mutual Fund"):
            continue

        val = p.get("current_value") or 0
        if total_value > 0:
            pct = (val / total_value) * 100
            if pct > pos_high_pct:
                deductions += 15
                msg = (
                    f"{sym} ({sector}) is {pct:.0f}% of your portfolio. "
                    f"Aim to keep individual positions under {pos_high_pct}% to limit downside risk. "
                    f"{rebalance_tip}"
                )
                issues.append({"type": "position_concentration", "severity": "high", "message": msg})
            elif pct > pos_med_pct:
                deductions += 7
                msg = (
                    f"{sym} ({sector}) is {pct:.0f}% of your portfolio. "
                    f"Consider trimming to under {pos_med_pct}% — this keeps any single position from having outsized impact. "
                    f"{rebalance_tip}"
                )
                issues.append({"type": "position_concentration", "severity": "medium", "message": msg})

    # ── Number of positions ───────────────────────────────────────────
    n = len(positions)
    if n < 5:
        deductions += 12
        issues.append({
            "type": "too_few_positions",
            "severity": "medium",
            "message": f"You hold only {n} position{'s' if n != 1 else ''}. Spreading across more positions and sectors reduces single-stock risk significantly.",
        })
    elif n < 10:
        deductions += 5
        issues.append({
            "type": "few_positions",
            "severity": "low",
            "message": f"You hold {n} positions. Aiming for 10–20 positions across multiple sectors is generally considered well-diversified.",
        })

    # ── Overall performance ───────────────────────────────────────────
    losing = [p for p in positions if (p.get("total_gain_loss") or 0) < 0]
    if len(losing) > len(positions) * 0.6 and len(positions) >= 3:
        deductions += 8
        if is_long:
            msg = f"{len(losing)} of {n} positions are currently at a loss. Long-game investors stay the course, but reviewing persistent underperformers is worthwhile."
        else:
            msg = f"{len(losing)} of {n} positions are at a loss. Consider reviewing underperformers and rebalancing into stronger positions."
        issues.append({"type": "majority_losing", "severity": "medium", "message": msg})

    score = max(0, min(100, 100 - deductions))

    if score >= 90:
        grade = "A"
    elif score >= 75:
        grade = "B"
    elif score >= 60:
        grade = "C"
    elif score >= 45:
        grade = "D"
    else:
        grade = "F"

    # ── Sector breakdown for display (includes "Other" for unknown funds) ─
    sector_breakdown = []
    if total_value > 0 and sector_values_display:
        for sector, val in sorted(sector_values_display.items(), key=lambda x: (-x[1], x[0])):
            pct = round((val / total_value) * 100, 1)
            item: Dict[str, Any] = {"sector": sector, "value": round(val, 2), "pct": pct}
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
        "notes": notes,
        "sector_breakdown": sector_breakdown,
        "investment_style": investment_style,
        "market_trends_period": trend_period_label,
    }
