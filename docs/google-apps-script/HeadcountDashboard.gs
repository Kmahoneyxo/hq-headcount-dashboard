/**
 * HQ Headcount Dashboard — Live segment ideal-book API
 * Sheet: Global Sales Rep Headcount (1)
 * ID:  1Hq64TSm77FVH4hLxME2wrs1bJbT8Qi9Puk4FWMdkGsw
 *
 * DEPLOY (one-time, from the Google Sheet):
 * 1. Open the sheet → Extensions → Apps Script
 * 2. Paste this file as HeadcountDashboard.gs (delete default Code.gs or keep empty)
 * 3. Save → Deploy → New deployment → Web app
 *    Execute as: Me
 *    Who has access: Anyone  (required for GitHub Pages fetch; Indeed users can use Anyone with Google account)
 * 4. Copy Web app URL → docs/data/config.json → reference_apps_script_url
 * 5. Set reference_sheet_live: true → Reload sheet reference in dashboard
 *
 * Optional: add a "Markets" tab with columns country, segment, ideal_pcid, optimal_headcount,
 * growth_peak_accounts, growth_peak_pct, jv_plateau_book_max, jv_plateau_rev_per_job — overrides Rep_Level rollups.
 *
 * Warehouse snapshot (headcount.json) stays static until warehouse refresh; this API reads the live sheet.
 */

var SHEET_LABEL = 'Global Sales Rep Headcount (1)';
var KNOWN_SEGMENTS = ['M', 'UMM', 'ACC', 'L', 'NAM', 'DCA', 'ISDCA', 'NAMDCA'];

var PCID_BANDS = [
  { low: 1, high: 10, label: '1-10', mid: 5 },
  { low: 11, high: 20, label: '11-20', mid: 15 },
  { low: 21, high: 30, label: '21-30', mid: 25 },
  { low: 31, high: 40, label: '31-40', mid: 35 },
  { low: 41, high: 50, label: '41-50', mid: 45 },
  { low: 51, high: 60, label: '51-60', mid: 55 },
  { low: 61, high: 70, label: '61-70', mid: 65 },
  { low: 71, high: 80, label: '71-80', mid: 75 },
  { low: 81, high: 100, label: '81-100', mid: 90 },
  { low: 101, high: 125, label: '101-125', mid: 113 },
  { low: 126, high: 150, label: '126-150', mid: 138 },
  { low: 151, high: 9999, label: '150+', mid: 175 },
];

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var marketsTab = readMarketsTab_(ss);
  var repRows = readRepLevel_(ss);
  var capacity = readCapacityDashboard_(ss);
  var modelEngine = readModelEngine_(ss);
  var segments = buildSegments_(repRows, marketsTab, modelEngine);

  return ContentService
    .createTextOutput(JSON.stringify({
      updated_at: new Date().toISOString(),
      label: SHEET_LABEL,
      segments: segments,
      capacity_by_country: capacity,
      rep_level_count: repRows.length,
      model_engine: modelEngine,
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Optional Markets / Dashboard tab with warehouse-style segment fields. */
function readMarketsTab_(ss) {
  var names = ['Markets', 'Market', 'Dashboard', 'Dashboard_Export', 'Findings'];
  for (var n = 0; n < names.length; n++) {
    var sheet = ss.getSheetByName(names[n]);
    if (!sheet) continue;
    var rows = readMarketsSheet_(sheet);
    if (rows.length) return rows;
  }
  return [];
}

function readMarketsSheet_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var headers = data[0].map(function (h) { return normHeader_(h); });
  var col = buildColMap_(headers, {
    country: ['country', 'market country'],
    segment: ['segment', 'sales segment'],
    market: ['market'],
    ideal_pcid: ['ideal_pcid', 'ideal pcid', 'perfect_book_target', 'perfect book target'],
    optimal_hc: ['optimal_headcount', 'optimal hc', 'ideal_headcount', 'ideal hc'],
    current_reps: ['current_reps', 'current reps', 'reps'],
    current_avg_book: ['current_avg_book', 'avg_pcid_per_rep', 'avg pcid', 'avg book'],
    assigned_accounts: ['assigned_accounts', 'assigned accounts', 'pcids'],
    hc_gap: ['headcount_gap', 'hc gap', 'gap'],
    recommendation: ['headcount_recommendation', 'recommendation', 'hc recommendation'],
    growth_peak_accounts: ['growth_peak_accounts', 'growth peak accounts'],
    growth_peak_pct: ['growth_peak_pct', 'growth peak pct', 'growth peak %'],
    growth_decline_above_pcid: ['growth_decline_above_pcid'],
    jv_plateau_book_max: ['jv_plateau_book_max', 'jv plateau book'],
    jv_plateau_rev_per_job: ['jv_plateau_rev_per_job', 'jv plateau rev per job'],
    coverage_peak_accounts: ['coverage_peak_accounts', 'coverage inflection book max'],
    optimal_book_primary: ['optimal_book_primary', 'optimal book primary'],
  });

  var out = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row || row.every(function (c) { return c === '' || c === null; })) continue;
    var country = cell_(row, col.country);
    var segment = cell_(row, col.segment);
    var market = cell_(row, col.market);
    if (market && !country) {
      var mk = parseMarketKey_(String(market));
      if (mk) {
        country = mk.country;
        segment = segment || mk.segment;
      }
    }
    if (!country || !segment) continue;
    country = String(country).trim().toUpperCase();
    segment = String(segment).trim().toUpperCase();
    out.push({
      market: country + '-' + segment,
      country: country,
      segment: segment,
      ideal_pcid: parseNum_(cell_(row, col.ideal_pcid)),
      optimal_hc: parseNum_(cell_(row, col.optimal_hc)),
      current_reps: parseNum_(cell_(row, col.current_reps)),
      current_avg_book: parseNum_(cell_(row, col.current_avg_book)),
      assigned_accounts: parseNum_(cell_(row, col.assigned_accounts)),
      hc_gap: parseNum_(cell_(row, col.hc_gap)),
      recommendation: cell_(row, col.recommendation) || null,
      growth_peak_accounts: parseNum_(cell_(row, col.growth_peak_accounts)),
      growth_peak_pct: parseNum_(cell_(row, col.growth_peak_pct)),
      growth_decline_above_pcid: parseNum_(cell_(row, col.growth_decline_above_pcid)),
      jv_plateau_book_max: parseNum_(cell_(row, col.jv_plateau_book_max)),
      jv_plateau_rev_per_job: parseNum_(cell_(row, col.jv_plateau_rev_per_job)),
      coverage_peak_accounts: parseNum_(cell_(row, col.coverage_peak_accounts)),
      optimal_book_primary: cell_(row, col.optimal_book_primary) || null,
    });
  }
  return out;
}

