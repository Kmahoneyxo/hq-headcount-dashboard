# Share the live dashboard with your team

The team dashboard lives in `dashboard/` and deploys to **GitHub Pages** when you push to `main`.

## Share link (after setup)

Once GitHub Pages is enabled:

**https://kmahoneyxo.github.io/hq-headcount-dashboard/**

Send that URL to Sales Ops / HQ. Anyone with the link can view it.

> **Important:** This repo contains Indeed sales data. Keep the repository **private** and only share the Pages URL with your team, **or** use the Looker Studio path below for @indeed.com sharing with access controls.

---

## One-time setup (5 minutes)

1. Push this branch to GitHub (site files in `docs/`).
2. On GitHub: **Settings → Pages**
   - **Build and deployment → Source:** Deploy from a branch
   - **Branch:** `cursor/optimal-book-base-dataset-v1` (or `main` after merge)
   - **Folder:** `/docs` (GitHub Pages only supports `/docs` or root — not `/dashboard`)
3. Wait ~1–2 minutes, then open the share URL below.

---

## How data stays live

The dashboard reads `docs/data/headcount.json`. That file is produced by **query 16**:

`sql/16_dashboard_export.sql`

(Combines perfect book, FY26 score, opp pipeline, country SBS, and coverage.)

### Refresh weekly (recommended)

In Cursor with **dp-mcp** connected:

> Run sql/16_dashboard_export.sql, export JSON, and update docs/data/headcount.json

Or:

```bash
python3 scripts/json-from-mcp-results.py docs/data/query16_results.json
```

Then commit and push to `cursor/optimal-book-base-dataset-v1`. GitHub Pages redeploys in ~1 minute.

### Export Excel / CSV (for stakeholders)

After updating `headcount.json`, regenerate the spreadsheet:

```bash
python3 scripts/export-dashboard-data.py
```

This writes:

| File | Use |
|------|-----|
| `docs/data/headcount-dashboard.xlsx` | Excel — 3 sheets: **Markets**, **SBS whitespace**, **About** |
| `docs/data/headcount-dashboard.csv` | CSV — markets only (opens in Excel or Google Sheets) |

The live dashboard also has **Download Excel** / **Download CSV** buttons in the header (same files).

**Include in weekly refresh:** run export script after `json-from-mcp-results.py`, then commit both JSON + xlsx + csv.

### Google Sheet (manual import)

1. In Google Drive: **New → File upload** → `headcount-dashboard.xlsx`, or **Import** the CSV.
2. Or: open a blank Sheet → **File → Import → Upload** → choose the xlsx/csv.
3. Share the Sheet with Sales Ops (@indeed.com) with view or comment access.
4. Re-import weekly after Quest refresh (or use a scheduled Apps Script if you automate Quest export later).

For a persistent Looker Studio report, connect it to the Google Sheet as the data source.

### Refresh from Quest / iDash

1. Save query 16 as a Quest report in iDash.
2. Run on a schedule (weekly after JAM partition updates).
3. Export results as JSON/CSV.
4. Run `python3 scripts/csv-to-dashboard-json.py export.csv` (CSV) or `python3 scripts/json-from-mcp-results.py export.json` (JSON).
5. Commit + push.

---

## JSON schema

See `dashboard/data/headcount.json` for the live format. Key fields map from query 10:

| JSON field | SQL column |
|------------|------------|
| `perfect_book_target` | `perfect_book_target` |
| `optimal_headcount` | `optimal_headcount_assigned` |
| `headcount_gap` | `headcount_gap` |
| `headcount_recommendation` | `headcount_recommendation` |

---

## Alternative: Looker Studio (Google sharing)

If your team prefers Google access (@indeed.com):

1. Export query 10 to CSV weekly.
2. Import into a Google Sheet.
3. Create a Looker Studio report from the Sheet.
4. Share with Sales Ops group.

---

## Local preview

```bash
python3 scripts/dashboard-server.py
```

Open http://localhost:8080 and use **Refresh data**.

### Refresh button behavior

| Hosting | What Refresh does |
|---------|-------------------|
| **GitHub Pages** | Re-fetches `headcount.json` (picks up updates after you push new data) |
| **dashboard-server.py** | Calls `POST /api/refresh`, runs your refresh command, reloads charts |

### Live warehouse refresh (one-time setup)

Set a command that re-runs query 10 and writes `dashboard/data/headcount.json`:

```bash
export DASHBOARD_REFRESH_CMD="python3 scripts/csv-to-dashboard-json.py dashboard/data/export.csv"
python3 scripts/dashboard-server.py
```

Workflow: export query 10 from Quest/iDash to `dashboard/data/export.csv`, then click Refresh.

For full automation, save query 10 as a scheduled Quest report and point `DASHBOARD_REFRESH_CMD` at a script that exports CSV and converts it.
