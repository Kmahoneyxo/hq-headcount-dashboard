# Open questions for Addy (Friday sync)

## FY26 book score policy

1. **MM target score** — What is the official FY26 target for `% book built` and average flag score by segment (especially MM/M)? Dashboard has a placeholder column `fy26_target_pct_book_built` until confirmed.

2. **Z-score vs target average** — Book Building FY26 today uses account-level flags averaged to a rep score. Should the dashboard compare markets to:
   - a **z-score / evenness** benchmark across reps, or
   - a **target average score per book** (policy threshold)?

3. **Side-by-side interpretation** — When **data perfect book** (growth inflection from JAM) differs from **FY26 policy score** direction (e.g. small books but low FY26 % built), which takes precedence for staffing recommendations?

## SBS / whitespace

4. **Country assignment for unassigned accounts** — We use PCID `hq_country` (fallback `billing_country`) rolled to market codes (GB→UK, DE/AT/CH→DACH, BE/NL/LU→BNL). Is that the right rule for “build N books in country X”?

5. **SBS pool deduping** — Unassigned counts are distinct PCIDs with JAM activity in 90d where team is `None`. Should we also require `sales_rep_id IS NULL` on PCID?

## Opp pipeline & coverage

6. **$/job plateau** — We use `agg_job_id` distinct jobs per rep and median rev/job by book-size bucket. Confirm this matches the opp-pipeline definition from your meeting notes.

7. **Coverage metric** — Dashboard uses `rep_activity_sales.impact_calls` per account. Prefer impact_calls, total_calls, or meetings for Hold/Consolidate rules?

## Maryam / health dash

8. **Refresh stack** — What is Maryam’s health dashboard using for scheduled refresh and mobile layout? Worth mirroring for GitHub Pages vs Looker Studio split.