function buildSegments_(repRows, marketsTab, modelEngine) {
  var marketsByKey = {};
  marketsTab.forEach(function (m) {
    marketsByKey[m.market] = m;
  });

  var rollups = rollupRepLevel_(repRows);
  var keys = {};
  Object.keys(rollups).forEach(function (k) { keys[k] = true; });
  marketsTab.forEach(function (m) { keys[m.market] = true; });

  var segments = [];
  Object.keys(keys).sort().forEach(function (key) {
    var rollup = rollups[key] || {};
    var tab = marketsByKey[key] || {};
    var parts = parseMarketKey_(key);
    if (!parts) return;

    var idealPcid = tab.ideal_pcid != null ? tab.ideal_pcid : rollup.ideal_pcid;
    var band = idealPcid != null ? pcidBand_(idealPcid) : null;
    var currentReps = tab.current_reps != null ? tab.current_reps : rollup.rep_count;
    var avgBook = tab.current_avg_book != null ? tab.current_avg_book : rollup.avg_pcid;
    var assigned = tab.assigned_accounts != null ? tab.assigned_accounts : rollup.total_pcid;
    var optimalHc = tab.optimal_hc;
    if (optimalHc == null && assigned != null && idealPcid) {
      optimalHc = Math.round(assigned / idealPcid);
    }
    var hcGap = tab.hc_gap;
    if (hcGap == null && currentReps != null && optimalHc != null) {
      hcGap = Math.round(currentReps - optimalHc);
    }
    var rec = tab.recommendation || recommendFromGap_(hcGap);

    segments.push({
      market: key,
      country: parts.country,
      segment: parts.segment,
      ideal_pcid: idealPcid,
      ideal_band: band ? band.label : null,
      ideal_book_summary: buildIdealSummary_(idealPcid, band, tab, rollup),
      why_trends: buildWhyTrends_(idealPcid, band, avgBook, currentReps, tab, rollup, modelEngine, parts.country),
      current_avg_book: avgBook != null ? Math.round(avgBook * 10) / 10 : null,
      current_reps: currentReps != null ? Math.round(currentReps) : null,
      optimal_hc: optimalHc != null ? Math.round(optimalHc) : null,
      hc_gap: hcGap != null ? Math.round(hcGap) : null,
      recommendation: rec,
      source: tab.ideal_pcid != null ? 'markets_tab' : 'rep_level_rollup',
    });
  });
  return segments;
}

