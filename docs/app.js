let payload = null;
let bookHealth = null;
let config = { refresh_api: null, live_refresh: false };
let segmentFilter = "all";
let recFilter = "all";
let regionFilter = "global";
let hideJapan = true;
let sortBy = "ideal_hc";
let lookupCountry = "US";
let lookupSegment = "M";
let gapChart = null;
let recChart = null;
let sbsChart = null;
let bookScoreChart = null;
let growthChart = null;
let jvChart = null;
let inflectionChart = null;
let productMixChart = null;
let bhJvChart = null;
let lastLoadedAt = null;
let lastReloadedAt = null;
let isRefreshing = false;
let findingsSortCol = "revenue_90d";
let findingsSortDir = "desc";
let findingsAmerOnly = false;

const AMER_MARKETS = ["US", "CA", "UK", "DACH", "BNL"];

const REC_COLORS = {
  Hire: "#0d7a4d",
  Optimize: "#b45309",
  Hold: "#1d6fb8",
  "Do Not Hire": "#c41e3a",
};

const CHART_TICK = "#5c6578";
const CHART_GRID = "#dde1e8";
const CHART_LEGEND = "#5c6578";

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

const IMPACT_COVERAGE_DEFINITION =
  "Impact coverage = impact calls per assigned account over the trailing 90 days. " +
  "We sum impact_calls from rep_activity_sales (sql/16) for each rep, divide by that rep's PCID count " +
  "(impact_calls_per_account), then report the market median (median_impact_calls_per_account). " +
  "Reps are flagged too big when impact calls/account fall below 90% of the segment average (along with high PCID/PQR). " +
  "Coverage status is Declining when avg book exceeds the inflection book size and median coverage drops below 90% of peak at that size.";

const SBS_OPPORTUNITY_DEFINITION =
  "SBS whitespace = parent company IDs with no sales team assignment (team None on JAM) in this country. " +
  "These are assignable accounts reps could grow into. books_buildable_from_sbs = whitespace ÷ ideal PCID.";

const HEALTHY_BOOK_DEFINITION =
  "A healthy book means the rep is not flagged too_big or too_little (sql/16–17). " +
  "Too big = PCID or PQR above segment average plus weak impact coverage (<90% of segment avg) or current revenue below PQR. " +
  "Too little = PCID below ideal (growth-optimal target). " +
  "Healthy reps are near ideal PCID, at or above segment PQR benchmark, and maintain adequate impact coverage.";

const REV_GROWTH_DEFINITION =
  "Revenue growth = (current 90d revenue − prior 90d PQR) ÷ prior PQR, capped at −50% to +100%. " +
  "Current window: 20260427–20260725 vs prior 20260128–20260426 (quarterly PQR comparison). " +
  "Reps bucketed by PCID count (1–10, 11–20, … 150+); each bucket shows median growth across reps with PQR ≥ $5K. " +
  "Optimal book = largest bucket within 85% of segment peak growth where bigger books no longer add growth.";

const JV_DEFINITION =
  "Job value (JV) = current 90d revenue ÷ jobs (agg_job_id count) per rep — $/job from JAM (sql/19). " +
  "Reps bucketed by PCID count (same bands as revenue growth curve); each bucket shows median $/job across reps with PQR ≥ $5K and jobs > 0. " +
  "JV plateau = largest bucket within 90% of segment peak $/job where bigger books no longer add $/job (sql/16 opp_plateau). " +
  "Compare segment median JV to plateau $/job when avg book exceeds the plateau book size.";

const INFLECTION_DEFINITION =
  "Inflection curves show when outcomes change as PCIDs rise — not segment averages. " +
  "Growth % = median (current 90d rev − PQR) / PQR per bucket. " +
  "Coverage = median impact calls per account. JV = median $/job. " +
  "Product mix = median CPC vs CPA share of revenue (sql/23). " +
  "Ideal headcount targets the bucket range where growth stays within 85% of peak before JV or coverage decline.";

async function loadConfig() {
  try {
    const res = await fetch("./data/config.json?" + Date.now());
    if (res.ok) config = await res.json();
  } catch {
    /* static hosting — no config */
  }
}

