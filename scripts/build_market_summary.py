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
    """Return summary_status, summary_narrative, summary_primary, summary_bullets."""
    status = summary_status(m)
    primary = _primary_reason(m, status)
    bullets = _supporting_bullets(m)
    narrative = primary
    if bullets:
        narrative += " " + " ".join(bullets)
    return {
        "summary_status": status,
        "summary_primary": primary,
        "summary_bullets": bullets,
        "summary_narrative": narrative,
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
