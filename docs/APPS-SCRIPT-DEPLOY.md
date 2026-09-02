# Google Apps Script — live ideal book API

The dashboard loads **per-segment ideal book** (PCIDs/rep, band, why trends) and **country rep cross-check** directly from your Google Sheet via Apps Script.

**Sheet:** [Global Sales Rep Headcount (1)](https://docs.google.com/spreadsheets/d/1Hq64TSm77FVH4hLxME2wrs1bJbT8Qi9Puk4FWMdkGsw/edit)

---

## What updates live vs not

| Live from Apps Script | Static until warehouse refresh |
|-----------------------|----------------------------------|
| Ideal PCID, band, summary, why trends per segment | Revenue, curves, book health flags |
| Country rep counts (`Capacity_Dashboard`) | `headcount.json` gaps, recommendations, KPIs |
| Rep rollups from `Rep_Level` | `book_health.json` |

---

## Deploy steps (one-time)

1. **Open the Google Sheet** — Global Sales Rep Headcount (1).

2. **Extensions → Apps Script**

3. **Paste the code**
   - Delete default `Code.gs` content (or leave empty).
   - Create file **HeadcountDashboard.gs**.
   - Copy all of [`docs/google-apps-script/HeadcountDashboard.gs`](./google-apps-script/HeadcountDashboard.gs) from this repo.

4. **Save** (Ctrl/Cmd+S). Name the project e.g. `HQ Headcount Dashboard`.

5. **Deploy → New deployment**
   - Gear icon → **Web app**
   - **Execute as:** Me
   - **Who has access:** **Anyone** (required for GitHub Pages; use “Anyone with Google account” only if your dashboard is behind SSO)
   - **Deploy** → authorize spreadsheet read access

6. **Copy the Web app URL**  
   Example: `https://script.google.com/macros/s/AKfycbxxxxxxxx/exec`

7. **Paste into config** — edit `docs/data/config.json`:

   ```json
   "reference_apps_script_url": "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec",
   "reference_sheet_live": true
   ```

8. **Commit, push, open dashboard** → click **Reload sheet reference** (or hard-refresh).

---

## Verify

1. Open the Web app URL in a browser — JSON with `updated_at`, `label`, `segments`, `capacity_by_country`.
2. Overview lookup (e.g. US-M) shows **Ideal book** with live bullets and “Live from Apps Script · {time}”.
3. Reference tab shows country rep cross-check table.

### Example segment (US-M)

```json
{
  "market": "US-M",
  "country": "US",
  "segment": "M",
  "ideal_pcid": 90,
  "ideal_band": "81-100",
  "ideal_book_summary": "Ideal book is ~90 PCIDs per rep (81-100 band) — target size before growth, coverage, or $/job inflection.",
  "why_trends": [
    "Revenue growth peaks around 90 PCIDs/rep (20% median quarterly), softening above ~100 PCIDs.",
    "Today avg 97 PCIDs/rep (above ideal 90) across 232 reps in the sheet."
  ],
  "current_avg_book": 97,
  "current_reps": 232,
  "optimal_hc": 251,
  "hc_gap": -19,
  "recommendation": "Hold"
}
```

For richer ideal PCID and trend bullets, add a **Markets** tab with columns from `headcount.json` (`ideal_pcid`, `growth_peak_accounts`, `growth_peak_pct`, `jv_plateau_book_max`, etc.) — Apps Script prefers that tab over Rep_Level rollups.

---

## Re-deploy after code changes

1. **Deploy → Manage deployments** → Edit (pencil)
2. **Version: New version** → **Deploy**
3. URL stays the same — no config change.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| HTML login page instead of JSON | Redeploy with **Who has access: Anyone** |
| Empty `segments` | Check `Rep_Level` tab has data; team names like `US-M-...` |
| Empty `capacity_by_country` | Tab must be named `Capacity_Dashboard` (Market col J, count col K) |
| Dashboard shows warehouse only | Set `reference_apps_script_url` and `reference_sheet_live: true` |
| CORS / fetch failed | Use URL ending in `/exec`, not the script editor URL |

---

## Config reference

| Field | Purpose |
|-------|---------|
| `reference_apps_script_url` | Web app `/exec` URL from deploy step 6 |
| `reference_sheet_live` | `true` = fetch Apps Script on load + Reload sheet reference |
| `reference_sheet_url` | Link to open the Google Sheet in UI |
| `reference_workbook_label` | Display name in dashboard |
