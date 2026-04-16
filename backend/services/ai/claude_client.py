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


def generate_rebalance_suggestion(position: dict, portfolio_context: dict) -> dict:
    """Generate a rebalancing recommendation for a 401k/retirement account position.
    Never recommends SELL — only REDUCE, MAINTAIN, or INCREASE allocation."""
    sector = position.get('sector', 'Unknown')
    gain_pct = position.get('total_gain_loss_percent', 0) or 0
    pos_weight = position.get('percent_of_account', 0) or 0
    n = portfolio_context.get('position_count', 1) or 1
    avg_weight = round(100 / n, 1)
    style = portfolio_context.get('investment_style', 'not set')
    sector_trend = portfolio_context.get('sector_trend')
    trend_period = portfolio_context.get('trend_period', '3-month')
    account_type = portfolio_context.get('account_type', '401k')

    sector_line = (
        f"Sector {trend_period} trend: {sector_trend:+.1f}% (market benchmark for {sector})"
        if sector_trend is not None
        else f"Sector {trend_period} trend: unavailable"
    )
    weight_line = (
        f"Position weight: {pos_weight:.1f}% of portfolio "
        f"({'underweight' if pos_weight < avg_weight else 'overweight'} vs avg {avg_weight:.1f}% per position)"
    )

    prompt = f"""You are analyzing a {account_type.replace('_', ' ').upper()} retirement account position for an investor. Retirement accounts have limited fund options and no tax implications on trades — the right action is always about portfolio balance, not selling.

Position: {position['symbol']}
Sector: {sector}
Current gain/loss (all-time): {gain_pct:+.1f}%
Current value: ${position.get('current_value', 0):,.2f}
{weight_line}
{sector_line}

Portfolio context:
- Total value: ${portfolio_context.get('total_value', 0):,.2f}
- Positions: {n}
- Investment style: {style}

Use REDUCE when: position is significantly overweight vs the average (more than 2x the average weight), creating concentration risk inconsistent with the investment style.
Use INCREASE when: position is meaningfully underweight and sector trend supports it.
Use MAINTAIN when: allocation is roughly in balance or no strong signal either way.

DO NOT use SELL. This is a retirement account — frame everything as rebalancing, not selling.
Explain the specific allocation imbalance and what the investor should do within their available fund options.

Respond in this exact JSON format:
{{
  "recommendation": "REDUCE" | "MAINTAIN" | "INCREASE",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "reasoning": "2-3 sentence plain English explanation focused on allocation balance and retirement account context",
  "key_factors": ["factor 1", "factor 2", "factor 3"]
}}"""

    message = client.messages.create(
        model=FAST_MODEL,
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        upper = raw.upper()
        if "REDUCE" in upper:
            rec = "REDUCE"
        elif "INCREASE" in upper:
            rec = "INCREASE"
        else:
            rec = "MAINTAIN"
        return {
            "recommendation": rec,
            "confidence": "LOW",
            "reasoning": raw,
            "key_factors": [],
        }


def _format_signals_section(fmp: dict, current_price: float | None) -> str:
    """
    Format live market intelligence as pre-interpreted signals.
    Research shows Claude performs significantly better with labelled signals
    than raw numbers — e.g. 'Bullish (42 Buy / 3 Sell)' vs just the counts.
    """
    if not fmp:
        return ""

    lines = []

    # --- Analyst sentiment (most important signal) ---
    consensus = fmp.get("analyst_consensus")
    buys = fmp.get("analyst_buy_count")
    holds = fmp.get("analyst_hold_count")
    sells = fmp.get("analyst_sell_count")
    if consensus and buys is not None:
        total = (buys or 0) + (holds or 0) + (sells or 0)
        lines.append(f"Analyst sentiment: {consensus} ({buys} Buy / {holds} Hold / {sells} Sell — {total} analysts)")

    # --- Price target with upside/downside interpretation ---
    pt = fmp.get("price_target")
    if pt and current_price:
        upside = (pt - current_price) / current_price * 100
        direction = "upside" if upside >= 0 else "downside"
        pt_range = ""
        lo, hi = fmp.get("price_target_low"), fmp.get("price_target_high")
        if lo and hi:
            pt_range = f" (range ${lo:,.0f}–${hi:,.0f})"
        lines.append(f"Price target: ${pt:,.2f} — {upside:+.1f}% {direction} from current{pt_range}")
    elif pt:
        lines.append(f"Price target: ${pt:,.2f}")

    # --- Earnings result as plain verdict ---
    surprise = fmp.get("last_earnings_surprise_pct")
    if surprise is not None:
        if surprise >= 5:
            verdict = f"Strong beat (+{surprise:.1f}%)"
        elif surprise >= 0:
            verdict = f"Slight beat (+{surprise:.1f}%)"
        elif surprise >= -5:
            verdict = f"Slight miss ({surprise:.1f}%)"
        else:
            verdict = f"Missed badly ({surprise:.1f}%)"
        lines.append(f"Last earnings: {verdict}")

    # --- Valuation interpretation ---
    pe = fmp.get("pe_ratio_ttm")
    rev_growth = fmp.get("revenue_growth_yoy")
    margin = fmp.get("profit_margin")
    roe = fmp.get("roe")
    val_parts = []
    if pe:
        val_parts.append(f"P/E {pe}x TTM")
    if rev_growth is not None:
        growth_label = "strong" if rev_growth >= 15 else ("moderate" if rev_growth >= 5 else "slow")
        val_parts.append(f"revenue growth {rev_growth:+.1f}% YoY ({growth_label})")
    if margin is not None:
        val_parts.append(f"net margin {margin:.1f}%")
    if roe is not None:
        val_parts.append(f"ROE {roe:.1f}%")
    if val_parts:
        lines.append("Fundamentals: " + " | ".join(val_parts))

    # --- News sentiment ---
    sentiment_label = fmp.get("news_sentiment_label")
    sentiment_score = fmp.get("news_sentiment_score")
    article_count = fmp.get("news_article_count")
    if sentiment_label and sentiment_score is not None:
        lines.append(f"News sentiment: {sentiment_label} ({sentiment_score:+.2f} avg across {article_count} recent articles)")

    if not lines:
        return ""
    return "\nLive market signals:\n" + "\n".join(f"- {l}" for l in lines)


def _format_purchase_pattern_section(pattern_data: dict) -> str:
    """Format purchase pattern as a prompt section."""
    description = pattern_data.get("description")
    if not description:
        return ""
    count = pattern_data.get("purchase_count", 0)
    if count < 2:
        return ""
    return f"\nPurchase pattern:\n- {description}"


def generate_sell_hold_buy(position: dict, portfolio_context: dict) -> dict:
    sector = position.get('sector', 'Unknown')
    gain_pct = position.get('total_gain_loss_percent', 0) or 0
    gain_abs = position.get('total_gain_loss', 0) or 0
    pos_weight = position.get('percent_of_account', 0) or 0
    n = portfolio_context.get('position_count', 1) or 1
    avg_weight = round(100 / n, 1)
    style = portfolio_context.get('investment_style', 'not set')
    sector_trend = portfolio_context.get('sector_trend')
    trend_period = portfolio_context.get('trend_period', '3-month')
    company_name = position.get('description') or position['symbol']
    fmp = portfolio_context.get('fmp') or {}
    purchase_pattern = portfolio_context.get('purchase_pattern') or {}

    sector_line = (
        f"Sector {trend_period} trend: {sector_trend:+.1f}% (current market environment for {sector} sector)"
        if sector_trend is not None
        else f"Sector {trend_period} trend: data unavailable"
    )
    weight_line = (
        f"Position weight: {pos_weight:.1f}% of portfolio "
        f"({'underweight' if pos_weight < avg_weight else 'overweight'} vs {avg_weight:.1f}% equal-weight average)"
    )
    current_price = position.get("current_price") or position.get("last_price")
    signals_section = _format_signals_section(fmp, current_price)
    pattern_section = _format_purchase_pattern_section(purchase_pattern)

    is_failed_averaging_down = purchase_pattern.get("pattern") == "failed_averaging_down"

    style_guidance = {
        "long_game": "This investor has a 10+ year horizon. Quality companies with durable competitive advantages should be held through volatility — only recommend SELL if the company's long-term thesis is fundamentally broken.",
        "beat_the_market": "This investor wants to outperform the S&P 500. Favor positions in companies with strong growth momentum and sector tailwinds. Consider trimming laggards and adding to leaders.",
        "play_it_safe": "This investor prioritizes capital preservation. Flag meaningful downside risk, over-concentration, or speculative positions. Dividend stability and defensive characteristics matter.",
    }.get(style, "")

    has_live_data = bool(signals_section)

    prompt = f"""You are a professional financial analyst. Give a considered Sell, Hold, or Buy More recommendation for this position.

Company: {company_name} ({position['symbol']})
Sector: {sector}

Position details:
- All-time personal return: {gain_pct:+.1f}% (${gain_abs:+,.2f} unrealized)
- Current value: ${position.get('current_value', 0):,.2f}
- {weight_line}
- {sector_line}
{signals_section}{pattern_section}
Portfolio context:
- Investment style: {style}
- Total portfolio: ${portfolio_context.get('total_value', 0):,.2f} across {n} positions
{f"- Style guidance: {style_guidance}" if style_guidance else ""}

IMPORTANT:
1. Personal return % is from the investor's purchase date — do NOT compare it to the sector trend period. Different timeframes, not comparable.
2. Sector trend shows current market environment (tailwind or headwind) only.
{"3. Live market signals above are current data — weight them heavily in your decision." if has_live_data else "3. No live data available — rely on your knowledge of this company's competitive moat, growth trajectory, and market position."}
4. Being profitable (positive return) is NOT a reason to sell.
{"5. FAILED AVERAGING DOWN detected — the investor has repeatedly bought at lower prices and is now below all purchase prices. This is a critical signal that the investment thesis may be broken. Weight strongly toward SELL unless there is a compelling fundamental reason to hold." if is_failed_averaging_down else ""}

Decision criteria:
- BUY_MORE: Strong fundamentals or analyst consensus + favorable sector + position underweight
- HOLD: Solid company, neutral-to-positive analyst view, no clear reason to exit
- SELL: Analysts skewing negative, thesis broken, or severely overweight in deteriorating sector

Respond in this exact JSON format:
{{
  "recommendation": "SELL" | "HOLD" | "BUY_MORE",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "reasoning": "2-3 sentences citing specific signals (analyst count, earnings result, price target upside, purchase pattern) where available",
  "key_factors": ["factor 1", "factor 2", "factor 3"]
}}"""

    message = client.messages.create(
        model=ANALYSIS_MODEL,
        max_tokens=500,
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
