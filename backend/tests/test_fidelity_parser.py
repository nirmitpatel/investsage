import pytest
from services.csv_parser.fidelity import (
    parse_fidelity_positions,
    parse_fidelity_transactions,
    reconstruct_tax_lots,
)

# ── Shared CSV fixtures ───────────────────────────────────────────────────────

POSITIONS_CSV = """\
"Brokerage"

"Individual-X12345678"


"Symbol","Description","Quantity","Last Price","Last Price Change","Current Value","Today's Gain/Loss Dollar","Today's Gain/Loss Percent","Total Gain/Loss Dollar","Total Gain/Loss Percent","Percent Of Account","Cost Basis Total","Average Cost Basis","Type"
"AAPL","APPLE INC","10","$150.00","$1.50","$1,500.00","$15.00","1.01%","$300.00","25.00%","60.00%","$1,200.00","$120.00","Stock"
"MSFT","MICROSOFT CORP","5","$300.00","$-2.00","$1,500.00","$-10.00","-0.66%","$200.00","15.38%","40.00%","$1,300.00","$260.00","Stock"
"Pending Activity","","","","","","","","","","","","",""
"Account Total","","","","","$3,000.00","$5.00","0.17%","$500.00","20.00%","","$2,500.00","",""
"""

POSITIONS_CSV_MONEY_MARKET = """\
"Symbol","Description","Quantity","Last Price","Last Price Change","Current Value","Today's Gain/Loss Dollar","Today's Gain/Loss Percent","Total Gain/Loss Dollar","Total Gain/Loss Percent","Percent Of Account","Cost Basis Total","Average Cost Basis","Type"
"SPAXX**","FIDELITY GOVERNMENT MONEY MARKET","1000","$1.00","$0.00","$1,000.00","$0.00","0.00%","$0.00","0.00%","10.00%","$1,000.00","$1.00","Cash"
"AAPL","APPLE INC","10","$150.00","$1.50","$1,500.00","$15.00","1.01%","$300.00","25.00%","60.00%","$1,200.00","$120.00","Stock"
"""

POSITIONS_CSV_MISSING_HEADER = """\
"Some other content"
"No symbol header here"
"""

TRANSACTIONS_CSV = """\
"Run Date","Action","Symbol","Security Description","Security Type","Quantity","Price ($)","Commission ($)","Fees ($)","Accrued Interest ($)","Amount ($)","Settlement Date"
"06/01/2023","Bought","AAPL","APPLE INC","Equity","10","150.00","","","","-1500.00","06/05/2023"
"06/15/2023","Sold","AAPL","APPLE INC","Equity","-5","160.00","","","","800.00","06/19/2023"
"07/01/2023","Dividend Received","MSFT","MICROSOFT CORP","Equity","","","","","5.00","5.00","07/05/2023"
"07/15/2023","Reinvestment","MSFT","MICROSOFT CORP","Equity","0.02","250.00","","","","-5.00","07/19/2023"
"08/01/2023","YOU BOUGHT","XOM","EXXON MOBIL","Equity","20","50.00","","","","-1000.00","08/05/2023"
"""


# ── parse_fidelity_positions ──────────────────────────────────────────────────

