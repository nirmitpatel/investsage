"""
Portfolio Health Score calculator.

Scores 0-100 based on:
  - Diversification across sectors (40 pts)
  - Position sizing — no single position too large (35 pts)
  - Number of positions (15 pts)
  - Overall performance (10 pts)
"""

from typing import List, Dict, Any
from collections import defaultdict


def calculate_health_score(positions: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not positions:
        return {
            "score": 0,
            "grade": "N/A",
            "total_value": 0,
            "total_gain_loss": 0,
            "position_count": 0,
            "issues": [],
        }

    total_value = sum(p.get("current_value") or 0 for p in positions)
    total_gain_loss = sum(p.get("total_gain_loss") or 0 for p in positions)
    issues = []
    deductions = 0

    # ── Sector concentration ──────────────────────────────────────────
    sector_values: Dict[str, float] = defaultdict(float)
    for p in positions:
        val = p.get("current_value") or 0
        sector = p.get("sector") or "Unknown"
        sector_values[sector] += val

    if total_value > 0:
        for sector, val in sector_values.items():
            pct = (val / total_value) * 100
            if pct > 50:
                deductions += 25
                issues.append({
                    "type": "sector_concentration",
                    "severity": "high",
                    "message": f"{sector} makes up {pct:.0f}% of your portfolio — heavy concentration in one sector increases risk significantly.",
                })
            elif pct > 35:
                deductions += 12
                issues.append({
                    "type": "sector_concentration",
                    "severity": "medium",
                    "message": f"{sector} makes up {pct:.0f}% of your portfolio. Consider spreading across more sectors.",
                })

    # ── Individual position sizing ────────────────────────────────────
    for p in positions:
        val = p.get("current_value") or 0
        if total_value > 0:
            pct = (val / total_value) * 100
            if pct > 20:
                deductions += 15
                issues.append({
                    "type": "position_concentration",
                    "severity": "high",
                    "message": f"{p['symbol']} is {pct:.0f}% of your portfolio. A single position this large creates significant downside risk.",
                })
            elif pct > 12:
                deductions += 7
                issues.append({
                    "type": "position_concentration",
                    "severity": "medium",
                    "message": f"{p['symbol']} is {pct:.0f}% of your portfolio. Consider trimming to reduce concentration.",
                })

    # ── Number of positions ───────────────────────────────────────────
    n = len(positions)
    if n < 5:
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
        issues.append({
            "type": "majority_losing",
            "severity": "medium",
            "message": f"{len(losing)} of {n} positions are at a loss. Consider reviewing underperformers.",
        })

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

    return {
        "score": score,
        "grade": grade,
        "total_value": round(total_value, 2),
        "total_gain_loss": round(total_gain_loss, 2),
        "position_count": n,
        "issues": issues,
    }
