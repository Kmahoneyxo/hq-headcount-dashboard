#!/usr/bin/env python3
"""Plain-English market summaries for headcount dashboard.

One clear HC reason per market, prominent SBS routing, minimal duplicate bullets.
Used by json-from-mcp-results.py (embed in headcount.json) and
export-dashboard-data.py (Market summaries sheet).

Usage:
  python3 scripts/build_market_summary.py
  python3 scripts/build_market_summary.py docs/data/headcount.json
"""

from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_IN = ROOT / "docs" / "data" / "headcount.json"
DEFAULT_REP_BOOK = ROOT / "docs" / "data" / "rep_book.json"

# Healthy book thresholds (aligned with sql/16–17 rep_book_flags)
PCID_TOLERANCE_PCT = 10  # document ±10% band around ideal PCID
COVERAGE_FLOOR_RATIO = 0.90  # too_big uses segment_avg_coverage * 0.90
GROWTH_PEAK_FLOOR_RATIO = 0.85  # perfect book stays within 85% of segment peak (sql/16)
MIN_REPS_PER_BUCKET = 5
MIN_REPS_PERFECT_BUCKET = 20
MIN_PQR_FOR_GROWTH = 5000  # sql/16 rep_filtered


# PCID buckets aligned with sql/16_dashboard_export.sql
PCID_BUCKETS: list[tuple[int, str, int, int, int]] = [
    (1, "01: 1-10", 5, 10, 10),
    (2, "02: 11-20", 15, 20, 20),
    (3, "03: 21-30", 25, 30, 30),
    (4, "04: 31-40", 35, 40, 40),
    (5, "05: 41-50", 45, 50, 50),
    (6, "06: 51-65", 58, 65, 65),
    (7, "07: 66-80", 73, 80, 80),
    (8, "08: 81-100", 90, 100, 100),
    (9, "09: 101-125", 113, 125, 125),
    (10, "10: 126-150", 138, 150, 150),
    (11, "11: 150+", 175, 999, 999),
]


def _num(v, default=0):
    if v is None:
        return default
    return v


def summary_status(m: dict) -> str:
    """Over HC / Under HC / At target based on model thresholds."""
    rec = m.get("headcount_recommendation")
    if rec == "Optimize":
        return "Over HC"
    if rec == "Hire":
        return "Under HC"
    if rec == "Do Not Hire":
        return "At target"
    gap = m.get("headcount_gap")
    optimal = m.get("optimal_headcount") or m.get("optimal_headcount_assigned")
    current = m.get("current_reps")
    if gap is not None and optimal and current is not None:
        if current > optimal * 1.10:
            return "Over HC"
        if current < optimal * 0.90:
            return "Under HC"
    return "At target"


def book_health_status(m: dict) -> str:
    """Overweight / Underweight / On target based on avg PCID vs ideal."""
    _, label = _book_vs_ideal(m)
    if label == "overweight":
        return "Overweight"
    if label == "underweight":
        return "Underweight"
    if label == "on target":
        return "On target"
    return "Unknown"


def _fmt_int(n) -> str:
    if n is None:
        return "—"
    return f"{int(round(n)):,}"


def _book_vs_ideal(m: dict) -> tuple[str, str]:
    """Return (comparison phrase, short label: underweight/overweight/on target)."""
    ideal = m.get("ideal_pcid") or m.get("perfect_book_target")
    avg = m.get("current_avg_book")
    if ideal is None or avg is None:
        return "", ""
    ratio = avg / ideal if ideal else 1
    if ratio < 0.90:
        return f"avg book {int(round(avg))} vs ideal {int(ideal)}", "underweight"
    if ratio > 1.10:
        return f"avg book {int(round(avg))} vs ideal {int(ideal)}", "overweight"
    return f"avg book {int(round(avg))} vs ideal {int(ideal)}", "on target"


def _fmt_pct(p: float | None) -> str:
    if p is None:
        return "—"
    return f"{p * 100:.0f}%"


def _fmt_money(n) -> str:
    if n is None:
        return "—"
    n = float(n)
    if n >= 1_000_000:
        return f"${n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"${n / 1_000:.0f}K"
    return f"${n:,.0f}"


def _flag_pct(count, total) -> str:
    if not total:
        return ""
    return f" ({round(100 * count / total):.0f}%)"