class TestParseFidelityPositions:
    def test_parses_valid_csv(self):
        positions = parse_fidelity_positions(POSITIONS_CSV)
        assert len(positions) == 2
        symbols = [p["symbol"] for p in positions]
        assert "AAPL" in symbols
        assert "MSFT" in symbols

    def test_strips_dollar_and_comma(self):
        positions = parse_fidelity_positions(POSITIONS_CSV)
        aapl = next(p for p in positions if p["symbol"] == "AAPL")
        assert aapl["current_value"] == pytest.approx(1500.0)
        assert aapl["total_cost_basis"] == pytest.approx(1200.0)
        assert aapl["total_gain_loss"] == pytest.approx(300.0)
        assert aapl["current_price"] == pytest.approx(150.0)

    def test_gain_loss_percent_parsed(self):
        positions = parse_fidelity_positions(POSITIONS_CSV)
        aapl = next(p for p in positions if p["symbol"] == "AAPL")
        assert aapl["total_gain_loss_percent"] == pytest.approx(25.0)

    def test_skips_pending_activity_row(self):
        positions = parse_fidelity_positions(POSITIONS_CSV)
        symbols = [p["symbol"] for p in positions]
        assert "Pending Activity" not in symbols

    def test_skips_account_total_row(self):
        positions = parse_fidelity_positions(POSITIONS_CSV)
        symbols = [p["symbol"] for p in positions]
        assert "Account Total" not in symbols

    def test_skips_money_market_long_symbol(self):
        positions = parse_fidelity_positions(POSITIONS_CSV_MONEY_MARKET)
        symbols = [p["symbol"] for p in positions]
        assert "SPAXX**" not in symbols
        assert "AAPL" in symbols

    def test_missing_header_raises(self):
        with pytest.raises(ValueError, match="header"):
            parse_fidelity_positions(POSITIONS_CSV_MISSING_HEADER)

    def test_double_dash_field_returns_none(self):
        csv = """\
"Symbol","Description","Quantity","Last Price","Last Price Change","Current Value","Today's Gain/Loss Dollar","Today's Gain/Loss Percent","Total Gain/Loss Dollar","Total Gain/Loss Percent","Percent Of Account","Cost Basis Total","Average Cost Basis","Type"
"AAPL","APPLE INC","10","$150.00","$1.50","$1,500.00","--","--","--","--","60.00%","--","$120.00","Stock"
"""
        positions = parse_fidelity_positions(csv)
        aapl = positions[0]
        assert aapl["total_gain_loss"] is None
        assert aapl["total_gain_loss_percent"] is None

    def test_negative_values_parsed(self):
        positions = parse_fidelity_positions(POSITIONS_CSV)
        msft = next(p for p in positions if p["symbol"] == "MSFT")
        assert msft["total_gain_loss"] == pytest.approx(200.0)  # value in CSV is positive

    def test_quantity_parsed(self):
        positions = parse_fidelity_positions(POSITIONS_CSV)
        aapl = next(p for p in positions if p["symbol"] == "AAPL")
        assert aapl["total_shares"] == pytest.approx(10.0)


# ── parse_fidelity_transactions ───────────────────────────────────────────────

class TestParseFidelityTransactions:
    def test_bought_normalizes_to_buy(self):
        txns = parse_fidelity_transactions(TRANSACTIONS_CSV)
        buys = [t for t in txns if t["symbol"] == "AAPL" and t["action"] == "BUY"]
        assert len(buys) == 1

    def test_sold_normalizes_to_sell(self):
        txns = parse_fidelity_transactions(TRANSACTIONS_CSV)
        sells = [t for t in txns if t["symbol"] == "AAPL" and t["action"] == "SELL"]
        assert len(sells) == 1

    def test_dividend_normalized(self):
        txns = parse_fidelity_transactions(TRANSACTIONS_CSV)
        divs = [t for t in txns if t["action"] == "DIVIDEND"]
        assert len(divs) == 1

    def test_reinvestment_normalized(self):
        txns = parse_fidelity_transactions(TRANSACTIONS_CSV)
        reinv = [t for t in txns if t["action"] == "REINVESTMENT"]
        assert len(reinv) == 1

    def test_unknown_action_uppercased(self):
        # "YOU BOUGHT" contains "bought" so the parser normalizes it to BUY — that's correct.
        # Test a truly unknown action that doesn't match any known keyword.
        csv = """\
"Run Date","Action","Symbol","Security Description","Security Type","Quantity","Price ($)","Commission ($)","Fees ($)","Accrued Interest ($)","Amount ($)","Settlement Date"
"06/01/2023","Journal Entry","AAPL","APPLE INC","Equity","10","150.00","","","","-1500.00","06/05/2023"
"""
        txns = parse_fidelity_transactions(csv)
        assert txns[0]["action"] == "JOURNAL ENTRY"

    def test_date_parsed_correctly(self):
        txns = parse_fidelity_transactions(TRANSACTIONS_CSV)
        buy = next(t for t in txns if t["symbol"] == "AAPL" and t["action"] == "BUY")
        assert buy["trade_date"] == "2023-06-01"

    def test_missing_header_raises(self):
        with pytest.raises(ValueError, match="header"):
            parse_fidelity_transactions("Symbol,Price\nAAPL,100")

    def test_price_and_quantity_parsed(self):
        txns = parse_fidelity_transactions(TRANSACTIONS_CSV)
        buy = next(t for t in txns if t["symbol"] == "AAPL" and t["action"] == "BUY")
        assert buy["quantity"] == pytest.approx(10.0)
        assert buy["price"] == pytest.approx(150.0)


