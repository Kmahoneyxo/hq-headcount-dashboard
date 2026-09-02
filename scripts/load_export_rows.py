"""Load Quest/MCP export rows from JSON or CSV (sql/17, sql/23, etc.)."""

from __future__ import annotations

import csv
import json
from pathlib import Path

_INT_FIELDS = frozenset(
    {
        "sales_rep_id",
        "pcid_count",
        "ideal_pcid",
        "segment_avg_pcid",
        "vs_ideal_pcid",
        "peel_to_ideal",
        "grow_slots",
        "impact_calls_90d",
        "bucket_order",
        "bucket_midpoint",
        "bucket_upper",
        "rep_count",
    }
)
_FLOAT_FIELDS = frozenset(
    {
        "pqr_90d",
        "revenue_90d",
        "impact_calls_per_account",
        "segment_avg_pqr",
        "median_growth_pct",
        "median_cpc_share",
        "median_cpa_share",
        "median_cpc_revenue_90d",
        "median_cpa_revenue_90d",
        "median_rev_per_job",
        "median_impact_calls_per_account",
    }
)
_BOOL_FIELDS = frozenset({"too_big", "too_little"})


def _coerce_value(key: str, value: object) -> object:
    if value is None or value == "":
        if key in _BOOL_FIELDS:
            return False
        return None
    if key in _BOOL_FIELDS:
        if isinstance(value, bool):
            return value
        return str(value).lower() in ("true", "1", "yes")
    if key in _INT_FIELDS:
        if isinstance(value, bool):
            return value
        try:
            f = float(value)
            return int(f) if f.is_integer() else f
        except (TypeError, ValueError):
            return value
    if key in _FLOAT_FIELDS:
        if isinstance(value, bool):
            return value
        try:
            return float(value)
        except (TypeError, ValueError):
            return value
    return value


def _coerce_row(row: dict) -> dict:
    return {k: _coerce_value(k, v) for k, v in row.items()}


def load_export_rows(path: Path) -> list[dict]:
    if path.suffix.lower() == ".csv":
        with path.open(encoding="utf-8", newline="") as f:
            return [_coerce_row(r) for r in csv.DictReader(f)]

    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, dict) and "data" in raw:
        return [_coerce_row(r) for r in raw["data"]]
    if isinstance(raw, list):
        return [_coerce_row(r) for r in raw]
    raise SystemExit(f"Expected data[] or CSV in {path}")
