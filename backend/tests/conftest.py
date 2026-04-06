import pytest


@pytest.fixture
def make_position():
    def _make(symbol, value, sector, gain_loss=0.0, shares=10.0):
        return {
            "symbol": symbol,
            "current_value": value,
            "sector": sector,
            "total_gain_loss": gain_loss,
            "total_shares": shares,
            "current_price": value / shares if shares else None,
            "total_cost_basis": value - gain_loss,
            "percent_of_account": None,
        }
    return _make


@pytest.fixture
def make_lot():
    def _make(symbol, shares, price, date_str, cost_basis=None):
        return {
            "symbol": symbol,
            "shares": shares,
            "purchase_price": price,
            "purchase_date": date_str,
            "cost_basis": cost_basis if cost_basis is not None else shares * price,
        }
    return _make
