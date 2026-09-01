# Deploy HQ Headcount Dashboard to Indeed Prototypes

**Target:** [prototypes.indeed.com/projects](https://prototypes.indeed.com/projects) (Indeed SSO)

This dashboard is a **static site** in `docs/`. Prototypes serves it like any other static HTML app — no backend required.

---

## What to upload

Upload the **contents of `docs/`** (not the whole repo):

| Required | Purpose |
|----------|---------|
| `index.html` | Entry point |
| `app.js`, `styles.css` | UI |
| `data/*.json` | Live dashboard data (refreshed from warehouse) |
| `data/*.csv`, `data/*.xlsx` | Optional download links in the header |

Relative paths (`./data/headcount.json`) work on Prototypes without changes.

---

## One-time setup

1. Sign in at [prototypes.indeed.com/projects](https://prototypes.indeed.com/projects).
2. **Create project** → name e.g. `HQ Headcount Capacity Model`.
3. Choose one deployment method:

### Option A — Upload zip (fastest)

From the repo root:

```bash
cd docs && zip -r ../hq-headcount-dashboard-prototypes.zip . -x "*.DS_Store"
```

Upload `hq-headcount-dashboard-prototypes.zip` to the new Prototypes project.

### Option B — Git-connected deploy (recommended for weekly refresh)

If Prototypes supports connecting a GitHub repo:

- **Repository:** `Kmahoneyxo/hq-headcount-dashboard` (private)
- **Branch:** `cursor/optimal-book-base-dataset-v1` (or `main` after merge)
- **Root / publish directory:** `/docs`

Each push to that branch redeploys automatically after you refresh data files.

4. Restrict visibility to your team (Sales Ops / HQ stakeholders with Indeed SSO).

---

## Weekly data refresh (before redeploy)

Run warehouse exports via **dp-mcp** in Cursor (Trino, `prod`):

| SQL | Output |
|-----|--------|
| `sql/16_dashboard_export.sql` | `docs/data/headcount.json` |
| `sql/17_rep_book_profile_all.sql` | `docs/data/rep_book.json` |
| `sql/17_rep_book_profile.sql` | `docs/data/book_health.json` |
| `sql/18_impact_coverage_all_reps.sql` | `docs/data/impact_coverage_all_reps.json` |
| `sql/22_book_threshold_analysis.sql` | `docs/data/book_threshold_reps.json` |

Then:

```bash
python3 scripts/analyze-book-thresholds.py --update-headcount
python3 scripts/export-dashboard-data.py
```

Commit updated files under `docs/data/`, push (or re-upload zip). Prototypes picks up the new JSON on redeploy.

> **Note:** The in-app **Reload snapshot** button only re-reads bundled JSON — it does not query the warehouse. Refresh = update JSON + redeploy.

---

## Segment logic (important)

Use the **repo** versions of sql/16–18 (GTM segment from `current_sales_team_name`, see `sql/_sales_segment_v2.sql`).

The saved iDash shortlink `RTPDA69FDDY` still uses **employer size** (`company_size_segment`) — do **not** use that for production refresh until iDash is updated.

---

## Share with stakeholders

After deploy, copy the Prototypes project URL and share with HQ / Sales Ops. Access is gated by Indeed SSO (unlike public GitHub Pages).

**GitHub Pages (legacy):** https://kmahoneyxo.github.io/hq-headcount-dashboard/ — still works but is a public URL; prefer Prototypes for team-facing production.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Blank dashboard | Confirm `data/headcount.json` was uploaded with the site |
| 404 on data files | Ensure zip root contains `index.html`, not a nested `docs/` folder |
| Stale numbers | Re-run sql/16–18/22 and redeploy |
| Wrong US-M/L/UMM segments | Verify sql/16 uses v2 GTM segment, not iDash shortlink |