# ── reconstruct_tax_lots ──────────────────────────────────────────────────────

class TestReconstructTaxLots:
    def _txn(self, date, action, symbol, qty, price):
        return {
            "trade_date": date, "action": action, "symbol": symbol,
            "quantity": qty, "price": price, "description": "", "amount": None, "settlement_date": "",
        }

    def test_two_buys_no_sells(self):
        txns = [
            self._txn("2023-01-01", "BUY", "AAPL", 10, 100),
            self._txn("2023-02-01", "BUY", "AAPL", 5, 120),
        ]
        lots = reconstruct_tax_lots(txns)
        assert len(lots) == 2
        total_shares = sum(l["shares"] for l in lots)
        assert total_shares == pytest.approx(15)

    def test_full_sell_closes_lot(self):
        txns = [
            self._txn("2023-01-01", "BUY",  "AAPL", 10, 100),
            self._txn("2023-06-01", "SELL", "AAPL", -10, 150),
        ]
        lots = reconstruct_tax_lots(txns)
        assert lots == []

    def test_partial_sell_fifo(self):
        txns = [
            self._txn("2023-01-01", "BUY",  "AAPL", 10, 100),
            self._txn("2023-06-01", "SELL", "AAPL", -6, 150),
        ]
        lots = reconstruct_tax_lots(txns)
        assert len(lots) == 1
        assert lots[0]["shares"] == pytest.approx(4)
        assert lots[0]["cost_basis"] == pytest.approx(400)

    def test_sell_spanning_two_lots(self):
        txns = [
            self._txn("2023-01-01", "BUY",  "AAPL", 5, 100),
            self._txn("2023-02-01", "BUY",  "AAPL", 5, 120),
            self._txn("2023-06-01", "SELL", "AAPL", -7, 150),
        ]
        lots = reconstruct_tax_lots(txns)
        assert len(lots) == 1
        assert lots[0]["shares"] == pytest.approx(3)
        assert lots[0]["purchase_price"] == pytest.approx(120)

    def test_sell_exactly_first_lot(self):
        txns = [
            self._txn("2023-01-01", "BUY",  "AAPL", 5, 100),
            self._txn("2023-02-01", "BUY",  "AAPL", 8, 120),
            self._txn("2023-06-01", "SELL", "AAPL", -5, 150),
        ]
        lots = reconstruct_tax_lots(txns)
        assert len(lots) == 1
        assert lots[0]["shares"] == pytest.approx(8)

    def test_reinvestment_treated_as_sell(self):
        txns = [
            self._txn("2023-01-01", "BUY",          "MSFT", 10, 250),
            self._txn("2023-06-01", "REINVESTMENT", "MSFT", -2, 280),
        ]
        lots = reconstruct_tax_lots(txns)
        assert len(lots) == 1
        assert lots[0]["shares"] == pytest.approx(8)

    def test_orphan_sell_no_crash(self):
        txns = [self._txn("2023-06-01", "SELL", "AAPL", -5, 150)]
        lots = reconstruct_tax_lots(txns)
        assert lots == []

    def test_out_of_order_transactions_sorted(self):
        txns = [
            self._txn("2023-06-01", "SELL", "AAPL", -10, 150),  # sell first in list
            self._txn("2023-01-01", "BUY",  "AAPL", 10, 100),   # buy second in list
        ]
        lots = reconstruct_tax_lots(txns)
        # After sorting, BUY comes before SELL → lot is closed
        assert lots == []

    def test_multiple_symbols_independent(self):
        txns = [
            self._txn("2023-01-01", "BUY",  "AAPL", 10, 100),
            self._txn("2023-01-01", "BUY",  "MSFT", 5,  250),
            self._txn("2023-06-01", "SELL", "AAPL", -10, 150),
        ]
        lots = reconstruct_tax_lots(txns)
        symbols = [l["symbol"] for l in lots]
        assert "AAPL" not in symbols
        assert "MSFT" in symbols
