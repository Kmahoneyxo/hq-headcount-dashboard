#!/usr/bin/env python3
"""Build docs/data/headcount.json from query 16 MCP JSON export.

Usage:
  python3 scripts/json-from-mcp-results.py docs/data/query16_results.json
"""

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "data" / "headcount.json"
AMER = ["US", "CA", "UK", "DACH", "BNL"]


def normalize_market(row: dict) -> dict:
    m = dict(row)
    if "optimal_headcount_assigned" in m and "optimal_headcount" not in m:
        m["optimal_headcount"] = int(m["optimal_headcount_assigned"])
    if "sbs_whitespace_country" in m:
        m["sbs_whitespace"] = m["sbs_whitespace_country"]
    if "avg_pct_book_built" in m and m["avg_pct_book_built"] is not None:
        m["avg_pct_book_built"] = float(m["avg_pct_book_built"])
    if "perfect_book_growth_pct" in m and m["perfect_book_growth_pct"] is not None:
        m["perfect_book_growth_pct"] = float(m["perfect_book_growth_pct"])
    return m


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    raw = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    if isinstance(raw, dict) and "data" in raw:
        rows = raw["data"]
    elif isinstance(raw, list):
        rows = raw
    else:
        raise SystemExit("Expected MCP JSON with data[] or a list of rows")

    markets = [normalize_market(r) for r in rows]
    sbs = [
        {
            "country": m["country"],
            "segment": m["segment"],
            "accounts": m.get("sbs_whitespace_country") or 0,
            "revenue_90d": m.get("sbs_revenue_90d"),
        }
        for m in markets
        if (m.get("sbs_whitespace_country") or 0) > 0
    ]

    payload = {
        "updated_at": date.today().isoformat(),
        "window": "90d ending 2026-07-25 (20260427–20260725 vs prior 20260128–20260426)",
        "query": "sql/16_dashboard_export.sql",
        "amer_markets": AMER,
        "markets": sorted(markets, key=lambda m: -(m.get("revenue_90d") or 0)),
        "sbs_whitespace": sorted(sbs, key=lambda r: -(r.get("revenue_90d") or 0)),
    }

    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    us_m = next((m for m in markets if m.get("country") == "US" and m.get("segment") == "M"), None)
    print(f"Wrote {len(markets)} markets to {OUT}")
    if us_m:
        print(f"US-M perfect_book: {us_m.get('perfect_book_bucket')} target={us_m.get('perfect_book_target')}")


if __name__ == "__main__":
    main()
