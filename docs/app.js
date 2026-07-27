let payload = null;
let config = { refresh_api: null, live_refresh: false };
let segmentFilter = "all";
let recFilter = "all";
let hideJapan = true;
let sortBy = "revenue";
let gapChart = null;
let recChart = null;
let sbsChart = null;
let lastLoadedAt = null;
let isRefreshing = false;

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
      showToast("Running query 10 against warehouse…", "warn");
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
        `Already on latest snapshot (${payload.updated_at}). For warehouse refresh, run: python3 scripts/dashboard-server.py`,
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
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return "$" + Math.round(n / 1e6) + "M";
  if (n >= 1e3) return "$" + Math.round(n / 1e3) + "K";
  return "$" + Math.round(n);
}

function fmtNum(n) {
  return Number(n).toLocaleString("en-US");
}

function isJapan(m) {
  return m.country === "JP";
}

function filteredMarkets() {
  return payload.markets
    .filter((m) => {
      if (hideJapan && isJapan(m)) return false;
      if (segmentFilter !== "all" && m.segment !== segmentFilter) return false;
      if (recFilter !== "all" && m.headcount_recommendation !== recFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "gap") return Math.abs(b.headcount_gap) - Math.abs(a.headcount_gap);
      if (sortBy === "reps") return b.current_reps - a.current_reps;
      return b.revenue_90d - a.revenue_90d;
    });
}

function renderMeta() {
  const el = document.getElementById("meta-line");
  const loaded = lastLoadedAt ? ` · Browser loaded ${lastLoadedAt.toLocaleTimeString()}` : "";
  const live = config.live_refresh ? " · Live refresh on" : "";
  el.textContent =
    `Perfect book + optimal headcount · ${payload.window} · Snapshot ${payload.updated_at}${loaded}${live} · ${payload.markets.length} markets`;
  document.getElementById("refresh-note").textContent = config.refresh_api
    ? "Refresh pulls query 10 from the warehouse when dashboard-server.py is running with QUEST_AUTH_TOKEN."
    : `On GitHub Pages, Refresh reloads the latest JSON file. For warehouse pull, run python3 scripts/dashboard-server.py locally.`;
}

function renderHeadline() {
  const markets = filteredMarkets();
  const hire = markets.filter((m) => m.headcount_recommendation === "Hire");
  const optimize = markets.filter((m) => m.headcount_recommendation === "Optimize");
  const hireList = hire.slice(0, 6).map((m) => `${m.country}-${m.segment}`).join(", ");
  document.getElementById("headline").innerHTML =
    `<strong>Headline:</strong> ${optimize.length} markets show Optimize vs ${hire.length} Hire. ` +
    `Most top revenue markets are over-staffed relative to optimal book size — consolidate before net-new hires.` +
    (hire.length ? ` <strong>Hire:</strong> ${hireList}${hire.length > 6 ? "…" : ""}.` : "");
}

function renderKpis() {
  const markets = filteredMarkets();
  const hire = markets.filter((m) => m.headcount_recommendation === "Hire");
  const over = markets.reduce((s, m) => s + Math.max(0, m.headcount_gap), 0);
  const under = markets.reduce((s, m) => s + Math.abs(Math.min(0, m.headcount_gap)), 0);
  document.getElementById("kpis").innerHTML = `
    <div class="kpi"><div class="kpi-value">${markets.length}</div><div class="kpi-label">Markets shown</div></div>
    <div class="kpi hire"><div class="kpi-value">${hire.length}</div><div class="kpi-label">Hire markets</div></div>
    <div class="kpi optimize"><div class="kpi-value">+${fmtNum(over)}</div><div class="kpi-label">Over-staffed reps (Optimize)</div></div>
    <div class="kpi hire"><div class="kpi-value">−${fmtNum(under)}</div><div class="kpi-label">Under-staffed reps (Hire)</div></div>
  `;
}

function renderFilters() {
  const segments = ["all", "S", "M", "L", "XL"];
  const recs = ["all", "Hire", "Hold", "Optimize", "Do Not Hire"];
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

function renderTable() {
  const tbody = document.getElementById("market-body");
  tbody.innerHTML = filteredMarkets()
    .map((m) => {
      const gap = m.headcount_gap;
      const gapStr = gap > 0 ? "+" + fmtNum(gap) : fmtNum(gap);
      const bucket = (m.perfect_book_bucket || "").replace(/^\d+:\s*/, "");
      return `<tr>
        <td>${m.country}-${m.segment}</td>
        <td class="num">${fmtMoney(m.revenue_90d)}</td>
        <td class="num">${fmtNum(m.current_reps)}</td>
        <td class="num">${fmtNum(m.current_avg_book)}</td>
        <td class="num">${bucket} (${fmtNum(m.perfect_book_target)})</td>
        <td class="num">${fmtNum(m.optimal_headcount)}</td>
        <td class="num">${gapStr}</td>
        <td><span class="rec rec-${m.headcount_recommendation.replace(/ /g, "\\ ")}">${m.headcount_recommendation}</span></td>
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
      plugins: { legend: { display: false } },
      scales: {
        x: {
          title: { display: true, text: "Gap (reps)", color: "#9aa3b5" },
          ticks: { color: "#9aa3b5" },
          grid: { color: "#2a3040" },
        },
        y: { ticks: { color: "#9aa3b5" }, grid: { display: false } },
      },
    },
  });
}

function renderRecChart() {
  const markets = filteredMarkets();
  const counts = { Hire: 0, Optimize: 0, Hold: 0, "Do Not Hire": 0 };
  markets.forEach((m) => {
    counts[m.headcount_recommendation] = (counts[m.headcount_recommendation] || 0) + 1;
  });
  const labels = Object.keys(counts).filter((k) => counts[k] > 0);
  const ctx = document.getElementById("rec-chart");
  if (recChart) recChart.destroy();
  recChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: labels.map((l) => counts[l]),
          backgroundColor: labels.map((l) => REC_COLORS[l]),
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom", labels: { color: "#9aa3b5", boxWidth: 12 } },
      },
    },
  });
}

function renderSbsChart() {
  const ctx = document.getElementById("sbs-chart");
  const rows = payload.sbs_whitespace || [];
  if (sbsChart) sbsChart.destroy();
  sbsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: rows.map((r) => r.segment),
      datasets: [
        {
          label: "Unassigned accounts",
          data: rows.map((r) => r.accounts),
          backgroundColor: "#4c8bf5",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          title: { display: true, text: "Accounts", color: "#9aa3b5" },
          ticks: { color: "#9aa3b5" },
          grid: { color: "#2a3040" },
        },
        x: { ticks: { color: "#9aa3b5" }, grid: { display: false } },
      },
    },
  });
}

function renderAll() {
  renderMeta();
  renderHeadline();
  renderKpis();
  renderFilters();
  renderTable();
  renderGapChart();
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
