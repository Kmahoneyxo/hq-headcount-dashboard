#!/usr/bin/env python3
"""Plain-English market summaries for headcount dashboard.

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


def _primary_reason(m: dict, status: str) -> str:
    current = _num(m.get("current_reps"))
    optimal = int(round(_num(m.get("optimal_headcount") or m.get("optimal_headcount_assigned"))))
    gap = int(round(_num(m.get("headcount_gap"))))
    gap_abs = abs(gap)
    book_phrase, book_label = _book_vs_ideal(m)

    if status == "Over HC":
        lead = f"Over headcount by {gap_abs} reps ({current:,} current vs {optimal:,} ideal)."
        if book_label == "underweight":
            tail = (
                f" {book_phrase.capitalize()} — books are underweight even though "
                "we carry more reps than the capacity model needs."
            )
        elif book_label == "overweight":
            tail = (
                f" {book_phrase.capitalize()} — reps are carrying larger books than ideal, "
                "so consolidation may be possible before any net-new hiring."
            )
        else:
            tail = f" {book_phrase.capitalize()} — headcount is above model while books are roughly on target."
        return lead + tail

    if status == "Under HC":
        lead = f"Under headcount by {gap_abs} reps ({current:,} current vs {optimal:,} ideal)."
        if book_label == "underweight":
            tail = (
                f" {book_phrase.capitalize()} — we need more reps and/or to grow books "
                "toward the ideal size for this market."
            )
        elif book_label == "overweight":
            tail = (
                f" {book_phrase.capitalize()} — headcount is short but existing books "
                "are already above ideal; prioritize split/redistribution before pure hiring."
            )
        else:
            tail = f" {book_phrase.capitalize()} — staffing is below model with books near target."
        return lead + tail

    # At target
    if gap == 0:
        lead = f"At target headcount ({current:,} reps vs {optimal:,} ideal)."
    else:
        lead = (
            f"Near target headcount ({current:,} current vs {optimal:,} ideal, "
            f"gap {gap:+,})."
        )
    if book_label == "underweight":
        tail = f" {book_phrase.capitalize()} — focus on growing books rather than changing HC."
    elif book_label == "overweight":
        tail = f" {book_phrase.capitalize()} — books may need trimming even if HC is balanced."
    else:
        tail = f" {book_phrase.capitalize()} — both headcount and book size are close to model."
    return lead + tail


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


def _supporting_bullets(m: dict) -> list[str]:
    bullets: list[str] = []

    too_big = m.get("reps_too_big")
    too_little = m.get("reps_too_little")
    if too_big is not None or too_little is not None:
        big = _num(too_big)
        little = _num(too_little)
        if big or little:
            bullets.append(
                f"Book health: {big:,} reps flagged too big, {little:,} too little "
                "(uneven books across the team)."
            )

    rev_pct = m.get("rev_vs_pqr_pct")
    if rev_pct is not None:
        direction = "above" if rev_pct > 0 else "below"
        bullets.append(
            f"PQR trend: Revenue is {abs(rev_pct):.1f}% {direction} prior-quarter PQR "
            f"({m.get('headcount_recommendation', '—')} signal from capacity model)."
        )

    sbs = m.get("sbs_whitespace_country") or m.get("sbs_whitespace")
    books_sbs = m.get("books_buildable_from_sbs")
    if sbs and int(sbs) > 0:
        sbs_line = f"SBS whitespace: {_fmt_int(sbs)} unassigned accounts in this country × segment"
        if books_sbs:
            sbs_line += f" (~{_fmt_int(books_sbs)} buildable books at ideal size)."
        else:
            sbs_line += "."
        bullets.append(sbs_line)

    new_heads = m.get("new_heads_from_split")
    pool = m.get("splittable_pool")
    book_action = m.get("book_action")
    if m.get("split_hire_recommended") and new_heads:
        heads_n = int(new_heads)
        head_word = "head" if heads_n == 1 else "heads"
        bullets.append(
            f"Split-hire: Model suggests {heads_n:,} new {head_word} from "
            f"{_fmt_int(pool)} pooled PCIDs"
            + (f" — {book_action}" if book_action else ".")
        )
    elif book_action and book_action != "—":
        bullets.append(f"Book action: {book_action}.")

    opp = m.get("opp_pipeline_status")
    cov = m.get("coverage_status")
    if opp or cov:
        parts = []
        if opp:
            parts.append(f"opp pipeline {opp.lower()}")
        if cov:
            parts.append(f"coverage {cov.lower()}")
        bullets.append(f"Market signals: {', '.join(parts)}.")

    built = m.get("avg_pct_book_built")
    if built is not None and built < 50:
        bullets.append(
            f"FY26 book build: {built:.1f}% of policy flags positive — room to improve book quality."
        )

    rec_action = m.get("recommended_action")
    if rec_action and rec_action not in ("On track", "—"):
        bullets.append(f"Recommended next step: {rec_action}.")

    return bullets


def build_market_summary(m: dict) -> dict:
    """Return summary + optimal book rationale fields."""
    status = summary_status(m)
    primary = _primary_reason(m, status)
    bullets = _supporting_bullets(m)
    optimal = build_optimal_book_rationale(m)

    # Lead with optimal book context when we have a perfect-book target
    if optimal.get("optimal_book_primary"):
        bullets.insert(0, optimal["optimal_book_primary"])

    narrative = primary
    if bullets:
        narrative += " " + " ".join(bullets)
    return {
        "summary_status": status,
        "summary_primary": primary,
        "summary_bullets": bullets,
        "summary_narrative": narrative,
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
        print(f"US-M · {us_m['summary_status']}")
        print(us_m["summary_primary"])
        for b in us_m.get("summary_bullets", []):
            print(f"  • {b}")

    in_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"\nWrote summaries for {len(payload.get('markets', []))} markets to {in_path}")


if __name__ == "__main__":
    main()