def score_segment_for_sbs(m: dict) -> float:
    """Heuristic: which segment in a country should receive SBS accounts."""
    score = 0.0
    status = summary_status(m)
    _, book_label = _book_vs_ideal(m)

    if status == "Under HC":
        score += min(abs(_num(m.get("headcount_gap"))), 100) * 0.5
    elif status == "Over HC":
        score -= 40

    if book_label == "underweight":
        score += 50
    elif book_label == "overweight":
        score -= 35

    grow = _num(m.get("total_grow_slots"))
    score += min(grow, 5000) * 0.02
    score += _num(m.get("reps_too_little")) * 0.5

    avg_pqr = m.get("avg_pqr_per_rep")
    seg_pqr = m.get("segment_avg_pqr")
    if avg_pqr and seg_pqr and avg_pqr >= seg_pqr * 0.95:
        score += 15

    jv = m.get("opp_plateau_rev_per_job")
    if jv:
        score += min(float(jv), 50) * 0.3

    if m.get("coverage_status") == "Declining":
        score -= 25

    return score


def build_hc_reason(m: dict) -> dict:
    """One dominant plain-English reason why HC is too high or too low."""
    status = summary_status(m)
    gap = int(round(_num(m.get("headcount_gap"))))
    gap_abs = abs(gap)
    current = int(round(_num(m.get("current_reps"))))
    optimal = int(round(_num(m.get("optimal_headcount") or m.get("optimal_headcount_assigned"))))
    _, book_label = _book_vs_ideal(m)
    cov_status = m.get("coverage_status") or "Unknown"
    median_cov = m.get("median_impact_calls_per_account")
    rev_pct = m.get("rev_vs_pqr_pct")
    growth = m.get("perfect_book_growth_pct")
    new_heads = m.get("new_heads_from_split")
    ideal = m.get("ideal_pcid") or m.get("perfect_book_target")
    avg_book = m.get("current_avg_book")

    if status == "At target":
        return {
            "hc_reason_primary": (
                f"HC at target — {current:,} reps vs {optimal:,} ideal "
                f"(assigned accounts ÷ ideal PCID of {int(ideal) if ideal else '—'})."
            ),
            "hc_reason_driver": "at_target",
        }

    direction = "LOW" if status == "Under HC" else "HIGH"
    drivers: list[tuple[str, int, str]] = []

    if cov_status == "Declining":
        cov_detail = (
            f"impact coverage is declining"
            + (f" ({median_cov:g} median calls/account)" if median_cov is not None else "")
            + " while books exceed the coverage inflection point"
        )
        if status == "Under HC":
            cov_detail += " — need more reps or smaller books to restore touch rate"
        drivers.append(("impact_coverage", 100, cov_detail))

    if status == "Over HC" and cov_status == "OK":
        plateau = m.get("opp_pipeline_status") == "Plateaued"
        weak_growth = growth is not None and growth <= 0
        if plateau or weak_growth:
            drivers.append(
                (
                    "impact_coverage_overstaff",
                    88,
                    "impact coverage is adequate but revenue growth has plateaued — over-staffed vs book capacity",
                )
            )

    if book_label == "overweight":
        book_detail = (
            f"books are overweight ({int(round(avg_book))} vs ideal {int(ideal)} PCIDs/rep)"
        )
        if cov_status == "OK":
            book_detail += " with OK impact coverage — redistribute/split before net-new hiring"
        elif cov_status == "Declining":
            book_detail += " and impact coverage is thin — books too big for touch rate"
        elif status == "Under HC":
            book_detail += " — the HC gap overstates need; split overweight books first"
        drivers.append(("books_overweight", 95, book_detail))

    if book_label == "underweight":
        if status == "Over HC":
            drivers.append(
                (
                    "underweight_overstaff",
                    92,
                    f"books are underweight ({int(round(avg_book))} vs ideal {int(ideal)} PCIDs/rep) — "
                    "grow existing books before cutting reps",
                )
            )
        elif status == "Under HC":
            drivers.append(
                (
                    "underweight_understaff",
                    85,
                    f"books are underweight ({int(round(avg_book))} vs ideal {int(ideal)} PCIDs/rep) — "
                    "hire to reach ideal book size per rep",
                )
            )

    if new_heads and int(new_heads) >= 1:
        drivers.append(
            (
                "split_first",
                90,
                f"split-hire {int(new_heads)} heads from pooled overweight PCIDs before net-new hiring",
            )
        )

    if rev_pct is not None and rev_pct < -5:
        drivers.append(
            (
                "pqr_decline",
                75,
                f"revenue is {abs(rev_pct):.0f}% below prior-quarter PQR — books may be too heavy or under-covered",
            )
        )
    elif rev_pct is not None and rev_pct > 15 and status == "Over HC":
        drivers.append(
            (
                "pqr_growth_overstaff",
                65,
                f"revenue is {rev_pct:.0f}% above PQR but model shows over-staffing vs ideal PCID",
            )
        )

    drivers.append(
        (
            "gap",
            40,
            f"assigned accounts ÷ ideal PCID implies {gap_abs} rep gap ({current:,} current vs {optimal:,} ideal)",
        )
    )

    drivers.sort(key=lambda x: -x[1])
    driver_key, _, driver_detail = drivers[0]
    primary = f"HC too {direction} by {gap_abs} reps — {driver_detail}."

    return {"hc_reason_primary": primary, "hc_reason_driver": driver_key}


