# How to read: Ideal headcount by country × segment

**Live dashboard:** https://kmahoneyxo.github.io/hq-headcount-dashboard/  
**Owner:** Katie Mahoney · **Updated:** weekly (90d JAM window)

---

## Critical caveats (read before sharing)

> **Preview data — SQL v2 in progress.** Do not use for headcount decisions until grain is fixed.

1. **Segment = company size (S/M/L/XL), not sales segment.** Dashboard rows like **US-M** mean "US-assigned accounts where the employer is size M" — **not** the Mid Market sales org. True sales segments are **M, UMM, L, NAM, DCA**, etc. (from team names like `US-M-DE-NYC-2`, `US-MUpper-DE-STM-1`).

2. **Do not sum `current_reps` across rows.** The same rep appears in multiple company-size buckets (84% of US reps span >1 size). Summing dashboard rows yields **~4,349** vs **~942** unique US reps — inflated ~3×.

3. **Missing sales segments.** NAM, DCA, UMM, and others have **no dashboard row**. ~480 US reps in NAM+DCA alone are omitted.

4. **US-S, CA-S, BNL-S are not GTM segments.** They are company-size pools, not headcount planning units. Ignore Hire signals on size-S rows.

5. **Perfect book / optimal HC can be unstable** at this grain (e.g. UK-M shows absurd Hire gap). Treat outliers as data-quality flags, not action items.

See [`data-model-audit.md`](./data-model-audit.md) for full audit evidence.

---

## The question we answer

> **For [country] [segment], what is the ideal headcount?**

---

## Three numbers (HQ standard)

| # | Metric | Meaning |
|---|--------|---------|
| 1 | **Ideal book size** | Target accounts per rep where revenue growth peaks (e.g. **73** for US-M) |
| 2 | **Optimal headcount** | Total assigned accounts ÷ ideal book size (e.g. **549** reps for US-M) |
| 3 | **Headcount gap** | Current reps − optimal (e.g. **+186** = over-staffed vs model) |

---

## Recommendation

| Rec | Meaning |
|-----|---------|
| **Hire** | Fewer reps than optimal; market growing in ideal book range |
| **Hold** | Within ~±10% of optimal |
| **Optimize** | More reps than optimal — consolidate/redistribute before net-new hires |
| **Do Not Hire** | No growth signal in optimal book range |

---

## Example: US · size M *(not US Mid Market sales org)*

| | Value |
|---|------|
| Ideal book | 73 accounts/rep (66–80 band) |
| Optimal headcount | **549** reps |
| Current reps | 735 *(within this size bucket only — do not roll up)* |
| Gap | **+186** (Optimize) |

**Plain English:** This row pools all US teams' **M-sized employer accounts** — NAM, DCA, Mid Market, UMM, etc. At 73 accounts per rep, that pool supports ~549 reps in this slice. The 735 figure is **not** a unique rep count and must not be summed with US-S/L/XL. SQL v2 will split by true sales segment.

---

## Caveats (say these out loud)

1. **Japan** excluded from model.
2. Uses **90-day revenue growth** — refresh weekly after JAM updates.
3. **Not** Finance headcount cost or comp — capacity model only.
4. **FY26 book score** shown for context; policy target % may be added later.
5. **Split/new book** actions are a separate layer (book health) — coming after optimal HC is trusted.

---

## How to look up a market

1. Open the dashboard link.
2. Filter **AMER focus** (or Global).
3. Find row **{country}-{segment}** (e.g. UK-M).
4. Read **Optimal HC**, **Gap**, **Rec**.

---

## Contact

Questions or custom cuts → **Katie Mahoney**
