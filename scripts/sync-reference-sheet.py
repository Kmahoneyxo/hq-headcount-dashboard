#!/usr/bin/env python3
"""Import Google Sheet export (CSV) as reference data for dashboard cross-check.

The live Sheet is SSO-gated — export from Google Sheets:
  File → Download → Comma-separated values (.csv)
Save as docs/data/reference-sheet.csv (gid=1002 tab), then run:

  python3 scripts/sync-reference-sheet.py
  python3 scripts/sync-reference-sheet.py path/to/export.csv

Writes docs/data/reference_check.json for the dashboard to compare against headcount.json.
"""

from __future__ import annotations

import csv
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV = ROOT / "docs" / "data" / "reference-sheet.csv"
OUT_JSON = ROOT / "docs" / "data" / "reference_check.json"

SHEET_URL = (
    "https://docs.google.com/spreadsheets/d/"
    "1Hq64TSm77FVH4hLxME2wrs1bJbT8Qi9Puk4FWMdkGsw/edit#gid=1002"
)

# Header aliases → canonical field keys (first match wins per column).
FIELD_ALIASES: dict[str, list[str]] = {
    "market": ["market"],
    "country": ["country"],
    "segment": ["segment", "gtm segment", "sales segment"],
    "ideal_pcid": [
        "ideal pcid (accounts/rep)",
        "ideal pcid",
        "ideal book size (accounts/rep)",
        "perfect book target",
        "ideal_pcid",
    ],
    "optimal_headcount": [
        "ideal headcount",
        "optimal hc",
        "optimal headcount",
        "ideal headcount (assigned accounts)",
    ],
    "current_reps": ["current reps", "current_reps", "reps"],
    "headcount_gap": ["headcount gap", "hc gap", "headcount_gap"],
    "headcount_recommendation": [
        "hc recommendation",
        "headcount recommendation",
        "recommendation",
        "summary status (hc)",
        "headcount_recommendation",
    ],
    "assigned_accounts": ["assigned accounts", "assigned_accounts"],
    "avg_pcid_per_rep": ["avg pcid per rep", "avg pcid/rep", "current avg book"],
    "revenue_90d": ["revenue 90d ($)", "revenue 90d", "revenue_90d"],
}

COMPARE_FIELDS = [
    "ideal_pcid",
    "optimal_headcount",
    "current_reps",
    "headcount_gap",
    "headcount_recommendation",
    "assigned_accounts",
    "avg_pcid_per_rep",
]


def norm_header(h: str) -> str:
    return re.sub(r"\s+", " ", (h or "").strip().lower())


def map_headers(headers: list[str]) -> dict[str, str]:
    """Map canonical field → original CSV header."""
    mapping: dict[str, str] = {}
    norm_to_orig = {norm_header(h): h for h in headers if h}
    for field, aliases in FIELD_ALIASES.items():
        for alias in aliases:
            if alias in norm_to_orig:
                mapping[field] = norm_to_orig[alias]
                break
    return mapping


def parse_num(raw: str | None) -> float | int | None:
    if raw is None or str(raw).strip() == "":
        return None
    s = str(raw).strip().replace(",", "").replace("$", "").replace("%", "")
    if s.lower() in ("—", "-", "n/a", "na"):
        return None
    try:
        f = float(s)
        return int(f) if f == int(f) else f
    except ValueError:
        return None


def parse_str(raw: str | None) -> str | None:
    if raw is None or str(raw).strip() == "":
        return None
    return str(raw).strip()


def market_key(row: dict, col_map: dict[str, str]) -> str | None:
    if "market" in col_map:
        m = parse_str(row.get(col_map["market"]))
        if m:
            return m.upper().replace(" ", "")
    country = parse_str(row.get(col_map.get("country", ""))) if "country" in col_map else None
    segment = parse_str(row.get(col_map.get("segment", ""))) if "segment" in col_map else None
    if country and segment:
        return f"{country.upper()}-{segment.upper()}"
    return None


def row_to_record(row: dict, col_map: dict[str, str]) -> dict:
    rec: dict = {}
    for field in FIELD_ALIASES:
        if field not in col_map:
            continue
        raw = row.get(col_map[field])
        if field == "headcount_recommendation":
            rec[field] = parse_str(raw)
        else:
            rec[field] = parse_num(raw) if field != "market" else parse_str(raw)
    return rec


def main() -> int:
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    if not csv_path.is_file():
        print(f"Missing CSV: {csv_path}")
        print("Export gid=1002 from Google Sheets → docs/data/reference-sheet.csv")
        return 1

    with csv_path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        col_map = map_headers(list(headers))
        if not col_map:
            print("Could not map any columns. Headers:", headers[:20])
            return 1

        markets: dict[str, dict] = {}
        skipped = 0
        for row in reader:
            key = market_key(row, col_map)
            if not key:
                skipped += 1
                continue
            markets[key] = row_to_record(row, col_map)

    payload = {
        "source_url": SHEET_URL,
        "source_gid": "1002",
        "source_csv": str(csv_path.resolve().relative_to(ROOT.resolve()) if csv_path.resolve().is_relative_to(ROOT.resolve()) else str(csv_path)),
        "imported_at": date.today().isoformat(),
        "columns_mapped": col_map,
        "compare_fields": COMPARE_FIELDS,
        "markets": markets,
        "row_count": len(markets),
        "skipped_rows": skipped,
    }
    OUT_JSON.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"Wrote {OUT_JSON} — {len(markets)} markets, columns: {list(col_map.keys())}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
