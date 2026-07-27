# SQL runbook — Week 1

Execute in order via **dp-mcp** → `execute_query` (queryType: `TRINO`, environment: `interactive`).

| # | File | Purpose | Expected outcome |
|---|------|---------|------------------|
| 1 | `01_validate_join.sql` | Confirm join still works | Top teams with sensible acct/rep (~50–100 for M segment) |
| 2 | `02_coverage_field_probe.sql` | Find activity fields | At least one of connections/clicks/applies non-zero; if all zero, escalate |
| 3 | `03_base_dataset_v0.sql` | Build rep-level base table | One row per team × segment × rep with book size + revenue |
| 4 | `04_book_size_vs_growth.sql` | First inflection read | Bucket table by segment showing revenue/account vs book size |
| 5 | `05_sbs_whitespace.sql` | Size SBS pool | Unassigned accounts + revenue by segment |
| 6 | `06_base_dataset_v1.sql` | Rep-level base with growth + coverage + country | One row per team × segment × rep |
| 7 | `07_optimal_book_segment_country.sql` | Growth-optimal book bucket by segment × country | Bucket table with median growth (min 5 reps) |
| 8 | `08_team_vs_optimal_book.sql` | Team vs optimal + Hire/Hold/Optimize v1 | Team-level headcount signal |
| 9 | `09_headcount_capacity_model.sql` | Team-level capacity model | Hire / Hold / Optimize / Do Not Hire |
| 10 | `10_perfect_book_headcount_country_segment.sql` | **Perfect book + optimal headcount** | Country × segment perfect book threshold + headcount gap |
| 11 | `11_book_score_join.sql` | **Book Building FY26 score** | FY26 book score by country × segment from `sales_book_summary_v2` |
| 16 | `16_dashboard_export.sql` | **Full dashboard export** | Ideal HC, PQR, book health, split-hire (Layer 1+2) |
| 17 | `17_rep_book_profile.sql` | **Rep book health** | Flagged reps (too big/too little) → `book_health.json` |

## Dashboard refresh

Run query **16** on Quest **prod** (interactive times out at 10m). Export → `scripts/json-from-mcp-results.py`.

Run query **17** for rep-level flags → `scripts/merge-book-health.py`.

## Before running

1. Update partition dates (`dl__yyyymmdd_cst`) to the latest available CST partition.
2. For 90-day windows in 03/04, align `BETWEEN` dates to your chosen end date.

## Claude Code one-liner

Paste into Claude Code (dp-mcp connected):

```
Run the Week 1 SQL in /Users/katiemahoney/hq-headcount-dashboard/sql/ in order.
Update partition dates to the latest available. Summarize results in docs/week1-status.md
with findings, blockers, and recommended Week 2 focus.
```
