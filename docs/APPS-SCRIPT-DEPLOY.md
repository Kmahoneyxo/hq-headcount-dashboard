# Live Google Sheet — Apps Script deploy

The dashboard can read **headcount recommendations and ideal-book targets** directly from the stakeholder Google Sheet via a deployed Apps Script web app. Warehouse numbers (`headcount.json`) stay on the last snapshot until you run a warehouse refresh — Apps Script updates **live segment recommendations** and country rep cross-checks.

**Sheet:** [Global Sales Rep Headcount (1)](https://docs.google.com/spreadsheets/d/1Hq64TSm77FVH4hLxME2wrs1bJbT8Qi9Puk4FWMdkGsw/edit)

---

## What updates live vs not

| Updates live (Apps Script) | Stays static until warehouse refresh |
|----------------------------|--------------------------------------|
| Per-segment ideal PCID, optimal HC, gap, Hire/Hold/Optimize | Revenue, PQR, book health flags, curves |
| Country rep counts from `Capacity_Dashboard` | `book_health.json`, inflection charts |
| Rep-level rollups from `Rep_Level` (Team_Name → country×segment) | SBS whitespace, FY26 book build |
| Model_Engine regional context in "why" bullets | Curve validation (`hc_curve_validated`) |
| Findings **Sheet** column (✓ / ≠) for country rep sum | Warehouse-only narratives when no sheet segment |

---

## Sheet columns that drive recommendations

### Rep_Level (primary segment rollup)

| Column | Role |
|--------|------|
| `rep_id` | Rep identifier |
| `Team_Name` | Parsed as `CC-SEG-…` (GTM v2: MUpper→UMM, ACCDE→ACC) |
| `Market` | Country code (rolled up: DE/AT/CH→DACH, BE/NL/LU→BNL, GB→UK) |
| `PCID Count` | Per-rep book size — aggregated to segment median/avg |

**Derived per segment (`US-M`, `UK-L`, …):**

- `current_reps` — count of reps in Rep_Level for that country×segment
- `current_avg_book` — mean PCID Count
- `ideal_pcid` — midpoint of PCID band containing segment median (unless Markets tab overrides)
- `optimal_hc` — `sum(PCID Count) ÷ ideal_pcid`
- `hc_gap` — `current_reps − optimal_hc`
- `recommendation` — Hire if gap > 5, Optimize if gap < −5, else Hold

### Capacity_Dashboard (country cross-check)

| Location | Role |
|----------|------|
| Column J (index 9) | Market / country code |
| Column K (index 10) | Rep count per country |

Compared to sum of `current_reps` across segments in `headcount.json`.

### Model_Engine (regional context)

| Column | Role |
|--------|------|
| `Region` | Asia-Pac, EMEA, The Americas |
| `Average PCID Count` | Regional avg book |
| `Average Growth` | Regional growth |
| `Average JV` | Regional $/job |
| `Recommendation` | Regional Hire/Hold/Optimize — used when segment gap is null |

### Optional Markets tab

If you add a tab named `Markets`, `Dashboard`, or `Findings` with warehouse-style columns, those values **override** Rep_Level rollups:

`country`, `segment`, `ideal_pcid`, `optimal_headcount`, `current_reps`, `headcount_gap`, `headcount_recommendation`, `growth_peak_accounts`, `jv_plateau_book_max`, etc.

---

## JSON response schema

```json
{
  "updated_at": "2026-09-02T18:30:00.000Z",
  "label": "Global Sales Rep Headcount (1)",
  "segments": [
    {
      "market": "US-M",
      "country": "US",
      "segment": "M",
      "ideal_pcid": 90,
      "ideal_band": "81-100",
      "ideal_book_summary": "Ideal book is ~90 PCIDs per rep (81-100 band) — …",
      "why_trends": ["Today avg 98.4 PCIDs/rep (above ideal 90) across 232 reps in the sheet."],
      "current_avg_book": 98.4,
      "current_reps": 232,
      "optimal_hc": 251,
      "optimal_headcount": 251,
      "hc_gap": -19,
      "headcount_gap": -19,
      "recommendation": "Hold",
      "headcount_recommendation": "Hold",
      "source": "rep_level_rollup"
    }
  ],
  "capacity_by_country": { "US": 914, "UK": 192 },
  "rep_level": [ { "rep_id": "17284", "pcid_count": 0, "market": "BR", "team_name": "BR-M-DE-SAO-1" } ],
  "rep_level_count": 1837,
  "model_engine": [
    { "region": "The Americas", "avg_pcid": 85.2, "avg_growth": 0.12, "recommendation": "Hire" }
  ]
}
```

---

## Deploy steps (one-time)

1. **Open the Google Sheet** — Global Sales Rep Headcount (1) (edit access required).

2. **Extensions → Apps Script**

3. **Paste the code**
   - Remove default `Code.gs` content.
   - Create **ReferenceCheck.gs**.
   - Copy full contents of [`docs/google-apps-script/ReferenceCheck.gs`](./google-apps-script/ReferenceCheck.gs).

4. **Save** (Ctrl/Cmd+S). Project name e.g. `HQ Headcount Live`.

5. **Deploy → New deployment**
   - Gear icon → **Web app**
   - **Execute as:** Me (`your@indeed.com`)
   - **Who has access:** **Anyone** (required for GitHub Pages fetch without login)
   - **Deploy** → authorize spreadsheet read scope

6. **Copy the Web app URL** — `https://script.google.com/macros/s/AKfycb…/exec`

7. **Paste into dashboard config** — `docs/data/config.json`:

   ```json
   "reference_apps_script_url": "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec",
   "reference_sheet_live": true
   ```

8. **Commit & push**, open dashboard, click **Reload sheet reference** (or hard-refresh).

---

## Verify

1. Open the Web app URL in a browser — JSON with `segments`, `capacity_by_country`, `updated_at`.
2. Dashboard **Reference** tab — status shows **Live from Apps Script · {timestamp}**.
3. **Overview** lookup panel — ideal book panel shows sheet data with green "Live from Apps Script" badge.
4. **Findings** tab — HC recommendation, ideal PCID, gap columns show ● when live segment data is used.
5. **Sheet** column — ✓ or ≠ per country rep count vs warehouse.

---

## Re-deploy after code changes

Apps Script does **not** auto-update old deployments.

1. **Deploy → Manage deployments**
2. Edit (pencil) → **Version: New version** → **Deploy**
3. URL stays the same — no config change needed.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| HTML login page instead of JSON | Redeploy with **Who has access: Anyone** |
| `segments` empty | Check Rep_Level has `Team_Name` in `CC-SEG-…` format; add optional Markets tab |
| `capacity_by_country` empty | Tab must be named `Capacity_Dashboard`; pivot Market col J, count col K |
| CORS / fetch failed | Use Web app URL ending in `/exec`, not script editor URL |
| Stale numbers after sheet edit | Click **Reload sheet reference** |
| No Apps Script URL | Set `reference_apps_script_url`; dashboard falls back to CSV country check or `reference_check.json` |
| MUpper teams missing | Script maps `MUpper` → `UMM` (GTM v2); redeploy latest ReferenceCheck.gs |

---

## Config reference

| Field | Purpose |
|-------|---------|
| `reference_apps_script_url` | Web app `/exec` URL from deploy step 6 |
| `reference_sheet_live` | `true` = fetch Apps Script on load + Reload sheet reference |
| `reference_sheet_url` | Link to open the Google Sheet in UI |
| `reference_workbook_label` | Display name in dashboard |

**Offline fallback:** download sheet as `reference-workbook.xlsx` → `python3 scripts/sync-reference-workbook.py` → commits `reference_check.json`.
