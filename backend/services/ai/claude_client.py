"""
Claude API integration for plain English analysis.
Uses structured prompts — Claude receives clean data, not raw financials.
"""

import anthropic
from config import settings

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
MODEL = "claude-opus-4-6"


def explain_tax_opportunity(opportunity: dict) -> str:
    prompt = f"""You are a portfolio analyst explaining a tax-loss harvesting opportunity to an investor.

Position: {opportunity['symbol']}
Unrealized loss: ${abs(opportunity['unrealized_loss']):.2f}
Estimated tax savings: ${opportunity['tax_savings']:.2f}
Holding period: {"Short-term (taxed as income)" if opportunity['is_short_term'] else "Long-term (taxed at capital gains rate)"}
Days until long-term transition: {opportunity.get('days_until_lt', 'N/A')}

Write 2-3 sentences explaining why selling this position makes sense from a tax perspective. Be specific about the dollar savings. Plain English, no jargon."""

    message = client.messages.create(
        model=MODEL,
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def explain_health_issue(issue: dict) -> str:
    prompt = f"""You are a portfolio analyst explaining a portfolio issue to an investor.

Issue type: {issue['type']}
Details: {issue['details']}

Write 2-3 sentences explaining what this issue means for their portfolio and what they should consider doing. Plain English, no jargon."""

    message = client.messages.create(
        model=MODEL,
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def generate_sell_hold_buy(position: dict, portfolio_context: dict) -> dict:
    prompt = f"""You are analyzing a stock position for an investor. Based on the data below, provide a Sell, Hold, or Buy More recommendation.

Position: {position['symbol']}
Current gain/loss: {position['total_gain_loss_percent']:.1f}%
Current value: ${position['current_value']:.2f}
Percent of portfolio: {position['percent_of_account']:.1f}%
Sector: {position.get('sector', 'Unknown')}
30-day price trend: {position.get('trend_30d', {}).get('change_pct', 'N/A')}%
90-day price trend: {position.get('trend_90d', {}).get('change_pct', 'N/A')}%
Analyst recommendation: {position.get('recommendation', 'N/A')}

Portfolio context:
- Total portfolio value: ${portfolio_context.get('total_value', 0):.2f}
- Number of positions: {portfolio_context.get('position_count', 0)}

Respond in this exact JSON format:
{{
  "recommendation": "SELL" | "HOLD" | "BUY_MORE",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "reasoning": "2-3 sentence plain English explanation",
  "key_factors": ["factor 1", "factor 2", "factor 3"]
}}"""

    message = client.messages.create(
        model=MODEL,
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )

    import json
    try:
        return json.loads(message.content[0].text)
    except json.JSONDecodeError:
        return {
            "recommendation": "HOLD",
            "confidence": "LOW",
            "reasoning": message.content[0].text,
            "key_factors": [],
        }