function rollupRepLevel_(repRows) {
  var groups = {};
  repRows.forEach(function (r) {
    var parsed = parseRepMarketSegment_(r);
    if (!parsed) return;
    var key = parsed.country + '-' + parsed.segment;
    if (!groups[key]) {
      groups[key] = { country: parsed.country, segment: parsed.segment, pcids: [], rep_count: 0, total_pcid: 0 };
    }
    groups[key].rep_count += 1;
    if (r.pcid_count != null) {
      groups[key].pcids.push(r.pcid_count);
      groups[key].total_pcid += r.pcid_count;
    }
  });

  Object.keys(groups).forEach(function (key) {
    var g = groups[key];
    if (g.pcids.length) {
      g.pcids.sort(function (a, b) { return a - b; });
      g.median_pcid = g.pcids[Math.floor(g.pcids.length / 2)];
      g.avg_pcid = g.total_pcid / g.pcids.length;
      var band = pcidBand_(g.median_pcid);
      g.ideal_pcid = band ? band.mid : Math.round(g.median_pcid);
    }
  });
  return groups;
}

function parseRepMarketSegment_(r) {
  if (r.country && r.segment) {
    return { country: String(r.country).toUpperCase(), segment: String(r.segment).toUpperCase() };
  }
  if (r.market && r.segment) {
    return { country: String(r.market).toUpperCase(), segment: String(r.segment).toUpperCase() };
  }
  if (r.team_name) return parseTeamName_(r.team_name);
  if (r.market) {
    var c = String(r.market).toUpperCase();
    if (c.indexOf('-') >= 0) return parseMarketKey_(c);
    return null;
  }
  return null;
}

function parseTeamName_(team) {
  var parts = String(team || '').split('-');
  if (parts.length < 2) return null;
  var country = parts[0].trim().toUpperCase();
  var seg = parts[1].trim().toUpperCase();
  if (KNOWN_SEGMENTS.indexOf(seg) < 0) return null;
  return { country: country, segment: seg };
}

function parseMarketKey_(key) {
  var m = String(key || '').trim().toUpperCase().match(/^([A-Z]{2,4})-([A-Z]+)$/);
  if (!m) return null;
  return { country: m[1], segment: m[2] };
}

function buildIdealSummary_(idealPcid, band, tab, rollup) {
  if (tab.optimal_book_primary) return String(tab.optimal_book_primary);
  if (!idealPcid) {
    return rollup.rep_count
      ? rollup.rep_count + ' reps in sheet — add ideal_pcid on Markets tab or refresh Rep_Level.'
      : 'No rep data for this segment.';
  }
  var bandLabel = band ? band.label : String(idealPcid);
  return 'Ideal book is ~' + idealPcid + ' PCIDs per rep (' + bandLabel + ' band) — target size before growth, coverage, or $/job inflection.';
}

