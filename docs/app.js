let payload = null;
let config = { refresh_api: null, live_refresh: false };
let segmentFilter = "all";
let recFilter = "all";
let regionFilter = "amer";
let hideJapan = true;
let sortBy = "ideal_hc";
let lookupCountry = "US";
let lookupSegment = "M";
let gapChart = null;
let recChart = null;
let sbsChart = null;
let bookScoreChart = null;
let lastLoadedAt = null;
let isRefreshing = false;

const AMER_MARKETS = ["US", "CA", "UK", "DACH", "BNL"];

const REC_COLORS = {
  Hire: "#3ecf8e",
  Optimize: "#f5a623",
  Hold: "#6eb5ff",
  "Do Not Hire": "#f07178",
};

async function loadConfig() {
  try {
    const res = await fetch("./data/config.json?" + Date.now());
    if (res.ok) config = await res.json();
  } catch {
    /* static hosting — no config */
  }
}

async function loadData() {
  const res = await fetch("./data/headcount.json?" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load headcount.json");
  payload = await res.json();
  lastLoadedAt = new Date();
}

function showToast(message, tone = "ok") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = "toast " + tone;
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    el.className = "toast hidden";
  }, 6000);
}

function setRefreshLoading(loading) {
  isRefreshing = loading;
  const btn = document.getElementById("refresh-btn");
  const label = document.getElementById("refresh-label");
  btn.disabled = loading;
  btn.classList.toggle("loading", loading);
  label.textContent = loading ? "Refreshing…" : "Refresh data";
}

async function refreshData() {
  if (isRefreshing) return;
  setRefreshLoading(true);
  const previousUpdatedAt = payload?.updated_at;
  const previousRefreshedAt = payload?.refreshed_at;
  try {
    if (config.refresh_api) {
      showToast("Running query 16 against warehouse…", "warn");
      const res = await fetch(config.refresh_api, { method: "POST", cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body.error || "Refresh API failed");
      }
    }
    await loadData();
    renderAll();
    const loaded = lastLoadedAt.toLocaleTimeString();
    if (
      payload.updated_at !== previousUpdatedAt ||
      payload.refreshed_at !== previousRefreshedAt
    ) {
      showToast(
        `Data updated · snapshot ${payload.updated_at}${payload.refreshed_at ? " · pulled " + payload.refreshed_at : ""} · loaded ${loaded}`,
        "ok",
      );
    } else if (config.refresh_api && config.live_refresh) {
      showToast(`Up to date · snapshot ${payload.updated_at} · loaded ${loaded}`, "ok");
    } else if (config.refresh_api) {
      showToast(
        `Loaded latest file · ${payload.updated_at}. Set QUEST_AUTH_TOKEN on the server for warehouse refresh.`,
        "warn",
      );
    } else {
      showToast(
        `Already on latest snapshot (${payload.updated_at}). For warehouse refresh, run python3 scripts/dashboard-server.py`,
        "warn",
      );
    }
  } catch (err) {
    showToast(err.message || "Refresh failed", "err");
  } finally {
    setRefreshLoading(false);
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
  return payload.markets
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
  const loaded = lastLoadedAt ? ` · Browser loaded ${lastLoadedAt.toLocaleTimeString()}` : "";
  const live = config.live_refresh ? " · Live refresh on" : "";
  const region = regionFilter === "amer" ? " · AMER focus" : " · Global";
  el.textContent =
    `Ideal headcount by country × segment · ${payload.window} · Snapshot ${payload.updated_at}${region}${loaded}${live} · ${filteredMarkets().length} markets shown`;
  document.getElementById("refresh-note").textContent = config.refresh_api
    ? "Refresh pulls query 16 from the warehouse when dashboard-server.py is running with QUEST_AUTH_TOKEN."
    : "On GitHub Pages, Refresh reloads the latest JSON file. Weekly Quest export → csv-to-dashboard-json.py → push.";
}

function renderHeadline() {
  const markets = filteredMarkets();
  const hire = markets.filter((m) => m.headcount_recommendation === "Hire");
  const optimize = markets.filter((m) => m.headcount_recommendation === "Optimize");
  const lookup = findLookupMarket();
  const lookupLine = lookup
    ? `<strong>${lookup.country}-${lookup.segment} ideal HC:</strong> ${fmtNum(lookup.optimal_headcount)} reps ` +
      `(ideal book ${fmtNum(lookup.perfect_book_target)}, current ${fmtNum(lookup.current_reps)}, gap ${lookup.headcount_gap > 0 ? "+" : ""}${fmtNum(lookup.headcount_gap)} ${lookup.headcount_recommendation}). `
    : "";
  document.getElementById("headline").innerHTML =
    lookupLine +
    `<strong>Filtered view:</strong> ${optimize.length} markets Optimize vs ${hire.length} Hire.` +
    (hire.length
      ? ` <strong>Hire:</strong> ${hire.slice(0, 5).map((m) => `${m.country}-${m.segment}`).join(", ")}${hire.length > 5 ? "…" : ""}.`
      : "");
}

function allMarketsForLookup() {
  return payload.markets.filter((m) => !hideJapan || !isJapan(m));
}

function findLookupMarket() {
  return allMarketsForLookup().find(
    (m) => m.country === lookupCountry && m.segment === lookupSegment,
  );
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
    return;
  }
  const gap = m.headcount_gap;
  const gapStr = gap > 0 ? "+" + fmtNum(gap) : fmtNum(gap);
  const recClass = m.headcount_recommendation.replace(/ /g, "\\ ");
  el.innerHTML = `
    <div class="lookup-market">${m.country}-${m.segment}</div>
    <div class="lookup-grid">
      <div class="lookup-stat primary">
        <div class="lookup-stat-value">${fmtNum(m.optimal_headcount)}</div>
        <div class="lookup-stat-label">Ideal headcount</div>
      </div>
      <div class="lookup-stat">
        <div class="lookup-stat-value">${fmtNum(m.current_reps)}</div>
        <div class="lookup-stat-label">Current reps</div>
      </div>
      <div class="lookup-stat">
        <div class="lookup-stat-value">${gapStr}</div>
        <div class="lookup-stat-label">Gap (reps)</div>
      </div>
      <div class="lookup-stat">
        <div class="lookup-stat-value">${fmtNum(m.perfect_book_target)}</div>
        <div class="lookup-stat-label">Ideal book (accounts/rep)</div>
      </div>
      <div class="lookup-stat">
        <div class="lookup-stat-value"><span class="rec rec-${recClass}">${m.headcount_recommendation}</span></div>
        <div class="lookup-stat-label">Recommendation</div>
      </div>
      <div class="lookup-stat">
        <div class="lookup-stat-value">${m.avg_pct_book_built != null ? m.avg_pct_book_built.toFixed(1) + "%" : "—"}</div>
        <div class="lookup-stat-label">FY26 % book built</div>
      </div>
    </div>
    <p class="lookup-formula">Formula: ${fmtNum(m.assigned_accounts)} assigned accounts ÷ ${fmtNum(m.perfect_book_target)} ideal book = ${fmtNum(m.optimal_headcount)} ideal HC</p>
  `;
}

