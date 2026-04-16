"""
Tests for generate_sell_hold_buy — the per-position AI recommendation logic.

The Anthropic client is mocked so these run offline without API keys.
"""

import json
import pytest
from unittest.mock import patch, MagicMock, call

from services.ai.claude_client import generate_sell_hold_buy


VALID_POSITION = {
    "symbol": "VRTX",
    "sector": "Healthcare",
    "total_gain_loss_percent": 8.2,
    "total_gain_loss": 1234.56,
    "current_value": 5000.0,
    "percent_of_account": 1.6,
}

BASE_CONTEXT = {
    "total_value": 312500.0,
    "position_count": 50,
    "investment_style": "beat_the_market",
    "sector_trend": 5.0,
    "trend_period": "3-month",
    "price_performance": {"pct_30d": 3.2, "pct_90d": 12.5, "spy_30d": 1.1, "spy_90d": 8.3},
    "portfolio_fit": {"conflicts": [], "redundancies": []},
    "tax_timing": {"short_term_lots": 1, "long_term_lots": 1, "days_to_long_term": 45},
}


def _mock_claude(json_payload: dict):
    """Return a mock Anthropic response wrapping the given dict as JSON text."""
    msg = MagicMock()
    msg.content = [MagicMock(text=json.dumps(json_payload))]
    return msg


# ── Output schema ─────────────────────────────────────────────────────────────

class TestOutputSchema:
    VALID_RESPONSE = {
        "recommendation": "HOLD",
        "confidence": "MEDIUM",
        "reasoning": "Position is balanced.",
        "key_factors": ["factor A", "factor B"],
        "factor_scores": {
            "performance_trajectory": 65,
            "thesis_validity": 70,
            "portfolio_fit": 55,
            "tax_timing": 60,
        },
    }

    def test_returns_all_required_keys(self):
        with patch("services.ai.claude_client.client.messages.create",
                   return_value=_mock_claude(self.VALID_RESPONSE)):
            result = generate_sell_hold_buy(VALID_POSITION, BASE_CONTEXT)
        assert set(result.keys()) >= {"recommendation", "confidence", "reasoning", "key_factors", "factor_scores"}

    def test_factor_scores_has_all_four_factors(self):
        with patch("services.ai.claude_client.client.messages.create",
                   return_value=_mock_claude(self.VALID_RESPONSE)):
            result = generate_sell_hold_buy(VALID_POSITION, BASE_CONTEXT)
        fs = result.get("factor_scores", {})
        assert set(fs.keys()) >= {
            "performance_trajectory", "thesis_validity", "portfolio_fit", "tax_timing"
        }

    @pytest.mark.parametrize("rec", ["SELL", "HOLD", "BUY_MORE"])
    def test_accepts_all_valid_recommendations(self, rec):
        payload = {**self.VALID_RESPONSE, "recommendation": rec}
        with patch("services.ai.claude_client.client.messages.create",
                   return_value=_mock_claude(payload)):
            result = generate_sell_hold_buy(VALID_POSITION, BASE_CONTEXT)
        assert result["recommendation"] == rec

    @pytest.mark.parametrize("conf", ["HIGH", "MEDIUM", "LOW"])
    def test_accepts_all_valid_confidences(self, conf):
        payload = {**self.VALID_RESPONSE, "confidence": conf}
        with patch("services.ai.claude_client.client.messages.create",
                   return_value=_mock_claude(payload)):
            result = generate_sell_hold_buy(VALID_POSITION, BASE_CONTEXT)
        assert result["confidence"] == conf


# ── Null sector trend ─────────────────────────────────────────────────────────

class TestNullSectorTrend:
    """Regression: when sector_trend is None (e.g. 'Health Care' not normalised before
    the ETF lookup), the prompt must still produce a valid recommendation — not crash
    or silently return garbage."""

    NULL_TREND_CONTEXT = {**BASE_CONTEXT, "sector_trend": None}
    RESPONSE = {
        "recommendation": "HOLD",
        "confidence": "LOW",
        "reasoning": "No sector trend data available.",
        "key_factors": ["sector trend unavailable"],
    }

    def test_returns_valid_recommendation_when_sector_trend_is_none(self):
        with patch("services.ai.claude_client.client.messages.create",
                   return_value=_mock_claude(self.RESPONSE)):
            result = generate_sell_hold_buy(VALID_POSITION, self.NULL_TREND_CONTEXT)
        assert result["recommendation"] in ("SELL", "HOLD", "BUY_MORE")

    def test_prompt_says_unavailable_when_sector_trend_is_none(self):
        """The prompt must tell Claude the sector trend is unavailable — not omit it —
        so Claude doesn't hallucinate a trend."""
        captured = []

        def capture(**kwargs):
            captured.append(kwargs["messages"][0]["content"])
            return _mock_claude(self.RESPONSE)

        with patch("services.ai.claude_client.client.messages.create", side_effect=capture):
            generate_sell_hold_buy(VALID_POSITION, self.NULL_TREND_CONTEXT)

        assert captured, "client.messages.create was never called"
        prompt = captured[0]
        assert "unavailable" in prompt.lower(), (
            "When sector_trend is None the prompt must say the trend is unavailable "
            "so Claude doesn't invent data."
        )

    def test_prompt_includes_sector_trend_value_when_present(self):
        """When sector_trend IS available it must appear in the prompt."""
        captured = []

        def capture(**kwargs):
            captured.append(kwargs["messages"][0]["content"])
            return _mock_claude({
                "recommendation": "BUY_MORE", "confidence": "HIGH",
                "reasoning": "Sector up 5%.", "key_factors": [],
            })

        with patch("services.ai.claude_client.client.messages.create", side_effect=capture):
            generate_sell_hold_buy(VALID_POSITION, {**BASE_CONTEXT, "sector_trend": 5.0})

        prompt = captured[0]
        assert "+5.0%" in prompt or "5.0%" in prompt, (
            "Sector trend value must appear in the prompt so Claude can reference it."
        )


