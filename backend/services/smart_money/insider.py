"""
Insider transaction ingestion via SEC EDGAR Form 4.
Fetches executive buy/sell disclosures within the past N days.
"""

import logging
import requests
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from typing import List, Dict, Any, Optional

log = logging.getLogger(__name__)

EDGAR_SEARCH_URL = "https://efts.sec.gov/LATEST/search-index"
HEADERS = {
    "User-Agent": "InvestSage nirmitpatel1994@gmail.com",
    "Accept": "application/json",
}


def _parse_form4_xml(xml_text: str, company_name: str) -> List[Dict[str, Any]]:
    """Parse a Form 4 XML document into trade records."""
    trades: List[Dict[str, Any]] = []
    try:
        root = ET.fromstring(xml_text)

        def _find_text(path: str) -> Optional[str]:
            el = root.find(path)
            return el.text.strip() if el is not None and el.text else None

        reporter_name = _find_text(".//reportingOwner/reportingOwnerId/rptOwnerName")
        is_officer = _find_text(".//reportingOwner/reportingOwnerRelationship/isOfficer")
        is_director = _find_text(".//reportingOwner/reportingOwnerRelationship/isDirector")
        officer_title = _find_text(".//reportingOwner/reportingOwnerRelationship/officerTitle")
        issuer_ticker = _find_text(".//issuer/issuerTradingSymbol")
        issuer_name = _find_text(".//issuer/issuerName")

        if not issuer_ticker or not reporter_name:
            return trades

        for txn in root.findall(".//nonDerivativeTransaction"):
            def _t(tag: str) -> Optional[str]:
                el = txn.find(tag)
                return el.text.strip() if el is not None and el.text else None

            code = (_t("transactionCoding/transactionCode") or "").upper()
            if code not in ("P", "S"):  # P=open-market purchase, S=sale
                continue

            trade_date = _t("transactionDate/value")
            shares_text = _t("transactionAmounts/transactionShares/value")
            price_text = _t("transactionAmounts/transactionPricePerShare/value")

            try:
                shares = float(shares_text) if shares_text else None
            except ValueError:
                shares = None
            try:
                price = float(price_text) if price_text else None
            except ValueError:
                price = None

            trade_type = "buy" if code == "P" else "sell"
            amount = None
            if shares and price:
                amt = shares * price
                amount = f"${amt:,.0f}"

            trades.append({
                "trader_type": "insider",
                "trader_name": reporter_name,
                "trader_detail": {
                    "company": company_name or issuer_name,
                    "title": officer_title,
                    "is_officer": is_officer == "1",
                    "is_director": is_director == "1",
                },
                "symbol": issuer_ticker.upper(),
                "trade_type": trade_type,
                "trade_date": trade_date,
                "disclosure_date": date.today().isoformat(),
                "amount_range": amount,
                "shares": shares,
                "price": price,
                "source": "sec_edgar_form4",
            })
    except ET.ParseError as e:
        log.warning(f"Form 4 XML parse error: {e}")
    return trades


def fetch_insider_trades(days_back: int = 7) -> List[Dict[str, Any]]:
    """Fetch recent Form 4 insider trades from SEC EDGAR."""
    start_date = (date.today() - timedelta(days=days_back)).isoformat()
    all_trades: List[Dict[str, Any]] = []

    try:
        resp = requests.get(
            EDGAR_SEARCH_URL,
            params={
                "forms": "4",
                "dateRange": "custom",
                "startdt": start_date,
                "enddt": date.today().isoformat(),
                "hits.hits.total.value": "true",
                "hits.hits._source": "period_of_report,entity_name,file_date,accession_no",
            },
            headers=HEADERS,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        log.warning(f"EDGAR Form 4 search failed: {e}")
        return all_trades

    hits = data.get("hits", {}).get("hits", [])
    log.info(f"Found {len(hits)} Form 4 filings since {start_date}")

    for hit in hits[:200]:  # cap per run
        source = hit.get("_source", {})
        accession = source.get("accession_no", "").replace("-", "")
        entity_name = source.get("entity_name", "")
        _id = hit.get("_id", "")
        cik = source.get("entity_id", "") or (_id.split("/")[2] if _id.count("/") >= 2 else "")

        if not accession or not cik:
            continue

        acc_dashed = f"{accession[:10]}-{accession[10:12]}-{accession[12:]}"
        xml_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{acc_dashed}.xml"

        try:
            xml_resp = requests.get(xml_url, headers=HEADERS, timeout=10)
            if xml_resp.status_code != 200:
                continue
            trades = _parse_form4_xml(xml_resp.text, entity_name)
            all_trades.extend(trades)
        except Exception as e:
            log.debug(f"Failed to fetch Form 4 {accession}: {e}")

    log.info(f"Parsed {len(all_trades)} insider trades from Form 4 filings")
    return all_trades
