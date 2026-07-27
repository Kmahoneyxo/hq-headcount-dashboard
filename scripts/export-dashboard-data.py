#!/usr/bin/env python3
"""Export docs/data/headcount.json to CSV and Excel for stakeholders.

Usage:
  python3 scripts/export-dashboard-data.py
  python3 scripts/export-dashboard-data.py path/to/headcount.json

Outputs (by default):
  docs/data/headcount-dashboard.csv
  docs/data/headcount-dashboard.xlsx  (requires openpyxl)
"""

from __future__ import annotations

import csv
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_IN = ROOT / "docs" / "data" / "headcount.json"
OUT_DIR = ROOT / "docs" / "data"
CSV_OUT = OUT_DIR / "headcount-dashboard.csv"
XLSX_OUT = OUT_DIR / "headcount-dashboard.xlsx"

# Dashboard table order — stakeholder-friendly (ideal HC first).
MARKET_COLUMNS = [
    ("market", "Market"),
    ("country", "Country"),
    ("segment", "Segment"),
    ("optimal_headcount", "Ideal headcount"),
    ("current_reps", "Current reps"),
    ("headcount_gap", "Headcount gap"),
    ("headcount_recommendation", "HC recommendation"),
    ("perfect_book_target", "Ideal book size (accounts/rep)"),
    ("perfect_book_bucket", "Perfect book bucket"),
    ("perfect_book_ceiling", "Perfect book ceiling"),
    ("perfect_book_growth_pct", "Perfect book growth %"),
    ("current_avg_book", "Current avg book"),
    ("assigned_accounts", "Assigned accounts"),
    ("revenue_90d", "Revenue 90d ($)"),
    ("recommended_action", "Recommended action"),
    ("avg_pct_book_built", "FY26 % book built"),
    ("avg_fy26_book_score", "FY26 book score"),
    ("fy26_target_pct_book_built", "FY26 target % (TBD)"),
    ("headroom_accounts", "Headroom accounts"),
    ("sbs_whitespace_country", "SBS whitespace (country)"),
    ("sbs_revenue_90d", "SBS revenue 90d ($)"),
    ("books_buildable_from_sbs", "Books buildable from SBS"),
    ("opp_plateau_book_max", "Opp plateau book max"),
    ("opp_plateau_rev_per_job", "Opp plateau $/job"),
    ("opp_pipeline_status", "Opp pipeline status"),
    ("coverage_inflection_book_max", "Coverage inflection book max"),
    ("coverage_at_inflection", "Coverage at inflection"),
    ("median_impact_calls_per_account", "Median impact calls/account"),
    ("coverage_status", "Coverage status"),
]

SBS_COLUMNS = [
    ("country", "Country"),
    ("segment", "Segment"),
    ("accounts", "SBS accounts"),
    ("revenue_90d", "SBS revenue 90d ($)"),
]

META_ROWS = [
    ("updated_at", "Data as of"),
    ("window", "Revenue window"),
    ("query", "Source query"),
    ("exported_at", "Export generated"),
]


def market_row(market: dict) -> dict:
    row = dict(market)
    row["market"] = f"{market.get('country', '')}-{market.get('segment', '')}"
    # Normalize legacy alias
    if row.get("sbs_whitespace_country") is None and row.get("sbs_whitespace") is not None:
        row["sbs_whitespace_country"] = row["sbs_whitespace"]
    return row


def flatten_markets(payload: dict) -> list[dict]:
    return [market_row(m) for m in payload.get("markets", [])]


def write_csv(payload: dict, path: Path) -> None:
    markets = flatten_markets(payload)
    fieldnames = [key for key, _ in MARKET_COLUMNS]
    headers = {key: label for key, label in MARKET_COLUMNS}

    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writerow(headers)
        for row in markets:
            writer.writerow({k: row.get(k, "") for k in fieldnames})

    print(f"Wrote {len(markets)} markets to {path}")


def write_xlsx(payload: dict, path: Path) -> bool:
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font
        from openpyxl.utils import get_column_letter
    except ImportError:
        print("openpyxl not installed — skipping .xlsx (pip install openpyxl)")
        return False

    wb = Workbook()
    bold = Font(bold=True)

    # --- Markets sheet ---
    ws = wb.active
    ws.title = "Markets"
    keys = [k for k, _ in MARKET_COLUMNS]
    labels = [label for _, label in MARKET_COLUMNS]
    ws.append(labels)
    for cell in ws[1]:
        cell.font = bold

    for market in flatten_markets(payload):
        ws.append([market.get(k) for k in keys])

    for col_idx, (_, label) in enumerate(MARKET_COLUMNS, start=1):
        width = min(max(len(str(label)) + 2, 12), 36)
        ws.column_dimensions[get_column_letter(col_idx)].width = width
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    # --- SBS sheet ---
    ws_sbs = wb.create_sheet("SBS whitespace")
    sbs_keys = [k for k, _ in SBS_COLUMNS]
    sbs_labels = [label for _, label in SBS_COLUMNS]
    ws_sbs.append(sbs_labels)
    for cell in ws_sbs[1]:
        cell.font = bold
    for row in payload.get("sbs_whitespace", []):
        ws_sbs.append([row.get(k) for k in sbs_keys])
    ws_sbs.freeze_panes = "A2"

    # --- Metadata sheet ---
    ws_meta = wb.create_sheet("About")
    ws_meta.append(["Field", "Value"])
    for cell in ws_meta[1]:
        cell.font = bold
    exported_at = date.today().isoformat()
    meta = {
        "updated_at": payload.get("updated_at", ""),
        "window": payload.get("window", ""),
        "query": payload.get("query", ""),
        "exported_at": exported_at,
    }
    for key, label in META_ROWS:
        ws_meta.append([label, meta.get(key, payload.get(key, ""))])
    ws_meta.append([])
    ws_meta.append(["AMER focus markets", ", ".join(payload.get("amer_markets", []))])
    ws_meta.column_dimensions["A"].width = 28
    ws_meta.column_dimensions["B"].width = 72

    wb.save(path)
    print(f"Wrote Excel workbook to {path}")
    return True


def main() -> None:
    in_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_IN
    if not in_path.is_file():
        print(f"Missing input: {in_path}")
        sys.exit(1)

    payload = json.loads(in_path.read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    write_csv(payload, CSV_OUT)
    write_xlsx(payload, XLSX_OUT)


if __name__ == "__main__":
    main()
