import pytest
from services.health_score import build_effective_sector_values, calculate_health_score


# ── build_effective_sector_values ─────────────────────────────────────────────

class TestBuildEffectiveSectorValues:
    def test_plain_stocks_only(self):
        positions = [
            {"symbol": "AAPL", "current_value": 1000, "sector": "Technology"},
            {"symbol": "JNJ",  "current_value": 500,  "sector": "Healthcare"},
        ]
        result = build_effective_sector_values(positions)
        assert result == {"Technology": 1000, "Healthcare": 500}

    def test_etf_with_known_weightings(self):
        positions = [{"symbol": "XLK", "current_value": 1000, "sector": "ETF"}]
        weightings = {"XLK": {"Technology": 0.7, "Communication Services": 0.3}}
        result = build_effective_sector_values(positions, weightings)
        assert result["Technology"] == pytest.approx(700)
        assert result["Communication Services"] == pytest.approx(300)

    def test_etf_unknown_weightings_excluded_by_default(self):
        positions = [{"symbol": "MYFUND", "current_value": 1000, "sector": "Mutual Fund"}]
        result = build_effective_sector_values(positions, {})
        assert result == {}

    def test_etf_unknown_weightings_grouped_as_other(self):
        positions = [{"symbol": "MYFUND", "current_value": 1000, "sector": "Mutual Fund"}]
        result = build_effective_sector_values(positions, {}, unknown_as_other=True)
        assert result == {"Other": 1000}

    def test_unknown_sector_stock_excluded_by_default(self):
        positions = [{"symbol": "XYZ", "current_value": 500, "sector": "Unknown"}]
        result = build_effective_sector_values(positions)
        assert result == {}

    def test_unknown_sector_stock_grouped_as_other(self):
        positions = [{"symbol": "XYZ", "current_value": 500, "sector": "Unknown"}]
        result = build_effective_sector_values(positions, unknown_as_other=True)
        assert result == {"Other": 500}

    def test_mixed_positions(self):
        positions = [
            {"symbol": "AAPL",   "current_value": 1000, "sector": "Technology"},
            {"symbol": "XLK",    "current_value": 500,  "sector": "ETF"},
            {"symbol": "MYFUND", "current_value": 200,  "sector": "Mutual Fund"},
        ]
        weightings = {"XLK": {"Technology": 1.0}}
        result = build_effective_sector_values(positions, weightings, unknown_as_other=True)
        assert result["Technology"] == pytest.approx(1500)
        assert result["Other"] == pytest.approx(200)

    def test_none_value_treated_as_zero(self):
        positions = [{"symbol": "AAPL", "current_value": None, "sector": "Technology"}]
        result = build_effective_sector_values(positions)
        assert result.get("Technology", 0) == pytest.approx(0)


# ── calculate_health_score ────────────────────────────────────────────────────