def build_book_health(m: dict) -> dict:
    """Compact book health snapshot."""
    ideal = m.get("ideal_pcid") or m.get("perfect_book_target")
    avg_book = m.get("current_avg_book")
    seg_pcid = m.get("segment_avg_pcid")
    avg_pqr = m.get("avg_pqr_per_rep")
    seg_pqr = m.get("segment_avg_pqr")
    reps = _num(m.get("current_reps"))
    too_big = _num(m.get("reps_too_big"))
    too_little = _num(m.get("reps_too_little"))
    built = m.get("avg_pct_book_built")
    book_label = book_health_status(m)
    cov_status = m.get("coverage_status")
    median_cov = m.get("median_impact_calls_per_account")

    parts: list[str] = []
    if avg_book is not None and ideal is not None:
        seg_part = f" (segment avg {int(round(seg_pcid))})" if seg_pcid is not None else ""
        parts.append(f"Avg {int(round(avg_book))} PCIDs/rep vs ideal {int(ideal)}{seg_part}")
    if avg_pqr is not None and seg_pqr is not None:
        parts.append(f"PQR {_fmt_money(avg_pqr)} vs segment {_fmt_money(seg_pqr)}")
    if too_big or too_little:
        parts.append(
            f"{too_big} too big{_flag_pct(too_big, reps)}, "
            f"{too_little} too little{_flag_pct(too_little, reps)}"
        )
    if median_cov is not None:
        parts.append(f"Impact coverage {median_cov:g} calls/account ({cov_status.lower() if cov_status else '—'})")
    if built is not None:
        parts.append(f"FY26 book build {built:.1f}%")

    primary = ". ".join(parts) + "." if parts else ""
    if book_label == "Overweight":
        primary += " Books overweight vs ideal."
    elif book_label == "Underweight":
        primary += " Books underweight vs ideal."

    return {
        "book_health_status": book_label,
        "health_primary": primary,
        "health_bullets": [],
    }


