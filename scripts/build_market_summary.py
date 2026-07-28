#!/usr/bin/env python3
"""Plain-English market summaries for headcount dashboard.

Flow: current book health → actionable recommendations.
Used by json-from-mcp-results.py (embed in headcount.json) and
export-dashboard-data.py (Market summaries sheet).

Usage:
  python3 scripts/build_market_summary.py
  python3 scripts/build_market_summary.py docs/data/headcount.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_IN = ROOT / "docs" / "data" / "headcount.json"


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


def _hc_context(m: dict, status: str) -> str:
    """One sentence on headcount position for recommendations."""
    current = _num(m.get("current_reps"))
    optimal = int(round(_num(m.get("optimal_headcount") or m.get("optimal_headcount_assigned"))))
    gap = int(round(_num(m.get("headcount_gap"))))
    gap_abs = abs(gap)
    rec = m.get("headcount_recommendation", "—")

    if status == "Over HC":
        return (
            f"Market is over headcount by {gap_abs} reps ({current:,} current vs "
            f"{optimal:,} ideal) — {rec}."
        )
    if status == "Under HC":
        return (
            f"Market is under headcount by {gap_abs} reps ({current:,} current vs "
            f"{optimal:,} ideal) — {rec}."
        )
    if gap == 0:
        return f"Headcount at target ({current:,} reps vs {optimal:,} ideal) — {rec}."
    return (
        f"Near target headcount ({current:,} current vs {optimal:,} ideal, "
        f"gap {gap:+,}) — {rec}."
    )


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


def build_book_health(m: dict) -> dict:
    """Section 1 — current book health snapshot vs segment benchmarks."""
    ideal = m.get("ideal_pcid") or m.get("perfect_book_target")
    avg_book = m.get("current_avg_book")
    seg_pcid = m.get("segment_avg_pcid")
    avg_pqr = m.get("avg_pqr_per_rep")
    seg_pqr = m.get("segment_avg_pqr")
    reps = _num(m.get("current_reps"))
    too_big = _num(m.get("reps_too_big"))
    too_little = _num(m.get("reps_too_little"))
    built = m.get("avg_pct_book_built")
    fy26_score = m.get("avg_fy26_book_score")
    book_label = book_health_status(m)
    book_phrase, _book_label_raw = _book_vs_ideal(m)

    parts: list[str] = []
    if reps:
        parts.append(f"{reps:,} reps")
    if avg_book is not None and ideal is not None:
        seg_part = f", segment avg {int(round(seg_pcid))}" if seg_pcid is not None else ""
        parts.append(
            f"carrying avg {int(round(avg_book))} PCIDs/rep vs ideal {int(ideal)}{seg_part}"
        )
    if avg_pqr is not None:
        seg_pqr_part = f" (segment {_fmt_money(seg_pqr)})" if seg_pqr is not None else ""
        parts.append(f"avg PQR {_fmt_money(avg_pqr)}{seg_pqr_part}")
    if too_big or too_little:
        parts.append(
            f"{too_big:,} too big{_flag_pct(too_big, reps)}, "
            f"{too_little:,} too little{_flag_pct(too_little, reps)}"
        )
    if built is not None:
        parts.append(f"FY26 book build {built:.1f}%")
    elif fy26_score is not None:
        parts.append(f"FY26 book score {fy26_score:.1f}")

    primary = ". ".join(parts) + "."
    if book_label != "Unknown":
        if book_label == "Overweight":
            primary += " Books are overweight vs ideal PCID."
        elif book_label == "Underweight":
            primary += " Books are underweight vs ideal PCID."
        else:
            primary += " Books are near ideal PCID."

    bullets: list[str] = []

    if ideal is not None:
        bucket = m.get("perfect_book_bucket")
        band = (
            bucket.split(": ", 1)[1]
            if bucket and ": " in bucket
            else f"up to {int(m.get('perfect_book_ceiling') or ideal)}"
        )
        growth = m.get("perfect_book_growth_pct")
        growth_txt = _fmt_pct(growth) if growth is not None else "positive"
        bullets.append(
            f"Ideal PCID {int(round(ideal))} ({band} band, {growth_txt} median growth) — "
            "growth-optimal target for headcount math."
        )

    if seg_pcid is not None:
        bullets.append(
            f"Segment avg PCID: {int(round(seg_pcid))} accounts/rep — "
            "typical book size today (ideal PCID is the growth-optimal target)."
        )
    if seg_pqr is not None:
        bullets.append(
            f"Segment avg PQR: {_fmt_money(seg_pqr)} — benchmark for book revenue weight."
        )

    rev_pct = m.get("rev_vs_pqr_pct")
    if rev_pct is not None:
        direction = "above" if rev_pct > 0 else "below"
        bullets.append(
            f"Market revenue is {abs(rev_pct):.1f}% {direction} prior-quarter PQR."
        )

    if book_phrase:
        bullets.append(f"Book size: {book_phrase}.")

    opp = m.get("opp_pipeline_status")
    cov = m.get("coverage_status")
    if opp or cov:
        parts_sig = []
        if opp:
            parts_sig.append(f"opp pipeline {opp.lower()}")
        if cov:
            parts_sig.append(f"coverage {cov.lower()}")
        bullets.append(f"Signals: {', '.join(parts_sig)}.")

    return {
        "book_health_status": book_label,
        "health_primary": primary,
        "health_bullets": bullets,
    }


def build_recommendations(m: dict) -> dict:
    """Section 2 — actionable next steps from flags and capacity model."""
    status = summary_status(m)
    ideal = m.get("ideal_pcid") or m.get("perfect_book_target")
    too_big = _num(m.get("reps_too_big"))
    too_little = _num(m.get("reps_too_little"))
    pool = m.get("splittable_pool")
    grow = m.get("total_grow_slots")
    new_heads = m.get("new_heads_from_split")
    book_action = m.get("book_action")
    rec_action = m.get("recommended_action")
    sbs = m.get("sbs_whitespace_country") or m.get("sbs_whitespace")
    books_sbs = m.get("books_buildable_from_sbs")
    built = m.get("avg_pct_book_built")
    _, book_label = _book_vs_ideal(m)

    bullets: list[str] = []

    if too_big and ideal is not None and pool:
        bullets.append(
            f"{too_big:,} reps should peel accounts toward ideal PCID of {int(ideal)} — "
            f"{_fmt_int(pool)} PCIDs in splittable pool."
        )
    elif too_big and ideal is not None:
        bullets.append(
            f"{too_big:,} reps flagged too big — peel toward ideal PCID of {int(ideal)}."
        )

    if too_little and grow:
        bullets.append(
            f"{too_little:,} reps have room to grow ({_fmt_int(grow)} total grow slots "
            f"toward ideal PCID of {int(ideal) if ideal else '—'})."
        )
    elif too_little:
        bullets.append(f"{too_little:,} reps flagged too little — grow books toward ideal PCID.")

    if m.get("split_hire_recommended") and new_heads:
        heads_n = int(new_heads)
        head_word = "head" if heads_n == 1 else "heads"
        bullets.append(
            f"Split-hire {heads_n:,} new {head_word} from {_fmt_int(pool)} pooled PCIDs"
            + (f" ({book_action})." if book_action else ".")
        )
    elif book_action and book_action not in ("Books near ideal", "—"):
        bullets.append(f"Book action: {book_action}.")

    bullets.append(_hc_context(m, status))

    if status == "Under HC" and book_label == "overweight":
        bullets.append(
            "Headcount is short but books are already above ideal — "
            "prioritize split/redistribution before net-new hiring."
        )
    elif status == "Over HC" and book_label == "underweight":
        bullets.append(
            "Over-staffed with underweight books — grow existing books before adding reps."
        )

    if sbs and int(sbs) > 0:
        sbs_line = f"SBS whitespace: {_fmt_int(sbs)} unassigned accounts"
        if books_sbs:
            sbs_line += f" (~{_fmt_int(books_sbs)} buildable books at ideal size)."
        else:
            sbs_line += "."
        if status == "Under HC" or too_little:
            bullets.append(f"Hire/build from SBS — {sbs_line}")
        else:
            bullets.append(sbs_line)

    if built is not None and built < 50:
        bullets.append(
            f"Improve FY26 book build ({built:.1f}% of policy flags positive)."
        )

    if rec_action and rec_action not in ("On track", "—"):
        bullets.append(f"Recommended next step: {rec_action}.")

    # Top-line recommendation: book action first, then HC action
    primary_parts: list[str] = []
    if book_action and book_action not in ("Books near ideal", "—"):
        primary_parts.append(book_action)
    if rec_action and rec_action not in ("On track", "—"):
        primary_parts.append(rec_action)
    elif m.get("headcount_recommendation"):
        primary_parts.append(f"HC: {m['headcount_recommendation']}")
    primary = ". ".join(primary_parts) + "." if primary_parts else _hc_context(m, status)

    return {
        "recommendation_primary": primary,
        "recommendation_bullets": bullets,
    }


def build_optimal_book_rationale(m: dict) -> dict:
    """Plain-English optimal book rationale from sql/16 perfect_book + segment benchmarks."""
    ideal = m.get("ideal_pcid") or m.get("perfect_book_target")
    bucket = m.get("perfect_book_bucket")
    ceiling = m.get("perfect_book_ceiling")
    growth = m.get("perfect_book_growth_pct")
    seg_pqr = m.get("segment_avg_pqr")
    seg_pcid = m.get("segment_avg_pcid")
    avg_book = m.get("current_avg_book")
    opp_max = m.get("opp_plateau_book_max")
    cov_max = m.get("coverage_inflection_book_max")

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
        f"Optimal book for this segment is {ideal_i} accounts/rep ({band} band). "
        f"We pick the largest book-size bucket where median revenue growth stays within "
        f"85% of the segment peak ({growth_txt} in that band) and a bigger book no longer "
        f"adds growth — that plateau is the data-driven target for headcount math."
    )

    bullets: list[str] = []

    if seg_pqr is not None:
        bullets.append(
            f"Segment avg PQR (prior quarter revenue per rep): {_fmt_money(seg_pqr)} — "
            "the benchmark for whether a rep's book is revenue-heavy vs peers."
        )
    if seg_pcid is not None:
        bullets.append(
            f"Segment avg PCID: {int(round(seg_pcid))} accounts/rep — "
            "typical book size today; ideal PCID is the growth-optimal target, not the average."
        )

    if avg_book is not None and ideal:
        ratio = avg_book / ideal
        if ratio > 1.10:
            bullets.append(
                f"Current avg book ({int(round(avg_book))}) is above ideal — "
                "more accounts per rep can dilute coverage and drag growth; peel toward ideal PCID."
            )
        elif ratio < 0.90:
            bullets.append(
                f"Current avg book ({int(round(avg_book))}) is below ideal — "
                "room to grow books toward the growth-optimal size before adding headcount."
            )

    if opp_max is not None:
        opp_status = m.get("opp_pipeline_status", "").lower()
        bullets.append(
            f"Opp pipeline {'plateaus' if opp_status == 'plateaued' else 'still growing'} "
            f"around {int(opp_max)} accounts/rep — revenue per job peaks near this book size."
        )

    if cov_max is not None:
        bullets.append(
            f"Coverage (impact calls/account) peaks near {int(cov_max)} accounts/rep — "
            "books larger than this tend to see fewer touches per account."
        )

    bullets.append(
        "Too big = PCID or PQR above segment avg plus weak coverage or revenue below PQR; "
        "too little = below ideal PCID. Split/peel actions use ideal PCID as the target."
    )

    rationale = primary + " " + " ".join(bullets)
    return {
        "optimal_book_primary": primary,
        "optimal_book_bullets": bullets,
        "optimal_book_rationale": rationale,
    }


def build_market_summary(m: dict) -> dict:
    """Return health → recommendations narrative + optimal book rationale."""
    status = summary_status(m)
    health = build_book_health(m)
    recs = build_recommendations(m)
    optimal = build_optimal_book_rationale(m)

    narrative = health["health_primary"]
    if recs["recommendation_primary"]:
        narrative += " " + recs["recommendation_primary"]
    if recs["recommendation_bullets"]:
        narrative += " " + " ".join(recs["recommendation_bullets"])

    return {
        "summary_status": status,
        "summary_primary": health["health_primary"],
        "summary_bullets": recs["recommendation_bullets"],
        "summary_narrative": narrative,
        **health,
        **recs,
        **optimal,
    }


def enrich_market(m: dict) -> dict:
    """Add summary fields to a market dict (in place + return)."""
    summary = build_market_summary(m)
    m.update(summary)
    return m


def enrich_payload(payload: dict) -> dict:
    for m in payload.get("markets", []):
        enrich_market(m)
    return payload


def main() -> None:
    in_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_IN
    if not in_path.is_file():
        print(f"Missing input: {in_path}")
        sys.exit(1)

    payload = json.loads(in_path.read_text(encoding="utf-8"))
    enrich_payload(payload)

    us_m = next(
        (m for m in payload["markets"] if m.get("country") == "US" and m.get("segment") == "M"),
        None,
    )
    if us_m:
        print(f"US-M · {us_m['summary_status']} · books {us_m['book_health_status']}")
        print("\n=== Current book health ===")
        print(us_m["health_primary"])
        for b in us_m.get("health_bullets", []):
            print(f"  • {b}")
        print("\n=== Recommendations ===")
        print(us_m["recommendation_primary"])
        for b in us_m.get("recommendation_bullets", []):
            print(f"  • {b}")

    in_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"\nWrote summaries for {len(payload.get('markets', []))} markets to {in_path}")


if __name__ == "__main__":
    main()
