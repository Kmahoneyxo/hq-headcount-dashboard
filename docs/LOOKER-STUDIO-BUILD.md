# Looker Studio — complete build guide (from zero)

Step-by-step instructions to connect Looker Studio to the **Looker_Export** tab and build the HQ Headcount dashboard with segment PCID, revenue, coverage, ideal targets, headcount recommendations, and country/segment filters on every chart.

**Prerequisites**

- Access to [Global Sales Rep Headcount (1)](https://docs.google.com/spreadsheets/d/1Hq64TSm77FVH4hLxME2wrs1bJbT8Qi9Puk4FWMdkGsw/edit)
- Google account that can create Looker Studio reports

**Related docs:** [LOOKER-STUDIO-SETUP.md](./LOOKER-STUDIO-SETUP.md) (quick reference) · [APPS-SCRIPT-DEPLOY.md](./APPS-SCRIPT-DEPLOY.md) (web app deploy)

---

## Part A — Sheet, Apps Script, and Looker_Export

### A1. Open the headcount sheet

1. Open [Global Sales Rep Headcount (1)](https://docs.google.com/spreadsheets/d/1Hq64TSm77FVH4hLxME2wrs1bJbT8Qi9Puk4FWMdkGsw/edit).
2. Confirm these source tabs exist (at minimum): **Rep_Level**, **Capacity_Dashboard**, **Model_Engine**.
3. Optional but recommended for revenue/coverage metrics: a **Markets** tab (see A5).

### A2. Install or update Apps Script

1. In the sheet: **Extensions → Apps Script**.
2. Delete any default `Code.gs` content.
3. Paste the full contents of `docs/google-apps-script/ReferenceCheck.gs` from this repo (file name in the editor: `ReferenceCheck.gs`).
4. **Save** (Ctrl/Cmd+S).
5. If you use the web app for the HTML dashboard, redeploy: **Deploy → Manage deployments → Edit → New version → Deploy**. See [APPS-SCRIPT-DEPLOY.md](./APPS-SCRIPT-DEPLOY.md).

### A3. Refresh dashboard tabs

1. Return to the spreadsheet.
2. Menu **HQ Dashboard → Refresh dashboards**.
3. Confirm these tabs were created or updated:
   - **HC_Model** — analyst formulas
   - **Executive_View** — summary + charts
   - **Looker_Export** — flat table for Looker Studio (one row per country×segment market)
   - **Markets_Template** — optional paste guide for warehouse columns

### A4. Verify Looker_Export

1. Open the **Looker_Export** tab.
2. Row 1 must be column headers (snake_case).
3. Row 2+ should have one row per market (e.g. `US-M`, `UK-ACC`).
4. Key columns you should see:

| Column | What it is |
|--------|------------|
| `segment_avg_pcid` | Segment average PCIDs per rep |
| `revenue_90d` | Market 90-day revenue ($) |
| `avg_pqr_per_rep` | Average prior-quarter revenue per rep ($) — “avg rev” proxy |
| `segment_avg_pqr` | Segment benchmark PQR ($) — “ideal rev” proxy |
| `coverage_peak_accounts` | PCIDs/rep where impact coverage peaks |
| `median_impact_calls` | Median impact calls per account |
| `coverage_at_inflection` | Calls/account at coverage inflection |
| `ideal_pcid` | Target PCIDs per rep |
| `optimal_hc` | Ideal headcount |
| `current_reps` | Current rep count |
| `heads_to_add` | Reps needed to reach optimal HC |
| `hc_gap` | Current reps − optimal HC (negative = under-staffed) |
| `recommendation` | Hire / Hold / Optimize |
| `country`, `segment` | Filter dimensions |

> **Note:** `revenue_90d`, PQR, and coverage columns are blank until the **Markets** tab has warehouse data (Part A5) or you paste from `docs/data/headcount-dashboard.csv`. Rep_Level alone still populates PCID and headcount fields.

### A5. Optional — populate Markets tab (revenue & coverage)

Warehouse metrics do not live in Rep_Level. To fill revenue and coverage in Looker_Export:

**Option 1 — Paste from repo export**

1. In this repo, run: `python3 scripts/export-dashboard-data.py`
2. Open `docs/data/headcount-dashboard.csv`.
3. In the Google Sheet, create or open a tab named **Markets**.
4. Open **Markets_Template** (created by refresh) — row 2 lists snake_case headers; row 3 lists matching CSV labels.
5. Copy columns from `headcount-dashboard.csv` into **Markets** so headers align (country, segment, revenue_90d, segment_avg_pcid, avg_pqr_per_rep, segment_avg_pqr, coverage fields, etc.).
6. Run **HQ Dashboard → Refresh dashboards** again.

**Option 2 — Warehouse schedule**

Export sql/16 results to the Markets tab on a schedule (same column names as `headcount.json` / `headcount-dashboard.csv`).

**Minimum Markets columns for full Looker metrics**

```
country, segment, revenue_90d, segment_avg_pcid, avg_pqr_per_rep, segment_avg_pqr,
coverage_peak_accounts, median_impact_calls_per_account, coverage_at_inflection
```

---

## Part B — Connect data in Looker Studio

1. Go to [lookerstudio.google.com](https://lookerstudio.google.com/).
2. Click **Create → Report**.
3. **Add data → Google Sheets**.
4. Select **Global Sales Rep Headcount (1)**.
5. Choose worksheet **Looker_Export**.
6. Set **Header row** to **1**.
7. Click **Add** / **Connect**.
8. When prompted, click **Add to report**.
9. Close the starter table/chart Looker adds (select it → Delete) — you will build your own layout.

---

## Part C — Set field types (one time)

1. **Resource → Manage added data sources**.
2. Click the **pencil** icon on the Looker_Export connector.
3. For each field below, click the **ABC/123** type icon and set the type:

| Field | Type |
|-------|------|
| `updated_at` | Date & Time |
| `heads_to_add`, `heads_over`, `hc_gap`, `current_reps`, `optimal_hc` | Number |
| `ideal_pcid`, `avg_pcid`, `segment_avg_pcid`, `median_book`, `assigned_pcids` | Number |
| `revenue_90d`, `avg_pqr_per_rep`, `segment_avg_pqr` | Number (Currency optional) |
| `coverage_peak_accounts`, `median_impact_calls`, `coverage_at_inflection` | Number |
| `market`, `country`, `segment`, `region`, `recommendation`, `ideal_band`, `action_short` | Text |

4. Click **Done**.

---

## Part D — Country and segment filters (apply to page)

These controls filter **every chart on the page** when configured correctly.

### D1. Country filter

1. **Add a control → Drop-down list**.
2. **Control field:** `country`
3. In the properties panel → **Control** tab:
   - **Allow multiple selections:** ON (recommended)
   - **Default selection:** None (show all)
4. **Style** tab: resize and place top-left of the canvas.

### D2. Segment filter

1. **Add a control → Drop-down list**.
2. **Control field:** `segment`
3. Same settings: multiple selections ON.
4. Place next to the country control.

### D3. Apply filters to the whole page

1. Select the **country** control.
2. In properties → **Setup** tab → **Filter** section → ensure **Apply to** includes **Page** (or **Report** for all pages).
3. Repeat for the **segment** control.
4. Test: pick `US` and `M` — all charts below should narrow to US-M only.

> **Tip:** Do not add separate chart-level country/segment filters unless you need an exception. Page-level controls keep every scorecard, table, and chart in sync.

---

## Part E — Scorecards (top row)

Add three scorecards: **Add a chart → Scorecard**.

### E1. Total heads to add

| Setting | Value |
|---------|--------|
| **Metric** | `heads_to_add` |
| **Aggregation** | Sum |
| **Title** | Total heads to add |

### E2. Total optimal HC

| Setting | Value |
|---------|--------|
| **Metric** | `optimal_hc` |
| **Aggregation** | Sum |
| **Title** | Optimal headcount |

### E3. Total revenue (optional)

| Setting | Value |
|---------|--------|
| **Metric** | `revenue_90d` |
| **Aggregation** | Sum |
| **Title** | Revenue 90d |
| **Style → Show compact numbers** | ON (e.g. 121.9M) |

Only appears when Markets tab has `revenue_90d` populated.

### E4. Last refreshed (optional fourth scorecard)

| Setting | Value |
|---------|--------|
| **Metric** | `updated_at` |
| **Aggregation** | Max |
| **Title** | Last refreshed |

Arrange scorecards in a horizontal row below the filter controls.

---

## Part F — Master table (all metrics)

1. **Add a chart → Table**.
2. Add **dimensions** (columns) in this order:

| Column header (rename in chart) | Field |
|---------------------------------|-------|
| Market | `market` |
| Country | `country` |
| Segment | `segment` |
| Recommendation | `recommendation` |
| Heads to add | `heads_to_add` |
| Current reps | `current_reps` |
| Optimal HC | `optimal_hc` |
| HC gap | `hc_gap` |
| Avg PCID | `avg_pcid` |
| Segment avg PCID | `segment_avg_pcid` |
| Ideal PCID | `ideal_pcid` |
| Revenue 90d | `revenue_90d` |
| Avg PQR/rep | `avg_pqr_per_rep` |
| Segment avg PQR | `segment_avg_pqr` |
| Coverage peak (PCIDs) | `coverage_peak_accounts` |
| Median impact calls | `median_impact_calls` |
| Coverage at inflection | `coverage_at_inflection` |
| Action | `action_short` |

3. **Sort:** `heads_to_add` descending (Setup → Sort).
4. **Style → Wrap text:** ON for `action_short`.
5. **Pagination:** 25–50 rows per page.
6. Resize table to full width below scorecards.

> Page-level country/segment controls automatically filter this table.

---

## Part G — Bar chart: avg PCID vs ideal PCID by market

1. **Add a chart → Bar chart** (horizontal bars work well).
2. **Setup:**
   - **Dimension:** `market`
   - **Metric 1:** `avg_pcid` — aggregation **Avg** (or **None** if one row per market)
   - **Metric 2:** `ideal_pcid` — aggregation **Avg** (or **None**)
3. **Style → Bars shown:** 20 (or Auto).
4. **Sort:** `heads_to_add` descending (or `market` ascending).
5. **Title:** Avg PCID vs ideal PCID by market
6. **Legend:** ON — label series “Avg PCID” and “Ideal PCID”.
7. Optional **reference line** on ideal PCID average for segment filter context.

Because Looker_Export has one row per market, use **Sum** or **Avg** — values are identical per row. Prefer **Avg** or disable aggregation via a blended field if you add duplicate rows later.

---

## Part H — Bar chart: current reps vs optimal HC

1. **Add a chart → Bar chart**.
2. **Dimension:** `market`
3. **Metric 1:** `current_reps` (Sum or Avg)
4. **Metric 2:** `optimal_hc` (Sum or Avg)
5. **Sort:** `heads_to_add` descending.
6. **Title:** Current reps vs optimal HC
7. Optional filter on chart: `heads_to_add` > 0 to highlight under-staffed markets only.

Place Part G and Part H side by side below the master table.

---

## Part I — Pie chart: recommendation mix

1. **Add a chart → Pie chart**.
2. **Dimension:** `recommendation`
3. **Metric:** `market` — aggregation **Count Distinct** (or Record Count)
4. **Title:** Hire / Hold / Optimize
5. **Style → Colors** (suggested):
   - Hire: `#137333`
   - Hold: `#9aa0a6`
   - Optimize: `#c5221f`
6. **Pie slice labels:** Percentage + value

Page filters apply — pie shows recommendation mix for selected country/segment only.

---

## Part J — Share and refresh workflow

### J1. Share the report

1. Click **Share** (top right).
2. Add viewers (individuals or Google Group).
3. Viewers need at least **View** access to the source Google Sheet if Looker prompts for authorization.

### J2. Weekly refresh rhythm

| Step | Where | Action |
|------|--------|--------|
| 1 | Repo / warehouse | Update `headcount.json` or export Markets CSV |
| 2 | Google Sheet | Paste into **Markets** tab if needed; confirm **Rep_Level** is current |
| 3 | Google Sheet | **HQ Dashboard → Refresh dashboards** |
| 4 | Looker Studio | **Resource → Manage added data sources → Refresh data** |
| 5 | Looker Studio | Check **Last refreshed** scorecard (`updated_at` Max) |

### J3. Scheduled refresh (optional)

If your Google Workspace plan supports it: **Resource → Manage added data sources → Edit → Data freshness → Schedule**. Align schedule with sheet refresh (e.g. Monday 8am after warehouse export).

### J4. Troubleshooting

| Issue | Fix |
|-------|-----|
| Blank revenue/coverage columns | Populate **Markets** tab from `headcount-dashboard.csv` (Part A5) |
| Stale recommendations | Refresh dashboards in sheet, then refresh data source in Looker |
| Filters don’t affect a chart | Select control → Setup → apply to **Page** |
| Wrong number types | Revisit Part C field types |
| Tab missing | Re-paste Apps Script and run **Refresh dashboards** |

---

## Looker_Export column reference

| Column | Description |
|--------|-------------|
| `updated_at` | ISO timestamp when export was built |
| `market` | Country–segment key (e.g. `US-M`) |
| `country` | Rollup country code |
| `segment` | Sales segment |
| `region` | The Americas / EMEA / Asia-Pac |
| `recommendation` | Hire / Hold / Optimize |
| `heads_to_add` | Reps to add to reach optimal HC |
| `heads_over` | Reps above optimal HC |
| `hc_gap` | Current reps − optimal HC |
| `current_reps` | Rep count in segment |
| `optimal_hc` | Model optimal headcount |
| `ideal_pcid` | Target PCIDs per rep |
| `ideal_band` | PCID band label |
| `avg_pcid` | Average PCIDs per rep (from Rep_Level or Markets) |
| `segment_avg_pcid` | Segment average PCID |
| `median_book` | Median PCIDs per rep |
| `assigned_pcids` | Total assigned PCIDs |
| `revenue_90d` | Market 90-day revenue ($) — Markets tab |
| `avg_pqr_per_rep` | Avg prior-quarter revenue per rep — Markets tab |
| `segment_avg_pqr` | Segment avg PQR benchmark — Markets tab |
| `coverage_peak_accounts` | PCIDs/rep at coverage peak — Markets tab |
| `median_impact_calls` | Median impact calls/account — Markets tab |
| `coverage_at_inflection` | Calls/account at inflection — Markets tab |
| `action_short` | One-line action summary (≤80 chars) |

---

## Metric mapping (stakeholder language → field)

| Stakeholder ask | Looker field |
|-----------------|--------------|
| Segment avg PCID | `segment_avg_pcid` |
| Avg revenue | `avg_pqr_per_rep` (per rep) or `revenue_90d` (market total) |
| Ideal revenue | `segment_avg_pqr` |
| Impact coverage | `median_impact_calls`, `coverage_at_inflection`, `coverage_peak_accounts` |
| Ideal PCID | `ideal_pcid` |
| Ideal headcount | `optimal_hc` |
| Recommendation | `recommendation` |
| Heads to add | `heads_to_add` |
