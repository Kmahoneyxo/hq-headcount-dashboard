# Open questions for Addy (Friday sync)

## Resolved (Katie — Jul 2026)

| Topic | Decision |
|-------|----------|
| **PQR** | Prior quarter revenue (prior 90–92 days) |
| **Too big** | Segment avg PCID **and/or** segment avg PQR exceeded **plus** outcome signal (coverage ↓ or current rev ↓ vs prior Q) |
| **Prior quarter** | Last 90–92 day revenue window (same as model: prior 90d vs current 90d) |
| **Split-hire vs Optimize** | Split-hire OK at **country × segment** even when market-level says Optimize |
| **Which accounts to move** | No preference v1 — goal is **ideal/even books**; peel only to `perfect_book_target`, never over-strip donor |

## Still open

### FY26 book score policy

1. **MM target score** — Official FY26 target for `% book built` and average flag score by segment (especially MM/M)? Placeholder: `fy26_target_pct_book_built`.

2. **Z-score vs target average** — Compare markets to z-score/evenness vs target avg score per book?

3. **Side-by-side interpretation** — When data perfect book differs from FY26 policy direction, which takes precedence?

### SBS / whitespace

4. **Country assignment for unassigned accounts** — PCID `hq_country` (fallback `billing_country`) → market codes (GB→UK, DACH, BNL). Correct?

5. **SBS pool deduping** — Require `sales_rep_id IS NULL` on PCID in addition to JAM team `None`?

### Opp pipeline & coverage

6. **$/job plateau** — Confirm `agg_job_id` + median rev/job matches opp-pipeline definition.

7. **Coverage metric** — Confirm `impact_calls` per account for Hold/Consolidate rules.

### Maryam / health dash

8. **Refresh stack** — Health dash refresh cadence and mobile layout to mirror for Layer 1.

### Evenness metric

9. **“Even books” KPI** — Prefer stddev of PCID count across reps, max−min, or % reps within ±10% of ideal for the health dash?
