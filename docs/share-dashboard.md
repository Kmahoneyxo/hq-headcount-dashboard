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
| `docs/data/headcount-dashboard.xlsx` | **Full download** — 5 sheets: **Markets** (all fields + summary columns), **Book health (flagged reps)**, **SBS whitespace**, **Market summaries** (Over/Under HC + why), **About** |
| `docs/data/headcount-dashboard.csv` | Markets only — all columns from `headcount.json` |
| `docs/data/headcount-dashboard-book-health.csv` | Flagged reps only — flattened from `book_health.json` |

The live dashboard header links to the Excel workbook (full data) and the markets CSV. Use Excel for the complete export including rep-level book health.

**Include in weekly refresh:** run export script after updating `headcount.json` and `book_health.json`, then commit JSON + xlsx + both CSVs.

### Google Sheet (manual import)

1. In Google Drive: **New → File upload** → `headcount-dashboard.xlsx`, or **Import** the CSV.
2. Or: open a blank Sheet → **File → Import → Upload** → choose the xlsx/csv.
3. Share the Sheet with Sales Ops (@indeed.com) with view or comment access.
4. Re-import weekly after Quest refresh (or use a scheduled Apps Script if you automate Quest export later).

For a persistent Looker Studio report, connect it to the Google Sheet as the data source.

### Quest / iDash — saved report (sql/16 on prod)

Your query is saved in iDash:

| | Link |
|---|------|
| **Workspace** | https://data.indeed.tech/idash/workspace/133772/queries/ |
| **Shortlink (query)** | https://link.indeed.tech/RTPDA69FDDY |
| **Query name** | `HQ Headcount Dashboard Export (sql/16)` |
| **Engine** | Trino |
| **Source file** | `sql/16_dashboard_export.sql` |

> **Visibility:** Workspace may be Indeed-wide by default. Use iDash **Share** settings if you want to restrict access.

#### First run (prod — ~5–10 min)

1. Open the **workspace** or **shortlink** above (log in with @indeed.com).
2. Click the query **`HQ Headcount Dashboard Export (sql/16)`**.
3. Set environment to **`prod`** (not `interactive` — interactive times out at 10 min).
   - In the Quest UI, look **directly below the blue Run button** — you'll see **`Trino | Auto`**.
   - **Click `Auto`** (it's a dropdown, not just a label).
   - Choose **`prod`** from the list. Options are typically: `Auto`, `interactive`, `prod`, `stage`.
   - After selecting, it should read **`Trino | prod`** before you click Run.
   - If you don't see `prod`, ask in **#data-platform** or **#quest** — some roles need Trino prod access.
4. Click **Run** and wait for completion (~5–10 min).
5. When results appear, **Export → JSON** (or CSV).
   - Save as `docs/data/query16_results.json` (JSON must be `{"data": [...]}` or a raw array — see below).

#### Update the live dashboard

```bash
cd hq-headcount-dashboard

# JSON export from iDash
python3 scripts/json-from-mcp-results.py docs/data/query16_results.json

# Regenerate Excel/CSV
python3 scripts/export-dashboard-data.py

# Optional: sql/17 rep flags (book health drill-down)
# Save sql/17 in same workspace, run on prod, export → query17_results.json
python3 scripts/merge-book-health.py docs/data/query17_results.json

git add docs/data/headcount.json docs/data/book_health.json docs/data/headcount-dashboard.*
git commit -m "Refresh dashboard from Quest prod"
git push
```

GitHub Pages redeploys in ~1–2 min.

#### Weekly refresh (recommended)

1. **When:** After JAM partition updates (e.g. Monday or Tuesday).
2. **Run** query 16 on **prod** in iDash.
3. Export → run scripts above → commit + push.
4. Optional: schedule via **Swift Jobs** or iDash scheduled run if your team uses that (ask Data Platform).

#### Also save sql/17 (rep book health)

1. In the same workspace, **Add query** → paste `sql/17_rep_book_profile.sql`.
2. Name it `HQ Rep Book Profile (sql/17)` · Trino · prod.
3. Run on prod → export → `merge-book-health.py`.

#### Troubleshooting

| Problem | Fix |
|---------|-----|
| Query times out at 10 min | Use **`prod`**, not `interactive` |
| `mismatched input ';'` syntax error | **Remove trailing semicolon** on last line (`ORDER BY ... DESC` with no `;`) |
| Missing PQR / book action columns | Re-run **latest** sql/16 (Layer 1+2 fields added Jul 2026) |
| JSON export wrong shape | Wrap rows: `{"data": [...]}` or use `json-from-mcp-results.py` which accepts both |
| MCP refresh from Cursor | `execute_query` with `queryEnvironment: prod`, `maxWait: 0`, poll with `get_query_status` |

### Refresh from Quest / iDash (legacy steps)

1. Open workspace above (sql/16 already saved).
2. Run on **prod** schedule (weekly after JAM partition updates).
3. Export results as JSON/CSV.
4. Run `python3 scripts/json-from-mcp-results.py export.json` (JSON) or `csv-to-dashboard-json.py` (CSV).
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
