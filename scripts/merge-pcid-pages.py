#!/usr/bin/env python3
"""Merge PCID partition page CSVs into docs/data/pcid_market_attributes.csv."""

from __future__ import annotations

import csv
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES_DIR = ROOT / "docs" / "data" / ".pcid_pages"
OUT_CSV = ROOT / "docs" / "data" / "pcid_market_attributes.csv"
OUT_JSON = ROOT / "docs" / "data" / "pcid_market_attributes.json"

EXECUTION_IDS = [
    "2dc32a5e-347a-4ba4-a703-6c7577ae655b",
    "ffb948b6-7b27-40ea-9390-aa70b952ac2f",
    "88861480-0bd9-4fea-858d-495b3ef69d0b",
]


def merge_pages() -> int:
    parts = sorted({p.name.split("_")[0] for p in PAGES_DIR.glob("part*_*.csv")})
    if not parts:
        print(f"No page files in {PAGES_DIR}")
        sys.exit(1)

    rows_written = 0
    with OUT_CSV.open("w", newline="", encoding="utf-8") as out_f:
        writer = None
        for part in parts:
            pages = sorted(PAGES_DIR.glob(f"{part}_*.csv"))
            for page in pages:
                with page.open(newline="", encoding="utf-8") as in_f:
                    reader = csv.reader(in_f)
                    header = next(reader)
                    if writer is None:
                        writer = csv.writer(out_f)
                        writer.writerow(header)
                    for row in reader:
                        writer.writerow(row)
                        rows_written += 1
                print(f"  {page.name}: merged")
    return rows_written


def write_metadata(row_count: int) -> None:
    payload = {
        "updated_at": date.today().isoformat(),
        "query": "sql/20_pcid_market_attributes.sql",
        "execution_ids": EXECUTION_IDS,
        "source_table": "datalake.scss.client_attributes_dim_parent_attributes_current",
        "note": "133,827 PCIDs on HQ rep books (excludes JP). Full table is 28M rows; scoped to sql/18 rep universe. Exported in 3 Quest partitions (MOD 3) due to 5k export_csv page limit.",
  "row_count": 133827,
    }
    OUT_JSON.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    print(f"Merging pages from {PAGES_DIR} ...")
    rows = merge_pages()
    write_metadata(rows)
    print(f"Wrote {rows:,} rows to {OUT_CSV}")
    print(f"Wrote metadata to {OUT_JSON}")


if __name__ == "__main__":
    main()
