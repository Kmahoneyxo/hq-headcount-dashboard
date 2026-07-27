# Prompt: Evolve HQ Headcount Dashboard to Project Goals

> **One project, two layers:** Book **health** dash first (confirm ideal book size) → then **headcount** (heads + accounts). See `docs/project-overview.md`.

Copy everything below the line into Cursor (Agent mode, dp-mcp connected) or share with Addy/Maryam as the build spec.

---

## PROMPT START

You are working on the **HQ Headcount Capacity Model** repo:

- **Repo:** `/Users/katiemahoney/hq-headcount-dashboard`
- **Live dash:** https://kmahoneyxo.github.io/hq-headcount-dashboard/
- **Due:** October 1, 2026
- **Owners:** Katie Mahoney & Addy
- **Gameplan:** https://docs.google.com/document/d/1NtJ-bAiX3T2s5eMC7WiX0WV9lVVVsvCkgBOwZlryhHI/edit

### What exists today (do not rebuild from scratch)

| Layer | Location | Status |
|-------|----------|--------|
| Live web dashboard | `docs/index.html`, `docs/app.js`, `docs/styles.css`, `docs/data/headcount.json` | GitHub Pages, refresh button |
| Dashboard source query | `sql/12_headcount_with_book_score.sql` | Perfect book + optimal HC + FY26 book score |
| Book score join | `sql/11_book_score_join.sql` | `sales_book_summary_v2` (Book Building FY26) |
| Headcount model | `sql/10_perfect_book_headcount_country_segment.sql` | Country × segment |
| SBS whitespace (segment only) | `sql/05_sbs_whitespace.sql` | Global pool by S/M/L/XL |
| Refresh tooling | `scripts/dashboard-server.py`, `scripts/csv-to-dashboard-json.py` | Manual / Quest export |

**Approved tables only:**
- JAM: `datalake.imhotep_iceberg.jobactivitymetrics`
- PCID: `datalake.scss.client_attributes_dim_parent_attributes_current`
- DSA: `datalake.sales_data_strategy_dsa` (incl. `sales_book_summary_v2`, `current_parent_rep_assignment`, `rep_activity_sales`)

---

### My goals (prioritized)

1. **Operationalize the perfect book** — country × segment threshold where revenue growth peaks before diminishing returns; show on dash clearly vs current avg book.
2. **Optimal headcount** — `assigned accounts ÷ perfect book` vs current reps → Hire / Hold / Optimize / Do Not Hire.
3. **Book scoring (FY26)** — use official Book Building methodology (`sales_book_summary_v2` / Tableau Book Building FY26). Compare **policy book build %** vs **data-derived perfect book size**. Discuss moving from z-score “evenness” to **target avg score per book**.
4. **Opportunity pipeline** — by country × segment: does **$/job** (or rev/job) plateau when books get too big? Is there a **# PCIDs/rep** where growth drops? Answer for **every country × every segment** (AMER first).
5. **SBS opportunities** — unassigned accounts for new books; need **country × segment** (not segment-global only). Support recommendations like “build 2 new S books in UK.”
6. **Coverage KPIs** — when do bigger books get less coverage (`rep_activity_sales.impact_calls`)? Inflection curve on dash.
7. **Shareable, mobile, easy refresh** — keep GitHub Pages dash; add scheduled Quest refresh; consider Looker Studio mirror for @indeed.com sharing.
8. **AMER-first scope for v2** — US, CA, UK, DACH, BNL first; then expand global. **Japan out of scope** everywhere.

**Out of scope:** SBS/GES/agency book composition, Japan, sector/HQ/tenure in v2 (park for later unless trivial).

---

### What I need you to build next

#### Phase A — AMER-focused dash upgrade (this week)

1. **Default dash filter: AMER only** (US, CA, UK, DACH, BNL) with toggle for global.
2. **New SQL + dash sections:**
   - `sql/13_opp_pipeline_country_segment.sql` — rev/job (or $/job) vs book-size buckets, by country × segment; find plateau.
   - `sql/14_sbs_whitespace_country_segment.sql` — unassigned PCIDs + 90d revenue by country × segment.
   - `sql/15_coverage_vs_book_size.sql` — impact calls/account vs book size; inflection by country × segment.
3. **Update `docs/data/headcount.json` schema** and `docs/app.js` to show:
   - Perfect book vs current avg book (visual gap)
   - FY26 % book built vs **policy target** (placeholder column until Addy confirms MM target)
   - SBS assignable accounts (country × segment)
   - Opp pipeline flag (“$/job still growing” vs “plateaued”)
   - Coverage vs book-size status
   - **Action column:** e.g. “Grow books”, “Improve FY26 score”, “Build N new books”, “Optimize HC”
