"""
Claude API integration for plain English analysis.
Uses structured prompts — Claude receives clean data, not raw financials.
"""

import anthropic
import json
from typing import List, Dict, Any, Optional
from config import settings

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

# Use Haiku for fast, cheap per-request summaries
FAST_MODEL = "claude-haiku-4-5-20251001"
# Use Sonnet for deeper analysis
ANALYSIS_MODEL = "claude-sonnet-4-6"


def explain_tax_opportunity(opportunity: dict) -> str:
    prompt = f"""You are a portfolio analyst explaining a tax-loss harvesting opportunity to an investor.

Position: {opportunity['symbol']} ({opportunity.get('sector', 'Unknown')})
Unrealized loss: ${opportunity['unrealized_loss']:,.2f}
Estimated tax savings: ${opportunity['tax_savings_estimate']:,.2f}
Holding period: {opportunity['holding_period_label']} ({opportunity.get('days_held', '?')} days held)
{"Days until long-term: " + str(opportunity['days_until_lt']) if opportunity.get('days_until_lt') else "Already long-term"}
Suggested replacement: {opportunity['replacement_suggestion']}

Write 2-3 sentences explaining: (1) the tax benefit of harvesting this loss now, (2) whether they should wait for long-term treatment if close, (3) the replacement ETF to maintain exposure and avoid wash-sale rules. Be specific about dollar savings. Plain English, no jargon."""

    message = client.messages.create(
        model=FAST_MODEL,
        max_tokens=250,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def analyze_portfolio(
    positions: List[Dict[str, Any]],
    health: Dict[str, Any],
    tax_summary: Optional[Dict[str, Any]] = None,
) -> str:
    """Generate a holistic plain-English portfolio summary using AI."""
    style = health.get("investment_style") or "not set"
    score = health.get("score", 0)
    grade = health.get("grade", "N/A")
    issues = health.get("issues", [])
    sector_breakdown = health.get("sector_breakdown", [])

    top_sectors = [f"{s['sector']} ({s['pct']}%)" for s in sector_breakdown[:4]]
    issue_summaries = [i["message"][:120] for i in issues[:3]]

    tax_line = ""
    if tax_summary and tax_summary.get("opportunity_count", 0) > 0:
        tax_line = f"\nTax opportunities: {tax_summary['opportunity_count']} positions with harvestable losses totaling ${tax_summary['total_harvestable_loss']:,.0f} (est. ${tax_summary['total_tax_savings_estimate']:,.0f} savings)"

    prompt = f"""You are a portfolio analyst giving a brief, actionable summary to an investor.

Portfolio snapshot:
- Health score: {score}/100 (Grade {grade})
- Investment style: {style}
- Positions: {health.get('position_count', len(positions))}
- Total value: ${health.get('total_value', 0):,.2f}
- Total return: ${health.get('total_gain_loss', 0):+,.2f}
- Top sectors: {', '.join(top_sectors) if top_sectors else 'N/A'}
- Key issues: {'; '.join(issue_summaries) if issue_summaries else 'None'}
{tax_line}

Write a 3-4 sentence portfolio summary covering: (1) overall portfolio health in plain terms, (2) the biggest risk or strength, (3) one specific action to consider. Be direct and specific. No generic advice."""

    message = client.messages.create(
        model=ANALYSIS_MODEL,
        max_tokens=350,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def generate_sell_hold_buy(position: dict, portfolio_context: dict) -> dict:
    sector = position.get('sector', 'Unknown')
    gain_pct = position.get('total_gain_loss_percent', 0) or 0
    pos_weight = position.get('percent_of_account', 0) or 0
    n = portfolio_context.get('position_count', 1) or 1
    avg_weight = round(100 / n, 1)
    style = portfolio_context.get('investment_style', 'not set')
    sector_trend = portfolio_context.get('sector_trend')
    trend_period = portfolio_context.get('trend_period', '3-month')

    sector_line = (
        f"Sector {trend_period} trend: {sector_trend:+.1f}% (market benchmark for {sector})"
        if sector_trend is not None
        else f"Sector {trend_period} trend: unavailable"
    )
    weight_line = (
        f"Position weight: {pos_weight:.1f}% of portfolio "
        f"({'underweight' if pos_weight < avg_weight else 'overweight'} vs avg {avg_weight:.1f}% per position)"
    )
    vs_sector = ""
    if sector_trend is not None:
        diff = gain_pct - sector_trend
        vs_sector = f"\nPosition vs sector: {'outperforming' if diff >= 0 else 'underperforming'} sector benchmark by {abs(diff):.1f}%"

    prompt = f"""You are analyzing a stock position for an investor. Based on the data below, provide a Sell, Hold, or Buy More recommendation.

Position: {position['symbol']}
Sector: {sector}
Current gain/loss (all-time): {gain_pct:+.1f}%
Current value: ${position.get('current_value', 0):,.2f}
{weight_line}
{sector_line}{vs_sector}

Portfolio context:
- Total value: ${portfolio_context.get('total_value', 0):,.2f}
- Positions: {n}
- Investment style: {style}

Use BUY_MORE when: sector is trending positively, position is underweight, and the stock is holding up well or outperforming its sector.
Use SELL when: position is significantly underperforming its sector, or overweight in a declining sector.
Use HOLD when: neither a clear buy nor sell signal.

Respond in this exact JSON format:
{{
  "recommendation": "SELL" | "HOLD" | "BUY_MORE",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "reasoning": "2-3 sentence plain English explanation referencing the sector trend and position weight",
  "key_factors": ["factor 1", "factor 2", "factor 3"]
}}"""

    message = client.messages.create(
        model=FAST_MODEL,
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Try to salvage a recommendation keyword from the raw text
        upper = raw.upper()
        if "SELL" in upper:
            rec = "SELL"
        elif "BUY_MORE" in upper or "BUY MORE" in upper:
            rec = "BUY_MORE"
        else:
            rec = "HOLD"
        return {
            "recommendation": rec,
            "confidence": "LOW",
            "reasoning": raw,
            "key_factors": [],
        }