def build_sbs_opportunity(m: dict, country_markets: list[dict] | None = None) -> dict:
    """SBS whitespace + segment routing recommendation."""
    sbs = m.get("sbs_whitespace_country") or m.get("sbs_whitespace") or 0
    books = m.get("books_buildable_from_sbs") or 0
    revenue = m.get("sbs_revenue_90d")
    grow = m.get("total_grow_slots") or 0
    ideal = m.get("ideal_pcid") or m.get("perfect_book_target")
    country = m.get("country", "")
    has_opp = bool(sbs and int(sbs) > 0)

    if not has_opp:
        return {
            "sbs_has_opportunity": False,
            "sbs_opportunity_primary": "No SBS whitespace in this country.",
            "sbs_opportunity_bullets": [],
            "sbs_routing_primary": "",
            "sbs_routing_bullets": [],
        }

    primary = (
        f"SBS opportunity: {_fmt_int(sbs)} unassigned accounts"
        + (f" ({_fmt_money(revenue)} 90d revenue)" if revenue else "")
        + f" — ~{_fmt_int(books)} books at ideal PCID ({int(ideal) if ideal else '—'})."
    )

    routing = ""
    routing_bullets: list[str] = []
    if country_markets:
        peers = [x for x in country_markets if x.get("country") == country]
        ranked = sorted(peers, key=score_segment_for_sbs, reverse=True)
        top = [x for x in ranked if score_segment_for_sbs(x) > 0][:3]
        if top:
            parts: list[str] = []
            for i, seg in enumerate(top):
                seg_name = seg.get("segment")
                seg_ideal = seg.get("ideal_pcid") or seg.get("perfect_book_target")
                grow_slots = seg.get("total_grow_slots") or 0
                seg_pqr = seg.get("segment_avg_pqr")
                jv = seg.get("opp_plateau_rev_per_job")
                _, bl = _book_vs_ideal(seg)
                why_bits: list[str] = []
                if bl == "underweight":
                    why_bits.append(
                        f"underweight books ({int(round(seg['current_avg_book']))} vs ideal {int(seg_ideal)})"
                    )
                if grow_slots:
                    why_bits.append(f"{_fmt_int(grow_slots)} grow slots")
                hc = summary_status(seg)
                if hc == "Under HC":
                    why_bits.append(
                        f"under HC by {abs(int(round(_num(seg.get('headcount_gap')))))}"
                    )
                if seg_pqr:
                    why_bits.append(f"segment PQR {_fmt_money(seg_pqr)}")
                if jv:
                    why_bits.append(f"${jv:.0f}/job at opp plateau")
                rank = ("Route 1st", "Route 2nd", "Route 3rd")[i]
                parts.append(f"{rank}: {seg_name} — {', '.join(why_bits) if why_bits else 'best book capacity'}")
            routing = "Assign SBS accounts to: " + "; ".join(parts) + "."
        else:
            routing = (
                f"No segment in {country} has clear grow capacity — "
                "fix overweight books before assigning SBS."
            )

    routing_bullets.append(
        "SBS is country-level (unassigned accounts have no segment); routing uses PQR, "
        "ideal PCID, grow slots, HC gap, and rev/job at opp plateau."
    )
    if grow:
        routing_bullets.append(
            f"This segment has {_fmt_int(grow)} grow slots — fill underweight reps here first."
        )

    return {
        "sbs_has_opportunity": True,
        "sbs_opportunity_primary": primary,
        "sbs_opportunity_bullets": routing_bullets[:2],
        "sbs_routing_primary": routing,
        "sbs_routing_bullets": routing_bullets,
    }


def build_recommendations(m: dict) -> dict:
    """Top 1–2 actionable next steps only."""
    status = summary_status(m)
    ideal = m.get("ideal_pcid") or m.get("perfect_book_target")
    too_big = _num(m.get("reps_too_big"))
    pool = m.get("splittable_pool")
    new_heads = m.get("new_heads_from_split")
    book_action = m.get("book_action")
    rec_action = m.get("recommended_action")
    sbs = m.get("sbs_whitespace_country") or m.get("sbs_whitespace")
    books_sbs = m.get("books_buildable_from_sbs")
    built = m.get("avg_pct_book_built")

    bullets: list[str] = []

    if m.get("split_hire_recommended") and new_heads:
        heads_n = int(new_heads)
        bullets.append(
            f"Split-hire {heads_n:,} new {'head' if heads_n == 1 else 'heads'} "
            f"from {_fmt_int(pool)} pooled PCIDs."
        )
    elif too_big and ideal and pool:
        bullets.append(
            f"Peel {too_big:,} overweight reps toward ideal PCID {int(ideal)} "
            f"({_fmt_int(pool)} PCIDs in pool)."
        )
    elif book_action and book_action not in ("Books near ideal", "—"):
        bullets.append(book_action)

    if sbs and int(sbs) > 0 and books_sbs and status == "Under HC":
        bullets.append(
            f"Build from SBS: ~{_fmt_int(books_sbs)} books available at ideal size."
        )

    if built is not None and built < 50:
        bullets.append(f"Improve FY26 book build ({built:.1f}% positive flags).")

    primary_parts: list[str] = []
    if rec_action and rec_action not in ("On track", "—"):
        primary_parts.append(rec_action)
    elif book_action and book_action not in ("Books near ideal", "—"):
        primary_parts.append(book_action)
    elif m.get("headcount_recommendation"):
        primary_parts.append(m["headcount_recommendation"])

    primary = ". ".join(primary_parts) + "." if primary_parts else "On track."

    return {
        "recommendation_primary": primary,
        "recommendation_bullets": bullets[:2],
    }


