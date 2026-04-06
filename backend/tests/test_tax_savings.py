import pytest
from freezegun import freeze_time
from services.tax_savings import (
    find_tax_opportunities,
    summarize_tax_opportunities,
    SHORT_TERM_RATE,
    LONG_TERM_RATE,
    SECTOR_REPLACEMENTS,
    DEFAULT_REPLACEMENT,
)

FROZEN_DATE = "2025-06-15"


# ── find_tax_opportunities ────────────────────────────────────────────────────

class TestFindTaxOpportunities:
    @freeze_time(FROZEN_DATE)
    def test_gain_position_excluded(self, make_lot):
        lot = make_lot("AAPL", 10, 100, "2024-01-01")  # cost 1000
        result = find_tax_opportunities([lot], {"AAPL": 120})  # value 1200 → gain
        assert result == []

    @freeze_time(FROZEN_DATE)
    def test_break_even_excluded(self, make_lot):
        lot = make_lot("AAPL", 10, 100, "2024-01-01")
        result = find_tax_opportunities([lot], {"AAPL": 100})
        assert result == []

    @freeze_time(FROZEN_DATE)
    def test_short_term_loss(self, make_lot):
        # Bought 100 days ago → short-term
        lot = make_lot("AAPL", 10, 100, "2025-03-07")  # 100 days before 2025-06-15
        result = find_tax_opportunities([lot], {"AAPL": 80})
        assert len(result) == 1
        opp = result[0]
        assert opp["is_short_term"] is True
        assert opp["tax_rate_used"] == SHORT_TERM_RATE
        assert opp["unrealized_loss"] == pytest.approx(200)
        assert opp["tax_savings_estimate"] == pytest.approx(200 * SHORT_TERM_RATE)

    @freeze_time(FROZEN_DATE)
    def test_long_term_loss(self, make_lot):
        # Bought 400 days ago → long-term
        lot = make_lot("AAPL", 10, 100, "2024-05-11")  # ~400 days before 2025-06-15
        result = find_tax_opportunities([lot], {"AAPL": 80})
        assert len(result) == 1
        opp = result[0]
        assert opp["is_short_term"] is False
        assert opp["days_until_lt"] is None
        assert opp["tax_rate_used"] == LONG_TERM_RATE
        assert opp["tax_savings_estimate"] == pytest.approx(200 * LONG_TERM_RATE)

    @freeze_time(FROZEN_DATE)
    def test_days_until_lt_calculated(self, make_lot):
        # Held 300 days → 65 days until long-term
        lot = make_lot("AAPL", 10, 100, "2025-08-18")  # wrong, need 300 days before 2025-06-15
        # 2025-06-15 - 300 days = 2024-08-19
        lot = make_lot("AAPL", 10, 100, "2024-08-19")
        result = find_tax_opportunities([lot], {"AAPL": 80})
        opp = result[0]
        assert opp["is_short_term"] is True
        assert opp["days_until_lt"] == 65

    @freeze_time(FROZEN_DATE)
    def test_urgency_high_within_30_days(self, make_lot):
        # Held 340 days → 25 days until long-term
        lot = make_lot("AAPL", 10, 100, "2024-07-10")
        result = find_tax_opportunities([lot], {"AAPL": 80})
        assert result[0]["urgency"] == "high"

    @freeze_time(FROZEN_DATE)
    def test_urgency_medium_within_90_days(self, make_lot):
        # Held 310 days → 55 days until long-term
        lot = make_lot("AAPL", 10, 100, "2024-08-08")
        result = find_tax_opportunities([lot], {"AAPL": 80})
        assert result[0]["urgency"] == "medium"

    @freeze_time(FROZEN_DATE)
    def test_no_urgency_when_long_term(self, make_lot):
        lot = make_lot("AAPL", 10, 100, "2024-01-01")  # long-term
        result = find_tax_opportunities([lot], {"AAPL": 80})
        assert result[0]["urgency"] is None

    @freeze_time(FROZEN_DATE)
    def test_no_urgency_when_far_from_lt(self, make_lot):
        # Held 100 days → 265 days until long-term → no urgency flag
        lot = make_lot("AAPL", 10, 100, "2025-03-07")
        result = find_tax_opportunities([lot], {"AAPL": 80})
        assert result[0]["urgency"] is None

    @freeze_time(FROZEN_DATE)
    def test_missing_current_price_skipped(self, make_lot):
        lot = make_lot("AAPL", 10, 100, "2025-03-07")
        result = find_tax_opportunities([lot], {})
        assert result == []

    @freeze_time(FROZEN_DATE)
    def test_zero_shares_skipped(self, make_lot):
        lot = make_lot("AAPL", 0, 100, "2025-03-07")
        result = find_tax_opportunities([lot], {"AAPL": 80})
        assert result == []

    @freeze_time(FROZEN_DATE)
    def test_no_purchase_date_treated_as_long_term(self, make_lot):
        lot = make_lot("AAPL", 10, 100, None)
        result = find_tax_opportunities([lot], {"AAPL": 80})
        assert result[0]["is_short_term"] is False
        assert result[0]["days_held"] is None

    @freeze_time(FROZEN_DATE)
    def test_sector_replacement_known(self, make_lot):
        lot = make_lot("AAPL", 10, 100, "2025-03-07")
        result = find_tax_opportunities([lot], {"AAPL": 80}, sectors={"AAPL": "Technology"})
        assert result[0]["replacement_suggestion"] == SECTOR_REPLACEMENTS["Technology"]

    @freeze_time(FROZEN_DATE)
    def test_sector_replacement_unknown(self, make_lot):
        lot = make_lot("XYZ", 10, 100, "2025-03-07")
        result = find_tax_opportunities([lot], {"XYZ": 80}, sectors={"XYZ": "UnknownSector"})
        assert result[0]["replacement_suggestion"] == DEFAULT_REPLACEMENT

    @freeze_time(FROZEN_DATE)
    def test_sorted_by_tax_savings_descending(self, make_lot):
        lots = [
            make_lot("SMALL", 10, 100, "2025-03-07"),  # loss $50 → smaller savings
            make_lot("BIG",   10, 200, "2025-03-07"),  # loss $500 → larger savings
        ]
        prices = {"SMALL": 95, "BIG": 150}
        result = find_tax_opportunities(lots, prices)
        assert result[0]["symbol"] == "BIG"
        assert result[1]["symbol"] == "SMALL"

    @freeze_time(FROZEN_DATE)
    def test_explicit_cost_basis_used(self, make_lot):
        # cost_basis provided explicitly, not shares * price
        lot = make_lot("AAPL", 10, 100, "2025-03-07", cost_basis=1200)
        result = find_tax_opportunities([lot], {"AAPL": 80})
        # current_value = 10 * 80 = 800; loss = 1200 - 800 = 400
        assert result[0]["unrealized_loss"] == pytest.approx(400)


# ── summarize_tax_opportunities ───────────────────────────────────────────────

class TestSummarizeTaxOpportunities:
    def test_empty_list(self):
        result = summarize_tax_opportunities([])
        assert result["opportunity_count"] == 0
        assert result["total_harvestable_loss"] == 0
        assert result["total_tax_savings_estimate"] == 0
        assert result["short_term_count"] == 0
        assert result["long_term_count"] == 0
        assert result["urgent_count"] == 0

    def test_counts_and_totals(self):
        opps = [
            {"unrealized_loss": 100, "tax_savings_estimate": 37,  "is_short_term": True,  "urgency": "high"},
            {"unrealized_loss": 200, "tax_savings_estimate": 40,  "is_short_term": False, "urgency": None},
            {"unrealized_loss": 50,  "tax_savings_estimate": 18.5,"is_short_term": True,  "urgency": "medium"},
        ]
        result = summarize_tax_opportunities(opps)
        assert result["opportunity_count"] == 3
        assert result["total_harvestable_loss"] == pytest.approx(350)
        assert result["total_tax_savings_estimate"] == pytest.approx(95.5)
        assert result["short_term_count"] == 2
        assert result["long_term_count"] == 1
        assert result["urgent_count"] == 1
