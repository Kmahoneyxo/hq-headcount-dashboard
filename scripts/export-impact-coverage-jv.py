#!/usr/bin/env python3
"""Export impact coverage + JV (job value) for all reps to a single Excel sheet.

Usage:
  python3 scripts/export-impact-coverage-jv.py

Inputs:
  docs/data/impact_coverage_all_reps.json  — impact coverage (sql/18)
  docs/data/rep_jv_all_reps.json           — jobs_90d, rev_per_job (sql/19, optional)

Output:
  docs/data/impact_coverage_jv.xlsx
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IC_PATH = ROOT / "docs" / "data" / "impact_coverage_all_reps.json"
JV_PATH = ROOT / "docs" / "data" / "rep_jv_all_reps.json"
OUT_PATH = ROOT / "docs" / "data" / "impact_coverage_jv.xlsx"

FIELD_LABELS: dict[str, str] = {
    "sales_rep_id": "Sales rep ID",
    "country": "Country",
    "segment": "Segment",
    "team": "Team",
    "pcid_count": "PCID count",
    "impact_calls_90d": "Impact calls 90d",
    "impact_calls_per_account": "Impact calls / account",
    "revenue_90d": "Revenue 90d ($)",
    "jobs_90d": "Jobs 90d",
    "rev_per_job": "Rev / job (JV)",
    "segment_avg_coverage": "Segment avg coverage",
    "too_big": "Too big",
}

KEY_ORDER = list(FIELD_LABELS.keys())


def load_json(path: Path) -> dict:
    if not path.is_file():
        print(f"Missing input: {path}")
        sys.exit(1)
    return json.loads(path.read_text(encoding="utf-8"))


def load_json_optional(path: Path) -> dict:
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def jv_lookup(jv_payload: dict) -> dict[tuple[str, str, int], dict]:
    lookup: dict[tuple[str, str, int], dict] = {}
    for rep in jv_payload.get("reps", []):
        key = (rep["country"], rep["segment"], int(rep["sales_rep_id"]))
        lookup[key] = rep
    return lookup


def merge_rows(ic_payload: dict, jv_payload: dict) -> list[dict]:
    jv_by_rep = jv_lookup(jv_payload) if jv_payload else {}
    rows: list[dict] = []
    for rep in ic_payload.get("reps", []):
        key = (rep["country"], rep["segment"], int(rep["sales_rep_id"]))
        jv = jv_by_rep.get(key, {})
        jobs = jv.get("jobs_90d")
        rev_per_job = jv.get("rev_per_job")
        revenue = rep.get("revenue_90d")
        if rev_per_job is None and jobs and revenue:
            rev_per_job = round(float(revenue) / float(jobs), 2)
        rows.append({
            "sales_rep_id": rep["sales_rep_id"],
            "country": rep["country"],
            "segment": rep["segment"],
            "team": rep.get("sales_team_name"),
            "pcid_count": rep.get("pcid_count"),
            "impact_calls_90d": rep.get("impact_calls_90d"),
            "impact_calls_per_account": rep.get("impact_calls_per_account"),
            "revenue_90d": revenue,
            "jobs_90d": jobs,
            "rev_per_job": rev_per_job,
            "segment_avg_coverage": rep.get("segment_avg_coverage"),
            "too_big": rep.get("too_big_coverage_signal"),
        })
    return rows


def label_for(key: str) -> str:
    return FIELD_LABELS.get(key, key.replace("_", " ").title())


def write_xlsx(rows: list[dict], path: Path) -> None:
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font
        from openpyxl.utils import get_column_letter
    except ImportError:
        print("openpyxl not installed — pip install openpyxl")
        sys.exit(1)

    wb = Workbook()
    bold = Font(bold=True)
    ws = wb.active
    ws.title = "Impact coverage + JV"

    keys = KEY_ORDER
    ws.append([label_for(k) for k in keys])
    for cell in ws[1]:
        cell.font = bold
    for row in rows:
        ws.append([row.get(k) for k in keys])

    for col_idx, key in enumerate(keys, start=1):
        label = label_for(key)
        width = min(max(len(str(label)) + 2, 12), 36)
        ws.column_dimensions[get_column_letter(col_idx)].width = width
    ws.column_dimensions["D"].width = 28
    ws.freeze_panes = "A2"
    if rows:
        ws.auto_filter.ref = ws.dimensions

    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)
    print(f"Wrote {len(rows)} rows to {path}")


def main() -> None:
    ic_payload = load_json(IC_PATH)
    jv_payload = load_json_optional(JV_PATH)
    rows = merge_rows(ic_payload, jv_payload)
    write_xlsx(rows, OUT_PATH)


if __name__ == "__main__":
    main()
