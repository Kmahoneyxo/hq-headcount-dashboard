# Share the live dashboard with your team

The team dashboard lives in `dashboard/` and deploys to **GitHub Pages** when you push to `main`.

## Share link (after setup)

Once GitHub Pages is enabled:

**https://kmahoneyxo.github.io/hq-headcount-dashboard/**

Send that URL to Sales Ops / HQ. Anyone with the link can view it.

> **Important:** This repo contains Indeed sales data. Keep the repository **private** and only share the Pages URL with your team, **or** use the Looker Studio path below for @indeed.com sharing with access controls.

---

## One-time setup (5 minutes)

1. Merge this branch to `main` (or push `dashboard/` to `main`).
2. On GitHub: **Settings → Pages**
   - Source: **GitHub Actions**
3. The workflow `.github/workflows/deploy-pages.yml` runs automatically.
4. Copy the published URL from **Settings → Pages**.

---

## How data stays live

The dashboard reads `dashboard/data/headcount.json`. That file is produced by **query 10**:

`sql/10_perfect_book_headcount_country_segment.sql`

### Refresh weekly (recommended)

In Cursor with **dp-mcp** connected, ask:

> Run sql/10_perfect_book_headcount_country_segment.sql, export JSON, and update dashboard/data/headcount.json

Then commit and push to `main`. GitHub Pages redeploys in ~1 minute.

### Refresh from Quest / iDash

1. Save query 10 as a Quest report in iDash.
2. Run on a schedule (weekly after JAM partition updates).
3. Export results as JSON/CSV.
4. Run `python3 scripts/csv-to-dashboard-json.py export.csv`
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