# ── Malformed JSON fallback ────────────────────────────────────────────────────

class TestMalformedJsonFallback:
    def test_sell_keyword_in_raw_text_falls_back_to_sell(self):
        msg = MagicMock()
        msg.content = [MagicMock(text="I think you should SELL this position.")]
        with patch("services.ai.claude_client.client.messages.create", return_value=msg):
            result = generate_sell_hold_buy(VALID_POSITION, BASE_CONTEXT)
        assert result["recommendation"] == "SELL"
        assert result["confidence"] == "LOW"

    def test_buy_more_keyword_falls_back_to_buy_more(self):
        msg = MagicMock()
        msg.content = [MagicMock(text="BUY MORE shares of this.")]
        with patch("services.ai.claude_client.client.messages.create", return_value=msg):
            result = generate_sell_hold_buy(VALID_POSITION, BASE_CONTEXT)
        assert result["recommendation"] == "BUY_MORE"

    def test_no_keyword_falls_back_to_hold(self):
        msg = MagicMock()
        msg.content = [MagicMock(text="This is a confusing response with no signal.")]
        with patch("services.ai.claude_client.client.messages.create", return_value=msg):
            result = generate_sell_hold_buy(VALID_POSITION, BASE_CONTEXT)
        assert result["recommendation"] == "HOLD"

    def test_markdown_fenced_json_is_parsed(self):
        payload = {
            "recommendation": "BUY_MORE", "confidence": "HIGH",
            "reasoning": "Good signal.", "key_factors": ["underweight"],
        }
        fenced = f"```json\n{json.dumps(payload)}\n```"
        msg = MagicMock()
        msg.content = [MagicMock(text=fenced)]
        with patch("services.ai.claude_client.client.messages.create", return_value=msg):
            result = generate_sell_hold_buy(VALID_POSITION, BASE_CONTEXT)
        assert result["recommendation"] == "BUY_MORE"
        assert result["reasoning"] == "Good signal."


# ── Position weight in prompt ─────────────────────────────────────────────────

class TestPromptContent:
    RESPONSE = {
        "recommendation": "BUY_MORE", "confidence": "MEDIUM",
        "reasoning": "Underweight.", "key_factors": [],
    }

    def _capture_prompt(self, position, context):
        captured = []

        def capture(**kwargs):
            captured.append(kwargs["messages"][0]["content"])
            return _mock_claude(self.RESPONSE)

        with patch("services.ai.claude_client.client.messages.create", side_effect=capture):
            generate_sell_hold_buy(position, context)

        return captured[0]

    def test_underweight_label_in_prompt(self):
        pos = {**VALID_POSITION, "percent_of_account": 1.6}
        ctx = {**BASE_CONTEXT, "position_count": 50}  # avg = 2.0%
        prompt = self._capture_prompt(pos, ctx)
        assert "underweight" in prompt.lower()

    def test_overweight_label_in_prompt(self):
        pos = {**VALID_POSITION, "percent_of_account": 8.0}
        ctx = {**BASE_CONTEXT, "position_count": 50}  # avg = 2.0%
        prompt = self._capture_prompt(pos, ctx)
        assert "overweight" in prompt.lower()

    def test_symbol_appears_in_prompt(self):
        prompt = self._capture_prompt(VALID_POSITION, BASE_CONTEXT)
        assert "VRTX" in prompt

    def test_sector_appears_in_prompt(self):
        prompt = self._capture_prompt(VALID_POSITION, BASE_CONTEXT)
        assert "Healthcare" in prompt

    def test_30d_return_in_prompt_when_available(self):
        ctx = {**BASE_CONTEXT, "price_performance": {"pct_30d": 3.2, "pct_90d": 12.5, "spy_30d": 1.1, "spy_90d": 8.3}}
        prompt = self._capture_prompt(VALID_POSITION, ctx)
        assert "30-day" in prompt and "3.2%" in prompt

    def test_spy_comparison_in_prompt(self):
        ctx = {**BASE_CONTEXT, "price_performance": {"pct_30d": 3.2, "pct_90d": 12.5, "spy_30d": 1.1, "spy_90d": 8.3}}
        prompt = self._capture_prompt(VALID_POSITION, ctx)
        assert "S&P 500" in prompt

    def test_conflicts_in_prompt_when_present(self):
        ctx = {**BASE_CONTEXT, "portfolio_fit": {"conflicts": ["Social Media (alongside META)"], "redundancies": []}}
        prompt = self._capture_prompt(VALID_POSITION, ctx)
        assert "Social Media" in prompt

    def test_tax_timing_short_term_in_prompt(self):
        ctx = {**BASE_CONTEXT, "tax_timing": {"short_term_lots": 2, "long_term_lots": 0, "days_to_long_term": 30}}
        prompt = self._capture_prompt(VALID_POSITION, ctx)
        assert "short-term" in prompt.lower()

    def test_four_factor_headers_in_prompt(self):
        prompt = self._capture_prompt(VALID_POSITION, BASE_CONTEXT)
        assert "PERFORMANCE TRAJECTORY" in prompt
        assert "THESIS VALIDITY" in prompt
        assert "PORTFOLIO FIT" in prompt
        assert "TAX & TIMING" in prompt
