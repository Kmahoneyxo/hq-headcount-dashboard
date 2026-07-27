#!/usr/bin/env python3
"""Convert query 16 CSV export to docs/data/headcount.json.

Usage:
  python3 scripts/csv-to-dashboard-json.py export.csv

CSV columns (from sql/16_dashboard_export.sql):
  segment, country, perfect_book_bucket, perfect_book_target, ...
"""

import csv
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "data" / "headcount.json"

INT_FIELDS = {
    "perfect_book_target",
    "perfect_book_ceiling",
    "assigned_accounts",
    "current_reps",
    "current_avg_book",
    "optimal_headcount_assigned",
    "headcount_gap",
    "sbs_whitespace_country",
    "sbs_revenue_90d",
    "headroom_accounts",
    "books_buildable_from_sbs",
    "opp_plateau_book_max",
    "coverage_inflection_book_max",
}

FLOAT_FIELDS = {
    "perfect_book_growth_pct",
    "revenue_90d",
    "avg_fy26_book_score",
    "avg_pct_book_built",
    "fy26_target_pct_book_built",
    "opp_plateau_rev_per_job",
    "coverage_at_inflection",
    "median_impact_calls_per_account",
}


def parse_val(key: str, val: str | None):
    if val is None or val == "":
        return None
    if key in INT_FIELDS:
        return int(float(val))
    if key in FLOAT_FIELDS:
        return float(val)
    return val


def row_to_market(row: dict) -> dict:
    market = {}
    for key, val in row.items():
        if key == "optimal_headcount_assigned":
            market["optimal_headcount"] = parse_val(key, val)
        elif key == "sbs_whitespace_country":
            market["sbs_whitespace_country"] = parse_val(key, val)
            market["sbs_whitespace"] = parse_val(key, val)  # legacy alias
        else:
            market[key] = parse_val(key, val)
    return market


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    path = Path(sys.argv[1])
    markets = []
    sbs_by_market: dict[str, dict] = {}

    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            market = row_to_market(row)
            markets.append(market)
            key = f"{market['country']}-{market['segment']}"
            ws = market.get("sbs_whitespace_country")
            if ws:
                sbs_by_market[key] = {
                    "country": market["country"],
                    "segment": market["segment"],
                    "accounts": ws,
                    "revenue_90d": market.get("sbs_revenue_90d"),
                }

    payload = {
        "updated_at": date.today().isoformat(),
        "window": "90d ending 2026-07-25 (20260427–20260725 vs prior 20260128–20260426)",
        "query": "sql/16_dashboard_export.sql",
        "amer_markets": ["US", "CA", "UK", "DACH", "BNL"],
        "markets": sorted(markets, key=lambda m: -m["revenue_90d"]),
        "sbs_whitespace": sorted(
            sbs_by_market.values(),
            key=lambda r: -(r.get("revenue_90d") or 0),
        ),
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(markets)} markets to {OUT}")


if __name__ == "__main__":
    main()
