# Data Model Audit — HQ Headcount Dashboard

**Date:** 2026-07-27 · **Scope:** Dimension/grain bugs (subagent audit 8a1ddcee)  
**Bottom line:** The dashboard is a **country × employer-size** capacity sketch, not a **country × sales-segment** headcount model. Do not share rolled-up rep counts or global Hire/Optimize totals until SQL v2 lands.

---

## Critical — wrong answer if shared with stakeholders

| # | Issue | Where | Evidence | Fix |
|---|-------|-------|----------|-----|
| 1 | **`segment` = company size (S/M/L/XL), not sales GTM segment** | `sql/16`, `sql/17`, JSON/UI | PCID has S/M/L/XL only; teams use M, MUpper→UMM, L, NAM, DCA | Derive `sales_segment` from team name; grain = `country × sales_segment` |
| 2 | **Rep double-counting across size rows** | `rep_level` → `market_accounts` | **794 / 942 US reps (84.3%)** span >1 company-size bucket; sum of US size-row reps = **2,934** vs **942** unique | One row per `(country, sales_segment, rep)`; **never sum `current_reps` across rows** |
| 3 | **"US-M" is not Mid Market sales org** | Docs, lookup default `M` | Reps on `US-M-*` teams by PCID size: L/M/S/XL each ~235–259 | Rename to "US · size M" until SQL v2; then true US-M + US-UMM |
| 4 | **Missing sales segments (NAM, DCA, UMM, …)** | Grain + `perfect_book` inner join | US team segments: M 260, UMM 132, L 211, NAM 230, DCA 109 — dashboard has US-S/M/L/XL only | Add team-derived segments; perfect book per sales segment |
| 5 | **S/XL as headcount "markets" is invalid framing** | `headcount.json`, stakeholder docs | US-S shows 516 reps / Optimize — not a GTM planning unit | Remove S/XL from segment axis (or appendix only) |
| 6 | **Perfect book unstable at wrong grain** | `perfect_book` CTE | UK-M: avg book 41, perfect book 5, optimal HC 1,325, gap −1,164 (Hire) | Recompute on `country × sales_segment`; add confidence flags |

---

## High — material bias

| # | Issue | Where | Evidence | Fix |
|---|-------|-------|----------|-----|
| 7 | **Inconsistent country definition** | `sql/16` country, `book_score_market`, `sbs_country` | DE→DACH 144 reps; NL→BNL 68; UK→IBE 1 — IBE/IE/ES absent | One `market_country` mapping everywhere |
| 8 | **SBS whitespace on company size, not sales segment** | `sql/16` L314–331 | SBS for US-M uses M-sized unassigned pool, not Mid Market whitespace | Map SBS to sales segment or drop from segment actions |
| 9 | **Book health / split-hire on rep × company-size slices** | `sql/17` | Same rep "too little" on US-S and "too big" on US-L | Flag reps at `country × sales_segment` on full book |
| 10 | **`perfect_book` inner join drops markets** | Final `base` CTE | 16 markets exported; NAM/DCA/UMM, most FR/IT/ES missing | LEFT JOIN + `data_quality` flag; coverage report |
| 11 | **Stakeholder docs contradict reality** | `how-to-read-headcount.md`, `stakeholder-summary.md` | Docs say "US-M = Medium"; UI footnote buried | Banners + relabel "company size" until SQL v2 |

---

## Medium / Low (summary)

- **`revenue_prior >= 5000`** — drops low-PQR reps from benchmarks (`sql/16` L119)
- **Japan exclusion asymmetry** — assigned side only (`country <> 'JP'`)
- **UI segment filters** — S/M/L/XL chips reinforce wrong dimension
- **Excel meta note** — documents issue but numbers remain misleading
- **`assigned_accounts`** — sums per-rep counts at slice grain, not distinct PCIDs market-wide

---

## Recommended fix order

1. **Stop** sharing rolled-up rep counts or global Hire/Optimize totals from current dashboard.
2. **SQL v2 grain:** `country × sales_segment` from team name (`MUpper`→`UMM`); exclude **S** as segment.
3. **Unify country mapping** (DSA + rollup) across assigned, SBS, book score.
4. **Re-run sql/16 + sql/17** on prod; refresh JSON.
5. **Rewrite** stakeholder docs with true sales-segment examples (US-M + US-UMM split).
6. Add **data-quality flags:** `perfect_book_confidence`, `excluded_market_reason`, `do_not_sum_reps`.

---

## Query evidence summary (Trino interactive, 90d window)

| Query | Result |
|-------|--------|
| US reps by company_size | S 508, M 735, L 785, XL 906 (distinct per row) |
| US reps spanning multiple sizes | **794 / 942 (84.3%)** |
| Sum US size-row reps vs unique | **2,934 vs 942** |
| US-M team × PCID size | M/L/S/XL all ~235–259 reps each |
| Team prefix vs DSA market | DE→DACH 144, NL→BNL 68, UK→IBE 1 |
| Live `headcount.json` | 16 markets; **Σ current_reps = 4,349** |
| US sales segments (team-derived) | M 260, UMM 132, L 211, NAM 230, DCA 109 |

---

## Partially documented in-repo

- `docs/index.html` — company size ≠ sales segment note (buried in "How to read this")
- `scripts/export-dashboard-data.py` L304 — Excel meta sheet note
- No guard in `app.js` against summing reps across rows

**Refactor grain before Oct 1 stakeholder deadline.**
