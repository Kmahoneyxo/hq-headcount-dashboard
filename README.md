# HQ Headcount Dashboard

Looker Studio dashboard for HQ headcount planning: per **team × segment**, signal whether headcount should **Add / Hold / Consolidate**, backed by book size, coverage, revenue growth, and SBS whitespace.

**Due:** October 1, 2026  
**Gameplan:** [Google Doc](https://docs.google.com/document/d/1NtJ-bAiX3T2s5eMC7WiX0WV9lVVVsvCkgBOwZlryhHI/edit)

## Data sources

| Role | Table |
|------|-------|
| Job / revenue / activity (JAM) | `datalake.imhotep_iceberg.jobactivitymetrics` |
| Parent company / segment (PCID) | `datalake.scss.client_attributes_dim_parent_attributes_current` |
| Rep / roster (DSA) | `datalake.sales_data_strategy_dsa` |

**Reference roster:** [Sales Roster (locked)](https://docs.google.com/spreadsheets/d/1jNEgAVnnBa4Gg3x6sM6VcqyopUssvVK-rwomW384Lv8/edit?gid=1267790725)

## Week 1 SQL (run in order)

Run via **dp-mcp** (`execute_query`, Trino) or iDash. See `sql/README.md`.

1. `01_validate_join.sql` — confirm JAM × PCID join (replicate 7/24 validation)
2. `02_coverage_field_probe.sql` — find non-zero coverage/activity fields
3. `03_base_dataset_v0.sql` — team × segment × rep base table (90-day window)
4. `04_book_size_vs_growth.sql` — bucket analysis by accounts/rep
5. `05_sbs_whitespace.sql` — unassigned accounts by segment

## Running queries from Cursor

**dp-mcp** is configured in Claude Code but not in this Cursor session by default. To run live queries here:

1. Cursor Settings → MCP → add `dp-mcp` (URL: `https://data-plat-mcp.sandbox.indeed.net/mcp`)
2. Or continue in **Claude Code** where dp-mcp is already connected

Then ask the agent: *"Run sql/02_coverage_field_probe.sql via dp-mcp and summarize results."*