4. **Fix US-M outlier** — cap perfect book at 150+ bucket or require min 20 reps; operational target ~66–80.
5. **Wire refresh** — document Quest saved report on query 12; update `csv-to-dashboard-json.py` for new columns.

#### Phase B — Book Health Dashboard (Layer 1 — before headcount actions)

6. **Rep-level book health** — `sql/17`: PCID count, PQR (when defined), coverage, rev trend, FY26 score; flag too big / too little with outcome rules.
7. **Book health tab** in dash — confirm ideal book per market; histogram of rep books vs ideal band; Maryam-style mobile UX.
8. Do **not** ship split/new-head recommendations until health layer validates ideal size for that market.

#### Phase C — Headcount from confirmed book health (Layer 2)

9. Regional cost tier (Finance data or document as limitation).
10. Split / new-head calculator — pool from unhealthy overweight books → new heads (see `prompt-book-redistribution-calculator.md`).
11. Looker Studio mirror fed by same Quest export (optional parallel to GitHub Pages).

---

### Dash UX requirements (learn from Maryam’s health dash)

- **Mobile-first** — readable on phone; sticky filters; scrollable table.
- **One-screen headline** — AMER markets over-staffed vs under-staffed; top Hire/Optimize actions.
- **Three numbers per market** (HQ standard): perfect book target | optimal HC | headcount gap.
- **Compare two book views side by side:**
  - **Data perfect book** (growth inflection from JAM)
  - **FY26 book build score** (policy flags from DSA)
- **Refresh** — one button; show `updated_at` + data window; weekly cadence is fine.
- **No Tableau required** — web dash is primary; prettier styling welcome.

---

### Analytics questions the dash must answer

For each **country × segment** (AMER first):

1. What is the **perfect book** (# PCIDs/rep at peak growth)?
2. What is **optimal headcount** and **gap** vs today?
3. What is **FY26 avg book score** and **% book built**? vs target?
4. How many **additional accounts** can current reps absorb? (`headroom × reps`)
5. How many **SBS accounts** exist in this market to fill new books?
6. At current book size, has **$/job** stopped growing?
7. Has **coverage per account** dropped vs smaller-book peers?

---

### Data rules (locked)

- `'None'` team = unassigned / SBS in all logic.
- Join: `JAM.current_parent_company_id = PCID.parent_company_id`; rep via `current_sales_rep_id = sales_rep_id`.
- 90d windows: update partitions to latest JAM CST date.
- Growth capped −50% to +100%; min $5k prior 90d revenue per rep for growth calcs.
- Exclude Japan (`JP`) in all outputs.

---

### Deliverables checklist

- [ ] SQL 13, 14, 15 written and run via dp-mcp
- [ ] Query 12 updated or new export query combining all metrics
- [ ] `docs/data/headcount.json` refreshed with AMER markets + new fields
- [ ] Dash updated: filters, charts, action column, AMER default
- [ ] `docs/meeting-sheet.md` or CSV export for Friday Addy sync
- [ ] `docs/share-dashboard.md` updated with Quest refresh steps
- [ ] Push to `cursor/optimal-book-base-dataset-v1`; GitHub Pages redeploys from `/docs`

---

### How to work

1. Read existing SQL (`10`, `11`, `12`) and dash (`docs/app.js`) before changing.
2. Run queries via dp-mcp; embed results in `headcount.json` (no live Trino from browser).
3. Minimize scope — one focused PR worth of changes per phase.
4. Document open questions for Addy: FY26 MM target score, z-score vs target avg, Maryam health dash stack.

## PROMPT END

---

## Shorter version (quick Cursor turn)

```
Evolve the HQ headcount dashboard in /Users/katiemahoney/hq-headcount-dashboard toward Oct 1 goals.

Existing dash: docs/ on GitHub Pages, data from sql/12_headcount_with_book_score.sql.

Build AMER-first (US, CA, UK, DACH, BNL; exclude JP):
1. sql/13 opp pipeline — $/job vs book size by country×segment
2. sql/14 SBS whitespace by country×segment  
3. sql/15 coverage vs book size inflection
4. Update docs/app.js + headcount.json: perfect book vs avg book, FY26 score vs target, SBS pool, opp plateau flag, action recommendations
5. Default AMER filter; mobile-friendly; fix US-M 150+ outlier
6. Refresh via Quest export → csv-to-dashboard-json.py

Tables: JAM, PCID, DSA only. Follow sql/10-12 patterns. Push when done.
```