function renderKpis() {
  const markets = filteredMarkets();
  const lookup = findLookupMarket();
  const hire = markets.filter((m) => m.headcount_recommendation === "Hire");
  const over = markets.reduce((s, m) => s + Math.max(0, m.headcount_gap), 0);
  const idealTotal = markets.reduce((s, m) => s + (m.optimal_headcount || 0), 0);
  const currentTotal = markets.reduce((s, m) => s + (m.current_reps || 0), 0);
  document.getElementById("kpis").innerHTML = `
    <div class="kpi primary"><div class="kpi-value">${lookup ? fmtNum(lookup.optimal_headcount) : "—"}</div><div class="kpi-label">${lookup ? `${lookup.country}-${lookup.segment} ideal HC` : "Lookup ideal HC"}</div></div>
    <div class="kpi"><div class="kpi-value">${fmtNum(idealTotal)}</div><div class="kpi-label">Ideal HC (filtered total)</div></div>
    <div class="kpi"><div class="kpi-value">${fmtNum(currentTotal)}</div><div class="kpi-label">Current reps (filtered)</div></div>
    <div class="kpi hire"><div class="kpi-value">${hire.length}</div><div class="kpi-label">Hire markets</div></div>
    <div class="kpi optimize"><div class="kpi-value">+${fmtNum(over)}</div><div class="kpi-label">Over-staffed reps</div></div>
  `;
}

