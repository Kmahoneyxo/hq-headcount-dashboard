#!/usr/bin/env python3
"""Merge sql/17 all-rep export into docs/data/rep_book.json.

Usage:
  python3 scripts/merge-rep-book.py docs/data/query17_all_results.json
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "data" / "rep_book.json"

REP_FIELDS = (
    "country",
    "segment",
    "sales_rep_id",
    "sales_team_name",
    "pcid_count",
    "pqr_90d",
    "revenue_90d",
    "impact_calls_90d",
    "impact_calls_per_account",
    "ideal_pcid",
    "segment_avg_pcid",
    "segment_avg_pqr",
    "vs_ideal_pcid",
    "too_big",
    "too_little",
    "peel_to_ideal",
    "grow_slots",
)


def rep_row(raw: dict) -> dict:
    country = raw.get("country", "")
    segment = raw.get("segment", "")
    row = {
        "market": f"{country}-{segment}" if country and segment else "",
        "country": country,
        "segment": segment,
        "sales_rep_id": raw.get("sales_rep_id"),
        "sales_team_name": raw.get("sales_team_name"),
        "pcid_count": raw.get("pcid_count"),
        "pqr_90d": raw.get("pqr_90d"),
        "revenue_90d": raw.get("revenue_90d"),
        "impact_calls_90d": raw.get("impact_calls_90d"),
        "impact_calls_per_account": raw.get("impact_calls_per_account"),
        "ideal_pcid": raw.get("ideal_pcid"),
        "segment_avg_pcid": raw.get("segment_avg_pcid"),
        "segment_avg_pqr": raw.get("segment_avg_pqr"),
        "vs_ideal_pcid": raw.get("vs_ideal_pcid"),
        "too_big": bool(raw.get("too_big")),
        "too_little": bool(raw.get("too_little")),
        "peel_to_ideal": raw.get("peel_to_ideal"),
        "grow_slots": raw.get("grow_slots"),
    }
    return row


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    rows = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    if isinstance(rows, dict) and "data" in rows:
        rows = rows["data"]

    reps = [rep_row(r) for r in rows]
    reps.sort(key=lambda r: (r.get("country") or "", r.get("segment") or "", r.get("sales_rep_id") or 0))

    payload = {
        "updated_at": date.today().isoformat(),
        "query": "sql/17_rep_book_profile_all.sql",
        "note": "All reps with book profile — audit trail from market rollup to individual books",
        "rep_count": len(reps),
        "reps_flagged": sum(1 for r in reps if r["too_big"] or r["too_little"]),
        "reps": reps,
    }

    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(reps)} reps ({payload['reps_flagged']} flagged) to {OUT}")


if __name__ == "__main__":
    main()
