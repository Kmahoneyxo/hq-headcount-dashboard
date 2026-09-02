/** Live Google Sheet CSV fetch + country-level cross-check for all markets. */
(function (global) {
  const SHEET_ID_DEFAULT = "1Hq64TSm77FVH4hLxME2wrs1bJbT8Qi9Puk4FWMdkGsw";

  function looksLikeCsv(text) {
    const t = (text || "").trimStart();
    return t.length > 0 && !t.startsWith("<!") && !t.startsWith("<html") && t.includes(",");
  }

  function csvUrlVariants(sheetId, gid) {
    const id = sheetId || SHEET_ID_DEFAULT;
    return [
      `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`,
      `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`,
      `https://docs.google.com/spreadsheets/d/${id}/pub?gid=${gid}&single=true&output=csv`,
    ];
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const next = text[i + 1];
      if (inQuotes) {
        if (c === '"' && next === '"') {
          field += '"';
          i++;
        } else if (c === '"') {
          inQuotes = false;
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || (c === "\r" && next === "\n")) {
        row.push(field);
        field = "";
        if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
        row = [];
        if (c === "\r") i++;
      } else {
        field += c;
      }
    }
    row.push(field);
    if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
    return rows;
  }

  function normHeader(h) {
    return String(h || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function parseNum(raw) {
    if (raw == null || String(raw).trim() === "") return null;
    const s = String(raw).replace(/,/g, "").trim();
    const n = Number(s);
    return Number.isFinite(n) ? (n === Math.floor(n) ? Math.trunc(n) : n) : null;
  }

  /** Capacity_Dashboard pivot export: market in col 9, rep count in col 10 (0-based). */
  function parseCapacityPivotRows(rows) {
    const totals = {};
    for (const row of rows) {
      if (!row || row.length < 11) continue;
      const market = String(row[9] ?? "").trim();
      const count = parseNum(row[10]);
      if (!market || market === "Market" || market === "Grand Total" || market.length > 4) continue;
      if (count != null) totals[market.toUpperCase()] = count;
    }
    return totals;
  }

  /** Header-based: Market + COUNTA of Rep Name / Number of Reps. */
  function parseCapacityHeaderRows(rows) {
    if (!rows.length) return {};
    const headers = rows[0].map(normHeader);
    let marketIdx = headers.findIndex((h) => h === "market" || h.startsWith("market"));
    let countIdx = headers.findIndex(
      (h) => h.includes("counta of rep") || h === "number of reps" || h.includes("rep count"),
    );
    if (marketIdx < 0 || countIdx < 0) return {};
    const totals = {};
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const market = String(row[marketIdx] ?? "").trim();
      const count = parseNum(row[countIdx]);
      if (!market || count == null) continue;
      const code = market.length <= 4 ? market.toUpperCase() : market.slice(0, 3).toUpperCase();
      totals[code] = count;
    }
    return totals;
  }

  function parseCapacityCountryTotals(rows) {
    const fromHeader = parseCapacityHeaderRows(rows);
    if (Object.keys(fromHeader).length) return fromHeader;
    return parseCapacityPivotRows(rows);
  }

  function dashboardCountryRepTotals(markets) {
    const totals = {};
    for (const m of markets || []) {
      const c = m.country;
      if (!c) continue;
      totals[c] = (totals[c] || 0) + (Number(m.current_reps) || 0);
    }
    return totals;
  }

  function buildCountryChecks(sheetTotals, dashTotals) {
    const allCountries = new Set([...Object.keys(sheetTotals), ...Object.keys(dashTotals)]);
    const checks = {};
    for (const country of allCountries) {
      const sheetReps = sheetTotals[country] ?? null;
      const dashboardReps = dashTotals[country] ?? null;
      checks[country] = {
        sheet_reps: sheetReps,
        dashboard_reps: dashboardReps,
        match:
          sheetReps != null &&
          dashboardReps != null &&
          Math.round(sheetReps) === Math.round(dashboardReps),
      };
    }
    return checks;
  }

  async function fetchCsvFromUrl(url) {
    const res = await fetch(url, { cache: "no-store", mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!looksLikeCsv(text)) throw new Error("Not CSV (login or HTML)");
    return { text, url };
  }

  async function fetchCsvFromSheet(sheetId, gid) {
    const urls = csvUrlVariants(sheetId, gid);
    let lastErr = null;
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: "no-store", mode: "cors" });
        if (!res.ok) {
          lastErr = new Error(`HTTP ${res.status}`);
          continue;
        }
        const text = await res.text();
        if (!looksLikeCsv(text)) {
          lastErr = new Error("Not CSV (login or HTML)");
          continue;
        }
        return { text, url };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Could not fetch published sheet CSV");
  }

  function resolveCsvTargets(config) {
    const sheetId = config.reference_sheet_id || SHEET_ID_DEFAULT;
    if (Array.isArray(config.reference_sheet_csv_urls) && config.reference_sheet_csv_urls.length) {
      return config.reference_sheet_csv_urls.map((entry) => {
        if (typeof entry === "string") {
          if (entry.startsWith("http")) {
            return { role: "capacity", name: "Sheet", gid: null, url: entry };
          }
          return {
            role: "capacity",
            name: "Sheet",
            gid: entry,
            url: csvUrlVariants(sheetId, entry)[0],
          };
        }
        const gid = entry.gid ?? entry.id;
        return {
          role: entry.role || "capacity",
          name: entry.name || entry.role || "Sheet",
          gid,
          url: entry.url || (gid != null ? csvUrlVariants(sheetId, gid)[0] : null),
        };
      });
    }
    const gids = config.reference_sheet_gids || { capacity: "0" };
    return Object.entries(gids).map(([role, gid]) => ({
      role,
      name: role,
      gid,
      url: csvUrlVariants(sheetId, gid)[0],
    }));
  }

  async function fetchLiveReferenceCheck(config, markets, cachedFallback) {
    if (!config.reference_sheet_live) {
      return { check: cachedFallback, source: "cached", error: null };
    }

    const targets = resolveCsvTargets(config);
    const dashTotals = dashboardCountryRepTotals(markets);
    let sheetTotals = {};
    const sheets = [];
    const fetched = [];
    const errors = [];

    for (const target of targets) {
      if (target.role !== "capacity" && target.role !== "capacity_dashboard") continue;
      try {
        const sheetId = config.reference_sheet_id || SHEET_ID_DEFAULT;
        const gid = target.gid ?? "0";
        const { text, url } =
          target.url && target.url.startsWith("http") && target.gid == null
            ? await fetchCsvFromUrl(target.url)
            : await fetchCsvFromSheet(sheetId, gid);
        const rows = parseCsv(text);
        const parsed = parseCapacityCountryTotals(rows);
        sheetTotals = { ...sheetTotals, ...parsed };
        fetched.push({ name: target.name, gid, url, rows: rows.length });
        const matched = Object.keys(parsed).filter(
          (c) => dashTotals[c] != null && Math.round(parsed[c]) === Math.round(dashTotals[c]),
        ).length;
        const mismatched = Object.keys(parsed).filter(
          (c) => dashTotals[c] != null && Math.round(parsed[c]) !== Math.round(dashTotals[c]),
        ).length;
        sheets.push({
          role: "global_capacity_dashboard",
          name: target.name,
          skipped: false,
          sheet_rows: Object.keys(parsed).length,
          dashboard_rows: Object.keys(dashTotals).length,
          matched,
          mismatched,
          missing_in_dashboard: 0,
          compare_fields: ["current_reps_sum"],
          mismatch_samples: Object.keys(parsed)
            .filter((c) => dashTotals[c] != null && Math.round(parsed[c]) !== Math.round(dashTotals[c]))
            .slice(0, 30)
            .map((c) => ({
              key: c,
              diffs: [{ field: "current_reps_sum", sheet: parsed[c], dashboard: dashTotals[c] }],
            })),
          note: "Live Capacity_Dashboard country rep counts vs sum of segment current_reps.",
          live_url: url,
        });
      } catch (e) {
        errors.push(`${target.name}: ${e.message || e}`);
      }
    }

    if (!Object.keys(sheetTotals).length) {
      return {
        check: cachedFallback,
        source: cachedFallback ? "cached" : "none",
        error: errors.join("; ") || "No capacity tab fetched",
      };
    }

    const countryChecks = buildCountryChecks(sheetTotals, dashTotals);
    const rowsMatched = Object.values(countryChecks).filter((c) => c.match).length;
    const rowsMismatched = Object.values(countryChecks).filter(
      (c) => c.sheet_reps != null && c.dashboard_reps != null && !c.match,
    ).length;

    const check = {
      source_type: "workbook",
      workbook_format: "global_headcount",
      reference_label: config.reference_workbook_label || "Global Sales Rep Headcount (1)",
      source_url: config.reference_sheet_url,
      source_live: true,
      live_fetched_at: new Date().toISOString(),
      live_urls: fetched,
      country_checks: countryChecks,
      sheets,
      workbook_summary: {
        sheets_compared: sheets.length,
        rows_matched: rowsMatched,
        rows_mismatched: rowsMismatched,
        sheets_skipped: [],
      },
      imported_at: new Date().toISOString().slice(0, 10),
      dashboard_snapshot: cachedFallback?.dashboard_snapshot,
    };

    return { check, source: "live", error: errors.length ? errors.join("; ") : null };
  }

  async function fetchAppsScriptPayload(config) {
    const url = (config.reference_apps_script_url || "").trim();
    if (!url) return { data: null, error: "No reference_apps_script_url in config" };
    try {
      const fetchUrl = url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
      const res = await fetch(fetchUrl, { cache: "no-store", redirect: "follow" });
      const text = await res.text();
      if (!res.ok || text.trimStart().startsWith("<")) {
        throw new Error("Apps Script returned HTML — redeploy with Who has access: Anyone");
      }
      return { data: JSON.parse(text), error: null };
    } catch (e) {
      return { data: null, error: e.message || String(e) };
    }
  }

  global.ReferenceLive = {
    fetchAppsScriptPayload,
    fetchLiveReferenceCheck,
    dashboardCountryRepTotals,
    buildCountryChecks,
    parseCapacityCountryTotals,
    looksLikeCsv,
  };
})(typeof window !== "undefined" ? window : globalThis);
