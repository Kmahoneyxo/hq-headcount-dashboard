#!/usr/bin/env python3
"""Merge sql/17 flagged-rep export into docs/data/book_health.json.

Usage:
  python3 scripts/merge-book-health.py docs/data/query17_results.json
  python3 scripts/merge-book-health.py docs/data/query17_flagged.csv
"""

import json
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from load_export_rows import load_export_rows

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "data" / "book_health.json"


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    rows = load_export_rows(Path(sys.argv[1]))

    by_market: dict[str, list] = defaultdict(list)
    for r in rows:
        key = f"{r['country']}-{r['segment']}"
        by_market[key].append(
            {
                "sales_rep_id": r.get("sales_rep_id"),
                "country": r.get("country"),
                "segment": r.get("segment"),
                "sales_team_name": r.get("sales_team_name"),
                "pcid_count": r.get("pcid_count"),
                "pqr_90d": r.get("pqr_90d"),
                "revenue_90d": r.get("revenue_90d"),
                "impact_calls_90d": r.get("impact_calls_90d"),
                "impact_calls_per_account": r.get("impact_calls_per_account"),
                "ideal_pcid": r.get("ideal_pcid"),
                "segment_avg_pcid": r.get("segment_avg_pcid"),
                "segment_avg_pqr": r.get("segment_avg_pqr"),
                "vs_ideal_pcid": r.get("vs_ideal_pcid"),
                "too_big": bool(r.get("too_big")),
                "too_little": bool(r.get("too_little")),
                "peel_to_ideal": r.get("peel_to_ideal"),
                "grow_slots": r.get("grow_slots"),
            }
        )

    payload = {
        "updated_at": date.today().isoformat(),
        "query": "sql/17_rep_book_profile.sql",
        "note": "Flagged reps only (too big or too little)",
        "markets": {
            k: {
                "reps_flagged": len(v),
                "reps_too_big": sum(1 for x in v if x["too_big"]),
                "reps_too_little": sum(1 for x in v if x["too_little"]),
                "splittable_pool": sum(x.get("peel_to_ideal") or 0 for x in v),
                "reps": v,
            }
            for k, v in sorted(by_market.items())
        },
    }

    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote book health for {len(by_market)} markets to {OUT}")


if __name__ == "__main__":
    main()