class TestCalculateHealthScore:
    def test_empty_positions(self):
        result = calculate_health_score([])
        assert result["score"] == 0
        assert result["grade"] == "N/A"
        assert result["total_value"] == 0
        assert result["position_count"] == 0
        assert result["issues"] == []

    def test_perfect_score_diverse_portfolio(self, make_position):
        # 10 positions, no concentration, all profitable
        positions = [
            make_position(f"SYM{i}", 1000, f"Sector{i}", gain_loss=100)
            for i in range(10)
        ]
        result = calculate_health_score(positions)
        assert result["score"] == 100
        assert result["grade"] == "A"
        assert result["issues"] == []

    def test_single_position_concentration(self, make_position):
        # One individual stock = 100% of portfolio → high severity
        positions = [make_position("AAPL", 10000, "Technology", gain_loss=1000)]
        result = calculate_health_score(positions)
        types = [i["type"] for i in result["issues"]]
        assert "position_concentration" in types
        high = [i for i in result["issues"] if i["type"] == "position_concentration"]
        assert high[0]["severity"] == "high"
        assert result["score"] <= 85  # at least 15 deducted

    def test_etf_skipped_in_position_sizing(self, make_position):
        # ETF taking 100% of portfolio should NOT trigger position_concentration
        positions = [make_position("VTI", 10000, "ETF", gain_loss=500)]
        result = calculate_health_score(positions)
        types = [i["type"] for i in result["issues"]]
        assert "position_concentration" not in types

    def test_sector_concentration_high(self, make_position):
        # One sector > 50% → high severity sector issue
        positions = (
            [make_position("AAPL", 6000, "Technology")] +
            [make_position(f"O{i}", 500, f"Other{i}") for i in range(8)]
        )
        result = calculate_health_score(positions)
        types = [i["type"] for i in result["issues"]]
        assert "sector_concentration" in types
        sc = [i for i in result["issues"] if i["type"] == "sector_concentration"][0]
        assert sc["severity"] == "high"

    def test_play_it_safe_lower_sector_threshold(self, make_position):
        # 30% in one sector: above play_it_safe medium threshold (28%) but below
        # beat_the_market medium threshold (35%) — only play_it_safe should flag it.
        # Use ETFs so per-position sizing doesn't interfere.
        positions = (
            [make_position("TECH_ETF", 3000, "ETF")] +
            [make_position(f"O{i}", 1000, f"Other{i}") for i in range(7)]
        )
        fund_w = {"TECH_ETF": {"Technology": 1.0}}
        beat = calculate_health_score(positions, fund_weightings=fund_w, investment_style="beat_the_market")
        safe = calculate_health_score(positions, fund_weightings=fund_w, investment_style="play_it_safe")
        beat_sc = [i for i in beat["issues"] if i["type"] == "sector_concentration"]
        safe_sc = [i for i in safe["issues"] if i["type"] == "sector_concentration"]
        assert beat_sc == []
        assert len(safe_sc) > 0

    def test_play_it_safe_high_volatility_warning(self, make_position):
        # >50% in high-volatility sectors triggers extra deduction for play_it_safe
        positions = [
            make_position("AAPL", 3000, "Technology"),
            make_position("META", 2200, "Communication Services"),
            make_position("JNJ",  1000, "Healthcare"),
            make_position("GLD",  500,  "Basic Materials"),
            make_position("XYZ",  500,  "Utilities"),
        ]
        result = calculate_health_score(positions, investment_style="play_it_safe")
        types = [i["type"] for i in result["issues"]]
        assert "high_volatility_exposure" in types

    def test_too_few_positions(self, make_position):
        positions = [make_position(f"S{i}", 1000, f"Sec{i}") for i in range(4)]
        result = calculate_health_score(positions)
        types = [i["type"] for i in result["issues"]]
        assert "too_few_positions" in types
        assert result["score"] <= 88

    def test_few_positions(self, make_position):
        positions = [make_position(f"S{i}", 1000, f"Sec{i}") for i in range(7)]
        result = calculate_health_score(positions)
        types = [i["type"] for i in result["issues"]]
        assert "few_positions" in types
        assert "too_few_positions" not in types

    def test_majority_losing(self, make_position):
        positions = (
            [make_position(f"L{i}", 1000, f"Sec{i}", gain_loss=-100) for i in range(7)] +
            [make_position(f"G{i}", 1000, f"SecG{i}", gain_loss=100) for i in range(3)]
        )
        result = calculate_health_score(positions)
        types = [i["type"] for i in result["issues"]]
        assert "majority_losing" in types

    def test_majority_losing_long_game_message(self, make_position):
        positions = (
            [make_position(f"L{i}", 1000, "Technology", gain_loss=-100) for i in range(7)] +
            [make_position(f"G{i}", 1000, "Healthcare", gain_loss=100) for i in range(3)]
        )
        result = calculate_health_score(positions, investment_style="long_game")
        losing_issue = next(i for i in result["issues"] if i["type"] == "majority_losing")
        assert "Long-game" in losing_issue["message"]

    def test_grade_boundaries(self, make_position):
        # 10 diverse ETFs → no issues → score 100 → grade A
        base = [make_position(f"ETF{i}", 1000, "ETF") for i in range(10)]
        assert calculate_health_score(base)["grade"] == "A"

        # 4 diverse ETFs → only too_few_positions triggered (-12) → score 88 → still A
        four = [make_position(f"ETF{i}", 1000, "ETF") for i in range(4)]
        r = calculate_health_score(four)
        assert r["score"] == 100 - 12  # 88
        assert r["grade"] == "B"  # 88 < 90 threshold for A

    def test_market_trends_attached_to_sector_breakdown(self, make_position):
        positions = [
            make_position("AAPL", 5000, "Technology"),
            make_position("JNJ",  5000, "Healthcare"),
        ]
        trends = {"Technology": 12.5, "Healthcare": -2.1}
        result = calculate_health_score(positions, market_trends=trends)
        tech = next(s for s in result["sector_breakdown"] if s["sector"] == "Technology")
        health = next(s for s in result["sector_breakdown"] if s["sector"] == "Healthcare")
        assert tech["market_trend"] == 12.5
        assert health["market_trend"] == -2.1

    def test_default_trend_period_when_no_style(self):
        result = calculate_health_score([])
        assert result["market_trends_period"] == "3-month"

    def test_long_game_trend_period(self):
        result = calculate_health_score([], investment_style="long_game")
        assert result["market_trends_period"] == "2-year"

    def test_unknown_fund_produces_note(self, make_position):
        positions = [make_position("MYFUND", 2000, "Mutual Fund")]
        result = calculate_health_score(positions, fund_weightings={})
        assert len(result["notes"]) > 0
        assert "MYFUND" in result["notes"][0]

    def test_sector_breakdown_sorted_by_value_descending(self, make_position):
        positions = [
            make_position("AAPL", 3000, "Technology"),
            make_position("JNJ",  5000, "Healthcare"),
            make_position("XOM",  1000, "Energy"),
        ]
        result = calculate_health_score(positions)
        values = [s["value"] for s in result["sector_breakdown"]]
        assert values == sorted(values, reverse=True)

    def test_total_gain_loss_summed(self, make_position):
        positions = [
            make_position("AAPL", 1000, "Technology", gain_loss=200),
            make_position("JNJ",  1000, "Healthcare", gain_loss=-50),
        ]
        result = calculate_health_score(positions)
        assert result["total_gain_loss"] == pytest.approx(150)
