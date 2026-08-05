#!/usr/bin/env python3
"""Add country×segment markets missing from headcount.json.

Uses rep_book.json aggregates + peer-segment / segment-median ideal PCID fallback
(mirrors sql/16 perfect_book_source when curve cannot compute).

Usage:
  python3 scripts/enrich-missing-markets.py
  python3 scripts/enrich-missing-markets.py docs/data/headcount.json
"""

from __future__ import annotations

import json
import statistics
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_HC = ROOT / "docs" / "data" / "headcount.json"
DEFAULT_REP = ROOT / "docs" / "data" / "rep_book.json"
DEFAULT_BH = ROOT / "docs" / "data" / "book_health.json"

sys.path.insert(0, str(ROOT / "scripts"))
from build_market_summary import enrich_market, load_rep_jv_by_id  # noqa: E402

DEFAULT_JV = ROOT / "docs" / "data" / "rep_jv_all_reps.json"

import importlib.util

_spec = importlib.util.spec_from_file_location(
    "json_from_mcp_results", ROOT / "scripts" / "json-from-mcp-results.py"
)
_jfr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_jfr)
headcount_recommendation = _jfr.headcount_recommendation
recommended_action = _jfr.recommended_action


def market_key(country: str, segment: str) -> str:
    return f"{country}-{segment}"


def peer_ideal(existing: list[dict], country: str, segment: str) -> dict | None:
    """Same segment, different country — pick market with most reps that has ideal PCID."""
    peers = [
        m
        for m in existing
        if m.get("segment") == segment
        and m.get("country") != country
        and (m.get("ideal_pcid") or m.get("perfect_book_target"))
    ]
    if not peers:
        return None
    return max(peers, key=lambda m: m.get("current_reps") or 0)


def aggregate_rep_book(reps: list[dict]) -> dict:
    pcids = [r["pcid_count"] for r in reps if r.get("pcid_count") is not None]
    pqrs = [r["pqr_90d"] for r in reps if r.get("pqr_90d") is not None]
    revs = [r["revenue_90d"] for r in reps if r.get("revenue_90d") is not None]
    covs = []
    for r in reps:
        v = r.get("impact_calls_per_account")
        if v is not None and v != "":
            try:
                covs.append(float(v))
            except (TypeError, ValueError):
                pass
    too_big = sum(1 for r in reps if r.get("too_big"))
    too_little = sum(1 for r in reps if r.get("too_little"))
    peel = sum(r.get("peel_to_ideal") or 0 for r in reps)
    grow = sum(r.get("grow_slots") or 0 for r in reps)
    ideal_vals = [r["ideal_pcid"] for r in reps if r.get("ideal_pcid") is not None]

    assigned = sum(pcids)
    current_reps = len(reps)
    avg_pcid = statistics.mean(pcids) if pcids else None
    median_pcid = int(round(statistics.median(pcids))) if pcids else None
    ideal = ideal_vals[0] if ideal_vals else median_pcid

    return {
        "assigned_accounts": assigned,
        "current_reps": current_reps,
        "current_avg_book": int(round(avg_pcid)) if avg_pcid else None,
        "revenue_90d": sum(revs) if revs else 0,
        "market_pqr_90d": sum(pqrs) if pqrs else None,
        "avg_pqr_per_rep": int(round(statistics.mean(pqrs))) if pqrs else None,
        "ideal_pcid": ideal,
        "perfect_book_target": ideal,
        "segment_avg_pcid": round(avg_pcid, 1) if avg_pcid else None,
        "segment_avg_pqr": int(round(statistics.mean(pqrs))) if pqrs else None,
        "median_impact_calls_per_account": round(statistics.median(covs), 2) if covs else None,
        "reps_too_big": too_big,
        "reps_too_little": too_little,
        "splittable_pool": int(peel),
        "total_grow_slots": int(grow),
        "median_pcid": median_pcid,
    }


def resolve_ideal(m: dict, existing: list[dict], source_note: str) -> None:
    country, segment = m["country"], m["segment"]
    ideal = m.get("ideal_pcid") or m.get("perfect_book_target")
    if ideal:
        m.setdefault("perfect_book_ceiling", ideal)
        m.setdefault("perfect_book_source", source_note or "rep_book")
        return

    peer = peer_ideal(existing, country, segment)
    if peer:
        ideal = peer.get("ideal_pcid") or peer.get("perfect_book_target")
        m["ideal_pcid"] = ideal
        m["perfect_book_target"] = ideal
        m["perfect_book_bucket"] = peer.get("perfect_book_bucket")
        m["perfect_book_ceiling"] = peer.get("perfect_book_ceiling") or ideal
        m["perfect_book_growth_pct"] = peer.get("perfect_book_growth_pct", 0.0)
        m["perfect_book_source"] = f"peer_segment:{peer['country']}"
        return

    median = m.get("median_pcid")
    if median:
        m["ideal_pcid"] = median
        m["perfect_book_target"] = median
        m["perfect_book_bucket"] = f"median: {median}"
        m["perfect_book_ceiling"] = median
        m["perfect_book_growth_pct"] = 0.0
        m["perfect_book_source"] = "segment_median"
        return

    # Last resort: same-country largest market ideal (e.g. US-ACC → US-M)
    same_country = [x for x in existing if x.get("country") == country]
    if same_country:
        donor = max(same_country, key=lambda x: x.get("current_reps") or 0)
        ideal = donor.get("ideal_pcid") or donor.get("perfect_book_target")
        if ideal:
            m["ideal_pcid"] = ideal
            m["perfect_book_target"] = ideal
            m["perfect_book_bucket"] = donor.get("perfect_book_bucket")
            m["perfect_book_ceiling"] = donor.get("perfect_book_ceiling") or ideal
            m["perfect_book_growth_pct"] = donor.get("perfect_book_growth_pct", 0.0)
            m["perfect_book_source"] = f"peer_country:{donor['segment']}"


