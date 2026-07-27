#!/usr/bin/env python3
"""Convert query 10 CSV export to docs/data/headcount.json.

Usage:
  python3 scripts/csv-to-dashboard-json.py export.csv

CSV columns (from query 10):
  segment, country, perfect_book_bucket, perfect_book_target, perfect_book_growth_pct,
  current_reps, current_avg_book, revenue_90d, optimal_headcount_assigned,
  headcount_gap, headcount_recommendation, sbs_whitespace_segment
"""

import csv
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "data" / "headcount.json"


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    path = Path(sys.argv[1])
    markets = []
    sbs_by_segment: dict[str, int] = {}

    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            seg = row["segment"]
            ws = row.get("sbs_whitespace_segment") or row.get("sbs_whitespace")
            if ws:
                sbs_by_segment[seg] = int(float(ws))
            markets.append(
                {
                    "segment": seg,
                    "country": row["country"],
                    "perfect_book_bucket": row["perfect_book_bucket"],
                    "perfect_book_target": int(float(row["perfect_book_target"])),
                    "perfect_book_growth_pct": float(row["perfect_book_growth_pct"]),
                    "current_reps": int(float(row["current_reps"])),
                    "current_avg_book": int(float(row["current_avg_book"])),
                    "revenue_90d": float(row["revenue_90d"]),
                    "optimal_headcount": int(
                        float(row.get("optimal_headcount_assigned") or row["optimal_headcount"])
                    ),
                    "headcount_gap": int(float(row["headcount_gap"])),
                    "headcount_recommendation": row["headcount_recommendation"],
                    "sbs_whitespace": int(float(ws)) if ws else None,
                }
            )

    payload = {
        "updated_at": date.today().isoformat(),
        "window": "90d — see sql/10_perfect_book_headcount_country_segment.sql",
        "query": "sql/10_perfect_book_headcount_country_segment.sql",
        "markets": sorted(markets, key=lambda m: -m["revenue_90d"]),
        "sbs_whitespace": [
            {"segment": s, "accounts": a} for s, a in sorted(sbs_by_segment.items())
        ],
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(markets)} markets to {OUT}")


if __name__ == "__main__":
    main()
