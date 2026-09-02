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

### Option C — `prototypes-publisher` script (recommended)

Indeed Design Technology maintains [`@indeed/prototypes-publisher`](https://code.corp.indeed.com/design-technology/prototypes-publisher) (successor to `@indeed/design-tech-publisher`). It uploads a static output folder to [prototypes.indeed.com](https://prototypes.indeed.com) and records a new build on the project's **Builds** tab.

**Requirements:** Node.js >= 24.11.0, npm >= 11.0.0

**One-time config** — create `.dtpublishrc.json` in the repo root:

```json
{
    "distPath": "docs",
    "projectId": "6a983dc2bd8fe2c9a2eec495"
}
```

(`headcount-dash` project; slug is set in Prototypes UI, not in this file.)

**Deploy from repo root** (no build step — `docs/` is already the static site):

```bash
PUBLISHER_USERNAME=your-ldap npx @indeed/prototypes-publisher
```

You will be prompted for LDAP if `PUBLISHER_USERNAME` is unset. On success you should see per-file upload lines, `Files uploaded successfully.`, and `View your prototype at: https://prototypes.indeed.com/apps/headcount-dash` (browser opens in interactive mode).

**GitLab CI** (optional, for deploy on push to `main`):

```yaml
publish-prototype:
    stage: deploy
    image: $JAVASCRIPT_BUILD_IMAGE:$JAVASCRIPT_BUILD_IMAGE_TAG
    rules:
        - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
    script:
        - PUBLISHER_USERNAME=$GITLAB_USER_LOGIN npx @indeed/prototypes-publisher --ci
```

Repo: `https://code.corp.indeed.com/kmahoney/hq-headcount-dashboard` (branch `main`, publish dir `docs/`).

**If Prototypes → Builds opens GitLab (no zip):**

1. In GitLab: **Settings → CI/CD → Variables** → add `PUBLISHER_USERNAME` = your LDAP.
2. Push `.gitlab-ci.yml` and latest `docs/` to `main` on GitLab (exclude files >25MB — see troubleshooting).
3. GitLab: **Build → Pipelines → Run pipeline** (or push triggers automatically).
4. When the `publish-prototype` job succeeds, refresh Prototypes — **Builds** should show a deployment and **View prototype** works.

> **Note:** The publisher only uploads whitelisted extensions (html, js, css, json, images, fonts, etc.). `data/*.csv` and `data/*.xlsx` are **skipped** — JSON data files upload fine; optional CSV/XLSX header downloads will 404 unless you use Option A zip upload or extend the publisher.

### Option A — Upload zip (legacy / new projects only)

Zip upload is only available when creating a **new** Prototypes project without GitLab. If your project shows a **Gitlab** badge (like `headcount-dash`), use **Option C** or **GitLab CI** below — the **Builds** button opens GitLab, not a zip picker.

From the repo root (if zip upload is available in your project type):

```bash
cd docs && zip -r ../hq-headcount-dashboard-prototypes.zip . -x "*.DS_Store"
```

Upload `hq-headcount-dashboard-prototypes.zip` during project creation or where the UI offers **Upload build**.

### Option B — GitHub zip / manual upload

Legacy path if you are not on Indeed GitLab CI:

- **Repository:** `Kmahoneyxo/hq-headcount-dashboard` (private GitHub mirror)
- **Branch:** `main`
- **Root / publish directory:** `/docs`

Re-upload zip or re-run Option C after refreshing data files.

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