function buildWhyTrends_(idealPcid, band, avgBook, currentReps, tab, rollup, modelEngine, country) {
  var bullets = [];

  if (tab.growth_peak_accounts != null && tab.growth_peak_pct != null) {
    bullets.push(
      'Revenue growth peaks around ' + tab.growth_peak_accounts + ' PCIDs/rep (' +
      formatPct_(tab.growth_peak_pct) + ' median quarterly)' +
      (tab.growth_decline_above_pcid ? ', softening above ~' + tab.growth_decline_above_pcid + ' PCIDs' : '') + '.'
    );
  } else if (idealPcid && band) {
    bullets.push('Ideal ' + idealPcid + ' PCIDs sits in the ' + band.label + ' band — largest book size before segment growth typically plateaus.');
  }

  if (avgBook != null && currentReps != null && idealPcid != null) {
    var dir = avgBook > idealPcid + 5 ? 'above' : avgBook < idealPcid - 5 ? 'below' : 'near';
    bullets.push(
      'Today avg ' + Math.round(avgBook * 10) / 10 + ' PCIDs/rep (' + dir + ' ideal ' + idealPcid + ') across ' + currentReps + ' reps in the sheet.'
    );
  } else if (rollup.rep_count) {
    bullets.push(rollup.rep_count + ' reps in Rep_Level; median book ' + (rollup.median_pcid != null ? rollup.median_pcid : '—') + ' PCIDs.');
  }

  if (tab.jv_plateau_book_max != null && tab.jv_plateau_rev_per_job != null) {
    bullets.push('$/job plateaus near ' + tab.jv_plateau_book_max + ' PCIDs (~$' + Math.round(tab.jv_plateau_rev_per_job * 100) / 100 + '/job).');
  } else if (tab.coverage_peak_accounts != null) {
    bullets.push('Impact coverage peaks near ~' + tab.coverage_peak_accounts + ' PCIDs/rep.');
  } else if (modelEngine && modelEngine.length) {
    var region = countryToRegion_(country);
    var me = modelEngine.filter(function (r) { return r.region === region; })[0];
    if (me && me.avg_growth != null) {
      bullets.push('Region ' + region + ' avg growth ' + formatPct_(me.avg_growth) + ' (Model_Engine).');
    }
  }

  return bullets.slice(0, 3);
}

function recommendFromGap_(gap) {
  if (gap == null) return 'Hold';
  if (gap > 5) return 'Hire';
  if (gap < -5) return 'Optimize';
  return 'Hold';
}

function pcidBand_(pcid) {
  var n = Number(pcid);
  if (!isFinite(n)) return null;
  for (var i = 0; i < PCID_BANDS.length; i++) {
    if (n >= PCID_BANDS[i].low && n <= PCID_BANDS[i].high) return PCID_BANDS[i];
  }
  return PCID_BANDS[PCID_BANDS.length - 1];
}

function formatPct_(v) {
  if (v == null) return '—';
  var n = Number(v);
  if (!isFinite(n)) return String(v);
  if (Math.abs(n) <= 1) return Math.round(n * 1000) / 10 + '%';
  return Math.round(n * 10) / 10 + '%';
}

var COUNTRY_TO_REGION = {
  AU: 'Asia-Pac', JP: 'Asia-Pac', IN: 'Asia-Pac', SG: 'Asia-Pac',
  US: 'The Americas', CA: 'The Americas', BR: 'The Americas', MX: 'The Americas',
  UK: 'EMEA', DE: 'EMEA', FR: 'EMEA', NL: 'EMEA', BE: 'EMEA', IE: 'EMEA',
  IT: 'EMEA', ES: 'EMEA', CH: 'EMEA', AT: 'EMEA', PL: 'EMEA',
  DACH: 'EMEA', BNL: 'EMEA', IBE: 'EMEA', EM: 'EMEA',
};

function countryToRegion_(country) {
  return COUNTRY_TO_REGION[String(country || '').toUpperCase()] || 'EMEA';
}

/** Rep_Level tab */
function readRepLevel_(ss) {
  var sheet = ss.getSheetByName('Rep_Level');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];

  var headers = data[0].map(function (h) { return normHeader_(h); });
  var col = buildColMap_(headers, {
    rep_id: ['rep_id'],
    pcid_count: ['pcid count'],
    market: ['market'],
    team_name: ['team_name', 'team name'],
    rep_or_director: ['rep_or_director'],
    sales_team_name: ['sales_team_name', 'sales team name'],
    country: ['country'],
    segment: ['segment'],
    revenue_growth: ['revenue growth', 'growth', 'growth %', 'growth_pct'],
  });

  var out = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row || row.every(function (c) { return c === '' || c === null; })) continue;
    var repId = cell_(row, col.rep_id);
    if (repId === null || repId === '') continue;
    var market = cell_(row, col.market) || cell_(row, col.country);
    var team = cell_(row, col.team_name) || cell_(row, col.sales_team_name);
    out.push({
      rep_id: String(repId).replace(/\.0$/, ''),
      pcid_count: parseNum_(cell_(row, col.pcid_count)),
      market: market ? String(market).trim().toUpperCase() : null,
      team_name: team ? String(team).trim() : null,
      rep_or_director: cell_(row, col.rep_or_director) || null,
      country: market ? String(market).trim().toUpperCase() : null,
      segment: cell_(row, col.segment) || null,
      revenue_growth: parseNum_(cell_(row, col.revenue_growth)),
    });
  }
  return out;
}

