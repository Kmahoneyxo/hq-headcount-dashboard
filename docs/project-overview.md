# HQ Headcount Capacity Model — One Project, Two Layers

**Due:** October 1, 2026 · **Owners:** Katie Mahoney & Addy  
**Live dash:** https://kmahoneyxo.github.io/hq-headcount-dashboard/  
**Gameplan:** [Google Doc](https://docs.google.com/document/d/1NtJ-bAiX3T2s5eMC7WiX0WV9lVVVsvCkgBOwZlryhHI/edit)

This is **one project**, not separate tools. Headcount decisions only make sense **after** we know what a healthy book looks like.

---

## Layer 1 — Book Health Dashboard (build / confirm first)

**Purpose:** Confirm **best book size** and **book health** by country × segment (then rep).

**Questions it must answer:**
- What is the **ideal book size** (growth peak before diminishing returns)?
- What is **FY26 book build score** vs policy target?
- When is a book **too big** or **too little**?
  - Too big: rep **PCID and/or PQR (prior Q rev)** above **segment average** + coverage ↓ or revenue ↓
  - Too little: below ideal with room to add accounts without hurting coverage
- Where do **$/job**, **coverage**, and **score** inflect as books grow?

**Signals (approved tables only):**
| Signal | Source |
|--------|--------|
| PCID count per rep | JAM + PCID |
| Revenue / growth | JAM (90d windows) |
| FY26 book score / % built | `sales_book_summary_v2` |
| Coverage | `rep_activity_sales.impact_calls` |
| Opp pipeline | JAM `agg_job_id` → rev/job |
| PQR | Prior quarter revenue (prior 90–92d) — compare rep vs segment avg |

**Deliverable:** Shareable **book health** view (GitHub Pages primary; align with Maryam on refresh/mobile patterns). Analysts use this to **lock ideal book size** before any staffing action.

**Status today (~Phase A):** Market-level perfect book, FY26 score, country SBS, opp plateau, coverage flags in `sql/16` + live dash. **Missing:** rep-level health, outcome-based too-big/too-little, PQR, dedicated health UX tab.

---

## Layer 2 — Headcount & Book Action (after Layer 1)

**Purpose:** Given **confirmed ideal book**, decide **heads and accounts** — not the other way around.

**Questions it must answer:**
- **Optimal headcount** = assigned PCIDs ÷ ideal book vs current reps → Hire / Hold / Optimize
- **Add accounts** — underweight books + SBS pool
- **Split / new head** — peel only to ideal (no over-strip); pool → new rep at segment level (**OK even if market Optimize**)
- **Evenness** — goal is all books ideal or even across reps in segment

**Rule:** Do not recommend headcount changes in markets where ideal book size is not yet validated (insufficient rep sample, flat growth curve, missing PQR/coverage).

**Status today:** Market-level optimal HC + gap + `recommended_action` in query 16. **Missing:** rep-level split simulator, new-head-from-pool calculator (see `docs/prompt-book-redistribution-calculator.md`).

---

## Build sequence (single roadmap)

```
Layer 1: Book Health          Layer 2: Headcount
─────────────────────         ────────────────────
Ideal book size      ───────► Optimal HC / gap
Too big / too little ───────► Split pool → new heads?
FY26 score vs target ───────► Grow score before hire?
SBS by country       ───────► Fill new books from SBS
Coverage / $/job     ───────► Healthy new book gates
```

| Phase | Focus | Key files |
|-------|--------|-----------|
| **A** (done) | AMER dash, sql 13–16, perfect book + FY26 + SBS + opp + coverage | `sql/16`, `docs/app.js` |
| **B** (next) | **Book health dash** — rep-level profile, too big/too little, health tab, PQR | `sql/17`, health UI |
| **C** | **Headcount from health** — split/new-head simulator, book action column | `sql/18`, `prompt-book-redistribution-calculator.md` |
| **D** | Oct 1 polish — Quest weekly refresh, Looker mirror optional, regional cost | `share-dashboard.md` |

---

## Prompts (use in Cursor)

| Doc | When to use |
|-----|-------------|
| `docs/prompt-evolve-dashboard.md` | General evolution toward Oct 1 goals |
| `docs/prompt-book-redistribution-calculator.md` | Layer 2 — split books, new heads (after Layer 1) |
| `docs/open-questions-addy.md` | PQR, FY26 targets, healthy-book thresholds |

---

## Open with Addy / Maryam

1. **FY26 MM target score** — policy bar for healthy book
2. **Evenness KPI** — how to measure “all books ideal or even” on the health dash
3. **Maryam health dash** — reuse refresh stack / mobile layout for Layer 1 UX
