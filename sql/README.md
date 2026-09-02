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
| 17 | `17_rep_book_profile.sql` | **Rep book health (flagged)** | Flagged reps (too big/too little) → `book_health.json` |
| 21 | `21_jv_by_bucket.sql` | JV by PCID bucket | `jv_by_bucket[]` in headcount (or computed from rep_jv) |
| 23 | `23_product_mix_by_bucket.sql` | CPC vs CPA share by bucket | `product_mix_by_bucket[]` via merge-bucket-exports.py |
| 24 | `24_coverage_by_bucket.sql` | Impact coverage by bucket | `coverage_by_bucket[]` (or computed from rep_book) |

## Dashboard refresh

Run query **16** on Quest **prod** (interactive times out at 10m). Export → `scripts/json-from-mcp-results.py`.

Run query **17** for rep-level flags → `scripts/merge-book-health.py`.

Run query **17a** (`17_rep_book_profile_all.sql`) for all reps → `scripts/merge-rep-book.py` (JSON or CSV export).

Merge scripts accept **JSON** (`query17_*_results.json`) or **CSV** (`query17_all.csv`, `query17_flagged.csv`).

> **Rep count vs headcount:** `headcount.json` `current_reps` (sql/16) counts all reps with activity in the window. `rep_book.json` (sql/17a) filters to `revenue_prior >= $5,000` — expect `current_reps` to be slightly higher (e.g. US-M +6).

Run **23** / **24** on prod → export JSON → `python3 scripts/merge-bucket-exports.py docs/data/product_mix_by_bucket.json` (and coverage file). Then `python3 scripts/build_market_summary.py docs/data/headcount.json` to refresh narratives.

## Data grain and refresh alignment

| Layer | Query | Grain | Runtime JSON |
|-------|-------|-------|----------------|
| Market HC + curves | sql/16 | country × segment | `headcount.json` (fetched) |
| All reps | sql/17a | rep | `rep_book.json` (build / validation) |
| Flagged reps | sql/17 | rep (`too_big` or `too_little`) | `book_health.json` (fetched) |

**Refresh together:** Run sql/16 and sql/17/17a on the **same day** and merge before deploy. `headcount.json` `updated_at` can drift from `rep_book.json` if only sql/16 is re-exported.

**`current_reps` vs `rep_book` row count:** sql/16 `market_accounts.current_reps` counts `rep_level` (any rep with job activity in the window). sql/17a / `rep_book.json` filters `revenue_prior >= $5,000`. Flag counts (`reps_too_big`, `reps_too_little`) use `rep_filtered` in sql/16 and align with `rep_book` when vintages match.

**`current_avg_book`:** `assigned_accounts ÷ current_reps` (sql/16 denominator = `rep_level`), not mean PCID from `rep_book`.

**Validation exports:** `query17_all.csv` / `query17_flagged.csv` are equivalent to MCP JSON when merged via `load_export_rows.py` (null/false booleans normalized). Flagged CSV omits `sales_team_name` and `impact_calls_90d` — use sql/17a export for full rep fields.

**Product mix:** After sql/23 export, always run `merge-bucket-exports.py`; charts read `product_mix_by_bucket[]` on `headcount.json`, not the raw MCP file.

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