function readCapacityDashboard_(ss) {
  var sheet = ss.getSheetByName('Capacity_Dashboard');
  if (!sheet) return {};
  var data = sheet.getDataRange().getValues();
  if (!data || !data.length) return {};
  var fromHeaders = parseCapacityHeaders_(data);
  if (Object.keys(fromHeaders).length) return fromHeaders;
  return parseCapacityPivot_(data);
}

function parseCapacityPivot_(data) {
  var totals = {};
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (!row || row.length < 11) continue;
    var market = String(row[9] || '').trim();
    var count = parseNum_(row[10]);
    if (!market || market === 'Market' || market === 'Grand Total' || market.length > 4) continue;
    if (count !== null) totals[market.toUpperCase()] = Math.round(count);
  }
  return totals;
}

function parseCapacityHeaders_(data) {
  var headers = data[0].map(function (h) { return normHeader_(h); });
  var marketIdx = -1;
  var countIdx = -1;
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i];
    if (marketIdx < 0 && (h === 'market' || h.indexOf('market') === 0)) marketIdx = i;
    if (countIdx < 0 && (h.indexOf('counta of rep') >= 0 || h === 'number of reps' || h.indexOf('rep count') >= 0)) {
      countIdx = i;
    }
  }
  if (marketIdx < 0 || countIdx < 0) return {};
  var totals = {};
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var market = String(row[marketIdx] || '').trim();
    var count = parseNum_(row[countIdx]);
    if (!market || count === null) continue;
    var code = market.length <= 4 ? market.toUpperCase() : market.slice(0, 3).toUpperCase();
    totals[code] = Math.round(count);
  }
  return totals;
}

function readModelEngine_(ss) {
  var sheet = ss.getSheetByName('Model_Engine');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var headers = data[0].map(function (h) { return normHeader_(h); });
  var col = buildColMap_(headers, {
    region: ['region'],
    avg_pcid: ['average pcid count', 'avg_pcid', 'avg pcid'],
    avg_growth: ['average growth', 'avg_growth', 'avg growth'],
    avg_jv: ['average jv', 'avg_jv'],
    recommendation: ['recommendation'],
  });
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row || row.every(function (c) { return c === '' || c === null; })) continue;
    var region = cell_(row, col.region);
    if (!region) continue;
    out.push({
      region: String(region).trim(),
      avg_pcid: parseNum_(cell_(row, col.avg_pcid)),
      avg_growth: parseNum_(cell_(row, col.avg_growth)),
      avg_jv: parseNum_(cell_(row, col.avg_jv)),
      recommendation: cell_(row, col.recommendation) || null,
    });
  }
  return out;
}

function normHeader_(h) {
  return String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildColMap_(headers, aliases) {
  var map = {};
  Object.keys(aliases).forEach(function (field) {
    var names = aliases[field];
    map[field] = -1;
    for (var i = 0; i < headers.length; i++) {
      var h = headers[i];
      for (var j = 0; j < names.length; j++) {
        if (h === names[j]) {
          map[field] = i;
          return;
        }
      }
    }
  });
  return map;
}

function cell_(row, idx) {
  if (idx == null || idx < 0 || idx >= row.length) return null;
  var v = row[idx];
  if (v === '' || v === null || v === undefined) return null;
  return v;
}

function parseNum_(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  if (typeof raw === 'number' && isFinite(raw)) {
    return raw === Math.floor(raw) ? Math.trunc(raw) : raw;
  }
  var s = String(raw).replace(/,/g, '').replace(/%/g, '').replace(/\$/g, '').trim();
  var n = Number(s);
  if (!isFinite(n)) return null;
  return n === Math.floor(n) ? Math.trunc(n) : n;
}
