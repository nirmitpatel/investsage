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

# Competitive pairs: companies in direct rivalry within the same market
# Flag when a user holds both a winner and loser in the same space.
COMPETITIVE_PAIRS: Dict[str, List[str]] = {
    "GLP-1 Weight Loss": ["LLY", "NVO", "HIMS", "AMGN", "VKTX", "ALT"],
    "EV Manufacturers": ["TSLA", "RIVN", "LCID", "NIO", "XPEV", "LI", "GM", "F"],
    "Streaming": ["NFLX", "DIS", "WBD", "PARA", "AMZN", "AAPL"],
    "Cybersecurity Identity": ["OKTA", "CYBR", "SAIL", "PING"],
    "Social Media": ["META", "SNAP", "PINS", "RDDT"],
    "Ride Sharing": ["UBER", "LYFT"],
    "AI Chips": ["NVDA", "AMD", "INTC"],
    "Fintech / BNPL": ["SQ", "PYPL", "AFRM", "SOFI", "UPST"],
    "Online Travel": ["BKNG", "EXPE", "ABNB"],
    "Telecom": ["T", "VZ", "TMUS"],
    "Semiconductor Equipment": ["ASML", "AMAT", "LRCX", "KLAC"],
    "Rx Drug Distribution": ["MCK", "CAH", "ABC"],
    "Cannabis": ["CGC", "TLRY", "ACB"],
    "Space Launch": ["RKLB", "SPCE", "BA", "LMT"],
    "GenAI Platforms": ["MSFT", "GOOG", "GOOGL", "META", "AMZN"],
}

# Functional overlaps: positions that serve the same portfolio role.
# (min_count, [symbols]) — flag when user holds >= min_count from this category.
FUNCTIONAL_OVERLAPS: Dict[str, Tuple[int, List[str]]] = {
    "S&P 500 / Broad Market ETF": (2, ["SPY", "VOO", "IVV", "VTI", "SCHB", "ITOT", "FZROX", "SPTM"]),
    "Nasdaq / Tech Growth ETF": (2, ["QQQ", "XLK", "VGT", "FTEC", "QQMG", "ONEQ"]),
    "Small-Cap ETF": (2, ["IWM", "VB", "SCHA", "IJR"]),
    "Cybersecurity Platform": (3, ["CRWD", "PANW", "FTNT", "ZS", "S", "CHKP", "CSCO"]),
    "Cloud Analytics / SaaS": (3, ["SNOW", "DDOG", "MDB", "PLTR", "CRM", "NOW"]),
    "Semiconductor": (3, ["NVDA", "AMD", "INTC", "QCOM", "AVGO", "TXN", "MCHP", "MU"]),
    "Healthcare Insurance": (3, ["UNH", "HUM", "ELV", "CNC", "CVS"]),
    "Payment Networks": (3, ["V", "MA", "AXP"]),
    "Big-Tech Hyperscaler": (3, ["AMZN", "MSFT", "GOOG", "GOOGL", "META", "AAPL"]),
    "Oil Majors": (3, ["XOM", "CVX", "COP", "BP", "SHEL"]),
    "REITs / Real Estate ETF": (3, ["VNQ", "IYR", "XLRE", "O", "AMT", "PLD", "EQIX"]),
}

HIGH_VOLATILITY_SECTORS = {"Technology", "Energy", "Consumer Cyclical", "Communication Services"}

STYLE_REBALANCE_TIP = {
    "play_it_safe": "Consider rebalancing into diversified bond funds or defensive sectors like Healthcare, Utilities, or Consumer Defensive.",
    "beat_the_market": "Consider rebalancing into high-conviction positions across multiple growth sectors.",
    "long_game": "Consider spreading across 10–20 positions for steady long-term compounding.",
    None: "Consider rebalancing to reduce concentration risk.",
}

STYLE_LABEL = {
    "play_it_safe": "play-it-safe",
    "beat_the_market": "beat-the-market",
    "long_game": "long-game",
}

STYLE_TREND_PERIOD = {
    "play_it_safe": ("3y", "3-year"),
    "beat_the_market": ("3mo", "3-month"),
    "long_game": ("10y", "10-year"),
}


