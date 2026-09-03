#!/usr/bin/env python3
"""Emit compact EMBEDDED_WAREHOUSE_METRICS for ReferenceCheck.gs from headcount.json.

Run after updating docs/data/headcount.json:

  python3 scripts/gen-warehouse-embed.py

Prints a JS snippet to paste into docs/google-apps-script/ReferenceCheck.gs
(or use --inplace to rewrite the var block automatically).
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HEADCOUNT_JSON = ROOT / "docs" / "data" / "headcount.json"
GS_FILE = ROOT / "docs" / "google-apps-script" / "ReferenceCheck.gs"

FIELDS = [
    "revenue_90d",
    "avg_pqr_per_rep",
    "segment_avg_pqr",
    "segment_avg_pcid",
    "coverage_peak_accounts",
    "median_impact_calls_per_account",
    "coverage_at_inflection",
]


def rollup_country(c: str) -> str:
    c = str(c).strip().upper()
    if c in ("GB",):
        return "UK"
    if c in ("DE", "AT", "CH"):
        return "DACH"
    if c in ("BE", "NL", "LU"):
        return "BNL"
    if c in ("ES", "PT"):
        return "IBE"
    if c in ("IE", "IRELAND"):
        return "IRELAND"
    return c


def segment_market_key(country: str, segment: str) -> str | None:
    c = rollup_country(country)
    seg = str(segment).strip().upper()
    if not c or not seg:
        return None
    return f"{c}-{seg}"


def build_compact(data: dict) -> dict[str, list]:
    compact: dict[str, list] = {}
    for m in data.get("markets", []):
        key = segment_market_key(m.get("country", ""), m.get("segment", ""))
        if not key:
            continue
        cov = m.get("coverage_inflection_book_max") or m.get("coverage_peak_accounts")
        compact[key] = [
            round(m["revenue_90d"]) if m.get("revenue_90d") is not None else None,
            round(m["avg_pqr_per_rep"]) if m.get("avg_pqr_per_rep") is not None else None,
            round(m["segment_avg_pqr"]) if m.get("segment_avg_pqr") is not None else None,
            m.get("segment_avg_pcid"),
            round(cov) if cov is not None else None,
            m.get("median_impact_calls_per_account"),
            m.get("coverage_at_inflection"),
        ]
    return compact


def js_block(compact: dict) -> str:
    payload = json.dumps(compact, separators=(",", ":"))
    return (
        f"// Generated from docs/data/headcount.json ({len(compact)} markets, {len(payload)} chars)\n"
        f"var EMBEDDED_WAREHOUSE_METRICS = {payload};"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inplace", action="store_true", help="Rewrite var in ReferenceCheck.gs")
    args = parser.parse_args()

    with HEADCOUNT_JSON.open() as f:
        data = json.load(f)
    compact = build_compact(data)
    block = js_block(compact)

    if args.inplace:
        text = GS_FILE.read_text()
        pattern = r"// Generated from docs/data/headcount\.json[^\n]*\nvar EMBEDDED_WAREHOUSE_METRICS = \{.*?\};"
        if not re.search(pattern, text, re.DOTALL):
            raise SystemExit("EMBEDDED_WAREHOUSE_METRICS block not found in ReferenceCheck.gs")
        GS_FILE.write_text(re.sub(pattern, block, text, count=1, flags=re.DOTALL))
        print(f"Updated {GS_FILE} ({len(compact)} markets)")
    else:
        print(block)


if __name__ == "__main__":
    main()
