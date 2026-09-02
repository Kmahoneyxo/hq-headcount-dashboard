/* Shared data + formatting for dashboard prototypes */
const AMER_MARKETS = ["US", "CA", "UK", "DACH", "BNL"];

const REC_COLORS = {
  Hire: "#0d7a4d",
  Optimize: "#b45309",
  Hold: "#1d6fb8",
  "Do Not Hire": "#c41e3a",
};

let payload = null;
let bookHealth = null;

async function loadPreviewData() {
  const cacheBust = Date.now();
  const headcountUrl = `../data/headcount.json?${cacheBust}`;
  const bookHealthUrl = `../data/book_health.json?${cacheBust}`;

  const [headcountRes, bookHealthRes] = await Promise.all([
    fetch(headcountUrl, { cache: "no-store" }),
    fetch(bookHealthUrl, { cache: "no-store" }).catch(() => null),
  ]);

  if (!headcountRes.ok) throw new Error("Could not load headcount.json");
  payload = await headcountRes.json();

  try {
    bookHealth = bookHealthRes?.ok ? await bookHealthRes.json() : null;
  } catch {
    bookHealth = null;
  }
  return { payload, bookHealth };
}

function fmtMoney(n) {
  if (n == null) return "—";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return "$" + Math.round(n / 1e6) + "M";
  if (n >= 1e3) return "$" + Math.round(n / 1e3) + "K";
  return "$" + Math.round(n);
}

function fmtNum(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US");
}

function fmtPct(n) {
  if (n == null) return "—";
  return (Number(n) * 100).toFixed(0) + "%";
}

function idealPcid(m) {
  return m.ideal_pcid ?? m.perfect_book_target;
}

function marketKey(m) {
  return `${m.country}-${m.segment}`;
}

function isJapan(m) {
  return m.country === "JP";
}

function amerMarkets() {
  return payload?.amer_markets || AMER_MARKETS;
}

function hcRecLabel(m) {
  const rec = m.headcount_recommendation || "Hold";
  if (m.hc_curve_validated === false && m.headcount_recommendation_pre_gate) {
    return `Hold (gated from ${m.headcount_recommendation_pre_gate})`;
  }
  return rec;
}

function hcRecClass(m) {
  return (m.headcount_recommendation || "Hold").replace(/ /g, "\\ ");
}

/** HTML class for recommendation badges. */
function hcRecBadgeClass(m) {
  const rec = m.headcount_recommendation || "Hold";
  if (rec === "Do Not Hire") return "rec-dnh";
  return `rec-${rec}`;
}

function bucketLabel(b) {
  const raw = b?.book_bucket;
  if (raw == null) return "—";
  return String(raw).replace(/^\d+:\s*/, "");
}

function keyFinding(m) {
  return m.recommendation_primary || m.hc_reason_primary || m.summary_primary || "—";
}

/** Short action line for executive views (e.g. "Hire + build books from SBS"). */
function execActionLabel(m) {
  return m.recommended_action || m.recommendation_primary || hcRecLabel(m);
}

/** Bullets explaining the recommendation — HC reason, actions, SBS when relevant. */
function execReasonBullets(m) {
  const bullets = [];
  const seen = new Set();
  function add(text) {
    const t = (text || "").trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    bullets.push(t);
  }
  add(m.hc_reason_primary);
  for (const b of m.recommendation_bullets || []) add(b);
  for (const b of m.summary_bullets || []) add(b);
  if (m.sbs_has_opportunity) {
    add(m.sbs_opportunity_primary);
    for (const b of m.sbs_opportunity_bullets || []) add(b);
  }
  if (!bullets.length) add(keyFinding(m));
  return bullets.slice(0, 5);
}

function execReasonHtml(m, { listClass = "exec-bullets" } = {}) {
  const bullets = execReasonBullets(m);
  if (bullets.length === 1) {
    return `<p class="exec-reason-single">${bullets[0]}</p>`;
  }
  return `<ul class="${listClass}">${bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`;
}

/** One-line formula stakeholders can repeat. */
function execFormulaLine(m) {
  const ideal = idealPcid(m);
  const assigned = m.assigned_accounts;
  if (assigned == null || ideal == null) return "—";
  return (
    `${fmtNum(assigned)} assigned PCIDs ÷ ${fmtNum(ideal)} ideal PCID = ${fmtNum(m.optimal_headcount)} optimal HC · ` +
    `${fmtNum(m.current_reps)} current reps → gap ${gapStr(m.headcount_gap)}`
  );
}