def detect_conflicting_bets(
    positions: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], float]:
    """
    Detect positions in direct competitive rivalry where the user is on both sides.
    Returns (issues, score_deduction).

    Flags when:
      - User holds ≥2 non-ETF positions from the same COMPETITIVE_PAIRS space
      - The best performer is ≥15pp ahead of the worst performer
      - AND the worst performer is at a loss (<0%)
    """
    held = {
        p["symbol"]: p for p in positions
        if p.get("sector") not in ("ETF", "Mutual Fund")
    }
    issues: List[Dict[str, Any]] = []
    deduction = 0.0

    for space_name, space_symbols in COMPETITIVE_PAIRS.items():
        held_in_space = [held[sym] for sym in space_symbols if sym in held]
        if len(held_in_space) < 2:
            continue

        # Need gain/loss data to determine winner vs loser
        with_data = [p for p in held_in_space if p.get("total_gain_loss_percent") is not None]
        if len(with_data) < 2:
            continue

        sorted_by_perf = sorted(with_data, key=lambda p: p["total_gain_loss_percent"], reverse=True)
        winner = sorted_by_perf[0]
        loser = sorted_by_perf[-1]
        winner_pct = winner["total_gain_loss_percent"]
        loser_pct = loser["total_gain_loss_percent"]
        divergence = winner_pct - loser_pct

        if loser_pct < 0 and divergence >= 15:
            severity = "high" if loser_pct < -15 and winner_pct > 15 else "medium"
            msg = (
                f"Conflicting bet in {space_name}: you hold {winner['symbol']} "
                f"({winner_pct:+.0f}%) and {loser['symbol']} ({loser_pct:+.0f}%). "
                f"These companies compete directly — your gains on one are partially "
                f"offset by losses on the other. Consider consolidating into your "
                f"highest-conviction pick."
            )
            issues.append({"type": "conflicting_bet", "severity": severity, "message": msg})
            deduction += 4.0

    return issues, min(deduction, 10.0)


def detect_redundancies(
    positions: List[Dict[str, Any]],
    investment_style: InvestmentStyle = None,
) -> Tuple[List[Dict[str, Any]], float]:
    """
    Detect positions that serve the same portfolio function.
    Returns (issues, score_deduction).

    Flags when the user holds ≥ threshold positions from a FUNCTIONAL_OVERLAPS category.
    Skipped entirely for beat_the_market — sector concentration is intentional there.
    """
    if investment_style == "beat_the_market":
        return [], 0.0

    held = {p["symbol"]: p for p in positions}
    issues: List[Dict[str, Any]] = []
    deduction = 0.0

    for category_name, (min_count, category_symbols) in FUNCTIONAL_OVERLAPS.items():
        held_in_cat = [held[sym] for sym in category_symbols if sym in held]
        if len(held_in_cat) < min_count:
            continue
        syms = ", ".join(p["symbol"] for p in held_in_cat)
        msg = (
            f"Redundancy in {category_name}: you hold {len(held_in_cat)} positions "
            f"that serve the same portfolio function ({syms}). These provide little "
            f"additional diversification — consider consolidating into your highest-conviction pick."
        )
        issues.append({"type": "redundancy", "severity": "medium", "message": msg})
        deduction += 3.0

    return issues, min(deduction, 8.0)