async function loadData() {
  const cacheBust = Date.now();
  const res = await fetch(`./data/headcount.json?${cacheBust}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load headcount.json");
  payload = await res.json();
  lastLoadedAt = new Date();
  try {
    const bh = await fetch(`./data/book_health.json?${cacheBust}`, { cache: "no-store" });
    bookHealth = bh.ok ? await bh.json() : null;
  } catch {
    bookHealth = null;
  }
}

function dataFingerprint() {
  return JSON.stringify({
    updated_at: payload?.updated_at,
    refreshed_at: payload?.refreshed_at,
    markets: payload?.markets,
    book_updated_at: bookHealth?.updated_at,
    book_markets: bookHealth?.markets,
  });
}

function idealPcid(m) {
  return m.ideal_pcid ?? m.perfect_book_target;
}

function marketKey(m) {
  return `${m.country}-${m.segment}`;
}

function showToast(message, tone = "ok") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = "toast " + tone;
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    el.className = "toast hidden";
  }, 8000);
}

function isStaticHosting() {
  return !config.refresh_api;
}

function refreshButtonLabel(loading = false) {
  if (isStaticHosting()) {
    return loading ? "Reloading…" : "Reload snapshot";
  }
  return loading ? "Refreshing…" : "Refresh data";
}

function formatPageReloadTime(d) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function updateRefreshButton(loading = isRefreshing) {
  isRefreshing = loading;
  const btn = document.getElementById("refresh-btn");
  const label = document.getElementById("refresh-label");
  btn.disabled = loading;
  btn.classList.toggle("loading", loading);
  label.textContent = refreshButtonLabel(loading);
  btn.title = isStaticHosting()
    ? "Re-fetch published JSON from GitHub Pages (use after git push). Does not run Quest or query the warehouse."
    : config.live_refresh
      ? "Run your warehouse refresh command, then reload JSON from disk."
      : "Reload JSON from disk via local server. Set DASHBOARD_REFRESH_CMD to pull from warehouse.";
}

const QUEST_REFRESH_STEPS =
  "For new warehouse data: iDash sql/16 (prod) → export JSON → run scripts → git push → Reload snapshot.";

async function refreshData() {
  if (isRefreshing) return;
  updateRefreshButton(true);
  const previousFingerprint = dataFingerprint();
  try {
    if (config.refresh_api) {
      showToast("Running warehouse refresh command…", "warn");
      const res = await fetch(config.refresh_api, { method: "POST", cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body.error || "Refresh API failed");
      }
    }
    await loadData();
    lastReloadedAt = lastLoadedAt;
    renderAll();
    const pageReloadTime = formatPageReloadTime(lastReloadedAt);
    const dataChanged = dataFingerprint() !== previousFingerprint;
    const snapshot = payload.updated_at;
    const pulled = payload.refreshed_at ? ` (warehouse pull ${payload.refreshed_at})` : "";

    if (dataChanged) {
      showToast(
        `Snapshot ${snapshot}${pulled} loaded. Page re-fetched at ${pageReloadTime}.`,
        "ok",
      );
    } else if (config.refresh_api && config.live_refresh) {
      showToast(
        `Snapshot ${snapshot}${pulled} — no change. Page reloaded at ${pageReloadTime}.`,
        "ok",
      );
    } else if (config.refresh_api) {
      showToast(
        `Snapshot ${snapshot} — no change. Reloaded local files at ${pageReloadTime}. Set DASHBOARD_REFRESH_CMD for warehouse pulls.`,
        "warn",
      );
    } else {
      showToast(
        `Snapshot ${snapshot} — no change. Re-fetched published JSON at ${pageReloadTime} (does not query Quest). ${QUEST_REFRESH_STEPS}`,
        "warn",
      );
    }
  } catch (err) {
    showToast(err.message || "Reload failed", "err");
  } finally {
    updateRefreshButton(false);
  }
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

function isJapan(m) {
  return m.country === "JP";
}

function amerMarkets() {
  return payload?.amer_markets || AMER_MARKETS;
}

function filteredMarkets() {
  return (payload?.markets ?? [])
    .filter((m) => {
      if (hideJapan && isJapan(m)) return false;
      if (regionFilter === "amer" && !amerMarkets().includes(m.country)) return false;
      if (segmentFilter !== "all" && m.segment !== segmentFilter) return false;
      if (recFilter !== "all" && m.headcount_recommendation !== recFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "ideal_hc") return (b.optimal_headcount || 0) - (a.optimal_headcount || 0);
      if (sortBy === "gap") return Math.abs(b.headcount_gap) - Math.abs(a.headcount_gap);
      if (sortBy === "reps") return b.current_reps - a.current_reps;
      return b.revenue_90d - a.revenue_90d;
    });
}

function renderMeta() {
  const el = document.getElementById("meta-line");
  const timing = lastReloadedAt
    ? ` · Page reloaded ${formatPageReloadTime(lastReloadedAt)}`
    : lastLoadedAt
      ? ` · Page loaded ${formatPageReloadTime(lastLoadedAt)}`
      : "";
  const live = config.live_refresh ? " · Live warehouse refresh on" : "";
  const region = regionFilter === "amer" ? " · AMER focus" : " · All markets";
  el.textContent =
    `Ideal headcount by country × segment · ${payload.window} · Data snapshot ${payload.updated_at}${region}${timing}${live} · ${filteredMarkets().length} markets shown`;
  document.getElementById("refresh-note").textContent = config.refresh_api
    ? "Refresh data runs your local refresh command via dashboard-server.py (set DASHBOARD_REFRESH_CMD for warehouse pulls)."
    : "Reload snapshot re-fetches the published JSON from GitHub Pages (use after git push). It does not query Quest. " +
      QUEST_REFRESH_STEPS;
  updateRefreshButton();
  renderSources();
}

function renderSources() {
  const el = document.getElementById("sources-snapshot");
  if (!el || !payload) return;

  const marketCount = payload.markets?.length ?? 0;
  const bookUpdated = bookHealth?.updated_at;
  const query = payload.query || "sql/16_dashboard_export.sql";
  const window = payload.window || "—";

  const curveSources = {};
  for (const m of payload.markets || []) {
    const src = m.perfect_book_source || "unknown";
    curveSources[src] = (curveSources[src] || 0) + 1;
  }
  const curveSummary = Object.entries(curveSources)
    .sort((a, b) => b[1] - a[1])
    .map(([src, n]) => `${src}: ${n}`)
    .join(" · ") || "—";

  const gated = (payload.markets || []).filter((m) => m.hc_curve_validated === false).length;

  el.innerHTML = `
    <div class="sources-meta-grid">
      <div class="sources-meta-card">
        <div class="sources-meta-label">headcount.json snapshot</div>
        <div class="sources-meta-value">${payload.updated_at || "—"}</div>
        <div class="sources-meta-detail">${marketCount} markets · ${window}</div>
      </div>
      <div class="sources-meta-card">
        <div class="sources-meta-label">Source query</div>
        <div class="sources-meta-value"><code>${query}</code></div>
        <div class="sources-meta-detail">book_health.json${bookUpdated ? ` · ${bookUpdated}` : ""}</div>
      </div>
      <div class="sources-meta-card">
        <div class="sources-meta-label">Ideal PCID sources</div>
        <div class="sources-meta-value sources-meta-small">${curveSummary}</div>
        <div class="sources-meta-detail">${gated} market(s) HC-gated (curve not validated)</div>
      </div>
    </div>`;
}

function renderHeadline() {
  /* removed — lookup panel is the primary narrative */
}

function renderKpis() {
  /* KPI strip removed from Overview — table + lookup show essentials */
}

function allMarketsForLookup() {
  return (payload?.markets ?? []).filter((m) => !hideJapan || !isJapan(m));
}

function findLookupMarket() {
  return allMarketsForLookup().find(
    (m) => m.country === lookupCountry && m.segment === lookupSegment,
  );
}

function fmtPct(p) {
  if (p == null) return "—";
  return Math.round(p * 100) + "%";
}

function fmtJv(n) {
  if (n == null) return "—";
  return "$" + Number(n).toFixed(2) + "/job";
}

function fmtGrowthPct(n) {
  if (n == null) return "—";
  return (Number(n) * 100).toFixed(1) + "%";
}

function fmtCoverageCalls(n) {
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

function gapStr(gap) {
  if (gap == null) return "—";
  return gap > 0 ? "+" + fmtNum(gap) : fmtNum(gap);
}

/** 2–4 sentence summary: ideal book, HC math, curve gate, inflection signals. */
function buildRecommendationWhyParagraph(m) {
  const ideal = idealPcid(m);
  const rec = hcRecLabel(m);
  const sentences = [];

  const bookWhy =
    m.optimal_book_primary ||
    (ideal != null
      ? `Ideal PCID ${fmtNum(ideal)} from ${m.perfect_book_source || "sql/16"} — largest bucket within 85% of peak revenue growth.`
      : "Ideal book size not available in this snapshot.");
  sentences.push(`${rec} — ${bookWhy}`);

  const assigned = m.assigned_accounts;
  const optimal = m.optimal_headcount;
  const current = m.current_reps;
  const gap = m.headcount_gap;
  if (assigned != null && ideal != null && optimal != null) {
    let hcLine = `${fmtNum(assigned)} assigned PCIDs ÷ ${fmtNum(ideal)} ideal = ${fmtNum(optimal)} optimal HC`;
    if (current != null) hcLine += ` vs ${fmtNum(current)} current`;
    if (gap != null) hcLine += ` (gap ${gapStr(gap)})`;
    sentences.push(hcLine + ".");
  } else if (m.hc_reason_primary) {
    sentences.push(m.hc_reason_primary);
  }

  if (m.hc_curve_validated === false) {
    sentences.push(
      m.hc_curve_gate_reason ||
        "Ideal PCID isn't validated by the revenue growth curve — recommendation held to Hold until the curve is trusted.",
    );
  } else if (m.perfect_book_source) {
    sentences.push(`Growth curve validated (${m.perfect_book_source}) — HC action is trusted.`);
  }

  const dipParts = [];
  if (m.growth_peak_pct != null && m.growth_decline_above_pcid != null) {
    dipParts.push(
      `rev growth peaks at ~${fmtNum(m.growth_peak_accounts)} PCIDs (${fmtGrowthPct(m.growth_peak_pct)}) then softens above ~${fmtNum(m.growth_decline_above_pcid)}`,
    );
  }
  if (m.jv_decline_above_pcid != null && m.jv_decline_median_rev_per_job != null) {
    dipParts.push(
      `$/job falls from ${fmtJv(m.jv_peak_rev_per_job ?? m.jv_plateau_rev_per_job)} toward ${fmtJv(m.jv_decline_median_rev_per_job)} above ~${fmtNum(m.jv_decline_above_pcid)} PCIDs`,
    );
  }
  if (m.coverage_decline_above_pcid != null && m.coverage_decline_median_calls != null) {
    dipParts.push(
      `coverage drops from ${fmtCoverageCalls(m.coverage_peak_calls_per_account)} toward ${fmtCoverageCalls(m.coverage_decline_median_calls)} above ~${fmtNum(m.coverage_decline_above_pcid)} PCIDs`,
    );
  }
  if (dipParts.length) {
    sentences.push(`Inflection signals: ${dipParts.join("; ")}.`);
  } else if (m.recommendation_primary && m.recommendation_primary !== m.hc_reason_primary) {
    sentences.push(m.recommendation_primary);
  }

  return sentences.slice(0, 4).join(" ");
}

/** Hard-number table: growth, coverage, JV by book-size bucket (shared shape with preview-common.js). */
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
        <td class="num">${b.median_impact_calls_per_account != null ? fmtCoverageCalls(b.median_impact_calls_per_account) : "—"}</td>
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
      `<strong>Coverage:</strong> peak ${fmtCoverageCalls(m.coverage_peak_calls_per_account)} at ~${fmtNum(m.coverage_peak_accounts)} PCIDs → ` +
        `${fmtCoverageCalls(m.coverage_decline_median_calls)} above ~${fmtNum(m.coverage_decline_above_pcid)} PCIDs`,
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

function flagPct(count, total) {
  if (!total || count == null) return "";
  return ` (${Math.round((100 * count) / total)}%)`;
}

function bookHealthStatusClass(status) {
  if (status === "Overweight") return "summary-over";
  if (status === "Underweight") return "summary-under";
  return "summary-target";
}

function hcStatusClass(status) {
  if (status === "Over HC") return "summary-over";
  if (status === "Under HC") return "summary-under";
  return "summary-target";
}

function narrativeBlock(title, badge, badgeClass, primary, bullets) {
  if (!primary && !bullets.length) return "";
  return `<div class="market-summary ${badgeClass}">
    <div class="market-summary-header">
      <span class="market-summary-badge">${badge}</span>
      <span class="market-summary-label">${title}</span>
    </div>
    ${primary ? `<p class="market-summary-primary">${primary}</p>` : ""}
    ${
      bullets.length
        ? `<ul class="market-summary-bullets">${bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`
        : ""
    }
  </div>`;
}

function truncateText(text, max = 120) {
  if (!text || text.length <= max) return text || "—";
  return text.slice(0, max - 1) + "…";
}

function buildHealthFromMarket(m) {
  if (m.health_primary) {
    return {
      primary: m.health_primary,
      bullets: m.health_bullets || [],
      status: m.book_health_status || "—",
    };
  }
  const ideal = idealPcid(m);
  const reps = m.current_reps || 0;
  const tooBig = m.reps_too_big ?? 0;
  const tooLittle = m.reps_too_little ?? 0;
  const parts = [];
  if (reps) parts.push(`${fmtNum(reps)} reps`);
  if (m.current_avg_book != null && ideal != null) {
    const seg = m.segment_avg_pcid != null ? `, segment avg ${fmtNum(Math.round(m.segment_avg_pcid))}` : "";
    parts.push(`avg ${fmtNum(m.current_avg_book)} PCIDs/rep vs ideal ${fmtNum(ideal)}${seg}`);
  }
  if (m.avg_pqr_per_rep != null) {
    const segPqr =
      m.segment_avg_pqr != null ? ` (segment ${fmtMoney(m.segment_avg_pqr)})` : "";
    parts.push(`avg PQR ${fmtMoney(m.avg_pqr_per_rep)}${segPqr}`);
  }
  if (tooBig || tooLittle) {
    parts.push(
      `${fmtNum(tooBig)} too big${flagPct(tooBig, reps)}, ${fmtNum(tooLittle)} too little${flagPct(tooLittle, reps)}`,
    );
  }
  if (m.avg_pct_book_built != null) {
    parts.push(`FY26 book build ${m.avg_pct_book_built.toFixed(1)}%`);
  }
  let status = "On target";
  if (ideal && m.current_avg_book) {
    const ratio = m.current_avg_book / ideal;
    if (ratio > 1.1) status = "Overweight";
    else if (ratio < 0.9) status = "Underweight";
  }
  return {
    primary: parts.length ? parts.join(". ") + "." : "",
    bullets: [],
    status,
  };
}

function coverageStatusClass(status) {
  if (status === "Declining") return "summary-over";
  if (status === "OK") return "summary-target";
  return "summary-under";
}

function buildHcReason(m) {
  if (m.hc_reason_primary) {
    return { primary: m.hc_reason_primary, driver: m.hc_reason_driver || "" };
  }
  const status = m.summary_status || "—";
  const gap = Math.abs(m.headcount_gap ?? 0);
  const direction = status === "Under HC" ? "LOW" : status === "Over HC" ? "HIGH" : "";
  if (!direction) return { primary: "HC at target.", driver: "at_target" };
  return {
    primary: `HC too ${direction} by ${fmtNum(gap)} reps — see book health and coverage signals.`,
    driver: "gap",
  };
}

function buildSbsRouting(m) {
  const hasOpp = m.sbs_has_opportunity ?? (m.sbs_whitespace_country ?? m.sbs_whitespace ?? 0) > 0;
  return {
    hasOpp,
    opportunity: m.sbs_opportunity_primary || "",
    routing: m.sbs_routing_primary || "",
    bullets: m.sbs_routing_bullets || m.sbs_opportunity_bullets || [],
    books: m.books_buildable_from_sbs ?? 0,
  };
}

function sbsOppLabel(m) {
  const sbs = buildSbsRouting(m);
  if (!sbs.hasOpp) return "—";
  return sbs.books ? `Yes · ~${fmtNum(sbs.books)} books` : "Yes";
}

function buildRecommendationsFromMarket(m) {
  return {
    primary: m.recommendation_primary || m.recommended_action || m.headcount_recommendation || "",
    bullets: (m.recommendation_bullets || []).slice(0, 2),
  };
}

function buildHealthyBook(m) {
  if (m.healthy_book_primary) {
    return {
      primary: m.healthy_book_primary,
      definition: m.healthy_book_definition || m.healthy_book_primary,
      criteria: m.healthy_book_criteria || [],
      thresholds: m.healthy_book_thresholds || {},
      pct: m.pct_reps_healthy,
      healthy: m.reps_healthy,
      scored: m.reps_scored,
    };
  }
  const ideal = idealPcid(m);
  const segPqr = m.segment_avg_pqr;
  const medianCov = m.median_impact_calls_per_account;
  const criteria = [];
  if (ideal != null) {
    const low = Math.round(ideal * 0.9);
    const high = Math.round(ideal * 1.1);
    criteria.push(`PCID within ±10% of ideal (${low}–${high} at ideal ${fmtNum(ideal)})`);
  }
  if (segPqr != null) criteria.push(`PQR at or above segment benchmark (${fmtMoney(segPqr)})`);
  if (medianCov != null) {
    criteria.push(
      `Impact coverage ≥ 90% of segment average (median ${medianCov} calls/account)`,
    );
  }
  criteria.push("Not flagged too_big or too_little");
  return {
    primary: "Healthy book = not flagged too big or too little per sql/16–17.",
    definition: "",
    criteria,
    thresholds: {},
    pct: null,
    healthy: null,
    scored: m.current_reps,
  };
}

function renderHealthyBookBlock(m, healthy) {
  const t = healthy.thresholds;
  const thresholdBits = [];
  if (t.ideal_pcid != null) thresholdBits.push(`Ideal PCID ${fmtNum(t.ideal_pcid)}`);
  if (t.pcid_band_low != null && t.pcid_band_high != null) {
    thresholdBits.push(`±10% band ${fmtNum(t.pcid_band_low)}–${fmtNum(t.pcid_band_high)}`);
  }
  if (t.segment_avg_pqr != null) thresholdBits.push(`PQR benchmark ${fmtMoney(t.segment_avg_pqr)}`);
  if (t.coverage_benchmark != null) {
    thresholdBits.push(`Coverage median ${t.coverage_benchmark} calls/account`);
  }
  const pctLine =
    healthy.pct != null && healthy.healthy != null && healthy.scored
      ? `<p class="healthy-book-stat"><strong>${healthy.pct.toFixed(1)}%</strong> of reps have healthy books ` +
        `(${fmtNum(healthy.healthy)} of ${fmtNum(healthy.scored)} not flagged)</p>`
      : "";
  return `<div class="healthy-book-block">
    <div class="healthy-book-header">
      <span class="healthy-book-title">What is a healthy book?</span>
      <span class="metric-tip" title="${HEALTHY_BOOK_DEFINITION}">?</span>
    </div>
    ${thresholdBits.length ? `<p class="healthy-book-thresholds">${thresholdBits.join(" · ")}</p>` : ""}
    <ul class="healthy-book-checklist">${healthy.criteria.map((c) => `<li>${c}</li>`).join("")}</ul>
    ${pctLine}
  </div>`;
}

function buildGrowthCurve(m) {
  const buckets = m.growth_by_bucket || [];
  if (m.growth_curve_primary) {
    return {
      primary: m.growth_curve_primary,
      bullets: m.growth_curve_bullets || [],
      buckets,
      peakAccounts: m.growth_peak_accounts,
      peakPct: m.growth_peak_pct,
      declineAbove: m.growth_decline_above_pcid,
      declinePct: m.growth_decline_median_pct,
    };
  }
  const ideal = idealPcid(m);
  const growth = m.perfect_book_growth_pct;
  const inflection = m.coverage_inflection_book_max ?? m.perfect_book_ceiling;
  const primary =
    ideal != null && growth != null
      ? `Growth peaks near ideal ${fmtNum(ideal)} accounts/rep (${fmtPct(growth)} median quarterly growth)` +
        (inflection ? `; declines above ~${fmtNum(inflection)} PCIDs.` : ".")
      : "";
  return { primary, bullets: [], buckets, peakAccounts: ideal, peakPct: growth, declineAbove: inflection, declinePct: null };
}

function renderGrowthBucketTable(buckets, m) {
  if (!buckets.length) {
    return `<p class="growth-curve-empty">Bucket-level growth not available — using summary stats (ideal PCID ${fmtNum(idealPcid(m))}, ${m.perfect_book_growth_pct != null ? fmtPct(m.perfect_book_growth_pct) : "—"} at optimal).</p>`;
  }
  const ideal = idealPcid(m);
  const inflection = m.coverage_inflection_book_max ?? m.perfect_book_ceiling;
  const rows = buckets
    .map((b) => {
      const band = b.book_bucket?.includes(": ") ? b.book_bucket.split(": ")[1] : b.book_bucket;
      const isIdeal = ideal != null && b.bucket_midpoint === ideal;
      const isInflection = inflection != null && b.bucket_upper === inflection;
      const rowClass = isIdeal ? "growth-row-ideal" : isInflection ? "growth-row-inflection" : "";
      return `<tr class="${rowClass}">
        <td>${band || "—"}</td>
        <td class="num">${fmtNum(b.rep_count)}</td>
        <td class="num">${b.median_growth_pct != null ? fmtPct(b.median_growth_pct) : "—"}</td>
        <td>${isIdeal ? "Optimal" : isInflection ? "Coverage inflection" : ""}</td>
      </tr>`;
    })
    .join("");
  return `<div class="table-wrap table-wrap-sm growth-bucket-table">
    <table>
      <thead><tr><th>PCID bucket</th><th class="num">Reps</th><th class="num">Median rev growth</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderGrowthCurveBlock(m, growth) {
  if (!growth.primary && !growth.buckets.length) return "";
  const bullets =
    growth.bullets.length > 0
      ? `<ul class="market-summary-bullets growth-curve-bullets">${growth.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`
      : "";
  const chartBlock =
    growth.buckets.length > 0
      ? `<div class="growth-chart-wrap"><canvas id="growth-curve-chart" aria-label="Median revenue growth by PCID bucket"></canvas></div>`
      : "";
  return `<div class="growth-curve-block">
    <div class="growth-curve-header">
      <span class="growth-curve-title">Revenue growth vs book size</span>
      <span class="metric-tip" title="${REV_GROWTH_DEFINITION}">?</span>
    </div>
    <p class="growth-curve-primary">${growth.primary}</p>
    ${bullets}
    ${chartBlock}
    ${renderGrowthBucketTable(growth.buckets, m)}
  </div>`;
}

function renderGrowthChart(m) {
  if (!chartsAvailable()) return;
  const ctx = document.getElementById("growth-curve-chart");
  if (!ctx) return;
  const buckets = m.growth_by_bucket || [];
  if (growthChart) {
    growthChart.destroy();
    growthChart = null;
  }
  if (!buckets.length) return;

  const ideal = idealPcid(m);
  const inflection = m.coverage_inflection_book_max ?? m.perfect_book_ceiling;
  const labels = buckets.map((b) => (b.book_bucket?.includes(": ") ? b.book_bucket.split(": ")[1] : b.book_bucket));
  const data = buckets.map((b) => (b.median_growth_pct != null ? b.median_growth_pct * 100 : null));
  const colors = buckets.map((b) => {
    if (ideal != null && b.bucket_midpoint === ideal) return "#3ecf8e";
    if (inflection != null && b.bucket_upper === inflection) return "#f5a623";
    return "#4c8bf5";
  });

  growthChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Median rev growth % (90d vs prior PQR)",
          data,
          backgroundColor: colors,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y?.toFixed(1)}% median growth (${buckets[ctx.dataIndex]?.rep_count ?? "—"} reps)`,
          },
        },
      },
      scales: {
        y: {
          title: { display: true, text: "Median growth %", color: CHART_TICK },
          ticks: {
            color: CHART_TICK,
            callback: (v) => `${v}%`,
          },
          grid: { color: CHART_GRID },
        },
        x: {
          ticks: { color: CHART_TICK, font: { size: 10 }, maxRotation: 45 },
          grid: { display: false },
        },
      },
    },
  });
}

function buildJvCurve(m) {
  const buckets = m.jv_by_bucket || [];
  if (m.jv_curve_primary) {
    return {
      primary: m.jv_curve_primary,
      bullets: m.jv_curve_bullets || [],
      buckets,
      segmentAvg: m.segment_avg_jv,
      plateauBook: m.jv_plateau_book_max ?? m.opp_plateau_book_max,
      plateauJv: m.jv_plateau_rev_per_job ?? m.opp_plateau_rev_per_job,
      vsPlateauPct: m.jv_vs_plateau_pct,
      declineAbove: m.jv_decline_above_pcid ?? m.jv_plateau_book_max ?? m.opp_plateau_book_max,
      declineJv: m.jv_decline_median_rev_per_job,
    };
  }
  const plateauBook = m.jv_plateau_book_max ?? m.opp_plateau_book_max;
  const plateauJv = m.jv_plateau_rev_per_job ?? m.opp_plateau_rev_per_job;
  const primary =
    plateauBook != null && plateauJv != null
      ? `JV peaks near ~${fmtNum(plateauBook)} accounts/rep (${fmtJv(plateauJv)})` +
        (m.segment_avg_jv != null ? `; segment median ${fmtJv(m.segment_avg_jv)}.` : ".")
      : "";
  return {
    primary,
    bullets: [],
    buckets,
    segmentAvg: m.segment_avg_jv,
    plateauBook,
    plateauJv,
    vsPlateauPct: m.jv_vs_plateau_pct,
    declineAbove: plateauBook,
    declineJv: null,
  };
}

function renderJvBucketTable(buckets, m) {
  if (!buckets.length) {
    const plateauJv = m.jv_plateau_rev_per_job ?? m.opp_plateau_rev_per_job;
    return `<p class="growth-curve-empty">Bucket-level JV not available — using summary stats (plateau ${fmtJv(plateauJv)} at ~${fmtNum(m.jv_plateau_book_max ?? m.opp_plateau_book_max)} PCIDs).</p>`;
  }
  const plateauBook = m.jv_plateau_book_max ?? m.opp_plateau_book_max;
  const rows = buckets
    .map((b) => {
      const band = b.book_bucket?.includes(": ") ? b.book_bucket.split(": ")[1] : b.book_bucket;
      const isPlateau = plateauBook != null && b.bucket_upper === plateauBook;
      const rowClass = isPlateau ? "growth-row-ideal" : "";
      return `<tr class="${rowClass}">
        <td>${band || "—"}</td>
        <td class="num">${fmtNum(b.rep_count)}</td>
        <td class="num">${b.median_rev_per_job != null ? fmtJv(b.median_rev_per_job) : "—"}</td>
        <td>${isPlateau ? "JV plateau" : ""}</td>
      </tr>`;
    })
    .join("");
  return `<div class="table-wrap table-wrap-sm growth-bucket-table">
    <table>
      <thead><tr><th>PCID bucket</th><th class="num">Reps</th><th class="num">Median $/job</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderJvCurveBlock(m, jv) {
  if (!jv.primary && !jv.buckets.length && jv.plateauJv == null) return "";
  const bullets =
    jv.bullets.length > 0
      ? `<ul class="market-summary-bullets growth-curve-bullets">${jv.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`
      : "";
  const chartBlock =
    jv.buckets.length > 0
      ? `<div class="growth-chart-wrap"><canvas id="jv-curve-chart" aria-label="Median job value by PCID bucket"></canvas></div>`
      : "";
  const vsPlateau =
    jv.vsPlateauPct != null && jv.segmentAvg != null && jv.plateauJv != null
      ? `<p class="jv-vs-plateau caption">${fmtJv(jv.segmentAvg)} segment median vs ${fmtJv(jv.plateauJv)} at plateau (${jv.vsPlateauPct >= 0 ? "+" : ""}${jv.vsPlateauPct}%)</p>`
      : "";
  return `<div class="growth-curve-block jv-curve-block">
    <div class="growth-curve-header">
      <span class="growth-curve-title">JV ($/job) vs book size</span>
      <span class="metric-tip" title="${JV_DEFINITION}">?</span>
    </div>
    <p class="growth-curve-primary">${jv.primary}</p>
    ${vsPlateau}
    ${bullets}
    ${chartBlock}
    ${renderJvBucketTable(jv.buckets, m)}
  </div>`;
}

function renderJvChart(m) {
  if (!chartsAvailable()) return;
  const ctx = document.getElementById("jv-curve-chart");
  if (!ctx) return;
  const buckets = m.jv_by_bucket || [];
  if (jvChart) {
    jvChart.destroy();
    jvChart = null;
  }
  if (!buckets.length) return;

  const plateauBook = m.jv_plateau_book_max ?? m.opp_plateau_book_max;
  const labels = buckets.map((b) => (b.book_bucket?.includes(": ") ? b.book_bucket.split(": ")[1] : b.book_bucket));
  const data = buckets.map((b) => b.median_rev_per_job);
  const colors = buckets.map((b) => {
    if (plateauBook != null && b.bucket_upper === plateauBook) return "#3ecf8e";
    return "#a78bfa";
  });

  jvChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Median $/job (90d revenue ÷ jobs)",
          data,
          backgroundColor: colors,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${fmtJv(ctx.parsed.y)} (${buckets[ctx.dataIndex]?.rep_count ?? "—"} reps)`,
          },
        },
      },
      scales: {
        y: {
          title: { display: true, text: "$/job", color: CHART_TICK },
          ticks: {
            color: CHART_TICK,
            callback: (v) => "$" + v,
          },
          grid: { color: CHART_GRID },
        },
        x: {
          ticks: { color: CHART_TICK, font: { size: 10 }, maxRotation: 45 },
          grid: { display: false },
        },
      },
    },
  });
}

function buildOptimalBookRationale(m) {
  if (m.optimal_book_primary) {
    return {
      primary: m.optimal_book_primary,
      bullets: m.optimal_book_bullets || [],
    };
  }
  const ideal = idealPcid(m);
  if (ideal == null) return { primary: "", bullets: [] };
  const bucket = m.perfect_book_bucket || "";
  const band = bucket.includes(": ") ? bucket.split(": ")[1] : `up to ${m.perfect_book_ceiling ?? ideal}`;
  const growth = m.perfect_book_growth_pct;
  const primary =
    `Optimal book for this segment is ${fmtNum(ideal)} accounts/rep (${band} band). ` +
    `We pick the largest book-size bucket where median revenue growth stays within ` +
    `85% of the segment peak (${growth != null ? fmtPct(growth) : "positive"} in that band) ` +
    `and a bigger book no longer adds growth.`;
  const bullets = [];
  if (m.segment_avg_pqr != null) {
    bullets.push(
      `Segment avg PQR (prior quarter): ${fmtMoney(m.segment_avg_pqr)} — benchmark for revenue-heavy books.`,
    );
  }
  if (m.segment_avg_pcid != null) {
    bullets.push(
      `Segment avg PCID: ${fmtNum(Math.round(m.segment_avg_pcid))} — typical size today vs ${fmtNum(ideal)} ideal.`,
    );
  }
  return { primary, bullets };
}

function bucketLabel(b) {
  return b.book_bucket?.includes(": ") ? b.book_bucket.split(": ")[1] : b.book_bucket;
}

function buildCoverageCurve(m) {
  const buckets = m.coverage_by_bucket || [];
  if (m.coverage_curve_primary) {
    return {
      primary: m.coverage_curve_primary,
      bullets: m.coverage_curve_bullets || [],
      buckets,
      peakAccounts: m.coverage_peak_accounts,
      peakCov: m.coverage_peak_calls_per_account,
      declineAbove: m.coverage_decline_above_pcid ?? m.coverage_inflection_book_max,
      declineCov: m.coverage_decline_median_calls,
    };
  }
  const inflection = m.coverage_inflection_book_max;
  const at = m.coverage_at_inflection;
  const primary =
    inflection != null && at != null
      ? `Coverage inflection near ~${fmtNum(inflection)} PCIDs (${at} calls/account at peak).`
      : "";
  return { primary, bullets: [], buckets, peakAccounts: inflection, peakCov: at, declineAbove: inflection, declineCov: null };
}

function buildProductMix(m) {
  const buckets = m.product_mix_by_bucket || [];
  return {
    primary: m.product_mix_primary || "",
    bullets: m.product_mix_bullets || [],
    buckets,
  };
}

function renderCoverageCurveBlock(m, cov) {
  if (!cov.primary && !cov.buckets.length) return "";
  const bullets =
    cov.bullets.length > 0
      ? `<ul class="market-summary-bullets growth-curve-bullets">${cov.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`
      : "";
  const rows = cov.buckets
    .map((b) => {
      const isPeak = cov.peakAccounts != null && b.bucket_midpoint === cov.peakAccounts;
      const isInf = cov.declineAbove != null && b.bucket_upper === cov.declineAbove;
      return `<tr class="${isPeak ? "growth-row-ideal" : isInf ? "growth-row-inflection" : ""}">
        <td>${bucketLabel(b)}</td>
        <td class="num">${fmtNum(b.rep_count)}</td>
        <td class="num">${b.median_impact_calls_per_account ?? "—"}</td>
        <td>${isPeak ? "Peak" : isInf ? "Inflection" : ""}</td>
      </tr>`;
    })
    .join("");
  const table =
    cov.buckets.length
      ? `<div class="table-wrap table-wrap-sm growth-bucket-table"><table>
        <thead><tr><th>PCID bucket</th><th class="num">Reps</th><th class="num">Median coverage</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>`
      : "";
  return `<div class="growth-curve-block coverage-curve-block">
    <div class="growth-curve-header">
      <span class="growth-curve-title">Impact coverage vs book size</span>
      <span class="metric-tip" title="${IMPACT_COVERAGE_DEFINITION}">?</span>
    </div>
    <p class="growth-curve-primary">${cov.primary}</p>
    ${bullets}
    ${table}
  </div>`;
}

function renderThresholdCallout(m) {
  const ta = m.threshold_analysis;
  const el = document.getElementById("bh-threshold");
  if (!el) return;
  if (!ta?.narrative) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  const binding =
    ta.binding_threshold_low != null
      ? `Binding ceiling ~${fmtNum(ta.binding_threshold_low)}–${fmtNum(ta.binding_threshold_high)} PCIDs`
      : "";
  el.innerHTML = `<strong>Goal A threshold (sql/22):</strong> ${ta.narrative}${binding ? ` · ${binding}` : ""}`;
}

function renderBookHealth() {
  const countries = [...new Set(allMarketsForLookup().map((m) => m.country))].sort();
  const countrySelect = document.getElementById("bh-country");
  const segmentSelect = document.getElementById("bh-segment");
  if (!countrySelect || !segmentSelect) return;

  if (countrySelect.options.length !== countries.length) {
    countrySelect.innerHTML = countries
      .map((c) => `<option value="${c}"${c === lookupCountry ? " selected" : ""}>${c}</option>`)
      .join("");
  }
  countrySelect.value = lookupCountry;
  segmentSelect.value = lookupSegment;

  const m = findLookupMarket();
  const summaryEl = document.getElementById("bh-inflection-summary");
  const detailEl = document.getElementById("bh-detail");
  const mixEmpty = document.getElementById("product-mix-empty");

  if (!m) {
    if (summaryEl) summaryEl.textContent = `No data for ${lookupCountry}-${lookupSegment}.`;
    if (detailEl) detailEl.innerHTML = "";
    renderThresholdCallout({});
    if (mixEmpty) mixEmpty.classList.remove("hidden");
    return;
  }

  renderThresholdCallout(m);
  const growth = buildGrowthCurve(m);
  const jv = buildJvCurve(m);
  const cov = buildCoverageCurve(m);
  const mix = buildProductMix(m);

  if (summaryEl) {
    const gateNote =
      m.hc_curve_validated === false && m.hc_curve_gate_reason
        ? `<p class="threshold-callout gate-note">${m.hc_curve_gate_reason}</p>`
        : "";
    summaryEl.innerHTML = `<p><strong>${m.country}-${m.segment}</strong> · ideal ${fmtNum(idealPcid(m))} PCIDs · avg ${fmtNum(m.current_avg_book)} · ${m.perfect_book_source || "—"} · ${hcRecLabel(m)}</p>
      <p>${growth.primary || ""} ${cov.primary ? ` · ${cov.primary}` : ""}</p>${gateNote}`;
  }

  if (detailEl) {
    detailEl.innerHTML = `
      <div class="growth-curve-block">
        <p class="growth-curve-primary">${growth.primary || "—"}</p>
        ${renderGrowthBucketTable(growth.buckets, m)}
      </div>
      ${renderCoverageCurveBlock(m, cov)}
      <div class="growth-curve-block jv-curve-block">
        <p class="growth-curve-primary">${jv.primary || "—"}</p>
        ${renderJvBucketTable(jv.buckets, m)}
      </div>`;
  }

  const evidenceEl = document.getElementById("bh-evidence");
  if (evidenceEl) {
    evidenceEl.innerHTML = idealPcidEvidenceHtml(m);
  }

  if (mixEmpty) {
    mixEmpty.classList.toggle("hidden", mix.buckets.length > 0);
  }
}

function renderInflectionComboChart(m) {
  if (!chartsAvailable()) return;
  const ctx = document.getElementById("inflection-combo-chart");
  if (!ctx) return;
  const growthBuckets = m.growth_by_bucket || [];
  const covBuckets = m.coverage_by_bucket || [];
  if (inflectionChart) {
    inflectionChart.destroy();
    inflectionChart = null;
  }
  if (!growthBuckets.length && !covBuckets.length) return;

  const byOrder = new Map();
  growthBuckets.forEach((b) => byOrder.set(b.bucket_order, { g: b }));
  covBuckets.forEach((b) => {
    const row = byOrder.get(b.bucket_order) || {};
    row.c = b;
    byOrder.set(b.bucket_order, row);
  });
  const orders = [...byOrder.keys()].sort((a, b) => a - b);
  const labels = orders.map((o) => {
    const g = byOrder.get(o).g;
    const c = byOrder.get(o).c;
    return bucketLabel(g || c || {});
  });
  const growthData = orders.map((o) => {
    const p = byOrder.get(o).g?.median_growth_pct;
    return p != null ? p * 100 : null;
  });
  const covData = orders.map((o) => byOrder.get(o).c?.median_impact_calls_per_account ?? null);
  const ideal = idealPcid(m);

  inflectionChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Median rev growth %",
          data: growthData,
          borderColor: "#4c8bf5",
          backgroundColor: "rgba(76, 139, 245, 0.15)",
          yAxisID: "y",
          tension: 0.2,
          spanGaps: true,
        },
        {
          label: "Impact calls / account",
          data: covData,
          borderColor: "#3ecf8e",
          backgroundColor: "rgba(62, 207, 142, 0.1)",
          yAxisID: "y1",
          tension: 0.2,
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: CHART_TICK } },
        tooltip: { enabled: true },
      },
      scales: {
        y: {
          type: "linear",
          position: "left",
          title: { display: true, text: "Growth %", color: CHART_TICK },
          ticks: { color: CHART_TICK, callback: (v) => `${v}%` },
          grid: { color: CHART_GRID },
        },
        y1: {
          type: "linear",
          position: "right",
          title: { display: true, text: "Calls / acct", color: CHART_TICK },
          ticks: { color: CHART_TICK },
          grid: { drawOnChartArea: false },
        },
        x: {
          ticks: { color: CHART_TICK, font: { size: 10 }, maxRotation: 45 },
          grid: { display: false },
        },
      },
    },
  });
  if (ideal != null) {
    /* ideal PCID shown in summary — chart uses bucket bands not continuous x */
  }
}

function renderBhJvChart(m) {
  if (!chartsAvailable()) return;
  const ctx = document.getElementById("bh-jv-chart");
  if (!ctx) return;
  const buckets = m.jv_by_bucket || [];
  if (bhJvChart) {
    bhJvChart.destroy();
    bhJvChart = null;
  }
  if (!buckets.length) return;
  const plateauBook = m.jv_plateau_book_max ?? m.opp_plateau_book_max;
  const labels = buckets.map(bucketLabel);
  const data = buckets.map((b) => b.median_rev_per_job);
  const colors = buckets.map((b) =>
    plateauBook != null && b.bucket_upper === plateauBook ? "#3ecf8e" : "#a78bfa",
  );
  bhJvChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "$/job", data, backgroundColor: colors }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { color: CHART_TICK }, grid: { color: CHART_GRID } },
        x: { ticks: { color: CHART_TICK, font: { size: 10 }, maxRotation: 45 }, grid: { display: false } },
      },
    },
  });
}

function renderProductMixChart(m) {
  if (!chartsAvailable()) return;
  const ctx = document.getElementById("product-mix-chart");
  if (!ctx) return;
  const buckets = m.product_mix_by_bucket || [];
  if (productMixChart) {
    productMixChart.destroy();
    productMixChart = null;
  }
  if (!buckets.length) return;

  const labels = buckets.map(bucketLabel);
  const cpcPct = buckets.map((b) => (b.median_cpc_share != null ? b.median_cpc_share * 100 : 0));
  const cpaPct = buckets.map((b) => (b.median_cpa_share != null ? b.median_cpa_share * 100 : 0));

  productMixChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "CPC %", data: cpcPct, backgroundColor: "#4c8bf5", stack: "mix" },
        { label: "CPA %", data: cpaPct, backgroundColor: "#f5a623", stack: "mix" },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: CHART_TICK } } },
      scales: {
        x: { stacked: true, ticks: { color: CHART_TICK, font: { size: 10 }, maxRotation: 45 }, grid: { display: false } },
        y: {
          stacked: true,
          max: 100,
          ticks: { color: CHART_TICK, callback: (v) => `${v}%` },
          grid: { color: CHART_GRID },
        },
      },
    },
  });
}

function renderBookHealthCharts() {
  const m = findLookupMarket();
  if (!m) return;
  renderInflectionComboChart(m);
  renderBhJvChart(m);
  renderProductMixChart(m);
}

function renderOptimalBookPanel(_m) {
  /* consolidated into lookup panel */
}

function renderLookup() {
  const countries = [...new Set(allMarketsForLookup().map((m) => m.country))].sort();
  const countrySelect = document.getElementById("lookup-country");
  if (countrySelect.options.length !== countries.length) {
    countrySelect.innerHTML = countries
      .map(
        (c) =>
          `<option value="${c}"${c === lookupCountry ? " selected" : ""}>${c}</option>`,
      )
      .join("");
    if (!countries.includes(lookupCountry) && countries.length) {
      lookupCountry = countries.includes("US") ? "US" : countries[0];
      countrySelect.value = lookupCountry;
    }
  }
  document.getElementById("lookup-segment").value = lookupSegment;

  const m = findLookupMarket();
  const el = document.getElementById("lookup-answer");
  if (!m) {
    el.innerHTML =
      `<p class="lookup-missing">No data for <strong>${lookupCountry}-${lookupSegment}</strong> in this snapshot. ` +
      `Try another market or refresh query 16 for full coverage.</p>`;
    renderFlaggedRepsTable("", null);
    return;
  }

  const gap = m.headcount_gap;
  const gapLabel = gapStr(gap);
  const recClass = hcRecClass(m);
  const health = buildHealthFromMarket(m);
  const hcReason = buildHcReason(m);
  const sbs = buildSbsRouting(m);
  const recs = buildRecommendationsFromMarket(m);
  const ideal = idealPcid(m);
  const key = marketKey(m);
  const bh = bookHealth?.markets?.[key];

  const sbsLine = sbs.hasOpp
    ? sbs.opportunity || `SBS whitespace — ~${fmtNum(sbs.books)} books buildable`
    : "No SBS whitespace in this country.";

  el.innerHTML = `
    <div class="lookup-hero">
      <h2 class="lookup-market-title">${m.country}-${m.segment}</h2>
      <span class="rec lookup-rec-badge rec-${recClass}">${hcRecLabel(m)}</span>
    </div>

    <div class="lookup-stats">
      <div class="lookup-stat-card">
        <div class="lookup-stat-value">${fmtNum(m.current_reps)}</div>
        <div class="lookup-stat-label">Current reps</div>
      </div>
      <div class="lookup-stat-card highlight">
        <div class="lookup-stat-value">${fmtNum(m.optimal_headcount)}</div>
        <div class="lookup-stat-label">Optimal HC</div>
      </div>
      <div class="lookup-stat-card">
        <div class="lookup-stat-value">${gapLabel}</div>
        <div class="lookup-stat-label">HC gap</div>
      </div>
      <div class="lookup-stat-card">
        <div class="lookup-stat-value">${fmtNum(ideal)}</div>
        <div class="lookup-stat-label">Ideal PCID</div>
      </div>
    </div>

    <section class="rec-why-panel" aria-label="Recommendation rationale">
      <h3 class="rec-why-title">Why <span class="rec rec-${recClass}">${hcRecLabel(m)}</span>?</h3>
      <p class="rec-why-summary">${buildRecommendationWhyParagraph(m)}</p>
      <p class="lookup-formula">${fmtNum(m.assigned_accounts)} PCIDs ÷ ${fmtNum(ideal)} ideal = ${fmtNum(m.optimal_headcount)} optimal HC · gap ${gapLabel}${m.hc_curve_gate_reason && m.hc_curve_validated === false ? ` · <span class="gate-note">${m.hc_curve_gate_reason}</span>` : ""}</p>
    </section>

    ${idealPcidEvidenceHtml(m)}

    <details class="lookup-details">
      <summary>More detail</summary>
      <div class="lookup-details-body">
        <p><strong>Book health:</strong> ${health.primary || "—"}</p>
        <p>Avg ${fmtNum(m.current_avg_book)} PCIDs/rep vs ideal ${fmtNum(ideal)} · PQR ${m.avg_pqr_per_rep != null ? fmtMoney(m.avg_pqr_per_rep) : "—"} · ${fmtNum(m.reps_too_big ?? 0)} too big, ${fmtNum(m.reps_too_little ?? 0)} too little</p>
        <p><strong>SBS:</strong> ${sbsLine}</p>
        ${recs.bullets.length ? `<ul class="notes">${recs.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>` : ""}
      </div>
    </details>
  `;
  renderFlaggedRepsTable(key, bh);
}

function renderBookHealthPanel(_m) {
  /* consolidated into lookup panel */
}

function renderBookActionPanel(_m) {
  /* consolidated into lookup panel */
}

function renderFlaggedRepsTable(key, bh) {
  const wrap = document.getElementById("flagged-reps-wrap");
  const tbody = document.getElementById("flagged-reps-body");
  if (!wrap || !tbody) return;
  const reps = bh?.reps || [];
  if (!reps.length) {
    wrap.classList.add("hidden");
    tbody.innerHTML = "";
    return;
  }
  wrap.classList.remove("hidden");
  tbody.innerHTML = reps
    .slice(0, 25)
    .map(
      (r) => `<tr>
        <td>${r.sales_rep_id}</td>
        <td class="num">${fmtNum(r.pcid_count)}</td>
        <td class="num">${r.pqr_90d != null ? fmtMoney(r.pqr_90d) : "—"}</td>
        <td class="num">${fmtNum(r.ideal_pcid)}</td>
        <td>${r.too_big ? '<span class="rec rec-Optimize">Too big</span>' : ""}${r.too_little ? '<span class="rec rec-Hire">Too little</span>' : ""}</td>
        <td class="num">${r.peel_to_ideal ? fmtNum(r.peel_to_ideal) : "—"}</td>
        <td class="num">${r.grow_slots ? fmtNum(r.grow_slots) : "—"}</td>
      </tr>`,
    )
    .join("");
}

function renderFilters() {
  const segments = ["all", "M", "UMM", "ACC", "L", "NAM", "DCA", "ISDCA", "NAMDCA"];
  const recs = ["all", "Hire", "Hold", "Optimize", "Do Not Hire"];
  const regions = [
    { id: "global", label: "All markets" },
    { id: "amer", label: "AMER focus" },
  ];
  document.getElementById("region-filters").innerHTML = regions
    .map(
      (r) =>
        `<button class="chip${regionFilter === r.id ? " active" : ""}" data-region="${r.id}">${r.label}</button>`,
    )
    .join("");
  document.getElementById("segment-filters").innerHTML = segments
    .map(
      (s) =>
        `<button class="chip${segmentFilter === s ? " active" : ""}" data-segment="${s}">` +
        `${s === "all" ? "All segments" : s}</button>`,
    )
    .join("");
  document.getElementById("rec-filters").innerHTML = recs
    .map(
      (r) =>
        `<button class="chip${recFilter === r ? " active" : ""}" data-rec="${r}">` +
        `${r === "all" ? "All recs" : r}</button>`,
    )
    .join("");
}

function chartsAvailable() {
  return typeof Chart !== "undefined";
}

const CHART_JS_URLS = [
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js",
];

function loadScript(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), timeoutMs);
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
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
      /* try next CDN */
    }
  }
  return false;
}

function bookGapPct(m) {
  if (!m.perfect_book_target) return null;
  return Math.round((m.current_avg_book / m.perfect_book_target) * 100);
}

function keyFinding(m) {
  return m.recommendation_primary || m.hc_reason_primary || m.summary_primary || "—";
}

function curveValidatedLabel(m) {
  const validated = m.hc_curve_validated !== false;
  const src = m.perfect_book_source || "—";
  return validated ? `Yes · ${src}` : `No · ${src}`;
}

function findingsMarkets() {
  return (payload?.markets ?? [])
    .filter((m) => {
      if (hideJapan && isJapan(m)) return false;
      if (findingsAmerOnly && !amerMarkets().includes(m.country)) return false;
      return true;
    })
    .sort((a, b) => {
      const col = findingsSortCol;
      const dir = findingsSortDir === "asc" ? 1 : -1;
      if (col === "market") {
        const ak = marketKey(a);
        const bk = marketKey(b);
        return ak.localeCompare(bk) * dir;
      }
      if (col === "headcount_recommendation" || col === "hc_curve_validated") {
        const av = col === "hc_curve_validated" ? curveValidatedLabel(a) : a.headcount_recommendation || "";
        const bv = col === "hc_curve_validated" ? curveValidatedLabel(b) : b.headcount_recommendation || "";
        return av.localeCompare(bv) * dir;
      }
      const av =
        col === "avg_pcid"
          ? a.avg_pcid_per_rep ?? a.current_avg_book
          : col === "ideal_pcid"
            ? idealPcid(a)
            : a[col];
      const bv =
        col === "avg_pcid"
          ? b.avg_pcid_per_rep ?? b.current_avg_book
          : col === "ideal_pcid"
            ? idealPcid(b)
            : b[col];
      const an = Number(av);
      const bn = Number(bv);
      if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
}

function renderFindings() {
  const tbody = document.getElementById("findings-body");
  if (!tbody || !payload) return;
  const amer = amerMarkets();
  tbody.innerHTML = findingsMarkets()
    .map((m) => {
      const gap = m.headcount_gap;
      const gapStr = gap > 0 ? "+" + fmtNum(gap) : fmtNum(gap);
      const recClass = hcRecClass(m);
      const avgPcid = m.avg_pcid_per_rep ?? m.current_avg_book;
      const ideal = idealPcid(m);
      const usRow = m.country === "US" ? " findings-us-row" : "";
      const amerRow = amer.includes(m.country) ? " findings-amer-row" : "";
      const validated = m.hc_curve_validated !== false;
      return `<tr class="${usRow}${amerRow}">
        <td class="sticky-col"><strong>${m.country}-${m.segment}</strong></td>
        <td class="num">${fmtMoney(m.revenue_90d)}</td>
        <td class="num">${fmtNum(m.current_reps)}</td>
        <td class="num">${fmtNum(avgPcid)}</td>
        <td class="num">${fmtNum(ideal)}</td>
        <td class="num">${fmtNum(m.optimal_headcount)}</td>
        <td class="num">${gapStr}</td>
        <td><span class="rec rec-${recClass}">${hcRecLabel(m)}</span></td>
        <td><span class="curve-validated curve-validated-${validated ? "yes" : "no"}">${curveValidatedLabel(m)}</span></td>
        <td class="num">${fmtNum(m.growth_peak_accounts)}</td>
        <td class="findings-narrative">${keyFinding(m)}</td>
      </tr>`;
    })
    .join("");

  document.querySelectorAll("#findings-table th.sortable").forEach((th) => {
    th.classList.toggle("sort-asc", th.dataset.sort === findingsSortCol && findingsSortDir === "asc");
    th.classList.toggle("sort-desc", th.dataset.sort === findingsSortCol && findingsSortDir === "desc");
  });
}

function renderTable() {
  const tbody = document.getElementById("market-body");
  tbody.innerHTML = filteredMarkets()
    .map((m) => {
      const gap = m.headcount_gap;
      const gapStr = gap > 0 ? "+" + fmtNum(gap) : fmtNum(gap);
      const isLookupRow =
        m.country === lookupCountry && m.segment === lookupSegment;
      const hcStatus = m.summary_status || "—";
      const sbsFlag = sbsOppLabel(m);
      const hcClass = hcStatusClass(hcStatus).replace("summary-", "");
      return `<tr${isLookupRow ? ' class="lookup-row"' : ""}>
        <td class="sticky-col">${m.country}-${m.segment}</td>
        <td><span class="hc-verdict hc-verdict-${hcClass}">${hcStatus}</span></td>
        <td class="num highlight-col"><strong>${fmtNum(m.optimal_headcount)}</strong></td>
        <td class="num">${fmtNum(m.current_reps)}</td>
        <td class="num">${gapStr}</td>
        <td><span class="rec rec-${hcRecClass(m)}">${hcRecLabel(m)}</span></td>
        <td class="num">${fmtNum(m.current_avg_book)} / ${fmtNum(idealPcid(m))}</td>
        <td class="sbs-opp-cell${buildSbsRouting(m).hasOpp ? " sbs-opp-yes" : ""}">${sbsFlag}</td>
      </tr>`;
    })
    .join("");
}

function renderGapChart() {
  if (!chartsAvailable()) return;
  const ctx = document.getElementById("gap-chart");
  if (!ctx) return;
  const markets = [...filteredMarkets()]
    .sort((a, b) => Math.abs(b.headcount_gap) - Math.abs(a.headcount_gap))
    .slice(0, 12);
  if (gapChart) gapChart.destroy();
  gapChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: markets.map((m) => `${m.country}-${m.segment}`),
      datasets: [
        {
          label: "Headcount gap (reps)",
          data: markets.map((m) => m.headcount_gap),
          backgroundColor: markets.map((m) =>
            m.headcount_gap > 0 ? REC_COLORS.Optimize : REC_COLORS.Hire,
          ),
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          title: { display: true, text: "Gap (reps)", color: CHART_TICK },
          ticks: { color: CHART_TICK },
          grid: { color: CHART_GRID },
        },
        y: { ticks: { color: CHART_TICK, font: { size: 11 } }, grid: { display: false } },
      },
    },
  });
}

function renderRecChart() {
  if (!chartsAvailable()) return;
  const markets = filteredMarkets();
  const counts = {};
  markets.forEach((m) => {
    const key = m.recommended_action || m.headcount_recommendation;
    counts[key] = (counts[key] || 0) + 1;
  });
  const labels = Object.keys(counts).slice(0, 6);
  const ctx = document.getElementById("rec-chart");
  if (recChart) recChart.destroy();
  recChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: labels.map((l) => counts[l]),
          backgroundColor: ["#4c8bf5", "#3ecf8e", "#f5a623", "#6eb5ff", "#f07178", CHART_TICK],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: CHART_TICK, boxWidth: 10, font: { size: 10 } } },
      },
    },
  });
}

function renderSbsChart() {
  if (!chartsAvailable()) return;
  const ctx = document.getElementById("sbs-chart");
  const markets = filteredMarkets().filter((m) => (m.sbs_whitespace_country ?? m.sbs_whitespace) > 0);
  const rows = markets.length
    ? markets.slice(0, 10)
    : (payload.sbs_whitespace || []).slice(0, 10);
  if (sbsChart) sbsChart.destroy();
  sbsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: rows.map((r) => (r.country ? `${r.country}-${r.segment}` : r.segment)),
      datasets: [
        {
          label: "SBS accounts (country × segment)",
          data: rows.map((r) => r.sbs_whitespace_country ?? r.accounts ?? r.sbs_whitespace),
          backgroundColor: "#4c8bf5",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          title: { display: true, text: "Unassigned accounts", color: CHART_TICK },
          ticks: { color: CHART_TICK },
          grid: { color: CHART_GRID },
        },
        x: { ticks: { color: CHART_TICK, font: { size: 10 } }, grid: { display: false } },
      },
    },
  });
}

function renderBookScoreChart() {
  if (!chartsAvailable()) return;
  const markets = [...filteredMarkets()]
    .filter((m) => m.avg_pct_book_built != null)
    .sort((a, b) => b.revenue_90d - a.revenue_90d)
    .slice(0, 10);
  const ctx = document.getElementById("book-score-chart");
  if (!ctx) return;
  if (bookScoreChart) bookScoreChart.destroy();
  if (!markets.length) return;
  bookScoreChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: markets.map((m) => `${m.country}-${m.segment}`),
      datasets: [
        {
          label: "FY26 % book built (policy)",
          data: markets.map((m) => m.avg_pct_book_built),
          backgroundColor: "#4c8bf5",
        },
        {
          label: "Avg book vs data perfect (%)",
          data: markets.map((m) => bookGapPct(m)),
          backgroundColor: "#f5a623",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: CHART_TICK, font: { size: 11 } } },
      },
      scales: {
        y: {
          title: { display: true, text: "Percent", color: CHART_TICK },
          ticks: { color: CHART_TICK },
          grid: { color: CHART_GRID },
        },
        x: { ticks: { color: CHART_TICK, font: { size: 10 } }, grid: { display: false } },
      },
    },
  });
}

function renderAll() {
  renderMeta();
  renderLookup();
  renderBookHealth();
  renderHeadline();
  renderKpis();
  renderFilters();
  renderTable();
  renderFindings();
  renderCharts();
}

function bindEvents() {
  document.getElementById("hide-jp").addEventListener("change", (e) => {
    hideJapan = e.target.checked;
    renderAll();
  });
  const findingsAmerEl = document.getElementById("findings-amer-only");
  if (findingsAmerEl) {
    findingsAmerEl.addEventListener("change", (e) => {
      findingsAmerOnly = e.target.checked;
      renderFindings();
    });
  }
  const findingsTable = document.getElementById("findings-table");
  if (findingsTable) {
    findingsTable.querySelector("thead").addEventListener("click", (e) => {
      const th = e.target.closest("th.sortable");
      if (!th) return;
      const col = th.dataset.sort;
      if (findingsSortCol === col) {
        findingsSortDir = findingsSortDir === "asc" ? "desc" : "asc";
      } else {
        findingsSortCol = col;
        findingsSortDir = col === "market" || col === "headcount_recommendation" || col === "hc_curve_validated" ? "asc" : "desc";
      }
      renderFindings();
    });
  }
  document.getElementById("sort-by").addEventListener("change", (e) => {
    sortBy = e.target.value;
    renderAll();
  });
  document.getElementById("refresh-btn").addEventListener("click", refreshData);
  document.getElementById("lookup-country").addEventListener("change", (e) => {
    lookupCountry = e.target.value;
    renderAll();
  });
  document.getElementById("lookup-segment").addEventListener("change", (e) => {
    lookupSegment = e.target.value;
    renderAll();
  });
  const bhCountry = document.getElementById("bh-country");
  const bhSegment = document.getElementById("bh-segment");
  if (bhCountry) {
    bhCountry.addEventListener("change", (e) => {
      lookupCountry = e.target.value;
      document.getElementById("lookup-country").value = lookupCountry;
      renderAll();
    });
  }
  if (bhSegment) {
    bhSegment.addEventListener("change", (e) => {
      lookupSegment = e.target.value;
      document.getElementById("lookup-segment").value = lookupSegment;
      renderAll();
    });
  }
  document.getElementById("region-filters").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-region]");
    if (!btn) return;
    regionFilter = btn.dataset.region;
    renderAll();
  });
  document.getElementById("segment-filters").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-segment]");
    if (!btn) return;
    segmentFilter = btn.dataset.segment;
    renderAll();
  });
  document.getElementById("rec-filters").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-rec]");
    if (!btn) return;
    recFilter = btn.dataset.rec;
    renderAll();
  });
  document.querySelectorAll(".dash-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const id = tab.dataset.tab;
      document.querySelectorAll(".dash-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === id));
      document.getElementById("tab-markets").classList.toggle("hidden", id !== "overview");
      document.getElementById("tab-markets").classList.toggle("active", id === "overview");
      document.getElementById("tab-findings").classList.toggle("hidden", id !== "findings");
      document.getElementById("tab-findings").classList.toggle("active", id === "findings");
      document.getElementById("tab-book-health").classList.toggle("hidden", id !== "curves");
      document.getElementById("tab-book-health").classList.toggle("active", id === "curves");
      document.getElementById("tab-reference").classList.toggle("hidden", id !== "reference");
      document.getElementById("tab-reference").classList.toggle("active", id === "reference");
      if (id === "curves") {
        renderBookHealth();
        renderBookHealthCharts();
      }
      if (id === "reference") {
        renderSources();
      }
    });
  });
}

function renderCharts() {
  renderGapChart();
}

async function init() {
  try {
    await loadConfig();
    await loadData();
  } catch (err) {
    document.querySelector(".container").innerHTML =
      `<div class="error"><strong>Failed to load dashboard data.</strong> ${err.message}</div>`;
    return;
  }

  try {
    bindEvents();
    renderMeta();
    renderLookup();
    renderHeadline();
    renderKpis();
    renderFilters();
    renderTable();
    renderFindings();
  } catch (err) {
    showToast(err.message || "Dashboard render failed", "err");
    return;
  }

  const chartsOk = await ensureChartJs();
  if (chartsOk) {
    try {
      renderCharts();
    } catch (err) {
      showToast(err.message || "Charts failed to render", "warn");
    }
  } else {
    showToast(
      "Charts unavailable (Chart.js CDN blocked). Tables and KPIs still work — try another network or VPN.",
      "warn",
    );
  }
}

init();