def fill_hc_fields(m: dict) -> None:
    ideal = m.get("perfect_book_target") or m.get("ideal_pcid") or 1
    assigned = m.get("assigned_accounts") or 0
    current = m.get("current_reps") or 0
    optimal = int(round(assigned / ideal)) if ideal else current
    m["optimal_headcount"] = optimal
    m["optimal_headcount_assigned"] = optimal
    m["headcount_gap"] = current - optimal
    if not m.get("headcount_recommendation"):
        m["headcount_recommendation"] = headcount_recommendation(m)
    if not m.get("recommended_action"):
        m["recommended_action"] = recommended_action(m)
    sbs = m.get("sbs_whitespace_country") or m.get("sbs_whitespace") or 0
    if m.get("books_buildable_from_sbs") is None and ideal:
        m["books_buildable_from_sbs"] = int(sbs // ideal)


def copy_country_sbs(m: dict, existing: list[dict]) -> None:
    country = m.get("country")
    donor = next((x for x in existing if x.get("country") == country), None)
    if not donor:
        return
    for key in ("sbs_whitespace_country", "sbs_whitespace", "sbs_revenue_90d"):
        if m.get(key) is None and donor.get(key) is not None:
            m[key] = donor[key]
    if m.get("sbs_whitespace_country") is not None:
        m["sbs_whitespace"] = m["sbs_whitespace_country"]


def enrich_missing_markets(
    payload: dict,
    rep_book_path: Path = DEFAULT_REP,
    book_health_path: Path = DEFAULT_BH,
) -> int:
    markets = payload.get("markets", [])
    existing_keys = {market_key(m["country"], m["segment"]) for m in markets}

    rep_by_market: dict[str, list[dict]] = {}
    jv_by_id = load_rep_jv_by_id(DEFAULT_JV)
    if rep_book_path.is_file():
        rb = json.loads(rep_book_path.read_text(encoding="utf-8"))
        for rep in rb.get("reps", []):
            key = rep.get("market") or market_key(rep.get("country", ""), rep.get("segment", ""))
            rep_by_market.setdefault(key, []).append(rep)

    bh_markets: set[str] = set()
    if book_health_path.is_file():
        bh = json.loads(book_health_path.read_text(encoding="utf-8"))
        bh_markets = set(bh.get("markets", {}).keys())

    candidate_keys = set(rep_by_market.keys()) | bh_markets
    added = 0

    for key in sorted(candidate_keys):
        if key in existing_keys or not key or key.endswith("-"):
            continue
        country, segment = key.split("-", 1)
        reps = rep_by_market.get(key, [])
        if not reps and key not in bh_markets:
            continue

        m: dict = {"country": country, "segment": segment}
        if reps:
            m.update(aggregate_rep_book(reps))
            resolve_ideal(m, markets, "rep_book")
        else:
            # book_health-only market (e.g. US-ACC) — use flagged rep stats + peer ideal
            bh_data = {}
            if book_health_path.is_file():
                bh_payload = json.loads(book_health_path.read_text(encoding="utf-8"))
                bh_data = bh_payload.get("markets", {}).get(key, {})
            flagged = bh_data.get("reps") or []
            if flagged:
                m["reps_too_big"] = bh_data.get("reps_too_big", 0)
                m["reps_too_little"] = bh_data.get("reps_too_little", 0)
                m["splittable_pool"] = bh_data.get("splittable_pool", 0)
                m["ideal_pcid"] = flagged[0].get("ideal_pcid")
                m["perfect_book_target"] = flagged[0].get("ideal_pcid")
                m["segment_avg_pcid"] = flagged[0].get("segment_avg_pcid")
                m["segment_avg_pqr"] = flagged[0].get("segment_avg_pqr")
                m["current_reps"] = max(len(flagged), bh_data.get("reps_flagged", 0))
                m["assigned_accounts"] = sum(r.get("pcid_count") or 0 for r in flagged)
                if m["current_reps"]:
                    m["current_avg_book"] = int(round(m["assigned_accounts"] / m["current_reps"]))
            resolve_ideal(m, markets, "book_health")
            m.setdefault("current_reps", 0)
            m.setdefault("revenue_90d", 0)

        copy_country_sbs(m, markets)
        fill_hc_fields(m)
        rep_map = rep_by_market if reps else None
        enrich_market(m, [x for x in markets if x.get("country") == country], rep_map, jv_by_id)
        markets.append(m)
        existing_keys.add(key)
        added += 1

    payload["markets"] = sorted(markets, key=lambda x: -(x.get("revenue_90d") or 0))
    return added


def main() -> None:
    hc_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_HC
    if not hc_path.is_file():
        print(f"Missing {hc_path}")
        sys.exit(1)

    payload = json.loads(hc_path.read_text(encoding="utf-8"))
    before = len(payload.get("markets", []))
    added = enrich_missing_markets(payload)
    payload["updated_at"] = date.today().isoformat()

    hc_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    after = len(payload.get("markets", []))
    print(f"Markets: {before} → {after} (+{added})")
    keys = sorted(f"{m['country']}-{m['segment']}" for m in payload["markets"])
    print("Markets:", ", ".join(keys))
    us_acc = next((m for m in payload["markets"] if m["country"] == "US" and m["segment"] == "ACC"), None)
    print(f"US-ACC in headcount: {'yes' if us_acc else 'no'}" + (f" ({us_acc.get('current_reps')} reps)" if us_acc else ""))


if __name__ == "__main__":
    main()