def _market_key(m: dict) -> str:
    return f"{m.get('country', '')}-{m.get('segment', '')}"


def _pcid_band(ideal: float | int) -> tuple[int, int]:
    """±10% band around ideal PCID for documentation."""
    ideal_i = int(round(ideal))
    low = int(round(ideal_i * (1 - PCID_TOLERANCE_PCT / 100)))
    high = int(round(ideal_i * (1 + PCID_TOLERANCE_PCT / 100)))
    return low, high


def is_rep_healthy(rep: dict) -> bool:
    """Healthy book = not flagged too_big or too_little (sql/17 logic)."""
    return not rep.get("too_big") and not rep.get("too_little")


def load_rep_book_by_market(rep_book_path: Path | None = None) -> dict[str, list[dict]]:
    """Group rep_book.json reps by country-segment key."""
    path = rep_book_path or DEFAULT_REP_BOOK
    if not path.is_file():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    by_market: dict[str, list[dict]] = {}
    for rep in payload.get("reps", []):
        key = rep.get("market") or f"{rep.get('country', '')}-{rep.get('segment', '')}"
        by_market.setdefault(key, []).append(rep)
    return by_market


def compute_healthy_rep_stats(reps: list[dict]) -> dict:
    total = len(reps)
    healthy = sum(1 for r in reps if is_rep_healthy(r))
    pct = round(100.0 * healthy / total, 1) if total else None
    return {
        "reps_scored": total,
        "reps_healthy": healthy,
        "pct_reps_healthy": pct,
    }


def build_healthy_book_definition(m: dict, market_reps: list[dict] | None = None) -> dict:
    """Plain-English healthy book criteria per segment + rep-level stats when available."""
    ideal = m.get("ideal_pcid") or m.get("perfect_book_target")
    seg_pqr = m.get("segment_avg_pqr")
    seg_pcid = m.get("segment_avg_pcid")
    median_cov = m.get("median_impact_calls_per_account")
    bucket = m.get("perfect_book_bucket")
    band_label = bucket.split(": ", 1)[1] if bucket and ": " in bucket else None

    thresholds: dict = {}
    criteria: list[str] = []

    if ideal is not None:
        ideal_i = int(round(ideal))
        low, high = _pcid_band(ideal_i)
        thresholds["ideal_pcid"] = ideal_i
        thresholds["pcid_band_low"] = low
        thresholds["pcid_band_high"] = high
        if band_label:
            thresholds["perfect_book_band"] = band_label
        criteria.append(
            f"PCID within ±{PCID_TOLERANCE_PCT}% of ideal ({low}–{high} at ideal {ideal_i}"
            + (f", {band_label} growth band)" if band_label else ")")
            + f" — and not below ideal ({ideal_i}), which flags too_little"
        )

    if seg_pqr is not None:
        thresholds["segment_avg_pqr"] = seg_pqr
        criteria.append(
            f"PQR (prior-quarter revenue) at or above segment benchmark ({_fmt_money(seg_pqr)})"
        )

    if median_cov is not None:
        thresholds["coverage_benchmark"] = median_cov
        criteria.append(
            f"Impact coverage at or above {COVERAGE_FLOOR_RATIO:.0%} of segment average "
            f"(≥ {median_cov * COVERAGE_FLOOR_RATIO:.1f} calls/account when segment median is {median_cov:g})"
        )
    else:
        criteria.append(
            f"Impact coverage at or above {COVERAGE_FLOOR_RATIO:.0%} of segment average "
            "(impact calls per assigned account, 90d)"
        )

    criteria.append(
        "Current revenue at or above prior-quarter PQR (no revenue-decline signal)"
    )
    criteria.append("Not flagged too_big or too_little (sql/16–17 book health flags)")

    if seg_pcid is not None and ideal is not None:
        criteria.append(
            f"Too big = PCID ({int(round(seg_pcid))} segment avg) or PQR above segment avg "
            "plus weak coverage or revenue below PQR; too little = below ideal PCID"
        )

    built = m.get("avg_pct_book_built")
    if built is not None:
        criteria.append(
            f"FY26 book build context: segment avg {built:.1f}% flags positive "
            "(informational — not a healthy/unhealthy gate)"
        )

    stats = compute_healthy_rep_stats(market_reps) if market_reps else {}
    reps_total = stats.get("reps_scored") or _num(m.get("current_reps"))
    pct = stats.get("pct_reps_healthy")
    healthy_n = stats.get("reps_healthy")

    definition_parts = []
    if ideal is not None:
        definition_parts.append(
            f"A healthy book in {m.get('country', '')}-{m.get('segment', '')} means a rep's book "
            f"is near the growth-optimal size (ideal PCID {int(round(ideal))}), "
            f"carries adequate revenue weight and rep touch rate, and is not flagged for peel or grow."
        )
    else:
        definition_parts.append(
            f"A healthy book in {m.get('country', '')}-{m.get('segment', '')} is not flagged "
            "too_big or too_little per sql/16–17."
        )

    if pct is not None and healthy_n is not None and reps_total:
        definition_parts.append(
            f"{healthy_n:,} of {reps_total:,} reps ({pct:.1f}%) meet this definition in the current snapshot."
        )

    return {
        "healthy_book_thresholds": thresholds,
        "healthy_book_criteria": criteria,
        "healthy_book_definition": " ".join(definition_parts),
        "healthy_book_primary": definition_parts[0] if definition_parts else "",
        **stats,
    }