/** Structured answers for "why did you make that rec?" */
function execBossAnswer(m) {
  const ideal = idealPcid(m);
  const items = [
    {
      q: "What's the headcount math?",
      a: execFormulaLine(m),
    },
    {
      q: "Is the book healthy enough to act?",
      a: m.health_primary || m.summary_primary || "—",
    },
  ];

  if (m.hc_curve_validated === false) {
    items.push({
      q: "Why isn't this a straight Hire/Optimize?",
      a: m.hc_curve_gate_reason ||
        "Ideal PCID isn't validated by the revenue growth curve — recommendation held to Hold until the curve is trusted.",
    });
  } else {
    items.push({
      q: "Why this ideal book size?",
      a: m.optimal_book_primary ||
        `Ideal PCID ${fmtNum(ideal)} from ${m.perfect_book_source || "sql/16"} — largest bucket within 85% of peak revenue growth.`,
    });
  }

  items.push({
    q: "What should we do?",
    a: execActionLabel(m),
  });

  const actionDetail = (m.recommendation_bullets || []).concat(m.summary_bullets || []);
  if (actionDetail.length) {
    items.push({
      q: "Concrete next steps",
      a: actionDetail.slice(0, 3).join(" · "),
    });
  }

  if (m.sbs_has_opportunity && m.sbs_opportunity_primary) {
    items.push({
      q: "Where do new accounts come from?",
      a: m.sbs_opportunity_primary,
    });
  }

  return items;
}

function execBossAnswerHtml(m) {
  const items = execBossAnswer(m);
  return `<dl class="boss-qa">${items
    .map(
      (item) =>
        `<dt>${item.q}</dt><dd>${item.a}</dd>`,
    )
    .join("")}</dl>`;
}

function fmtJv(n) {
  if (n == null) return "—";
  return "$" + Number(n).toFixed(2) + "/job";
}

function fmtGrowthPct(n) {
  if (n == null) return "—";
  return (Number(n) * 100).toFixed(1) + "%";
}

function fmtCoverage(n) {
  if (n == null) return "—";
  return Number(n).toFixed(1) + " calls/acct";
}

function mergeEvidenceBuckets(m) {
  const map = new Map();
  const ingest = (arr, kind) => {
    for (const b of arr || []) {
      const key = b.book_bucket || String(b.bucket_midpoint);
      const row = map.get(key) || {
        book_bucket: b.book_bucket,
        bucket_midpoint: b.bucket_midpoint,
        bucket_upper: b.bucket_upper,
        bucket_order: b.bucket_order,
        rep_count: b.rep_count,
      };
      if (kind === "growth") row.median_growth_pct = b.median_growth_pct;
      if (kind === "coverage") row.median_impact_calls_per_account = b.median_impact_calls_per_account;
      if (kind === "jv") row.median_rev_per_job = b.median_rev_per_job;
      if (b.rep_count != null) row.rep_count = b.rep_count;
      map.set(key, row);
    }
  };
  ingest(m.growth_by_bucket, "growth");
  ingest(m.coverage_by_bucket, "coverage");
  ingest(m.jv_by_bucket, "jv");
  return [...map.values()].sort(
    (a, b) => (a.bucket_order ?? a.bucket_midpoint ?? 0) - (b.bucket_order ?? b.bucket_midpoint ?? 0),
  );
}

function bucketSizeLabel(b) {
  if (b.book_bucket?.includes(": ")) return b.book_bucket.split(": ")[1] + " PCIDs";
  if (b.bucket_midpoint != null) return fmtNum(b.bucket_midpoint) + " PCIDs";
  return b.book_bucket || "—";
}

function evidenceRowFlags(m, b, ideal) {
  const flags = [];
  if (ideal != null && b.bucket_midpoint === ideal) flags.push("Ideal book");
  if (m.growth_peak_accounts != null && b.bucket_midpoint === m.growth_peak_accounts) flags.push("Growth peak");
  if (ideal != null && b.bucket_midpoint != null && b.bucket_midpoint < ideal) flags.push("Below ideal");
  if (ideal != null && b.bucket_upper != null && b.bucket_upper > ideal) flags.push("Above ideal");
  return flags.join(" · ") || "—";
}

