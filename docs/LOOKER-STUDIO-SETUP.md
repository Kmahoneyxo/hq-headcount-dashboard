# Looker Studio setup — HQ Headcount Dashboard

Connect Looker Studio to the **Looker_Export** tab in the live Google Sheet. That tab is a flat table (one row per country×segment market) rebuilt whenever you run **HQ Dashboard → Refresh dashboards** in the sheet.

**Source sheet:** [Global Sales Rep Headcount (1)](https://docs.google.com/spreadsheets/d/1Hq64TSm77FVH4hLxME2wrs1bJbT8Qi9Puk4FWMdkGsw/edit)  
**Sheet ID:** `1Hq64TSm77FVH4hLxME2wrs1bJbT8Qi9Puk4FWMdkGsw`  
**Tab:** `Looker_Export`

---

## 1. Refresh the export tab (sheet)

1. Open the [headcount sheet](https://docs.google.com/spreadsheets/d/1Hq64TSm77FVH4hLxME2wrs1bJbT8Qi9Puk4FWMdkGsw/edit).
2. Menu **HQ Dashboard → Refresh dashboards**.
3. Confirm the **Looker_Export** tab exists with a header row and one data row per market.

Run this after Rep_Level or Markets tab updates so Looker sees current recommendations.

---

## 2. Create the Looker Studio data source

1. Go to [Looker Studio](https://lookerstudio.google.com/).
2. **Create → Report** (or add a data source to an existing report).
3. **Add data → Google Sheets**.
4. Select **Global Sales Rep Headcount (1)** (`1Hq64TSm77FVH4hLxME2wrs1bJbT8Qi9Puk4FWMdkGsw`).
5. Choose the **Looker_Export** worksheet.
6. Set **Header row** to **1** (first row is column names).
7. Click **Add** / **Connect**.

### Field types (Resource → Manage added data sources → Edit)

| Field | Type | Notes |
|-------|------|--------|
| `updated_at` | **Date & Time** (or Text) | Same timestamp on every row; use for “last refreshed” scorecard |
| `market` | Text | e.g. `US-M`, `UK-ACC` |
| `country` | Text | Filter dimension |
| `segment` | Text | Filter dimension |
| `region` | Text | `The Americas`, `EMEA`, `Asia-Pac` |
| `recommendation` | Text | `Hire`, `Hold`, `Optimize` |
| `heads_to_add` | **Number** | Integer; blank = 0 in charts if you coalesce |
| `heads_over` | **Number** | Reps above optimal model |
| `hc_gap` | **Number** | Current reps − optimal HC (negative = under-staffed) |
| `current_reps` | **Number** | |
| `optimal_hc` | **Number** | |
| `ideal_pcid` | **Number** | Target PCIDs per rep |
| `ideal_band` | Text | PCID band label |
| `median_book` | **Number** | Median assigned PCIDs from Rep_Level |
| `avg_pcid` | **Number** | Average PCIDs per rep |
| `assigned_pcids` | **Number** | Total assigned PCIDs in segment |
| `action_short` | Text | One-line action summary (≤80 chars) |

**Sort default for tables:** `heads_to_add` descending, then `market` ascending (matches the sheet).

**AMER tip:** Add a **Filter control** on `region` and select **The Americas** for US/CA/BR/MX-only views. You can also filter `country` directly (e.g. `US`, `CA`).

---

## 3. Recommended report layout

Build one page with these elements:

### Scorecards (top row)

| Scorecard | Metric | Aggregation |
|-----------|--------|-------------|
| Total heads to add | `heads_to_add` | **Sum** |
| Markets to hire | `recommendation` | **Count** where `recommendation` = `Hire` |
| Last refreshed | `updated_at` | **Max** (format as date/time) |

Optional: **Sum** of `heads_over`, **Count** of markets (`market` distinct count).

### Bar chart — Heads to add by market

- **Chart type:** Bar (horizontal works well for long market names)
- **Dimension:** `market`
- **Metric:** `heads_to_add` (Sum)
- **Filter:** `heads_to_add` > 0 (optional, to hide zero-add markets)
- **Sort:** `heads_to_add` descending
- **Limit:** Top 15–20 bars

### Table — Market detail

| Column | Field |
|--------|--------|
| Market | `market` |
| Recommendation | `recommendation` |
| Heads to add | `heads_to_add` |
| Current / Optimal | `current_reps`, `optimal_hc` |
| Ideal PCID | `ideal_pcid` |
| Action | `action_short` |

Add **Filter controls** for `country` and `recommendation` above the table.

### Pie chart — Hire / Hold / Optimize

- **Chart type:** Pie
- **Dimension:** `recommendation`
- **Metric:** Count of `market` (or **Record Count**)
- **Colors (suggested):** Hire `#137333`, Hold `#9aa0a6`, Optimize `#c5221f`

---

## 4. Sharing and refresh in Looker

1. **Share** the Looker report with your team (@indeed.com or group).
2. Ensure viewers can open the **source Google Sheet** (at least view access) if Looker prompts for authorization.
3. After each sheet refresh (**HQ Dashboard → Refresh dashboards**), open the report and use **Resource → Manage added data sources → Refresh data** (or enable scheduled refresh if your org supports it).

The `updated_at` column updates on every refresh — use a scorecard with **Max** to confirm Looker picked up the latest run.

---

## 5. Column reference (Looker_Export)

| Column | Description |
|--------|-------------|
| `updated_at` | ISO timestamp when the tab was last built |
| `market` | Country–segment key (e.g. `US-UMM`) |
| `country` | Rollup country code |
| `segment` | Sales segment |
| `region` | `The Americas`, `EMEA`, or `Asia-Pac` |
| `recommendation` | Hire / Hold / Optimize |
| `heads_to_add` | Reps needed to reach optimal HC |
| `heads_over` | Reps above optimal HC |
| `hc_gap` | Current reps minus optimal HC |
| `current_reps` | Rep count in segment |
| `optimal_hc` | Model optimal headcount |
| `ideal_pcid` | Target PCIDs per rep |
| `ideal_band` | PCID band for ideal target |
| `median_book` | Median PCIDs per rep (Rep_Level) |
| `avg_pcid` | Average PCIDs per rep |
| `assigned_pcids` | Total assigned PCIDs |
| `action_short` | Short action line for tables |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Tab missing | Run **HQ Dashboard → Refresh dashboards**; redeploy Apps Script if the menu is old |
| Wrong field types | Edit data source → set numbers vs text per table above |
| Stale data | Refresh dashboards in sheet, then refresh data source in Looker |
| Empty `heads_to_add` | Normal for markets at or above optimal; use filters or show zeros in chart settings |

For Apps Script deployment, see [APPS-SCRIPT-DEPLOY.md](./APPS-SCRIPT-DEPLOY.md).