def check_symbol_portfolio_fit(
    symbol: str,
    positions: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Check for conflicts and redundancies involving `symbol` within the held portfolio.
    Returns {"conflicts": [str], "redundancies": [str]}
    """
    held = {
        p["symbol"] for p in positions
        if p.get("sector") not in ("ETF", "Mutual Fund") and p["symbol"] != symbol
    }
    conflicts = []
    redundancies = []

    for space_name, space_symbols in COMPETITIVE_PAIRS.items():
        if symbol not in space_symbols:
            continue
        others = [s for s in space_symbols if s in held]
        if others:
            conflicts.append(f"{space_name} (alongside {', '.join(others)})")

    for category_name, (_, category_symbols) in FUNCTIONAL_OVERLAPS.items():
        if symbol not in category_symbols:
            continue
        others = [s for s in category_symbols if s in held]
        if others:
            redundancies.append(f"{category_name} (alongside {', '.join(others)})")

    return {"conflicts": conflicts, "redundancies": redundancies}


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


def _sub_grade(score: float, max_score: float = 25.0) -> str:
    pct = score / max_score
    if pct >= 0.90:
        return "A"
    if pct >= 0.75:
        return "B"
    if pct >= 0.60:
        return "C"
    if pct >= 0.45:
        return "D"
    return "F"


def calculate_sizing_score(
    positions: List[Dict[str, Any]],
    total_value: float,
    pos_high_pct: float,
    pos_med_pct: float,
) -> float:
    """0–25: deductions for oversized individual stock positions."""
    score = 25.0
    if total_value <= 0:
        return score
    for p in positions:
        if p.get("sector") in ("ETF", "Mutual Fund"):
            continue
        val = p.get("current_value") or 0
        pct = (val / total_value) * 100
        if pct > pos_high_pct:
            score -= 10
        elif pct > pos_med_pct:
            score -= 5
    return max(0.0, score)


def calculate_diversification_score(
    sector_values: Dict[str, float],
    total_value: float,
    n: int,
    sector_high_pct: float,
    sector_med_pct: float,
) -> float:
    """0–25: deductions for sector concentration and too few positions."""
    score = 25.0
    if total_value > 0:
        for val in sector_values.values():
            pct = (val / total_value) * 100
            if pct > sector_high_pct:
                score -= 12
            elif pct > sector_med_pct:
                score -= 6
    if n < 5:
        score -= 12
    elif n < 10:
        score -= 4
    return max(0.0, score)


def calculate_risk_score(
    sector_values: Dict[str, float],
    total_value: float,
    is_safe: bool,
    market_trends: Optional[Dict[str, float]],
    investment_style: InvestmentStyle,
) -> float:
    """0–25: deductions for market-trend headwinds and high-volatility exposure."""
    score = 25.0
    if total_value <= 0:
        return score
    if is_safe:
        hv_val = sum(v for s, v in sector_values.items() if s in HIGH_VOLATILITY_SECTORS)
        hv_pct = (hv_val / total_value) * 100
        if hv_pct > 50:
            score -= 5
    if market_trends and investment_style in ("beat_the_market", "play_it_safe"):
        for sector, val in sector_values.items():
            trend = market_trends.get(sector)
            if trend is None:
                continue
            pct = (val / total_value) * 100
            if trend < -3 and pct > 15:
                if trend < -8 or pct > 25:
                    score -= 8
                else:
                    score -= 4
            elif trend < -3 and pct > 8:
                score -= 2
    return max(0.0, score)


def calculate_performance_score(
    positions: List[Dict[str, Any]],
) -> float:
    """0–25: deductions for majority of positions at a loss."""
    score = 25.0
    n = len(positions)
    if n >= 3:
        losing = sum(1 for p in positions if (p.get("total_gain_loss") or 0) < 0)
        if losing > n * 0.6:
            score -= 10
    return max(0.0, score)


def calculate_health_score(
    positions: List[Dict[str, Any]],
    fund_weightings: Optional[Dict[str, Dict[str, float]]] = None,
    investment_style: InvestmentStyle = None,
    market_trends: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    trend_period_code, trend_period_label = STYLE_TREND_PERIOD.get(
        investment_style, ("3mo", "3-month")
    )

    _empty_sub = lambda label: {"score": 0, "grade": "N/A", "label": label, "max": 25}
    if not positions:
        return {
            "score": 0,
            "grade": "N/A",
            "total_value": 0,
            "total_gain_loss": 0,
            "position_count": 0,
            "issues": [],
            "notes": [],
            "opportunities": [],
            "sector_breakdown": [],
            "investment_style": investment_style,
            "market_trends_period": trend_period_label,
            "sub_scores": {
                "sizing": _empty_sub("Position Sizing"),
                "diversification": _empty_sub("Diversification"),
                "risk": _empty_sub("Risk Management"),
                "performance": _empty_sub("Performance"),
            },
        }

    total_value = sum(p.get("current_value") or 0 for p in positions)
    total_gain_loss = sum(p.get("total_gain_loss") or 0 for p in positions)
    issues: List[Dict[str, Any]] = []
    notes: List[str] = []
    opportunities: List[str] = []

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
                if is_safe:
                    msg = f"{sector} makes up {pct:.0f}% of your portfolio. For a safety-focused strategy, this concentration significantly increases your risk exposure. {rebalance_tip}"
                else:
                    msg = f"{sector} makes up {pct:.0f}% of your portfolio — heavy concentration in one sector increases risk significantly. {rebalance_tip}"
                issues.append({"type": "sector_concentration", "severity": "high", "message": msg})
            elif pct > sector_med_pct:
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
                msg = (
                    f"{sym} ({sector}) is {pct:.0f}% of your portfolio. "
                    f"Aim to keep individual positions under {pos_high_pct}% to limit downside risk. "
                    f"{rebalance_tip}"
                )
                issues.append({"type": "position_concentration", "severity": "high", "message": msg})
            elif pct > pos_med_pct:
                msg = (
                    f"{sym} ({sector}) is {pct:.0f}% of your portfolio. "
                    f"Consider trimming to under {pos_med_pct}% — this keeps any single position from having outsized impact. "
                    f"{rebalance_tip}"
                )
                issues.append({"type": "position_concentration", "severity": "medium", "message": msg})

    # ── Number of positions ───────────────────────────────────────────
    n = len(positions)
    if n < 5:
        issues.append({
            "type": "too_few_positions",
            "severity": "medium",
            "message": f"You hold only {n} position{'s' if n != 1 else ''}. Spreading across more positions and sectors reduces single-stock risk significantly.",
        })
    elif n < 10:
        issues.append({
            "type": "few_positions",
            "severity": "low",
            "message": f"You hold {n} positions. Aiming for 10–20 positions across multiple sectors is generally considered well-diversified.",
        })

    # ── Overall performance ───────────────────────────────────────────
    losing = [p for p in positions if (p.get("total_gain_loss") or 0) < 0]
    if len(losing) > len(positions) * 0.6 and len(positions) >= 3:
        if is_long:
            msg = f"{len(losing)} of {n} positions are currently at a loss. Long-game investors stay the course, but reviewing persistent underperformers is worthwhile."
        else:
            msg = f"{len(losing)} of {n} positions are at a loss. Consider reviewing underperformers and rebalancing into stronger positions."
        issues.append({"type": "majority_losing", "severity": "medium", "message": msg})

    # ── Market trend alignment (beat_the_market and play_it_safe only) ──
    # long_game intentionally excluded — 10-year trend data doesn't warrant
    # short-term rebalancing signals for patient investors.
    if market_trends and investment_style in ("beat_the_market", "play_it_safe") and total_value > 0:
        style_label = STYLE_LABEL.get(investment_style, investment_style)
        for sector, val in sector_values_analysis.items():
            trend = market_trends.get(sector)
            if trend is None:
                continue
            pct = (val / total_value) * 100

            # Penalize heavy allocation in underperforming sectors
            if trend < -3 and pct > 15:
                if trend < -8 or pct > 25:
                    issues.append({
                        "type": "sector_trend_headwind",
                        "severity": "high",
                        "message": (
                            f"{sector} is {pct:.0f}% of your portfolio and is down {abs(trend):.1f}% "
                            f"over the {trend_period_label} period. For a {style_label} strategy this is a "
                            f"significant headwind — consider reducing exposure or rotating into stronger sectors."
                        ),
                    })
                else:
                    issues.append({
                        "type": "sector_trend_headwind",
                        "severity": "medium",
                        "message": (
                            f"{sector} is {pct:.0f}% of your portfolio and is down {abs(trend):.1f}% "
                            f"({trend_period_label}). A {style_label} approach benefits from rotating "
                            f"out of underperforming sectors."
                        ),
                    })
            elif trend < -3 and pct > 8:
                issues.append({
                    "type": "sector_trend_headwind",
                    "severity": "low",
                    "message": (
                        f"{sector} ({pct:.0f}% of portfolio) has a negative {trend_period_label} "
                        f"trend ({trend:+.1f}%). Monitor this sector closely."
                    ),
                })

        # Note opportunities in outperforming sectors where you're underweight
        top_sectors = sorted(
            [(s, t) for s, t in market_trends.items() if t > 8],
            key=lambda x: -x[1],
        )
        for sector, trend in top_sectors[:3]:
            held_pct = (sector_values_analysis.get(sector, 0) / total_value * 100)
            if held_pct < 5:
                exposure_str = "no exposure" if held_pct < 0.5 else f"only {held_pct:.0f}% exposure"
                opportunities.append(
                    f"{sector} is up {trend:.1f}% ({trend_period_label}) and you have {exposure_str}. "
                    f"For a {style_label} strategy, this could be an opportunity worth exploring."
                )

    # ── Sub-scores (4 × 25 = 100) ────────────────────────────────────────
    sizing_score = calculate_sizing_score(positions, total_value, pos_high_pct, pos_med_pct)
    div_score = calculate_diversification_score(
        sector_values_analysis, total_value, n, sector_high_pct, sector_med_pct
    )
    risk_score = calculate_risk_score(
        sector_values_analysis, total_value, is_safe, market_trends, investment_style
    )
    perf_score = calculate_performance_score(positions)

    # ── Conflicting bets + redundancy ─────────────────────────────────────
    conflict_issues, conflict_deduction = detect_conflicting_bets(positions)
    redundancy_issues, redundancy_deduction = detect_redundancies(positions, investment_style)
    issues.extend(conflict_issues)
    issues.extend(redundancy_issues)
    risk_score = max(0.0, risk_score - conflict_deduction)
    div_score = max(0.0, div_score - redundancy_deduction)

    score = round(sizing_score + div_score + risk_score + perf_score)
    score = max(0, min(100, score))

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

    sub_scores = {
        "sizing": {"score": round(sizing_score, 1), "grade": _sub_grade(sizing_score), "label": "Position Sizing", "max": 25},
        "diversification": {"score": round(div_score, 1), "grade": _sub_grade(div_score), "label": "Diversification", "max": 25},
        "risk": {"score": round(risk_score, 1), "grade": _sub_grade(risk_score), "label": "Risk Management", "max": 25},
        "performance": {"score": round(perf_score, 1), "grade": _sub_grade(perf_score), "label": "Performance", "max": 25},
    }

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
        "opportunities": opportunities,
        "sector_breakdown": sector_breakdown,
        "investment_style": investment_style,
        "market_trends_period": trend_period_label,
        "sub_scores": sub_scores,
    }