def _pcid_bucket(pcid: float | int) -> tuple[int, str, int, int, int]:
    pcid_i = int(pcid or 0)
    for order, label, midpoint, upper, ceiling in PCID_BUCKETS:
        if order == 11 or pcid_i <= ceiling:
            return order, label, midpoint, upper, ceiling
    return PCID_BUCKETS[-1]


def _rep_revenue_growth_pct(rep: dict) -> float | None:
    prior = rep.get("pqr_90d")
    current = rep.get("revenue_90d")
    if prior is None or current is None or prior < MIN_PQR_FOR_GROWTH:
        return None
    raw = (float(current) - float(prior)) / float(prior)
    return max(-0.5, min(1.0, raw))


def compute_growth_by_bucket(reps: list[dict]) -> list[dict]:
    """Median quarterly rev growth per PCID bucket (sql/16 logic, from rep_book.json)."""
    grouped: dict[int, dict] = {}
    for rep in reps:
        growth = _rep_revenue_growth_pct(rep)
        if growth is None:
            continue
        order, label, midpoint, upper, ceiling = _pcid_bucket(rep.get("pcid_count") or 0)
        bucket = grouped.setdefault(
            order,
            {
                "bucket_order": order,
                "book_bucket": label,
                "bucket_midpoint": midpoint,
                "bucket_upper": upper,
                "growths": [],
            },
        )
        bucket["growths"].append(growth)

    rows: list[dict] = []
    for order in sorted(grouped):
        b = grouped[order]
        if len(b["growths"]) < MIN_REPS_PER_BUCKET:
            continue
        rows.append(
            {
                "bucket_order": b["bucket_order"],
                "book_bucket": b["book_bucket"],
                "bucket_midpoint": b["bucket_midpoint"],
                "bucket_upper": b["bucket_upper"],
                "rep_count": len(b["growths"]),
                "median_growth_pct": round(statistics.median(b["growths"]), 3),
            }
        )
    return rows


def _growth_above_book(buckets: list[dict], book_max: float | int) -> float | None:
    above = [b["median_growth_pct"] for b in buckets if b["bucket_upper"] > book_max]
    if not above:
        return None
    return round(statistics.median(above), 3)


