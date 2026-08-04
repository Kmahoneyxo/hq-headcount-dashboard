# Share the live dashboard with your team

The team dashboard lives in `docs/` and deploys to **GitHub Pages** when you push to `cursor/optimal-book-base-dataset-v1` (or `main` after merge).

## Share link (after setup)

Once GitHub Pages is enabled:

**https://kmahoneyxo.github.io/hq-headcount-dashboard/**

Send that URL to Sales Ops / HQ. Anyone with the link can view it.

**HQ methodology reference (Indeed SSO):** [Connect PTD — book & headcount methodology](https://connect-ptd.indeed.tech/content/7c14a602-80bf-4091-9072-b6861da49c77/) — official framework this dashboard implements. The live dash links to it in the methodology panel and footer.

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
| `docs/data/headcount-dashboard.xlsx` | **Full download** — 7 sheets: **Markets**, **Rep book** (all reps — audit trail), **Impact coverage** (all reps — data lake), **Book health (flagged reps)**, **SBS whitespace**, **Market summaries**, **About** |
| `docs/data/headcount-dashboard.csv` | Markets only — all columns from `headcount.json` |
| `docs/data/headcount-dashboard-rep-book.csv` | All reps — one row per rep from `rep_book.json` (segment, team, PCIDs, ideal, flags) |
| `docs/data/headcount-dashboard-book-health.csv` | Flagged reps only — flattened from `book_health.json` |
| `docs/data/impact_coverage_all_reps.csv` | All reps — impact coverage from data lake (`sql/18`) |
| `docs/data/impact_coverage_all_reps.json` | Same data as JSON (Quest prod export) |

The live dashboard header links to the Excel workbook (full data), rep-book CSV, markets CSV, and **Impact coverage** CSV. Use Excel **Rep book** tab to reconcile market rollup → individual reps; **Impact coverage** tab for per-rep `impact_calls_per_account` from the data lake.

**Include in weekly refresh:** run export script after updating `headcount.json`, `rep_book.json`, `book_health.json`, and `impact_coverage_all_reps.json`, then commit JSON + xlsx + all CSVs.

### Google Sheet (manual import — dp-mcp does not export to Sheets)

**dp-mcp Google Sheets tools** (`create_swift_google_sheets_job_draft`, etc.) are **ingestion only** (Google Sheet → data lake). There is no MCP path to push Quest query results directly into a new Google Sheet. Use one of the workflows below.

#### Impact coverage only (sql/18, all reps from data lake)

**Fastest — use the published CSV:**

1. Open [Impact coverage CSV on GitHub Pages](https://kmahoneyxo.github.io/hq-headcount-dashboard/data/impact_coverage_all_reps.csv) (or download from the dashboard **Impact coverage** button).
2. In Google Drive: **New → Google Sheets → Blank spreadsheet**.
3. **File → Import → Upload** → select `impact_coverage_all_reps.csv`.
4. Import settings: **Replace current sheet**, separator **Comma**, convert text to numbers **Yes**.
5. Rename the tab **Impact coverage**; share with Sales Ops (@indeed.com).

**Fresh from Quest prod (recommended weekly):**

1. In Cursor with **dp-mcp**: run `sql/18_impact_coverage_all_reps.sql` on Quest **prod** (Trino).
2. When complete, call `export_csv` with the `executionId` (paginate if >2000 rows) and save to `docs/data/impact_coverage_all_reps.csv`.
3. Import that CSV into Google Sheets (steps 2–5 above), or upload the CSV to Drive and open with Google Sheets.

**From iDash:** run saved query **HQ Impact Coverage All Reps (sql/18)** on prod → **Export → CSV** → import into Sheets (same import settings).

#### Full dashboard workbook (markets + rep book + impact coverage)

1. Run `python3 scripts/export-dashboard-data.py` (requires `headcount.json`, `rep_book.json`, `book_health.json`, `impact_coverage_all_reps.json`).
2. Upload `docs/data/headcount-dashboard.xlsx` to Drive, or import individual CSVs into one Sheet (one tab per file).
3. Share with Sales Ops (@indeed.com) with view or comment access.
4. Re-import weekly after Quest refresh.

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

# All reps for export audit trail (sql/17_rep_book_profile_all.sql)
python3 scripts/merge-rep-book.py docs/data/query17_all_results.json

git add docs/data/headcount.json docs/data/book_health.json docs/data/rep_book.json docs/data/headcount-dashboard.*
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

#### Also save sql/17 all reps (export audit trail)

1. **Add query** → paste `sql/17_rep_book_profile_all.sql`.
2. Name it `HQ Rep Book All (sql/17a)` · Trino · prod.
3. Run on prod → export → `merge-rep-book.py` → `export-dashboard-data.py`.

#### Impact coverage — all reps (sql/18, data lake)

Per-rep impact coverage from the **Indeed data lake** (Quest prod / Trino). Not computed locally.

| | |
|---|---|
| **Source file** | `sql/18_impact_coverage_all_reps.sql` |
| **Data lake tables** | `datalake.sales_data_strategy_dsa.rep_activity_sales` (impact_calls), `datalake.sales_data_strategy_dsa.current_parent_rep_assignment`, `datalake.imhotep_iceberg.jobactivitymetrics` (PCID count) |
| **Metric** | `impact_calls_per_account` = `impact_calls_90d` ÷ `pcid_count` (90d window aligned with sql/16) |

**Refresh from Cursor (dp-mcp):**

> Run `sql/18_impact_coverage_all_reps.sql` on Quest **prod** (Trino). Use `export_csv` if >1000 rows. Save to `docs/data/impact_coverage_all_reps.json` and `.csv`, then run `export-dashboard-data.py`.

**Refresh from iDash:**

1. **Add query** → paste `sql/18_impact_coverage_all_reps.sql`.
2. Name it `HQ Impact Coverage All Reps (sql/18)` · Trino · **prod**.
3. Run on prod (~2–5 min) → Export → CSV.
4. Save CSV as `docs/data/impact_coverage_all_reps.csv` and wrap rows in JSON:

```bash
# If you exported CSV only, build JSON wrapper (or re-export JSON from Quest):
python3 - <<'PY'
import csv, json
from datetime import date
from pathlib import Path
rows = list(csv.DictReader(Path("docs/data/impact_coverage_all_reps.csv").open()))
Path("docs/data/impact_coverage_all_reps.json").write_text(json.dumps({
    "updated_at": date.today().isoformat(),
    "query": "sql/18_impact_coverage_all_reps.sql",
    "source_tables": [
        "datalake.sales_data_strategy_dsa.rep_activity_sales",
        "datalake.sales_data_strategy_dsa.current_parent_rep_assignment",
        "datalake.imhotep_iceberg.jobactivitymetrics",
    ],
    "note": "impact_calls_per_account = impact_calls_90d / pcid_count. Quest prod / Trino data lake.",
    "row_count": len(rows),
    "reps": rows,
}, indent=2))
PY

python3 scripts/export-dashboard-data.py
git add docs/data/impact_coverage_all_reps.* docs/data/headcount-dashboard.xlsx docs/index.html
git commit -m "Refresh impact coverage from data lake (sql/18)"
git push
```

Dashboard header **Impact coverage** button downloads the CSV directly.

**Live download URLs (GitHub Pages):**

| File | URL |
|------|-----|
| Impact coverage CSV | https://kmahoneyxo.github.io/hq-headcount-dashboard/data/impact_coverage_all_reps.csv |
| JV by segment (JAM) | https://kmahoneyxo.github.io/hq-headcount-dashboard/data/jv_all_segments.xlsx |
| Impact coverage + JV | https://kmahoneyxo.github.io/hq-headcount-dashboard/data/impact_coverage_jv.xlsx |
| Full Excel workbook | https://kmahoneyxo.github.io/hq-headcount-dashboard/data/headcount-dashboard.xlsx |
| Dashboard | https://kmahoneyxo.github.io/hq-headcount-dashboard/ |

**Google Sheet:** dp-mcp cannot create or populate a Sheet automatically. See [Google Sheet (manual import)](#google-sheet-manual-import--dp-mcp-does-not-export-to-sheets) above — import the CSV or run Quest prod → `export_csv` → import.

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

See `docs/data/headcount.json` for the live format. Key fields map from query 10:

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

Open http://localhost:8080 and use **Refresh data** (local server) or **Reload snapshot** (GitHub Pages).

### Reload snapshot vs warehouse refresh

| Action | Where | What it does |
|--------|-------|--------------|
| **Reload snapshot** | GitHub Pages (live URL) | Re-fetches `headcount.json` + `book_health.json` from the published site (cache-busted). Does **not** query Quest or the warehouse. |
| **Refresh data** | `dashboard-server.py` locally | Calls `POST /api/refresh`, optionally runs `DASHBOARD_REFRESH_CMD`, then reloads JSON from disk. |

The toast **snapshot date** (`2026-07-27`) comes from `headcount.json` → `updated_at`. The **page reloaded** time is when your browser re-fetched the file — not a warehouse pull timestamp.

| Hosting | Button label | Toast you should see |
|---------|--------------|----------------------|
| **GitHub Pages** | **Reload snapshot** | **Snapshot … — no change** (amber) if JSON unchanged; **Snapshot … loaded** (green) after a new git push. Both explain that Quest was not queried and list the export → push workflow. |
| **dashboard-server.py** | **Refresh data** | **Snapshot … loaded** when files change; **no change** when warehouse + files are current |

On GitHub Pages, **Reload snapshot** is for picking up a **new push** — not for pulling live Quest data. After you export from Quest, run the scripts, commit, and push; then click **Reload snapshot** (or hard-reload the page) to see the new snapshot date.

### Live warehouse refresh (one-time setup)

Set a command that re-runs query 10 and writes `docs/data/headcount.json`:

```bash
export DASHBOARD_REFRESH_CMD="python3 scripts/csv-to-dashboard-json.py docs/data/export.csv"
python3 scripts/dashboard-server.py
```

Workflow: export query 10 from Quest/iDash to `docs/data/export.csv`, then click Refresh.

For full automation, save query 10 as a scheduled Quest report and point `DASHBOARD_REFRESH_CMD` at a script that exports CSV and converts it.
