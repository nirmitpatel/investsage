"""
Vanguard Performance Report PDF parser.

Vanguard's Performance Report is a Chromium-rendered PDF with no accessible
text layer (glyphs are encoded with proprietary IDs and no ToUnicode map).
Standard PDF text extraction libraries (pypdf, pdfminer, pymupdf text mode)
all return empty strings.

Instead we:
  1. Use PyMuPDF (fitz) to render each page to a PNG image.
  2. Send the images to Claude Haiku (vision) to read the table.
  3. Parse the structured JSON response.

The PDF contains a monthly performance table with a "Total" summary row:
  Columns: Month | Beginning balance | Deposits & Withdrawals |
           Market Gain/Loss | Income returns | Personal Investment Returns |
           Cumulative returns | Ending balance

We extract from the Total row:
  - Deposits & Withdrawals  → total cost basis (account started at $0)
  - Market Gain/Loss        → total unrealised market gain
  - Income returns          → total dividends/interest
  - Personal Investment Returns → total dollar return

Cost basis is then distributed across existing DB positions:
  - Money market positions (VMFXX-style, NAV ≈ $1): cost_basis = current_value
  - All other positions: proportional share of remaining cost by current value
"""

import base64
import json
from typing import Any, Dict, List


# ---------------------------------------------------------------------------
# PDF → images
# ---------------------------------------------------------------------------

def _render_pages_to_b64_pngs(content: bytes) -> List[str]:
    """Render each PDF page to a base64-encoded PNG string."""
    try:
        import fitz  # pymupdf
    except ImportError:
        raise RuntimeError(
            "pymupdf is required — install it with: pip install pymupdf"
        )

    try:
        doc = fitz.open(stream=content, filetype="pdf")
    except Exception as e:
        raise ValueError(f"Could not open PDF: {e}")

    images = []
    mat = fitz.Matrix(1.5, 1.5)  # 108 DPI — enough for Claude to read clearly
    for page in doc:
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("png")
        images.append(base64.standard_b64encode(img_bytes).decode())

    if not images:
        raise ValueError("PDF has no pages")

    return images


# ---------------------------------------------------------------------------
# Vision extraction
# ---------------------------------------------------------------------------

def _extract_via_vision(images: List[str]) -> Dict[str, Any]:
    """Send rendered page images to Claude Haiku and parse the response."""
    from services.ai.claude_client import client, FAST_MODEL

    content_blocks: List[Dict] = []
    for img_b64 in images:
        content_blocks.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": img_b64,
            },
        })
    content_blocks.append({
        "type": "text",
        "text": (
            "These images are pages from a Vanguard Performance Report.\n\n"
            "Find:\n"
            "1. The date range shown near the top (e.g. '09/01/2020 - 04/10/2026').\n"
            "2. The 'Total' summary row at the bottom of the table. "
            "The table columns are: Month | Beginning balance | "
            "Deposits & Withdrawals | Market Gain/Loss | Income returns | "
            "Personal Investment Returns | Cumulative returns | Ending balance.\n\n"
            "Return ONLY valid JSON — no markdown fences, no explanation:\n"
            '{"date_range":"MM/DD/YYYY - MM/DD/YYYY",'
            '"total_deposits":6806.00,'
            '"total_market_gain":2742.68,'
            '"total_income":340.51,'
            '"total_investment_return":3083.19}'
        ),
    })

    try:
        response = client.messages.create(
            model=FAST_MODEL,
            max_tokens=256,
            messages=[{"role": "user", "content": content_blocks}],
        )
    except Exception as e:
        raise ValueError(f"Vision extraction failed: {e}")

    raw = response.content[0].text.strip()

    # Strip markdown fences if the model wrapped the JSON anyway
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        raise ValueError(
            f"Could not parse vision response as JSON: {raw[:300]}"
        )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_vanguard_performance_pdf(content: bytes) -> Dict[str, Any]:
    """
    Parse a Vanguard Performance Report PDF.

    Returns a dict with:
      total_deposits          – sum of all Deposits & Withdrawals (= cost basis)
      total_market_gain       – cumulative Market Gain/Loss
      total_income            – cumulative Income returns (dividends)
      total_investment_return – cumulative Personal Investment Returns
      date_range              – "MM/DD/YYYY - MM/DD/YYYY" or None
    """
    images = _render_pages_to_b64_pngs(content)
    result = _extract_via_vision(images)

    total_deposits = result.get("total_deposits")
    if not total_deposits or float(total_deposits) <= 0:
        raise ValueError(
            "Could not extract total deposits — check that this is a complete "
            "Vanguard Performance Report starting from the first deposit."
        )

    return {
        "total_deposits": float(total_deposits),
        "total_market_gain": result.get("total_market_gain"),
        "total_income": result.get("total_income"),
        "total_investment_return": result.get("total_investment_return"),
        "date_range": result.get("date_range"),
    }


# ---------------------------------------------------------------------------
# Cost basis distribution
# ---------------------------------------------------------------------------

_MONEY_MARKET_SYMBOLS = {"VMFXX", "SPAXX", "FDRXX", "FDLXX", "SWVXX", "SPRXX", "VMRXX"}


def _is_money_market(pos: Dict[str, Any]) -> bool:
    sym = (pos.get("symbol") or "").upper()
    price = pos.get("current_price") or 0.0
    if sym in _MONEY_MARKET_SYMBOLS:
        return True
    # Heuristic: symbol ends in XX and NAV is within 1 cent of $1
    if sym.endswith("XX") and 0.99 <= price <= 1.01:
        return True
    return False


def distribute_cost_basis(
    positions: List[Dict[str, Any]],
    total_deposits: float,
) -> List[Dict[str, Any]]:
    """
    Distribute total_deposits as cost basis across positions.

    Money market positions get cost_basis = current_value (stable $1 NAV).
    All other positions get a proportional share of remaining cost by
    current market value.

    Returns [{symbol, total_cost_basis, total_gain_loss, total_gain_loss_percent}]
    """
    mm_positions = [p for p in positions if _is_money_market(p)]
    eq_positions = [p for p in positions if not _is_money_market(p)]

    mm_value = sum((p.get("current_value") or 0.0) for p in mm_positions)
    equity_cost = max(0.0, total_deposits - mm_value)
    equity_value = sum((p.get("current_value") or 0.0) for p in eq_positions)

    updates: List[Dict[str, Any]] = []
    for pos in positions:
        cv = pos.get("current_value") or 0.0

        if _is_money_market(pos):
            cost = cv
        elif equity_value > 0:
            cost = round(equity_cost * (cv / equity_value), 2)
        else:
            cost = 0.0

        gain = round(cv - cost, 2)
        gain_pct = round((gain / cost) * 100, 2) if cost > 0 else None

        updates.append({
            "symbol": pos["symbol"],
            "total_cost_basis": round(cost, 2),
            "total_gain_loss": gain,
            "total_gain_loss_percent": gain_pct,
        })

    return updates