def build_growth_curve(m: dict, market_reps: list[dict] | None = None) -> dict:
    """Revenue growth vs book size narrative + bucket table (computed or from export)."""
    buckets = m.get("growth_by_bucket")
    if buckets is None and market_reps:
        buckets = compute_growth_by_bucket(market_reps)

    ideal = m.get("ideal_pcid") or m.get("perfect_book_target")
    perfect_growth = m.get("perfect_book_growth_pct")
    perfect_ceiling = m.get("perfect_book_ceiling")
    inflection = m.get("coverage_inflection_book_max")
    avg_book = m.get("current_avg_book")
    reps_too_big = _num(m.get("reps_too_big"))
    cov_status = m.get("coverage_status")

    peak_bucket = None
    peak_growth = None
    if buckets:
        eligible = [
            b for b in buckets
            if b.get("bucket_order", 99) <= 10
            and b.get("rep_count", 0) >= MIN_REPS_PER_BUCKET
        ]
        peak_candidates = [b for b in eligible if b.get("rep_count", 0) >= MIN_REPS_PERFECT_BUCKET]
        search = peak_candidates or eligible
        if search:
            peak_bucket = max(search, key=lambda b: b.get("median_growth_pct") or -999)
            peak_growth = peak_bucket.get("median_growth_pct")

    peak_accounts = (
        m.get("perfect_book_target")
        or (peak_bucket or {}).get("bucket_midpoint")
        or ideal
    )
    peak_growth_val = m.get("perfect_book_growth_pct")
    if peak_growth_val is None:
        peak_growth_val = peak_growth
    elif peak_growth is not None and peak_bucket:
        # Prefer SQL perfect-book growth; use bucket peak only when SQL missing
        pass

    decline_book = inflection or perfect_ceiling
    decline_growth = None
    if buckets and decline_book is not None:
        decline_growth = _growth_above_book(buckets, decline_book)
    if decline_growth is None and perfect_growth is not None and peak_growth_val is not None:
        if peak_growth_val > perfect_growth:
            decline_growth = perfect_growth

    bullets: list[str] = []
    if peak_accounts is not None and peak_growth_val is not None:
        bullets.append(
            f"Peak median growth {_fmt_pct(peak_growth_val)} at ~{int(peak_accounts)} accounts/rep "
            f"({(peak_bucket or {}).get('book_bucket', m.get('perfect_book_bucket', '')).split(': ', 1)[-1]} band)."
        )
    if ideal is not None and perfect_growth is not None:
        bullets.append(
            f"Optimal book {int(round(ideal))} PCIDs — largest bucket within 85% of peak growth "
            f"({_fmt_pct(perfect_growth)})."
        )
    if decline_book is not None and peak_growth_val is not None:
        decline_txt = _fmt_pct(decline_growth) if decline_growth is not None else "lower levels"
        bullets.append(
            f"Above ~{int(decline_book)} accounts/rep, growth tends to fall "
            f"(from {_fmt_pct(peak_growth_val)} toward {decline_txt})."
        )
    if inflection is not None and cov_status == "Declining":
        bullets.append(
            f"Coverage inflection at ~{int(inflection)} PCIDs — avg book "
            f"({int(round(avg_book)) if avg_book else '—'}) exceeds this; impact calls/account drop."
        )
    elif inflection is not None:
        bullets.append(
            f"Coverage peaks near ~{int(inflection)} accounts/rep "
            f"(median {m.get('coverage_at_inflection')} calls/account at inflection)."
        )
    if reps_too_big:
        bullets.append(
            f"{reps_too_big:,} reps flagged too big — PCID/PQR above segment avg plus weak coverage or revenue below PQR."
        )

    primary_parts: list[str] = []
    if peak_accounts is not None and peak_growth_val is not None:
        primary_parts.append(
            f"Growth peaks at ~{int(peak_accounts)} accounts/rep ({_fmt_pct(peak_growth_val)} median quarterly growth)"
        )
    if decline_book is not None:
        decline_txt = _fmt_pct(decline_growth) if decline_growth is not None else "lower rates"
        primary_parts.append(
            f"growth declines above ~{int(decline_book)} PCIDs (toward {decline_txt})"
        )
    if avg_book and ideal and avg_book > (decline_book or ideal):
        primary_parts.append(
            f"this market averages {int(round(avg_book))} PCIDs/rep vs ideal {int(round(ideal))}"
        )

    primary = "; ".join(primary_parts) + "." if primary_parts else ""

    return {
        "growth_by_bucket": buckets or [],
        "growth_peak_accounts": int(peak_accounts) if peak_accounts is not None else None,
        "growth_peak_pct": peak_growth_val,
        "growth_decline_above_pcid": int(decline_book) if decline_book is not None else None,
        "growth_decline_median_pct": decline_growth,
        "growth_curve_primary": primary,
        "growth_curve_bullets": bullets[:4],
    }


