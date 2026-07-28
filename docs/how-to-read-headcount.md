# How to read: Ideal headcount by country × segment

**Live dashboard:** https://kmahoneyxo.github.io/hq-headcount-dashboard/  
**Owner:** Katie Mahoney · **Updated:** weekly (90d JAM window)  
**Official HQ methodology (Indeed SSO):** [Connect PTD — book & headcount methodology](https://connect-ptd.indeed.tech/content/7c14a602-80bf-4091-9072-b6861da49c77/)

---

## HQ methodology — two layers

This dashboard implements the HQ capacity model in **two layers**. Validate Layer 1 before acting on Layer 2.

| Layer | Question | Key metrics |
|-------|----------|-------------|
| **1 — Book health** | What is the ideal book size? Is each rep's book healthy? | Ideal PCID, PQR, impact coverage, FY26 score, too big / too little |
| **2 — Headcount** | How many reps should this market carry? | Ideal HC, headcount gap, Hire / Hold / Optimize, SBS routing |

**Build sequence:** confirm ideal book size → compute optimal headcount → split or grow books only after Layer 1 is trusted.

See the dashboard **"How to read this"** panel for field-level definitions and the [Connect PTD doc](https://connect-ptd.indeed.tech/content/7c14a602-80bf-4091-9072-b6861da49c77/) for the full HQ framework (requires Indeed SSO).

---

## The question we answer

> **For [country] [segment], what is the ideal headcount?**

---

## Three numbers (HQ standard)

| # | Metric | Meaning |
|---|--------|---------|
| 1 | **Ideal book size** | Target accounts per rep where revenue growth peaks (e.g. **90** for US-M) |
| 2 | **Optimal headcount** | Total assigned accounts ÷ ideal book size (e.g. **320** reps for US-M) |
| 3 | **Headcount gap** | Current reps − optimal (e.g. **−93** = under-staffed vs model) |

---

## Terminology (HQ ↔ dashboard)

| HQ term | Definition | sql/16 field |
|---------|------------|--------------|
| **PCID** | Parent company IDs per rep — book size | `ideal_pcid`, `avg_pcid_per_rep` |
| **PQR** | Prior-quarter revenue — book weight (prior 90d) | `avg_pqr_per_rep`, `segment_avg_pqr` |
| **Perfect / ideal book** | Accounts per rep at revenue-growth plateau | `ideal_pcid`, `perfect_book_bucket` |
| **Optimal headcount** | Assigned accounts ÷ ideal book | `ideal_headcount` |
| **Impact coverage** | Impact calls per assigned account (90d) | `median_impact_calls_per_account` |
| **Healthy book** | Not too big/too little; PCID near ideal, PQR ≥ segment avg, coverage ≥ 90% of segment norm | `reps_healthy`, `pct_reps_healthy` |
| **SBS whitespace** | Unassigned accounts in country — assignable pool | `sbs_whitespace`, `books_buildable_from_sbs` |

---

## Impact coverage

**Definition (sql/16):** Sum of `impact_calls` from `rep_activity_sales` over the trailing 90 days, divided by assigned PCIDs per rep (`impact_calls_per_account`). The dashboard shows the **market median** (`median_impact_calls_per_account`).

| Field | Meaning |
|-------|---------|
| **Median impact calls/account** | Typical rep touch rate per assigned account (90d) |
| **Coverage inflection book max** | Book size where impact calls/account peak |
| **Coverage at inflection** | Peak median impact calls/account at that book size |
| **Coverage status** | OK, Declining (avg book past inflection + coverage ↓), or Unknown |

Reps flagged **too big** when impact calls/account fall below 90% of segment average (with high PCID/PQR).

---

## Book health (Layer 1)

A rep has a **healthy book** when they are not flagged too_big or too_little (sql/16–17):

- PCID within ±10% of ideal (and not below ideal)
- PQR at or above segment benchmark
- Impact coverage ≥ 90% of segment average
- Current revenue ≥ prior-quarter PQR

The market lookup shows segment thresholds and % of reps meeting this definition.

---

## SBS whitespace / assignable accounts

| Field | Meaning |
|-------|---------|
| **sbs_whitespace_country** | Unassigned parent company IDs in country (team None on JAM) |
| **books_buildable_from_sbs** | Whitespace ÷ ideal PCID — how many full rep books could be built |
| **sbs_revenue_90d** | Revenue from unassigned pool (90d) |

SBS is **country-level** — all segment rows in a country share the same pool.

---

## Recommendation (Layer 2)

| Rec | Meaning |
|-----|---------|
| **Hire** | Fewer reps than optimal; market growing in ideal book range |
| **Hold** | Within ~±10% of optimal |
| **Optimize** | More reps than optimal — consolidate/redistribute before net-new hires |
| **Do Not Hire** | No growth signal in optimal book range |

---

## Grain & caveats

1. **Segment = GTM sales segment** from team name (M, UMM, ACC, L, NAM, DCA) — not company size. One rep per segment row; safe to sum within a market.
2. **Japan** excluded from model.
3. Uses **90-day revenue growth** — refresh weekly after JAM updates.
4. **Not** Finance headcount cost or comp — capacity model only.
5. **FY26 book score** shown for context; policy target % may be added later.
6. **Split/new book** actions are a separate layer (book health) — use after optimal HC is trusted.

See [`data-model-audit.md`](./data-model-audit.md) for audit history.

---

## Example: US · M (Mid Market sales segment)

| | Value |
|---|------|
| Ideal book | 90 accounts/rep (81–99 band) |
| Optimal headcount | **320** reps |
| Current reps | 227 |
| Gap | **−93** (Hire) |

**Plain English:** US Mid Market has 227 reps averaging 127 PCIDs each vs an ideal of 90. At ideal book size the account base supports ~320 reps — under-staffed by ~93. Books are overweight; redistribute/split before net-new hiring.

---

## How to look up a market

1. Open the dashboard link.
2. Filter **AMER focus** (or Global).
3. Find row **{country}-{segment}** (e.g. UK-M).
4. Read **Optimal HC**, **Gap**, **Rec**.

---

## Contact

Questions or custom cuts → **Katie Mahoney**
