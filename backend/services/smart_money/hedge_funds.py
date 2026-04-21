"""
Hedge fund 13F ingestion via SEC EDGAR.
Fetches quarterly position disclosures for top funds and normalizes into smart_money_trades.
"""

import logging
import requests
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from typing import List, Dict, Any, Optional

log = logging.getLogger(__name__)

EDGAR_SEARCH_URL = "https://efts.sec.gov/LATEST/search-index"
EDGAR_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
EDGAR_ARCHIVES_URL = "https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/"
HEADERS = {
    "User-Agent": "InvestSage nirmitpatel1994@gmail.com",
    "Accept": "application/json",
}

# Top 20 hedge funds by AUM with their SEC CIK numbers
TOP_FUNDS = [
    {"name": "Bridgewater Associates", "cik": "0001350694"},
    {"name": "Renaissance Technologies", "cik": "0001037389"},
    {"name": "Citadel Advisors", "cik": "0001423689"},
    {"name": "Two Sigma Investments", "cik": "0001450144"},
    {"name": "Millennium Management", "cik": "0001273931"},
    {"name": "D.E. Shaw", "cik": "0001336320"},
    {"name": "Viking Global Investors", "cik": "0001103804"},
    {"name": "Appaloosa Management", "cik": "0001061219"},
    {"name": "Point72 Asset Management", "cik": "0001603466"},
    {"name": "Elliott Investment Management", "cik": "0000920424"},
    {"name": "Pershing Square Capital", "cik": "0001336528"},
    {"name": "Baupost Group", "cik": "0001060349"},
    {"name": "Tiger Global Management", "cik": "0001167483"},
    {"name": "Lone Pine Capital", "cik": "0001100663"},
    {"name": "Coatue Management", "cik": "0001336528"},
    {"name": "Third Point", "cik": "0001040273"},
    {"name": "Greenlight Capital", "cik": "0001079114"},
    {"name": "Maverick Capital", "cik": "0001057378"},
    {"name": "Farallon Capital", "cik": "0000912096"},
    {"name": "Eminence Capital", "cik": "0001284823"},
]


def _get_latest_13f_accession(cik: str) -> Optional[str]:
    """Return the accession number of the most recent 13F-HR filing for a CIK."""
    try:
        url = EDGAR_SUBMISSIONS_URL.format(cik=cik.lstrip("0").zfill(10))
        resp = requests.get(url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        filings = data.get("filings", {}).get("recent", {})
        forms = filings.get("form", [])
        accessions = filings.get("accessionNumber", [])
        for form, acc in zip(forms, accessions):
            if form in ("13F-HR", "13F-HR/A"):
                return acc.replace("-", "")
    except Exception as e:
        log.warning(f"Failed to get 13F accession for CIK {cik}: {e}")
    return None


def _parse_13f_xml(cik: str, accession: str, fund_name: str) -> List[Dict[str, Any]]:
    """Fetch and parse 13F-HR information table XML for a single filing."""
    trades: List[Dict[str, Any]] = []
    base_url = EDGAR_ARCHIVES_URL.format(cik=cik.lstrip("0"), accession=accession)

    # Get filing index to find the information table document
    try:
        idx_resp = requests.get(
            f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=13F-HR&dateb=&owner=include&count=1&search_text=&output=atom",
            headers=HEADERS,
            timeout=10,
        )
    except Exception:
        pass

    # Try to fetch the primary document directly
    accession_dashed = f"{accession[:10]}-{accession[10:12]}-{accession[12:]}"
    index_url = f"https://www.sec.gov/Archives/edgar/data/{cik.lstrip('0')}/{accession}/{accession_dashed}-index.htm"
    try:
        idx_resp = requests.get(index_url, headers=HEADERS, timeout=10)
        # Look for the information table XML link
        xml_filename = None
        for line in idx_resp.text.splitlines():
            if "infotable" in line.lower() and ".xml" in line.lower():
                import re
                match = re.search(r'href="([^"]+\.xml)"', line, re.IGNORECASE)
                if match:
                    xml_filename = match.group(1).split("/")[-1]
                    break

        if not xml_filename:
            return trades

        xml_url = f"https://www.sec.gov/Archives/edgar/data/{cik.lstrip('0')}/{accession}/{xml_filename}"
        xml_resp = requests.get(xml_url, headers=HEADERS, timeout=15)
        xml_resp.raise_for_status()

        root = ET.fromstring(xml_resp.text)
        ns = {"ns": "http://www.sec.gov/edgar/document/thirteenf/informationtable"}

        for entry in root.findall(".//ns:infoTable", ns) or root.findall(".//infoTable"):
            def _text(tag: str) -> Optional[str]:
                el = entry.find(f"ns:{tag}", ns) or entry.find(tag)
                return el.text.strip() if el is not None and el.text else None

            ticker_el = entry.find("ns:ticker", ns) or entry.find("ticker")
            ticker = (ticker_el.text.strip() if ticker_el is not None and ticker_el.text else None)
            if not ticker:
                continue

            shares_text = _text("shrsOrPrnAmt/sshPrnamt") or _text("sshPrnamt")
            try:
                shares = float(shares_text.replace(",", "")) if shares_text else None
            except (ValueError, AttributeError):
                shares = None

            value_text = _text("value")
            try:
                value = int(value_text.replace(",", "")) * 1000 if value_text else None
            except (ValueError, AttributeError):
                value = None

            put_call = _text("putCall")
            trade_type = "buy"
            if put_call and put_call.lower() in ("put",):
                trade_type = "sell"

            trades.append({
                "trader_type": "hedge_fund",
                "trader_name": fund_name,
                "trader_detail": {"fund_name": fund_name},
                "symbol": ticker.upper(),
                "trade_type": trade_type,
                "trade_date": None,  # 13F reports period end, not exact trade date
                "disclosure_date": date.today().isoformat(),
                "amount_range": f"${value:,}" if value else None,
                "shares": shares,
                "price": None,
                "source": "sec_edgar_13f",
            })
    except Exception as e:
        log.warning(f"Failed to parse 13F for {fund_name}: {e}")

    return trades


def fetch_hedge_fund_trades() -> List[Dict[str, Any]]:
    """Fetch latest 13F holdings for top hedge funds via SEC EDGAR."""
    all_trades: List[Dict[str, Any]] = []
    for fund in TOP_FUNDS[:10]:  # limit to top 10 per run to avoid rate limits
        cik = fund["cik"].lstrip("0")
        accession = _get_latest_13f_accession(fund["cik"])
        if not accession:
            log.info(f"No 13F found for {fund['name']}")
            continue
        trades = _parse_13f_xml(cik, accession, fund["name"])
        all_trades.extend(trades)
        log.info(f"Fetched {len(trades)} positions from {fund['name']} 13F")
    return all_trades
