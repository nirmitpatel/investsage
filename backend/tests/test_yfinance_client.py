"""
Tests for yfinance_client -- sector normalization and ETF performance lookup.

These tests mock yfinance calls so they run offline and fast.

yfinance.download always returns a MultiIndex DataFrame:
  columns = [('Close', 'XLV'), ('High', 'XLV'), ...]
so mock DataFrames must match that shape.
"""

import pandas as pd
import pytest
from unittest.mock import patch, MagicMock

from services.market_data.yfinance_client import (
    SECTOR_ETFS,
    SECTOR_NAME_NORMALIZE,
    fetch_sectors,
    fetch_sector_etf_performance,
)


def _mock_download(etf: str, prices: list) -> pd.DataFrame:
    """Build a minimal MultiIndex DataFrame matching real yfinance.download output."""
    idx = pd.to_datetime(["2024-01-01", "2024-04-01"])
    df = pd.DataFrame(
        {("Close", etf): prices},
        index=idx,
    )
    df.columns = pd.MultiIndex.from_tuples(df.columns)
    return df


# -- SECTOR_NAME_NORMALIZE invariants -----------------------------------------

class TestSectorNameNormalize:
    def test_health_care_maps_to_healthcare(self):
        """yfinance returns 'Health Care' for biotech/pharma (VRTX, JNJ etc).
        The ETF lookup dict uses 'Healthcare'. Without this entry sector trend is None."""
        assert "Health Care" in SECTOR_NAME_NORMALIZE
        assert SECTOR_NAME_NORMALIZE["Health Care"] == "Healthcare"

    def test_every_canonical_name_has_sector_etf(self):
        """Every name SECTOR_NAME_NORMALIZE maps to must exist in SECTOR_ETFS."""
        for alias, canonical in SECTOR_NAME_NORMALIZE.items():
            if canonical not in ("Fixed Income",):
                assert canonical in SECTOR_ETFS, (
                    f"SECTOR_NAME_NORMALIZE maps '{alias}' -> '{canonical}' "
                    f"but '{canonical}' is missing from SECTOR_ETFS"
                )

    def test_health_care_alias_absent_from_sector_etfs(self):
        """'Health Care' must NOT be a key in SECTOR_ETFS -- normalization handles it."""
        assert "Health Care" not in SECTOR_ETFS


# -- fetch_sectors ------------------------------------------------------------

class TestFetchSectors:
    def _mock_ticker(self, info: dict):
        t = MagicMock()
        t.info = info
        return t

    def test_health_care_normalized_to_healthcare(self):
        with patch("services.market_data.yfinance_client.yf.Ticker",
                   return_value=self._mock_ticker({"sector": "Health Care"})):
            result = fetch_sectors(["VRTX"])
        assert result == {"VRTX": "Healthcare"}

    def test_canonical_sector_passes_through_unchanged(self):
        with patch("services.market_data.yfinance_client.yf.Ticker",
                   return_value=self._mock_ticker({"sector": "Technology"})):
            result = fetch_sectors(["AAPL"])
        assert result == {"AAPL": "Technology"}

    def test_etf_quote_type_returns_etf_string(self):
        with patch("services.market_data.yfinance_client.yf.Ticker",
                   return_value=self._mock_ticker({"sector": None, "quoteType": "ETF"})):
            result = fetch_sectors(["XLK"])
        assert result == {"XLK": "ETF"}

    def test_mutual_fund_quote_type_returns_mutual_fund_string(self):
        with patch("services.market_data.yfinance_client.yf.Ticker",
                   return_value=self._mock_ticker({"sector": None, "quoteType": "MUTUALFUND"})):
            result = fetch_sectors(["FXAIX"])
        assert result == {"FXAIX": "Mutual Fund"}

    def test_missing_sector_and_quote_type_excluded(self):
        with patch("services.market_data.yfinance_client.yf.Ticker",
                   return_value=self._mock_ticker({"sector": None, "quoteType": ""})):
            result = fetch_sectors(["???"])
        assert result == {}

    def test_exception_from_ticker_excluded_gracefully(self):
        with patch("services.market_data.yfinance_client.yf.Ticker", side_effect=Exception("network")):
            result = fetch_sectors(["FAIL"])
        assert result == {}


# -- fetch_sector_etf_performance ---------------------------------------------

class TestFetchSectorEtfPerformance:
    def test_health_care_alias_normalizes_and_returns_result(self):
        """'Health Care' must normalize to 'Healthcare' and return a real trend value."""
        mock_df = _mock_download("XLV", [100.0, 103.0])
        with patch("services.market_data.yfinance_client.yf.download", return_value=mock_df):
            result = fetch_sector_etf_performance(["Health Care"])
        assert "Healthcare" in result, (
            "fetch_sector_etf_performance must normalize 'Health Care' -> 'Healthcare' "
            "and return a trend keyed by the canonical name."
        )

    def test_returns_empty_for_unknown_sector(self):
        result = fetch_sector_etf_performance(["Imaginary Sector"])
        assert result == {}

    def test_returns_empty_when_all_sectors_unknown(self):
        # 'Health Care' normalizes to 'Healthcare' which has an ETF, so use truly unknown
        result = fetch_sector_etf_performance(["Imaginary", "AlsoFake"])
        assert result == {}

    def test_healthcare_key_present_in_sector_etfs(self):
        assert SECTOR_ETFS.get("Healthcare") == "XLV"

    def test_single_sector_computes_pct_change(self):
        """End-to-end: correct % change from first to last close."""
        mock_df = _mock_download("XLV", [100.0, 105.0])
        with patch("services.market_data.yfinance_client.yf.download", return_value=mock_df):
            result = fetch_sector_etf_performance(["Healthcare"], period="3mo")
        assert "Healthcare" in result
        assert result["Healthcare"] == pytest.approx(5.0)

    def test_multiple_sectors_computed_correctly(self):
        """Multiple ETFs in one download -- each sector gets correct value."""
        idx = pd.to_datetime(["2024-01-01", "2024-04-01"])
        df = pd.DataFrame(
            {("Close", "XLV"): [100.0, 104.0], ("Close", "XLK"): [200.0, 210.0]},
            index=idx,
        )
        df.columns = pd.MultiIndex.from_tuples(df.columns)
        with patch("services.market_data.yfinance_client.yf.download", return_value=df):
            result = fetch_sector_etf_performance(["Healthcare", "Technology"])
        assert result["Healthcare"] == pytest.approx(4.0)
        assert result["Technology"] == pytest.approx(5.0)

    def test_returns_empty_when_download_data_is_empty(self):
        with patch("services.market_data.yfinance_client.yf.download",
                   return_value=pd.DataFrame()):
            result = fetch_sector_etf_performance(["Healthcare"])
        assert result == {}

    def test_returns_empty_when_download_raises(self):
        with patch("services.market_data.yfinance_client.yf.download",
                   side_effect=Exception("rate limited")):
            result = fetch_sector_etf_performance(["Healthcare"])
        assert result == {}
