#!/usr/bin/env python3
"""Merge sql/23–24 bucket exports into docs/data/headcount.json.

Usage:
  python3 scripts/merge-bucket-exports.py docs/data/product_mix_by_bucket.json
  python3 scripts/merge-bucket-exports.py docs/data/coverage_by_bucket.json --field coverage_by_bucket

Each input file: MCP JSON with data[] rows (segment, country, book_bucket, bucket_order, …).
Groups rows by country-segment into arrays on matching headcount.json markets.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "data" / "headcount.json"


def load_rows(path: Path) -> list[dict]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, dict) and "data" in raw:
        return raw["data"]
    if isinstance(raw, list):
        return raw
    raise SystemExit(f"Expected data[] in {path}")


def group_by_market(rows: list[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = {}
    for r in rows:
        key = f"{r['country']}-{r['segment']}"
        grouped.setdefault(key, []).append(r)
    for key in grouped:
        grouped[key].sort(key=lambda b: b.get("bucket_order") or 0)
    return grouped


def merge_field(headcount_path: Path, rows: list[dict], field: str) -> int:
    payload = json.loads(headcount_path.read_text(encoding="utf-8"))
    by_market = group_by_market(rows)
    n = 0
    for m in payload.get("markets", []):
        key = f"{m['country']}-{m['segment']}"
        if key in by_market:
            m[field] = by_market[key]
            n += 1
    headcount_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return n


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    path = Path(sys.argv[1])
    field = "product_mix_by_bucket"
    if len(sys.argv) >= 3 and sys.argv[2] == "--field":
        field = sys.argv[3] if len(sys.argv) >= 4 else field
    elif path.name.startswith("coverage"):
        field = "coverage_by_bucket"

    rows = load_rows(path)
    n = merge_field(OUT, rows, field)
    print(f"Merged {len(rows)} bucket rows into {n} markets ({field}) → {OUT}")


if __name__ == "__main__":
    main()
