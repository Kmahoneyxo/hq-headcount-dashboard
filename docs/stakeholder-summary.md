# Stakeholder Summary — Perfect Book & Optimal Headcount

> **⚠ Preview data — do not share externally without caveats.**  
> **Segment = company size (S/M/L/XL), not sales segment (M/UMM/ACC/NAM).** Labels like **US-M** mean "M-sized employer accounts," not the Mid Market org. **Do not sum `current_reps` across rows** (same rep appears in multiple size buckets; dashboard total ~4,349 vs ~942 unique US reps). **Hire signals on BNL-S, CA-S, UK-S, etc. are not valid GTM planning units** — those are company-size pools. NAM, DCA, UMM are missing entirely. SQL v2 in progress. See [`data-model-audit.md`](./data-model-audit.md).

**Date:** 2026-07-27  
**Query:** `sql/10_perfect_book_headcount_country_segment.sql`  
**Window:** 90 days (20260427–20260725 vs prior 20260128–20260426)  
**Grain:** Country × company size *(labeled "segment" — not sales GTM segment)*

---

## Executive summary

We built a first-pass **global headcount capacity model** that:

1. **Identifies the perfect book** — the account range where median revenue growth peaks before diminishing returns
2. **Calculates optimal headcount** — `assigned accounts ÷ perfect book target`
3. **Recommends Hire / Hold / Optimize / Do Not Hire** based on headcount gap vs model

**Key finding:** Most high-revenue markets show **Optimize** — reps are carrying books **below** the growth-optimal size, but **total rep count exceeds** what the account base supports at that book size. This suggests **consolidation and book redistribution** rather than net-new hiring in those markets.

**Markets showing Hire signal** (under-staffed vs model — *directional only at company-size grain*): DACH-M, DACH-L, IT-M, FR-XL, UK-S, CA-S, BNL-S *(size-S rows are not GTM segments; treat with caution)*

---

## Top markets by revenue (90d)

| Segment | Country | Revenue (90d) | Current reps | Avg book | Perfect book | Optimal HC | Gap | Rec |
|---------|---------|---------------|--------------|----------|--------------|------------|-----|-----|
| M | US | $191M | 735 | 55 | 175* | 229 | +506 | **Optimize** |
| XL | JP | $143M | 492 | 19 | 66–80 | 126 | +366 | **Optimize** |
| XL | US | $122M | 906 | 7 | 21–30 | 259 | +647 | **Optimize** |
| L | US | $85M | 785 | 15 | 31–40 | 343 | +442 | **Optimize** |
| M | UK | $22M | 160 | 41 | 51–65 | 113 | +47 | **Optimize** |
| M | DACH | $9M | 131 | 43 | 31–40 | 162 | **−31** | **Hire** |
| L | DACH | $4M | 154 | 13 | 1–10 | 401 | **−247** | **Hire** |
| M | IT | $2.4M | 36 | 37 | 11–20 | 89 | **−53** | **Hire** |

*US-M perfect book bucket (150+) still influenced by outlier growth in large-book reps — manual review recommended; directional analysis suggests **66–80 accounts** as operational target (see Week 2 analysis).

---

## Perfect book by segment (pattern)

| Segment | Typical perfect book range | Interpretation |
|---------|---------------------------|----------------|
| **XL** | 11–20 to 66–80 (varies by country) | Strategic books; JP XL peaks at 66–80 |
| **L** | 11–20 to 31–40 | Moderate book sizes |
| **M** | 31–40 to 51–65 (US/UK); outliers in 150+ | Mid-market; US needs validation |
| **S** | 1–10 to 41–50 | Smaller books; large S whitespace pool (4.7M accounts) |

---

## Headcount recommendation summary (34 markets)

| Recommendation | Count | Meaning |
|----------------|-------|---------|
| **Optimize** | ~22 | Too many reps for account base at optimal book size — consolidate/redistribute |
| **Hire** | ~8 | Under-staffed vs model — add headcount |
| **Hold** | ~2 | At optimal |
| **Do Not Hire** | ~2 | Market declining or no growth in optimal bucket |

---

## SBS whitespace (unassigned accounts, 90d)

| Segment | Unassigned accounts |
|---------|---------------------|
| S | 4,717,764 |
| M | 366,600 |
| XL | 84,333 |
| L | 55,712 |

Large S-segment pool represents major assignment opportunity; hire recommendations in S markets should factor this in.

---

## How to use this for HQ headcount requests

**Standardize requests with three numbers:**

1. **Perfect book target** (accounts per rep at peak growth)
2. **Optimal headcount** = assigned accounts ÷ perfect book
3. **Headcount gap** = current reps − optimal headcount

**Example talking point (US · size M — not Mid Market org):**
> "The US size-M account pool has 735 rep-slots averaging 55 accounts each *(not 735 unique reps — do not sum with other size rows)*. At a perfect book of ~80 accounts, this slice supports ~500 reps — suggesting optimization opportunity within this size bucket. True Mid Market / UMM / NAM headcount requires SQL v2 sales-segment grain."

**Example talking point (DACH-M):**
> "DACH-M has 131 reps averaging 43 accounts. Perfect book is 31–40 accounts with 60% median growth. Model supports 162 reps — **hire gap of ~31**."

---

## Caveats & next steps

1. **US-M 150+ bucket** — tighten outlier filter (exclude 150+ from optimal selection or require min 20 reps in bucket)
2. **Regional comp** — not yet in model; add Finance cost data for ROI-weighted hire decisions
3. **SBS whitespace** — segment-global, not country-specific; refine for country-level hire cases
4. **Validate with HQ** — compare perfect book targets to existing roster policy
5. **Looker dashboard** — wire query 10 as data source for Oct 1 deliverable

---

## Methodology (one paragraph for gameplan)

Reps are bucketed by accounts per rep into 11 fine-grained bands. For each country × segment, we compute median capped revenue growth (prior 90d vs current 90d, min $5k prior revenue, growth capped at ±50–100%). The **perfect book** is the largest bucket within 90% of peak growth where the next larger bucket shows lower growth (diminishing returns). **Optimal headcount** = total assigned accounts ÷ perfect book midpoint. Recommendations: Hire if under-staffed >10% with positive growth; Optimize if over-staffed >10%; Do Not Hire if market growth ≤ 0.
