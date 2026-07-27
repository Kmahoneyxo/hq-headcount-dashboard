# Solo roadmap (without Addy) — Oct 1 goal

**Stakeholder question we must answer:**  
*“For [country] [segment], what is the ideal headcount?”*

**You can answer that today** for markets in the live dash — with caveats documented below.

---

## What already works (ship this now)

| They ask | You answer from |
|----------|-----------------|
| Ideal headcount | `optimal_headcount` = assigned PCIDs ÷ ideal book size |
| Current vs ideal | `current_reps` vs `optimal_headcount` |
| Over/under staffed? | `headcount_gap` (+ = too many reps, − = need more) |
| Hire or optimize? | `headcount_recommendation` |
| Ideal book size | `perfect_book_target` (accounts per rep) |
| Why that book size? | Growth peak before diminishing returns (sql/16) |

**Live link:** https://kmahoneyxo.github.io/hq-headcount-dashboard/  
**Example:** US-M → ideal HC **549**, current **735**, gap **+186 Optimize**, ideal book **73** PCIDs/rep.

**One-line script for stakeholders:**  
> “Optimal headcount is total assigned accounts divided by our data-derived ideal book size for that market. US-M Medium is 549 reps at 73 accounts each; we have 735 today, so we’re ~186 reps over before we’d hire.”

---

## Gaps blocking “every country × segment” (fix without Addy)

| Gap | Solo fix | Effort |
|-----|----------|--------|
| Only ~10 markets in JSON | Re-run `sql/16` (flat-growth fix pushed); expand to all non-JP markets | 1 Cursor session + dp-mcp |
| No weekly refresh | Save query 16 in Quest; calendar reminder; push JSON weekly | 30 min once |
| Dash doesn’t lead with “ideal HC” | Add headline KPI: country-segment lookup or top table sort | 1–2 hours |
| No one-pager for the team | `docs/how-to-read-headcount.md` (below) | 30 min |
| FY26 “target %” blank | **Assume 50%** or hide column until policy exists — don’t block on Addy | 0 |
| Book health / split-hire | **Phase B/C — defer** until basic HC Q is trusted | Later |

---

## Next steps (priority order, ~2–3 weeks solo)

### Week 1 — Make the answer complete and trustworthy

1. **Refresh full market export**
   - Run `sql/16_dashboard_export.sql` via dp-mcp (async OK)
   - Update `docs/data/headcount.json` for **all** country × segment markets (not just 10)
   - Verify US-M, US-L, US-XL, CA-*, UK-* present

2. **Quest + weekly cadence**
   - Save query 16 in iDash/Quest
   - Schedule weekly (after JAM partition updates)
   - Document in `docs/share-dashboard.md` — you already started this

3. **Stakeholder one-pager** (`docs/how-to-read-headcount.md`)
   - 3 numbers: ideal book | optimal HC | gap
   - Hire / Hold / Optimize definitions
   - Link to live dash + “data as of {date}”
   - Caveats: Japan out of scope; model uses 90d revenue growth; not Finance comp

4. **Dash UX: “ideal HC first”**
   - Default AMER filter (done)
   - Table: lead with **Optimal HC**, **Gap**, **Rec** — perfect book second column
   - Optional: simple lookup — type “US-M” filter (country + segment chips)

### Week 2 — Credibility and adoption

5. **Meeting-ready export**
   - CSV export script from `headcount.json` or Quest → paste into Google Sheet for Addy meetings / leadership
   - Columns: country, segment, ideal_book, optimal_hc, current_reps, gap, rec

6. **Sanity check doc** (for yourself + challengers)
   - 3–5 markets manually spot-checked (US-M, UK-M, DACH-L)
   - “Why US-M ideal book is 73 not 175” — outlier fix note in sql/12/16

7. **Maryam (optional, not Addy)**
   - 15 min: how does health dash refresh + mobile layout work?
   - Copy patterns only — don’t wait on her to ship

### Week 3–4 — Book health (only if stakeholders trust HC number)

8. **sql/17 rep book profile** — PQR = prior 90d rev; segment avg; too big flags (your rules, no Addy)
9. **Health tab** on same dash — supports “why is ideal book 73?” not required for “what is ideal HC?”

10. **Split-hire calculator (sql/18)** — after health tab; segment-level split-hire

---

## What NOT to wait on Addy for

| Topic | Solo default |
|-------|----------------|
| FY26 target % | Hide or use 50% placeholder |
| Z-score vs target avg | Show `% built` only; note “policy target TBD” |
| PQR | Prior quarter revenue — already defined by you |
| SBS country mapping | hq_country → market (document assumption) |
| Regional cost tier | “Not in v1” footnote |

---

## What to tell leadership if challenged

- **“Is this official headcount planning?”** — No. It’s a **data-derived capacity model** for conversation; Finance/comp not included.
- **“Why differs from my intuition?”** — Show ideal book curve + current avg book; gap is mechanical: accounts ÷ ideal book.
- **“Addy didn’t sign off”** — Book **size** from JAM growth; FY26 score from official `sales_book_summary_v2`; methodology in repo README/sql.

---

## Definition of done (Oct 1, minimal)

- [ ] Any AMER country × segment: **optimal headcount + gap + rec** in live dash
- [ ] Weekly Quest refresh documented and running
- [ ] One-pager + link you can send in Slack
- [ ] You can answer in 30 seconds: *“UK Medium optimal is X, we have Y, gap Z, Hold/Hire/Optimize”*

Book health + split-hire = **enhancement**, not blocker for the core question.

---

## Cursor prompt (next build session)

```
Solo sprint — no Addy dependency.

1. Re-run sql/16_dashboard_export.sql → full headcount.json (all markets).
2. Update dash: lead table with Optimal HC, Gap, Rec; optional US-M style lookup.
3. Add docs/how-to-read-headcount.md for stakeholders.
4. Add scripts/export-meeting-csv.py from headcount.json.

Do NOT block on FY26 target. Push to cursor/optimal-book-base-dataset-v1.
```
