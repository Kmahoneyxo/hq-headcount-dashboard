#!/usr/bin/env python3
"""Build docs/data/headcount.json from query 16 MCP JSON export.

Usage:
  python3 scripts/json-from-mcp-results.py docs/data/query16_results.json
"""

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "data" / "headcount.json"
AMER = ["US", "CA", "UK", "DACH", "BNL"]

ENRICHMENT_KEYS = [
    "sbs_whitespace_country",
    "sbs_revenue_90d",
    "avg_fy26_book_score",
    "avg_pct_book_built",
    "fy26_target_pct_book_built",
    "opp_plateau_book_max",
    "opp_plateau_rev_per_job",
    "coverage_inflection_book_max",
    "coverage_at_inflection",
    "median_impact_calls_per_account",
    "headroom_accounts",
    "books_buildable_from_sbs",
    "opp_pipeline_status",
    "coverage_status",
    "recommended_action",
]


def headcount_recommendation(m: dict) -> str:
    optimal = m.get("optimal_headcount") or m.get("optimal_headcount_assigned")
    current = m.get("current_reps")
    growth = m.get("perfect_book_growth_pct") or 0
    if optimal is None or current is None:
        return "Hold"
    if current < optimal * 0.90 and growth > 0:
        return "Hire"
    if current > optimal * 1.10:
        return "Optimize"
    if growth <= 0:
        return "Do Not Hire"
    return "Hold"


def recommended_action(m: dict) -> str:
    rec = m.get("headcount_recommendation") or headcount_recommendation(m)
    sbs = m.get("sbs_whitespace_country") or m.get("sbs_whitespace") or 0
    target = m.get("perfect_book_target") or 0
    avg_book = m.get("current_avg_book") or 0
    built = m.get("avg_pct_book_built")
    opp_max = m.get("opp_plateau_book_max")

    if rec == "Optimize":
        return "Optimize HC"
    if rec == "Hire" and sbs >= target:
        return "Hire + build books from SBS"
    if rec == "Hire":
        return "Hire"
    if avg_book < target * 0.90 and sbs >= target:
        books = int(sbs // target) if target else 0
        return f"Build {books} new books from SBS"
    if avg_book < target * 0.90 and built is not None and built < 50:
        return "Grow books + improve FY26 score"
    if avg_book < target * 0.90:
        return "Grow books toward perfect book"
    if built is not None and built < 50:
        return "Improve FY26 book build score"
    if opp_max and avg_book >= opp_max * 0.95:
        return "Hold — opp pipeline plateaued"
    return "On track"


def merge_prior_enrichment(markets: list[dict]) -> None:
    if not OUT.is_file():
        return
    prior = json.loads(OUT.read_text(encoding="utf-8"))
    by_key = {f"{m['country']}-{m['segment']}": m for m in prior.get("markets", [])}
    for m in markets:
        old = by_key.get(f"{m['country']}-{m['segment']}")
        if not old:
            continue
        for key in ENRICHMENT_KEYS:
            if m.get(key) is None and old.get(key) is not None:
                m[key] = old[key]


def normalize_market(row: dict) -> dict:
    m = dict(row)
    if "optimal_headcount_assigned" in m and "optimal_headcount" not in m:
        m["optimal_headcount"] = int(m["optimal_headcount_assigned"])
    if "sbs_whitespace_country" in m:
        m["sbs_whitespace"] = m["sbs_whitespace_country"]
    if "avg_pct_book_built" in m and m["avg_pct_book_built"] is not None:
        m["avg_pct_book_built"] = float(m["avg_pct_book_built"])
    if "perfect_book_growth_pct" in m and m["perfect_book_growth_pct"] is not None:
        m["perfect_book_growth_pct"] = float(m["perfect_book_growth_pct"])
    return m


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    raw = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    if isinstance(raw, dict) and "data" in raw:
        rows = raw["data"]
    elif isinstance(raw, list):
        rows = raw
    else:
        raise SystemExit("Expected MCP JSON with data[] or a list of rows")

    markets = [normalize_market(r) for r in rows]
    merge_prior_enrichment(markets)
    for m in markets:
        if not m.get("headcount_recommendation"):
            m["headcount_recommendation"] = headcount_recommendation(m)
        if not m.get("recommended_action"):
            m["recommended_action"] = recommended_action(m)
        if m.get("headroom_accounts") is None and m.get("perfect_book_target") is not None:
            m["headroom_accounts"] = max(
                0,
                round((m["perfect_book_target"] - (m.get("current_avg_book") or 0)) * (m.get("current_reps") or 0)),
            )
        sbs = m.get("sbs_whitespace_country") or 0
        target = m.get("perfect_book_target") or 0
        if m.get("books_buildable_from_sbs") is None and target > 0:
            m["books_buildable_from_sbs"] = int(sbs // target)
        if m.get("sbs_whitespace_country") is not None:
            m["sbs_whitespace"] = m["sbs_whitespace_country"]
    sbs = [
        {
            "country": m["country"],
            "segment": m["segment"],
            "accounts": m.get("sbs_whitespace_country") or 0,
            "revenue_90d": m.get("sbs_revenue_90d"),
        }
        for m in markets
        if (m.get("sbs_whitespace_country") or 0) > 0
    ]

    payload = {
        "updated_at": date.today().isoformat(),
        "window": "90d ending 2026-07-25 (20260427–20260725 vs prior 20260128–20260426)",
        "query": "sql/16_dashboard_export.sql",
        "amer_markets": AMER,
        "markets": sorted(markets, key=lambda m: -(m.get("revenue_90d") or 0)),
        "sbs_whitespace": sorted(sbs, key=lambda r: -(r.get("revenue_90d") or 0)),
    }

    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    us_m = next((m for m in markets if m.get("country") == "US" and m.get("segment") == "M"), None)
    print(f"Wrote {len(markets)} markets to {OUT}")
    if us_m:
        print(f"US-M perfect_book: {us_m.get('perfect_book_bucket')} target={us_m.get('perfect_book_target')}")

    import subprocess
    export_script = ROOT / "scripts" / "export-dashboard-data.py"
    if export_script.is_file():
        subprocess.run([sys.executable, str(export_script), str(OUT)], check=False)


if __name__ == "__main__":
    main()