def build_optimal_book_rationale(m: dict) -> dict:
    """Plain-English optimal book rationale (collapsed in UI — detail only)."""
    ideal = m.get("ideal_pcid") or m.get("perfect_book_target")
    bucket = m.get("perfect_book_bucket")
    ceiling = m.get("perfect_book_ceiling")
    growth = m.get("perfect_book_growth_pct")

    if ideal is None:
        return {
            "optimal_book_primary": "",
            "optimal_book_bullets": [],
            "optimal_book_rationale": "",
        }

    ideal_i = int(round(ideal))
    band = bucket.split(": ", 1)[1] if bucket and ": " in bucket else f"up to {int(ceiling)}"
    growth_txt = _fmt_pct(growth) if growth is not None else "positive"

    primary = (
        f"Ideal PCID {ideal_i} ({band} band) — largest book-size bucket where median revenue "
        f"growth stays within 85% of segment peak ({growth_txt} in that band)."
    )

    return {
        "optimal_book_primary": primary,
        "optimal_book_bullets": [],
        "optimal_book_rationale": primary,
    }


def build_market_summary(
    m: dict,
    country_markets: list[dict] | None = None,
    market_reps: list[dict] | None = None,
) -> dict:
    """Return compact health → HC reason → recommendations → SBS routing + healthy book."""
    status = summary_status(m)
    health = build_book_health(m)
    hc = build_hc_reason(m)
    sbs_opp = build_sbs_opportunity(m, country_markets)
    recs = build_recommendations(m)
    optimal = build_optimal_book_rationale(m)
    healthy = build_healthy_book_definition(m, market_reps)
    growth = build_growth_curve(m, market_reps)

    health_bullets: list[str] = []
    if healthy.get("pct_reps_healthy") is not None:
        health_bullets.append(
            f"Healthy books: {healthy['reps_healthy']:,} of {healthy['reps_scored']:,} reps "
            f"({healthy['pct_reps_healthy']:.1f}%) not flagged too big or too little."
        )

    narrative = " ".join(
        x
        for x in [
            health["health_primary"],
            healthy.get("healthy_book_definition"),
            hc["hc_reason_primary"],
            recs["recommendation_primary"],
            sbs_opp.get("sbs_routing_primary") or sbs_opp.get("sbs_opportunity_primary"),
        ]
        if x
    )

    return {
        "summary_status": status,
        "summary_primary": hc["hc_reason_primary"],
        "summary_bullets": recs["recommendation_bullets"],
        "summary_narrative": narrative,
        **health,
        "health_bullets": health_bullets,
        **hc,
        **sbs_opp,
        **recs,
        **optimal,
        **healthy,
        **growth,
    }


def enrich_market(
    m: dict,
    country_markets: list[dict] | None = None,
    rep_book_by_market: dict[str, list[dict]] | None = None,
) -> dict:
    """Add summary fields to a market dict (in place + return)."""
    reps = None
    if rep_book_by_market is not None:
        reps = rep_book_by_market.get(_market_key(m))
    summary = build_market_summary(m, country_markets, reps)
    m.update(summary)
    return m


def enrich_payload(payload: dict, rep_book_path: Path | None = None) -> dict:
    markets = payload.get("markets", [])
    by_country: dict[str, list[dict]] = {}
    for m in markets:
        by_country.setdefault(m.get("country", ""), []).append(m)
    rep_book_by_market = load_rep_book_by_market(rep_book_path)
    for m in markets:
        enrich_market(m, by_country.get(m.get("country", ""), []), rep_book_by_market)
    return payload


def main() -> None:
    in_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_IN
    if not in_path.is_file():
        print(f"Missing input: {in_path}")
        sys.exit(1)

    payload = json.loads(in_path.read_text(encoding="utf-8"))
    enrich_payload(payload, DEFAULT_REP_BOOK)

    for country, segment in [("US", "M"), ("US", "UMM")]:
        market = next(
            (m for m in payload["markets"] if m.get("country") == country and m.get("segment") == segment),
            None,
        )
        if not market:
            continue
        print(f"\n=== {country}-{segment} healthy book ===")
        print(market.get("healthy_book_definition", ""))
        for c in market.get("healthy_book_criteria", []):
            print(f"  • {c}")
        pct = market.get("pct_reps_healthy")
        if pct is not None:
            print(
                f"  → {market.get('reps_healthy')} / {market.get('reps_scored')} reps healthy ({pct}%)"
            )

    in_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"\nWrote summaries for {len(payload.get('markets', []))} markets to {in_path}")


if __name__ == "__main__":
    main()
