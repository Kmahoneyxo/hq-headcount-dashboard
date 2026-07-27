# Data sources & join logic

Verified 2026-07-24 via dp-mcp catalog + Trino validation query.

## Tables

### JAM — `datalake.imhotep_iceberg.jobactivitymetrics`

- **Grain:** job × day
- **Partition:** `dl__yyyymmdd_cst` (varchar, e.g. `'20260722'`)
- **Key fields for this project:**
  - `current_parent_company_id` — join to PCID
  - `current_sales_team_name`, `current_sales_team_id`
  - `current_sales_rep_id`
  - `cpc_revenue_millicents`, `cpa_revenue_millicents` — revenue (÷ 100000 for USD)
  - **Job activity (account health):** `clicks`, `apply_starts` — non-zero in iceberg; `applies`, `connections`, `hires` are zero
  - **Rep coverage (rep effort):** use DSA `rep_activity_sales` (impact_calls, total_calls, emails, meetings) — joins on `sales_rep_id`

#### Clicks vs apply_starts (JAM job-activity fields)

| Field | What it measures | Funnel stage |
|-------|------------------|--------------|
| **clicks** | Job seeker clicks on sponsored + organic jobs | Top of funnel (interest) |
| **apply_starts** | Clicks on Indeed Apply button or "apply to job" (3rd party) | Mid funnel (apply intent) |
| **applies** | Successfully submitted Indeed applies | Bottom funnel — **zero in iceberg JAM** |

On assigned books (90d): clicks ↔ apply_starts correlation = 0.74; apply_start rate ≈ 20% of clicks (consistent across segments). Clicks correlates more with revenue (0.52) than apply_starts (0.13).

**Recommendation:** Use **`clicks_per_account`** as primary job-activity proxy (volume + revenue link); add **`apply_starts_per_account`** as conversion-intent signal. For rep-side coverage, use **`rep_activity_sales.impact_calls`** (or similar) from DSA.

### PCID — `datalake.scss.client_attributes_dim_parent_attributes_current`

- **Grain:** parent company (current snapshot)
- **Key fields:**
  - `parent_company_id` — join key
  - `company_size_segment` — S / M / L / XL
  - `sales_rep_id` — null = unassigned (SBS whitespace signal)
  - `industry`, `industry_group`, `billing_country`, `login_count`

### DSA — `datalake.sales_data_strategy_dsa` (schema, not a single table)

- **Purpose:** Sales/CS rep metadata, book summaries, rep activity (coverage), parent assignments
- **Note:** `sales_data_strategy_dsa` is a **schema** with 50+ tables. Key tables for this project:

| Table | Grain | Join key to JAM | Match rate (20260725) | Use for |
|-------|-------|-----------------|----------------------|---------|
| `current_parent_rep_assignment` | parent company | `sales_rep_id` = `current_sales_rep_id` | 2202 / 2211 reps | Rep name, team, region, segment, manager hierarchy |
| `rep_activity_sales` | rep × day | `sales_rep_id` = `current_sales_rep_id` | 2181 / 2211 reps | **Rep coverage** — calls, emails, meetings, impact_calls |
| `sales_book_summary_v2` | parent × rep (long) | `rep_id` = `current_sales_rep_id` | 1298 / 2211 reps | Book scoring variables, sales team name |
| `cs_roster` | rep (CS only) | `cs_rep_id` — **does not join JAM sales rep id** | 0 | CS rep roster only (1095 CS reps); not for sales headcount |

**Recommended join for v1:** `JAM.current_sales_rep_id = current_parent_rep_assignment.sales_rep_id` for rep metadata; add `rep_activity_sales` for true rep coverage metrics.

### Regional cost data (gap)

No comp/cost table found in `sales_data_strategy_dsa`. Query `09_headcount_capacity_model.sql` uses a **region cost tier proxy** (High / Medium-High / Medium / Standard) based on `sales_region` and country. Replace with Finance/HR comp data when available for ROI-weighted hire decisions.

## Join chain (v0)

```
JAM.current_parent_company_id = PCID.parent_company_id
```

Optional: DSA on `current_sales_rep_id` or roster LDAP once fields confirmed.

## Analytical grain

- **Dashboard target:** team × segment
- **Analysis v0:** team × segment × rep (then roll up)
- **Hypothesis chain:** book size → coverage → revenue growth

## Already validated (7/24)

Single-day join (`dl__yyyymmdd_cst = '20260722'`) produced sensible team × segment counts:

| team | segment | accounts | reps | revenue (1d) | acct/rep |
|------|---------|----------|------|--------------|----------|
| US-M-DE-ATX-5 | M | 632 | 8 | ~$58.7k | ~79 |
| US-M-DE-STM-1 | M | 741 | 9 | ~$55.5k | ~82 |
| JP-NAM-DE-TYO-4 | XL | 127 | 10 | ~$105.6k | ~13 |
| *(null team)* | S | 3,164,779 | — | ~$10.0M | — |
