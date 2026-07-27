# Prompt: Book Split & New-Head Calculator (Layer 2)

> **Prerequisite:** Layer 1 Book Health Dash must confirm ideal book size for the market. See `docs/project-overview.md`. Do not build headcount/split actions until health layer is in place.

Copy everything below the line into Cursor (Agent mode, dp-mcp connected) or share with Addy as the next build spec.

---

## PROMPT START

You are extending the **HQ Headcount Capacity Model** dashboard toward an **account-level action tool** — not just “Hire / Optimize reps,” but **add or remove PCIDs from books** and simulate **whether trimmings can form new healthy books**.

- **Repo:** `/Users/katiemahoney/hq-headcount-dashboard`
- **Live dash:** https://kmahoneyxo.github.io/hq-headcount-dashboard/
- **Current export:** `sql/16_dashboard_export.sql` → `docs/data/headcount.json`
- **Owners:** Katie Mahoney & Addy

### The business question (plain language)

**Core flow:** find the **ideal book size** → compare **each rep’s book** → flag **too big** vs **too little** → recommend action.

For each **country × segment** market:

1. What is the **ideal book size** (data perfect book) and **FY26 book score**?
2. Which rep books are **too big** vs **too little**?
3. **Too little** → add PCIDs from SBS / whitespace until near ideal (grow existing book).
4. **Too big** → peel excess toward ideal; pool excess; if pool ≥ one ideal book → **hire a new head** and stand up a **new book**.

### Locked rules (Katie — Jul 2026)

#### PQR = prior quarter revenue
- **PQR** is **previous quarter revenue** (prior 90–92 days), same rolling window as the headcount model.
- Current 90d: `20260427–20260725` · Prior 90d: `20260128–20260426` (update with latest JAM partition).

#### “Too big” = segment-relative size + outcomes
Flag a rep book **too big** when **both**:

**A. Size (vs segment in that country × segment market):**
- Rep **PCID count** above segment average PCID, **and/or**
- Rep **PQR** (prior-quarter revenue) above segment average PQR

**B. Outcomes (required — not size alone):**
- Coverage ↓ (impact calls/account vs peers or prior quarter), **and/or**
- Current-quarter revenue ↓ vs prior quarter (PQR baseline)

Ideal book from growth inflection remains the **target**; segment avg PCID + avg PQR are **relative** overload signals within the segment.

#### “Too little”
Below ideal book target with room to add accounts; may receive redistributed accounts from too-big peers or SBS.

#### Prior quarter
Last quarter revenue = **prior 90–92 day window** (not calendar quarter unless it aligns with JAM refresh).

#### Split-hire at segment level
**Allowed even when market-level headcount says Optimize.** Split-hire recommendations are **country × segment** — individual unhealthy-fat books can justify new heads even if aggregate rep count is high.

#### Split / evenness — do not over-strip donor books
- **Goal:** all books **ideal or even** (toward `perfect_book_target`), not maximum extraction.
- Which specific PCIDs move **does not matter** for v1.
- From each too-big donor, peel **only** `GREATEST(0, pcid_count − perfect_book_target)` — bring donor **to ideal**, not below.
- Pool peeled accounts → new head + new book at ideal size.
- Prefer **internal redistribute** (too-big → too-little in same segment) before split-hire when it improves evenness without new head.

---

### What exists today (build on this)

| Field / concept | Already in dash? | Source |
|-----------------|------------------|--------|
| Ideal book size (perfect book) | Yes | `perfect_book_target`, `perfect_book_bucket` |
| FY26 book score / % built | Yes | `avg_fy26_book_score`, `avg_pct_book_built` |
| PCID count (market avg) | Partial | `current_avg_book`, `assigned_accounts` |
| Add accounts headroom | Yes | `headroom_accounts` = `(perfect − avg) × reps` when under-booked |
| SBS pool for new books | Yes | `sbs_whitespace_country`, `books_buildable_from_sbs` |
| Take-away / trim simulation | **No** | Needs new calculator |
| Per-rep PCID distribution | **No** | Needs rep-level export or drill-down |
| “New book from trimmings” | **No** | Needs new calculator |

---

### Phase C — Book action calculator (build next)

#### 1. Rep-level book profile (SQL)

Create `sql/17_rep_book_profile_country_segment.sql`:

- Grain: **rep × country × segment** (AMER first, exclude JP)
- Columns:
  - `sales_rep_id`, `country`, `segment`
  - `pcid_count` (distinct parent companies, 90d)
  - `revenue_90d`, `rev_per_job`, `revenue_growth_pct`
  - `impact_calls_per_account` (coverage)
  - `fy26_book_score`, `pct_book_built` (from `sales_book_summary_v2`)
  - `vs_perfect_book` = `pcid_count − perfect_book_target` (join market perfect book from query 16 logic)
  - `trim_candidate_accounts` = `GREATEST(0, pcid_count − perfect_book_max)` — accounts above ceiling
  - `grow_candidate_slots` = `GREATEST(0, perfect_book_target − pcid_count)` — room to add

#### 2. Market-level redistribution summary (SQL)

Create `sql/18_book_split_new_head_simulator.sql`:

**No fixed trim-per-rep.** Compute from ideal book comparison:

Per rep (from sql/17):
- `pcid_count`, `pqr_prior_90d` (prior-quarter revenue), `revenue_current_90d`
- `segment_avg_pcid`, `segment_avg_pqr` (same country × segment)
- `impact_calls_per_account`, `fy26_book_score`
- `too_big_flag`:
  - `(pcid_count > segment_avg_pcid OR pqr_prior_90d > segment_avg_pqr)`
  - AND `(coverage_down OR revenue_current_90d < pqr_prior_90d)`
