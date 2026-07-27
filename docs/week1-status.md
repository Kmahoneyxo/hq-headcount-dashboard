# Week 1 Status — HQ Headcount Dashboard

**Date:** 2026-07-27  
**Owner:** Katie Mahoney  
**Phase:** Data sourcing + coverage probe + v0 base dataset  
**Latest JAM partition:** `20260725`  
**90-day window:** `20260427` – `20260725`

---

## Summary

All five Week 1 SQL steps were executed via **dp-mcp** (Trino, interactive). The JAM × PCID join works at team × segment grain. Coverage proxies are **`clicks`** and **`apply_starts`** (not `applies` or `connections`). Unassigned books appear as team name **`'None'`**, not SQL NULL.

**Base dataset v0:** 7,312 rep rows across 332 teams and 4 segments; ~$697M assigned-book revenue over 90 days.

---

## Step 1 — Validate join ✅

**Query:** `sql/01_validate_join.sql`  
**Partition:** `20260725`

| Finding | Detail |
|---------|--------|
| Join | JAM × PCID works at team × segment grain |
| Unassigned | Team name `'None'` (string), not NULL — filter with `<> 'None'` for assigned books |
| Sample (M, 1 day) | US-M-DE-STM-1: 727 accounts, 9 reps, ~$37.5k/day, ~81 acct/rep |
| Sample (XL, 1 day) | JP-NAM-DE-TYO-4: 127 accounts, 10 reps, ~$74k/day |

Top M-segment teams by 1-day revenue are US-based (STM, ATX, NYC, DCA-AUTO), ~57–81 accounts/rep.

---

## Step 2 — Coverage probe ✅

**Query:** `sql/02_coverage_field_probe.sql`  
**Partition:** `20260725`

| Field | Total (global, 1 day) | Usable? |
|-------|----------------------|---------|
| applies | 0 | No |
| connections | 0 | No |
| hires | 0 | No |
| **apply_starts** | **9,352,859** | **Yes** |
| **clicks** | **44,178,162** | **Yes** |

PCID `login_count` returned 0 for all segments — not useful from this snapshot.

**Decision:** Use `clicks` and/or `apply_starts` as coverage/activity proxies in iceberg JAM.

---

## Step 3 — Base dataset v0 ✅

**Query:** `sql/03_base_dataset_v0.sql`  
**Window:** 90 days (`20260427` – `20260725`)

| Metric | Value |
|--------|-------|
| Rep rows | 7,312 |
| Teams | 332 |
| Segments | 4 (S, M, L, XL) |
| Avg accounts/rep | 18.6 |
| Total revenue (90d) | ~$697M |

Top teams by 90-day revenue are JP XL teams (e.g. JP-NAM-JB-TYO-1 ~$51M) plus US-NAM-LTL-RMT teams.

**Grain:** team × segment × rep  
**Columns:** account_count, revenue_usd_90d, revenue_per_account, clicks_90d, apply_starts_90d, clicks_per_account

---

## Step 4 — Book size vs growth ✅

**Query:** `sql/04_book_size_vs_growth.sql`  
**Window:** 90 days

Reps bucketed by accounts_per_rep (1–25, 26–50, 51–100, 101–200, 200+):

| Segment | Dominant bucket | Rep count | Avg rev/account (dominant bucket) |
|---------|-----------------|-----------|-----------------------------------|
| S | 01: 1–25 | 1,249 | $2,341 |
| M | 03: 51–100 | 522 | $4,075 |
| L | 01: 1–25 | 1,653 | $7,582 |
| XL | 01: 1–25 | 2,010 | $22,874 |

**Pattern:** Rev/account generally declines as book size grows (especially M and S at 200+). XL segment shows highest rev/account at small book sizes. M segment has the most reps in the 51–100 bucket (522 reps).

---

## Step 5 — SBS whitespace ✅

**Query:** `sql/05_sbs_whitespace.sql`  
**Partition:** `20260725`  
**Filter:** `team IS NULL OR team = 'None'`

| Segment | Unassigned accounts | Revenue (1 day) |
|---------|---------------------|-----------------|
| S | 2,977,917 | $6.14M |
| M | 294,485 | $2.32M |
| XL | 69,078 | $403k |
| L | 46,390 | $357k |

S-segment dominates the unassigned pool (~3M accounts, ~$6M/day).

---

## Deliverables

| Item | Location | Status |
|------|----------|--------|
| Project README | `README.md` | Done |
| Data source doc | `docs/data-sources.md` | Done |
| SQL runbook | `sql/README.md` | Done |
| Validation query | `sql/01_validate_join.sql` | Run + updated |
| Coverage probe | `sql/02_coverage_field_probe.sql` | Run + updated |
| Base dataset v0 | `sql/03_base_dataset_v0.sql` | Run + updated |
| Book size analysis | `sql/04_book_size_vs_growth.sql` | Run + updated |
| SBS whitespace | `sql/05_sbs_whitespace.sql` | Run + updated |

---

## Decisions locked (2026-07-27)

| Decision | Answer |
|----------|--------|
| Scope | **Global** (no US filter for v1) |
| Unassigned books | **`'None'` team = unassigned/SBS** in all downstream logic |
| DSA join key | **`current_sales_rep_id` = `sales_rep_id`** via `current_parent_rep_assignment` or `rep_activity_sales` |
| Job activity proxy | **`clicks`** primary (volume, 0.52 revenue corr); **`apply_starts`** secondary (intent, ~20% of clicks) |
| Rep coverage proxy | **`rep_activity_sales`** (impact_calls, meetings, emails) — not JAM clicks |

## Open questions for Katie

1. **Book scoring source:** Where does the current book scoring methodology live?
2. **Rep coverage metric:** impact_calls vs total_calls vs meetings for Add/Hold/Consolidate rules?

---

## Recommended Week 2 focus

1. Add period-over-period revenue growth to base dataset (prior 90d vs current 90d)
2. Roll up base dataset to team × segment for dashboard grain
3. Draft preliminary Add / Hold / Consolidate rules by segment (book size + rev growth + coverage)
4. Join DSA for rep metadata (title, tenure, region)
5. Begin Looker Studio data source (saved query or materialized view)