/** Hard-number table: growth, coverage, JV by book-size bucket — for "why 90?" */
function idealPcidEvidenceHtml(m) {
  const ideal = idealPcid(m);
  const rows = mergeEvidenceBuckets(m);
  const avgBook = m.current_avg_book ?? m.avg_pcid_per_rep;

  if (!rows.length) {
    return `<div class="ideal-evidence"><p class="missing">No bucket-level numbers in this export — refresh sql/16 growth/JV/coverage merges.</p></div>`;
  }

  const tbody = rows
    .map((b) => {
      const isIdeal = ideal != null && b.bucket_midpoint === ideal;
      return `<tr class="${isIdeal ? "evidence-ideal-row" : ""}">
        <td><strong>${bucketSizeLabel(b)}</strong></td>
        <td class="num">${fmtNum(b.rep_count)}</td>
        <td class="num">${fmtGrowthPct(b.median_growth_pct)}</td>
        <td class="num">${b.median_impact_calls_per_account != null ? fmtCoverage(b.median_impact_calls_per_account) : "—"}</td>
        <td class="num">${b.median_rev_per_job != null ? fmtJv(b.median_rev_per_job) : "—"}</td>
        <td class="evidence-flag">${evidenceRowFlags(m, b, ideal)}</td>
      </tr>`;
    })
    .join("");

  const dips = [];
  if (m.growth_peak_pct != null && m.growth_decline_above_pcid != null && m.growth_decline_median_pct != null) {
    dips.push(
      `<strong>Growth:</strong> peak ${fmtGrowthPct(m.growth_peak_pct)} at ~${fmtNum(m.growth_peak_accounts)} PCIDs → ` +
        `${fmtGrowthPct(m.growth_decline_median_pct)} above ~${fmtNum(m.growth_decline_above_pcid)} PCIDs`,
    );
  }
  if (m.coverage_peak_calls_per_account != null && m.coverage_decline_above_pcid != null) {
    dips.push(
      `<strong>Coverage:</strong> peak ${fmtCoverage(m.coverage_peak_calls_per_account)} at ~${fmtNum(m.coverage_peak_accounts)} PCIDs → ` +
        `${fmtCoverage(m.coverage_decline_median_calls)} above ~${fmtNum(m.coverage_decline_above_pcid)} PCIDs`,
    );
  }
  if (m.jv_plateau_rev_per_job != null && m.jv_decline_above_pcid != null && m.jv_decline_median_rev_per_job != null) {
    dips.push(
      `<strong>$/job:</strong> peak ${fmtJv(m.jv_peak_rev_per_job ?? m.jv_plateau_rev_per_job)} at ~${fmtNum(m.jv_peak_accounts ?? ideal)} PCIDs → ` +
        `${fmtJv(m.jv_decline_median_rev_per_job)} above ~${fmtNum(m.jv_decline_above_pcid)} PCIDs`,
    );
  }

  const context =
    avgBook != null && ideal != null
      ? `<p class="evidence-context">Today avg <strong>${fmtNum(avgBook)}</strong> PCIDs/rep vs ideal <strong>${fmtNum(ideal)}</strong> · segment avg <strong>${fmtNum(m.segment_avg_pcid)}</strong> · source <strong>${m.perfect_book_source || "sql/16"}</strong></p>`
      : "";

  return `
    <div class="ideal-evidence">
      <h3 class="ideal-evidence-title">Why ideal PCID ${fmtNum(ideal)}? (hard numbers)</h3>
      <p class="ideal-evidence-lead">${m.optimal_book_primary || "—"}</p>
      ${context}
      <div class="evidence-table-wrap">
        <table class="evidence-table">
          <thead>
            <tr>
              <th>Book size</th>
              <th class="num">Reps</th>
              <th class="num">Median rev growth</th>
              <th class="num">Impact coverage</th>
              <th class="num">$/job</th>
              <th>vs ideal</th>
            </tr>
          </thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>
      ${dips.length ? `<ul class="evidence-dips">${dips.map((d) => `<li>${d}</li>`).join("")}</ul>` : ""}
      ${m.threshold_analysis?.narrative ? `<p class="evidence-threshold"><strong>sql/22 threshold:</strong> ${m.threshold_analysis.narrative}</p>` : ""}
      <p class="evidence-footnote">Windows: current 90d vs prior PQR · reps with PQR ≥ $5k in growth curve · median per bucket (sql/16–19).</p>
    </div>`;
}

function curveValidatedLabel(m) {
  const validated = m.hc_curve_validated !== false;
  const src = m.perfect_book_source || "—";
  return validated ? `Yes · ${src}` : `No · ${src}`;
}

function gapStr(gap) {
  if (gap == null) return "—";
  return gap > 0 ? "+" + fmtNum(gap) : fmtNum(gap);
}

function gapClass(gap) {
  if (gap > 0) return "gap-pos";
  if (gap < 0) return "gap-neg";
  return "";
}

function findMarket(country, segment) {
  return (payload?.markets ?? []).find((m) => m.country === country && m.segment === segment);
}

function defaultMarket() {
  const markets = payload?.markets ?? [];
  return markets.find((m) => m.country === "US" && m.segment === "M") || markets[0];
}

const CHART_JS_URLS = [
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js",
];

function chartsAvailable() {
  return typeof Chart !== "undefined";
}

function loadScript(src, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), timeoutMs);
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("load failed"));
    };
    document.head.appendChild(script);
  });
}

async function ensureChartJs() {
  if (chartsAvailable()) return true;
  for (const url of CHART_JS_URLS) {
    try {
      await loadScript(url);
      if (chartsAvailable()) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}