- `too_little_flag`: `pcid_count < perfect_book_target` with growth headroom
- `peel_to_ideal` = `GREATEST(0, pcid_count − perfect_book_target)` — **only if too_big_flag**; never peel below ideal

Market rollup:
- `splittable_pool` = `SUM(peel_to_ideal)` for reps where `too_big_flag`
- `new_heads_from_split` = `FLOOR(splittable_pool / perfect_book_target)`
- `evenness_gap` — stddev or max−min PCID count across reps (goal: minimize toward ideal)
- `split_hire_recommended` — **segment-level OK even if market Optimize** when `new_heads_from_split >= 1`
- **Recommended action:**
  - `Redistribute internally` — too-big + too-little in same segment; pool fills underweight first
  - `Split-hire N new heads` — remaining pool after internal redistribute ≥ 1 ideal book
  - `Add from SBS` — too-little reps, SBS available
  - `Hold` — books near ideal and even

#### 3. Dashboard UX

Extend `docs/app.js` with a **Book Action** panel (AMER default):

**Per market row:**
| Ideal book | FY26 score | Too big / too little reps | Splittable pool | New heads? | Action |

**Book sizing panel:**
- Histogram or counts: reps below / in / above ideal band
- Splittable pool ÷ ideal book = **new books possible**
- Verdict: *“47 reps too big → 2,140 excess PCIDs → hire **29** new heads at ideal 73”* or *“Avg book below ideal — fill from SBS before split-hire”*

**Three-way book view (side by side):**
1. **Data perfect book** (growth inflection)
2. **FY26 policy score** (% built vs target)
3. **Simulated book** after trim/add (calculator output)

#### 4. JSON schema additions

Add to each market in `headcount.json`:

```json
{
  "perfect_book_target": 73,
  "reps_too_big": 47,
  "reps_too_little": 312,
  "reps_in_range": 376,
  "splittable_pool_accounts": 2140,
  "new_heads_from_split": 29,
  "accounts_needed_underweight": 8500,
  "book_action": "Hire new heads — split overweight books",
  "book_action_detail": "29 new books from pooled excess; 312 underweight reps can absorb SBS first"
}
```

Optional rep-level array (paginated / top trim candidates only for v1):
`rep_book_profiles: [{ rep_id, pcid_count, vs_perfect, trim_candidate }]`

#### 5. Rules for “healthy new book”

A simulated new book counts as **healthy** only if ALL pass (configurable with Addy):

1. **Size:** pooled PCIDs ≥ `perfect_book_target × 0.9`
2. **Score:** avg FY26 flag score ≥ policy target (placeholder until Addy confirms MM target)
3. **Growth:** market median growth > 0 at perfect bucket
4. **Pipeline:** opp pipeline not plateaued at perfect book size
5. **Coverage:** median impact calls/account ≥ inflection threshold
6. **Geo/segment:** accounts match country × segment (trim from same market only)

Document failures: e.g. *“Pool size OK but FY26 score too low — grow score before standing up book.”*

---

### Analytics the dash must answer (book action edition)

For each **country × segment**:

1. Ideal book size and FY26 score — **add or remove PCIDs?**
2. If **add**: how many from SBS vs grow existing rep books (`headroom_accounts`)?
3. If **remove**: how many PCIDs are above perfect ceiling across all reps?
4. If we take **N per rep** (default 5): total pool size and **# new books at perfect size**?
5. After simulation: **optimal HC and gap** — still Hire/Optimize/Hold?
6. Is the new book **healthy** (score + pipeline + coverage gates)?

---

### Data rules (unchanged)

- `'None'` team = SBS/unassigned
- Tables: JAM, PCID, DSA only; Japan out of scope
- 90d windows per `sql/16_dashboard_export.sql`
- Perfect book logic: exclude 150+ outlier bucket, peak from buckets with ≥20 reps

---

### Deliverables

- [ ] `sql/17_rep_book_profile_country_segment.sql`
- [ ] `sql/18_book_redistribution_simulator.sql` (parameterized trim N)
- [ ] Extend query 16 or create `sql/19_dashboard_export_with_book_action.sql`
- [ ] Update `headcount.json` schema + `csv-to-dashboard-json.py` / `json-from-mcp-results.py`
- [ ] Dash: Book Action column + trim simulator panel
- [ ] `docs/open-questions-addy.md`: PQR definition, healthy-book thresholds, trim vs layoff distinction

---

### How to work

1. Read `sql/16`, `docs/app.js`, current `headcount.json` before changing.
2. Run via dp-mcp; embed in JSON (no live Trino from browser).
3. Minimize scope — ship market-level calculator first; rep drill-down second.
4. Use **US-M** as test case: trim 5/rep → show pool → new books → still Optimize?

## PROMPT END

---

## Shorter version (quick Cursor turn)

```
Extend hq-headcount-dashboard: Book Action from ideal book comparison.

Flow: ideal book size → flag each rep too big / too little → pool excess from too-big books → if pool ≥ ideal size, recommend hire new head(s) and form new book(s).

Too little: add PCIDs from SBS. Too big: split excess toward ideal, don't use fixed N per rep.

Build sql/17 rep book profile, sql/18 split/new-head simulator, extend dash. AMER first. Clarify PQR + thresholds with Addy.
```