function renderFilters() {
  const segments = ["all", "S", "M", "L", "XL"];
  const recs = ["all", "Hire", "Hold", "Optimize", "Do Not Hire"];
  const regions = [
    { id: "amer", label: "AMER focus" },
    { id: "global", label: "Global" },
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

function bookGapPct(m) {
  if (!m.perfect_book_target) return null;
  return Math.round((m.current_avg_book / m.perfect_book_target) * 100);
}

function renderTable() {
  const tbody = document.getElementById("market-body");
  tbody.innerHTML = filteredMarkets()
    .map((m) => {
      const gap = m.headcount_gap;
      const gapStr = gap > 0 ? "+" + fmtNum(gap) : fmtNum(gap);
      const bucket = (m.perfect_book_bucket || "").replace(/^\d+:\s*/, "");
      const gapPct = bookGapPct(m);
      const fy26Target = m.fy26_target_pct_book_built;
      const built = m.avg_pct_book_built;
      const fy26Cell =
        built != null
          ? `${built.toFixed(1)}%${fy26Target != null ? " / " + fy26Target + "% tgt" : ""}`
          : "—";
      const fy26Score =
        m.avg_fy26_book_score != null ? m.avg_fy26_book_score.toFixed(3) : "—";
      const isLookupRow =
        m.country === lookupCountry && m.segment === lookupSegment;
      return `<tr${isLookupRow ? ' class="lookup-row"' : ""}>
        <td class="sticky-col">${m.country}-${m.segment}</td>
        <td class="num highlight-col"><strong>${fmtNum(m.optimal_headcount)}</strong></td>
        <td class="num">${fmtNum(m.current_reps)}</td>
        <td class="num">${gapStr}</td>
        <td><span class="rec rec-${m.headcount_recommendation.replace(/ /g, "\\ ")}">${m.headcount_recommendation}</span></td>
        <td class="num">${bucket} (${fmtNum(m.perfect_book_target)})${gapPct != null ? `<br><span class="sub">${gapPct}% of ideal</span>` : ""}</td>
        <td class="num">${fmtNum(m.current_avg_book)}</td>
        <td class="num">${fy26Cell}</td>
        <td class="num">${fy26Score}</td>
        <td class="num">${fmtNum(m.headroom_accounts)}</td>
        <td class="num">${fmtNum(m.sbs_whitespace_country ?? m.sbs_whitespace)}</td>
        <td><span class="status status-${(m.opp_pipeline_status || "unknown").toLowerCase()}">${m.opp_pipeline_status || "—"}</span></td>
        <td><span class="status status-${(m.coverage_status || "unknown").toLowerCase()}">${m.coverage_status || "—"}</span></td>
        <td class="action-cell">${m.recommended_action || m.book_score_action || "—"}</td>
      </tr>`;
    })
    .join("");
}

function renderGapChart() {
  const markets = [...filteredMarkets()]
    .sort((a, b) => Math.abs(b.headcount_gap) - Math.abs(a.headcount_gap))
    .slice(0, 12);
  const ctx = document.getElementById("gap-chart");
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
          title: { display: true, text: "Gap (reps)", color: "#9aa3b5" },
          ticks: { color: "#9aa3b5" },
          grid: { color: "#2a3040" },
        },
        y: { ticks: { color: "#9aa3b5", font: { size: 11 } }, grid: { display: false } },
      },
    },
  });
}

function renderRecChart() {
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
          backgroundColor: ["#4c8bf5", "#3ecf8e", "#f5a623", "#6eb5ff", "#f07178", "#9aa3b5"],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: "#9aa3b5", boxWidth: 10, font: { size: 10 } } },
      },
    },
  });
}

function renderSbsChart() {
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
          title: { display: true, text: "Unassigned accounts", color: "#9aa3b5" },
          ticks: { color: "#9aa3b5" },
          grid: { color: "#2a3040" },
        },
        x: { ticks: { color: "#9aa3b5", font: { size: 10 } }, grid: { display: false } },
      },
    },
  });
}

function renderBookScoreChart() {
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
        legend: { labels: { color: "#9aa3b5", font: { size: 11 } } },
      },
      scales: {
        y: {
          title: { display: true, text: "Percent", color: "#9aa3b5" },
          ticks: { color: "#9aa3b5" },
          grid: { color: "#2a3040" },
        },
        x: { ticks: { color: "#9aa3b5", font: { size: 10 } }, grid: { display: false } },
      },
    },
  });
}

function renderAll() {
  renderMeta();
  renderLookup();
  renderHeadline();
  renderKpis();
  renderFilters();
  renderTable();
  renderGapChart();
  renderBookScoreChart();
  renderRecChart();
  renderSbsChart();
}

function bindEvents() {
  document.getElementById("hide-jp").addEventListener("change", (e) => {
    hideJapan = e.target.checked;
    renderAll();
  });
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
}

async function init() {
  try {
    await loadConfig();
    await loadData();
    bindEvents();
    renderAll();
  } catch (err) {
    document.querySelector(".container").innerHTML =
      `<div class="error"><strong>Failed to load dashboard data.</strong> ${err.message}</div>`;
  }
}

init();
