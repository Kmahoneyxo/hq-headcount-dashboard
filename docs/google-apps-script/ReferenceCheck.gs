/**
 * HQ Headcount Dashboard — Live Google Sheet API
 * Sheet: Global Sales Rep Headcount (1)
 * ID:  1Hq64TSm77FVH4hLxME2wrs1bJbT8Qi9Puk4FWMdkGsw
 *
 * DEPLOY (one-time, from the Google Sheet):
 * 1. Open the sheet → Extensions → Apps Script
 * 2. Delete any default Code.gs content; paste this entire file as ReferenceCheck.gs
 * 3. Save (Ctrl/Cmd+S) → Deploy → New deployment
 * 4. Type: Web app
 *    Execute as: Me
 *    Who has access: Anyone  (or "Anyone with Google account" for Indeed SSO)
 * 5. Authorize when prompted → Deploy → copy the Web app URL
 * 6. Paste URL into docs/data/config.json → reference_apps_script_url
 * 7. Ensure reference_sheet_live is true → Reload sheet reference in dashboard
 *
 * OUTPUT TABS (no Web app deploy required):
 * - Run refreshDashboardSummary → menu HQ Dashboard → Refresh dashboards
 * - HC_Model        — full formulas, inputs, and recommendation logic (analyst)
 * - Executive_View  — clean summary table + charts for presenting
 * - Looker_Export   — flat table for Looker Studio (one row per market, no charts)
 *
 * Returns JSON: country rep cross-check (Capacity_Dashboard), Rep_Level rows,
 * Model_Engine regional stats, and per country×segment recommendations (segments[]).
 */

var SHEET_LABEL = 'Global Sales Rep Headcount (1)';
var MODEL_TAB_NAME = 'HC_Model';
var EXECUTIVE_TAB_NAME = 'Executive_View';
var LOOKER_EXPORT_TAB_NAME = 'Looker_Export';
var MARKETS_TEMPLATE_TAB_NAME = 'Markets_Template';
/** Public warehouse snapshot — fills revenue/coverage in Looker_Export when Markets tab is empty. */
var HEADCOUNT_JSON_URL = 'https://kmahoneyxo.github.io/hq-headcount-dashboard/data/headcount.json';
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

/** Build full payload from current sheet data. */
function buildDashboardPayload_(ss) {
  var marketsTab = readMarketsTab_(ss);
  var repRows = readRepLevel_(ss);
  var capacity = readCapacityDashboard_(ss);
  var modelEngine = readModelEngine_(ss);
  var segments = buildSegments_(repRows, marketsTab, modelEngine);
  mergeWarehouseMetricsIntoSegments_(segments, fetchHeadcountWarehouse_(ss));

  return {
    updated_at: new Date().toISOString(),
    label: SHEET_LABEL,
    segments: segments,
    capacity_by_country: capacity,
    rep_level: repRows,
    rep_level_count: repRows.length,
    model_engine: modelEngine,
  };
}

function doGet(e) {
  var payload = buildDashboardPayload_(SpreadsheetApp.getActiveSpreadsheet());
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Run from editor or HQ Dashboard menu — rebuilds output tabs. */
function refreshDashboardSummary() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var payload = buildDashboardPayload_(ss);
  writeHcModelTab_(ss, payload);
  writeExecutiveViewTab_(ss, payload);
  writeLookerExportTab_(ss, payload);
  writeMarketsTemplateTab_(ss);
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Updated ' + MODEL_TAB_NAME + ', ' + EXECUTIVE_TAB_NAME + ', ' + LOOKER_EXPORT_TAB_NAME + ', ' + MARKETS_TEMPLATE_TAB_NAME,
    'HQ Dashboard',
    5
  );
}

function onOpen() {
  SpreadsheetApp.getActiveSpreadsheet()
    .addMenu('HQ Dashboard', [
      { name: 'Refresh dashboards', functionName: 'refreshDashboardSummary' },
    ]);
}

function removeCharts_(sheet) {
  var charts = sheet.getCharts();
  for (var i = 0; i < charts.length; i++) {
    sheet.removeChart(charts[i]);
  }
}

function prepareSheet_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  } else {
    removeCharts_(sheet);
    sheet.clear();
    sheet.clearConditionalFormatRules();
  }
  return sheet;
}

/** Analyst tab — every formula and input visible. */
function writeHcModelTab_(ss, payload) {
  var sheet = prepareSheet_(ss, MODEL_TAB_NAME);
  var segments = (payload.segments || []).slice();
  segments.sort(function (a, b) {
    return String(a.market).localeCompare(String(b.market));
  });

  var updated = payload.updated_at || new Date().toISOString();
  var updatedDisplay = Utilities.formatDate(new Date(updated), Session.getScriptTimeZone(), 'MMM d, yyyy h:mm a');

  var rows = [];
  rows.push(['HC Model — formulas & calculations (analyst view)']);
  rows.push(['Updated', updatedDisplay, 'Rep_Level rows', payload.rep_level_count || 0]);
  rows.push([]);
  rows.push(['FORMULAS (Layer 2 headcount)']);
  rows.push(['Optimal HC', 'SUM(PCID Count) ÷ Ideal PCID  — assigned accounts per rep at ideal book size']);
  rows.push(['HC gap', 'Current reps − Optimal HC  (negative = under-staffed)']);
  rows.push(['Heads to add', 'MAX(0, Optimal HC − Current reps)']);
  rows.push(['Reps above model', 'MAX(0, Current reps − Optimal HC)']);
  rows.push(['Ideal PCID', 'Midpoint of PCID band containing segment median book (or Markets tab override)']);
  rows.push(['Recommendation', 'Hire if current < 90% optimal · Optimize if current > 110% optimal · else Hold']);
  rows.push([]);

  var headerRow = rows.length + 1;
  rows.push([
    'Market', 'Source',
    'Rep count', 'Sum PCIDs (assigned)',
    'Median PCID', 'Avg PCID',
    'Ideal PCID', 'Band',
    'Optimal HC (calc)', 'Optimal HC formula',
    'Current reps', 'Gap (calc)', 'Gap formula',
    'Heads to add', 'Add formula',
    'Reps over', 'Over formula',
    'Rec rule', 'Recommendation',
    'Ideal book — why', 'HC — why',
  ]);

  var dataStart = rows.length + 1;
  segments.forEach(function (s) {
    var assigned = s.assigned_accounts;
    var ideal = s.ideal_pcid;
    var cur = s.current_reps;
    var opt = s.optimal_hc;
    rows.push([
      s.market || '',
      s.source || '',
      s.current_reps != null ? s.current_reps : '',
      assigned != null ? assigned : '',
      s.median_book != null ? s.median_book : '',
      s.current_avg_book != null ? s.current_avg_book : '',
      ideal != null ? ideal : '',
      s.ideal_band || '',
      opt != null ? opt : '',
      optimalHcFormulaText_(assigned, ideal, opt),
      cur != null ? cur : '',
      s.hc_gap != null ? s.hc_gap : '',
      gapFormulaText_(cur, opt, s.hc_gap),
      s.heads_to_add != null && s.heads_to_add > 0 ? s.heads_to_add : 0,
      addFormulaText_(opt, cur, s.heads_to_add),
      s.heads_over != null && s.heads_over > 0 ? s.heads_over : 0,
      overFormulaText_(cur, opt, s.heads_over),
      recommendationRuleText_(cur, opt),
      s.recommendation || '',
      (s.ideal_why_detail || s.ideal_book_summary || '').replace(/\n/g, ' · '),
      (s.hc_rec_why || '').replace(/\n/g, ' · '),
    ]);
  });

  var numCols = 21;
  var numRows = rows.length;
  sheet.getRange(1, 1, numRows, numCols).setValues(padRows_(rows, numCols));

  sheet.getRange(1, 1, 1, numCols).merge()
    .setBackground('#3d4451').setFontColor('#ffffff').setFontWeight('bold').setFontSize(13);
  sheet.getRange(4, 1, 4, numCols).merge().setFontWeight('bold').setBackground('#f5f5f6');
  sheet.getRange(headerRow, 1, headerRow, numCols)
    .setBackground('#f0f1f3').setFontWeight('bold').setFontSize(9);
  sheet.setFrozenRows(headerRow);

  if (segments.length > 0) {
    sheet.getRange(dataStart, 1, numRows, numCols).setWrap(true).setVerticalAlignment('top');
    sheet.getRange(dataStart, 10, numRows, 10).setFontFamily('Courier New').setFontSize(8);
    sheet.getRange(dataStart, 13, numRows, 17).setFontFamily('Courier New').setFontSize(8);
    for (var r = dataStart; r <= numRows; r++) {
      var rec = String(sheet.getRange(r, 19).getValue() || '').toLowerCase();
      var recCell = sheet.getRange(r, 19);
      if (rec.indexOf('hire') >= 0) {
        recCell.setBackground('#f4f7f5').setFontColor('#3d6b52').setFontWeight('normal');
      } else if (rec.indexOf('optimize') >= 0) {
        recCell.setBackground('#f8f6f1').setFontColor('#8a6a2a').setFontWeight('normal');
      }
    }
  }

  sheet.setColumnWidth(1, 80);
  sheet.setColumnWidth(10, 200);
  sheet.setColumnWidth(13, 160);
  sheet.setColumnWidth(15, 160);
  sheet.setColumnWidth(17, 160);
  sheet.setColumnWidth(20, 280);
  sheet.setColumnWidth(21, 280);
}

/** Presentation tab — short table + charts. */
function writeExecutiveViewTab_(ss, payload) {
  var sheet = prepareSheet_(ss, EXECUTIVE_TAB_NAME);
  var segments = (payload.segments || []).slice();

  var totalAdd = 0;
  var totalOver = 0;
  var hire = 0;
  var hold = 0;
  var optimize = 0;
  segments.forEach(function (s) {
    if (s.heads_to_add) totalAdd += s.heads_to_add;
    if (s.heads_over) totalOver += s.heads_over;
    var r = String(s.recommendation || '').toLowerCase();
    if (r.indexOf('hire') >= 0) hire += 1;
    else if (r.indexOf('optimize') >= 0) optimize += 1;
    else hold += 1;
  });

  segments.sort(function (a, b) {
    var addB = b.heads_to_add || 0;
    var addA = a.heads_to_add || 0;
    if (addB !== addA) return addB - addA;
    return recSortOrder_(a.recommendation) - recSortOrder_(b.recommendation);
  });

  var updated = payload.updated_at || new Date().toISOString();
  var updatedDisplay = Utilities.formatDate(new Date(updated), Session.getScriptTimeZone(), 'MMM d, yyyy h:mm a');

  var rows = [];
  rows.push(['Executive headcount summary']);
  rows.push(['Updated', updatedDisplay]);
  rows.push([
    'Total heads to add', totalAdd,
    'Hire', hire,
    'Hold', hold,
    'Optimize', optimize,
  ]);
  rows.push([]);

  var tableHeaderRow = rows.length + 1;
  rows.push(['Market', 'Recommendation', 'Heads to add', 'Ideal PCID', 'Action']);

  var tableStart = rows.length + 1;
  segments.forEach(function (s) {
    var action = s.action_note || '';
    if (action.length > 90) action = action.slice(0, 87) + '…';
    rows.push([
      s.market || '',
      s.recommendation || '',
      s.heads_to_add > 0 ? s.heads_to_add : '',
      s.ideal_pcid != null ? s.ideal_pcid : '',
      action,
    ]);
  });
  var tableEnd = rows.length;

  var chartHeaderRow = tableEnd + 2;
  rows.push([]);
  rows.push(['', '', '', 'Chart — heads to add', '', 'Market', 'Heads']);
  var chartDataStart = rows.length + 1;
  var chartMarkets = segments.filter(function (s) { return (s.heads_to_add || 0) > 0; }).slice(0, 15);
  if (!chartMarkets.length) {
    chartMarkets = segments.slice(0, 10);
  }
  chartMarkets.forEach(function (s) {
    rows.push(['', '', '', '', '', s.market, s.heads_to_add > 0 ? s.heads_to_add : 0]);
  });
  var chartDataEnd = rows.length;

  var recChartStart = chartDataEnd + 2;
  rows.push(['', '', '', 'Chart — recommendations', '', 'Type', 'Count']);
  var recDataStart = rows.length + 1;
  rows.push(['', '', '', '', '', 'Hire', hire]);
  rows.push(['', '', '', '', '', 'Hold', hold]);
  rows.push(['', '', '', '', '', 'Optimize', optimize]);
  var recDataEnd = rows.length;

  var numCols = 7;
  var numRows = rows.length;
  sheet.getRange(1, 1, numRows, numCols).setValues(padRows_(rows, numCols));

  sheet.getRange(1, 1, 1, 5).merge()
    .setBackground('#3d4451').setFontColor('#ffffff').setFontWeight('bold').setFontSize(15);
  sheet.setRowHeight(1, 36);
  sheet.getRange(3, 1, 3, numCols)
    .setBackground('#f5f5f6').setFontWeight('normal').setFontSize(10);
  sheet.getRange(3, 2).setFontSize(16).setHorizontalAlignment('center').setFontWeight('bold');
  sheet.getRange(3, 4).setFontSize(13).setHorizontalAlignment('center');
  sheet.getRange(3, 6).setFontSize(13).setHorizontalAlignment('center');

  sheet.getRange(tableHeaderRow, 1, tableHeaderRow, 5)
    .setBackground('#f0f1f3').setFontWeight('bold');
  sheet.setFrozenRows(tableHeaderRow);

  if (segments.length > 0) {
    for (var r = tableStart; r <= tableEnd; r++) {
      var rec = String(sheet.getRange(r, 2).getValue() || '').toLowerCase();
      var recCell = sheet.getRange(r, 2);
      if (rec.indexOf('hire') >= 0) {
        recCell.setBackground('#f4f7f5').setFontColor('#3d6b52').setFontWeight('normal');
      } else if (rec.indexOf('optimize') >= 0) {
        recCell.setBackground('#f8f6f1').setFontColor('#8a6a2a').setFontWeight('normal');
      }
      var addCell = sheet.getRange(r, 3);
      if (addCell.getValue() !== '' && Number(addCell.getValue()) > 0) {
        addCell.setBackground('#f4f7f5').setFontWeight('bold').setFontSize(11).setHorizontalAlignment('center');
      }
    }
  }

  sheet.setColumnWidth(1, 90);
  sheet.setColumnWidth(2, 110);
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 80);
  sheet.setColumnWidth(5, 360);
  sheet.setColumnWidth(6, 80);
  sheet.setColumnWidth(7, 60);

  if (chartDataEnd >= chartDataStart) {
    var barChart = sheet.newChart()
      .setChartType(Charts.ChartType.BAR)
      .addRange(sheet.getRange(chartDataStart, 6, chartDataEnd, 7))
      .setPosition(1, 5, 0, 0)
      .setOption('title', 'Heads to add by market')
      .setOption('legend', { position: 'none' })
      .setOption('height', 340)
      .setOption('width', 520)
      .setOption('colors', ['#5c6b5e'])
      .setOption('hAxis', { title: 'Heads to add' })
      .build();
    sheet.insertChart(barChart);
  }

  if (recDataEnd >= recDataStart) {
    var pieChart = sheet.newChart()
      .setChartType(Charts.ChartType.PIE)
      .addRange(sheet.getRange(recDataStart, 6, recDataEnd, 7))
      .setPosition(10, 5, 0, 0)
      .setOption('title', 'Hire / Hold / Optimize')
      .setOption('height', 300)
      .setOption('width', 420)
      .setOption('colors', ['#5c6b5e', '#9aa0a6', '#a89888'])
      .setOption('pieSliceText', 'value')
      .build();
    sheet.insertChart(pieChart);
  }

  sheet.hideColumns(6, 2);
  if (chartHeaderRow > 0 && chartDataEnd >= chartHeaderRow) {
    sheet.hideRows(chartHeaderRow, chartDataEnd - chartHeaderRow + 1);
  }
  if (recChartStart > 0 && recDataEnd >= recChartStart) {
    sheet.hideRows(recChartStart, recDataEnd - recChartStart + 1);
  }
}

/** Flat export for Looker Studio — one row per market, header row 1, no charts. */
function writeLookerExportTab_(ss, payload) {
  var sheet = prepareSheet_(ss, LOOKER_EXPORT_TAB_NAME);
  var segments = (payload.segments || []).slice();
  var updated = payload.updated_at || new Date().toISOString();

  segments.sort(function (a, b) {
    var addB = b.heads_to_add || 0;
    var addA = a.heads_to_add || 0;
    if (addB !== addA) return addB - addA;
    return String(a.market).localeCompare(String(b.market));
  });

  var headers = [
    'updated_at', 'market', 'country', 'segment', 'region',
    'recommendation', 'heads_to_add', 'heads_over', 'hc_gap',
    'current_reps', 'optimal_hc', 'ideal_pcid', 'ideal_band',
    'avg_pcid', 'segment_avg_pcid', 'median_book', 'assigned_pcids',
    'revenue_90d', 'avg_pqr_per_rep', 'segment_avg_pqr',
    'coverage_peak_accounts', 'median_impact_calls', 'coverage_at_inflection',
    'action_short',
  ];

  var rows = [headers];
  segments.forEach(function (s) {
    rows.push([
      updated,
      s.market || '',
      s.country || '',
      s.segment || '',
      countryToRegion_(s.country),
      s.recommendation || '',
      s.heads_to_add != null ? s.heads_to_add : '',
      s.heads_over != null ? s.heads_over : '',
      s.hc_gap != null ? s.hc_gap : '',
      s.current_reps != null ? s.current_reps : '',
      s.optimal_hc != null ? s.optimal_hc : '',
      s.ideal_pcid != null ? s.ideal_pcid : '',
      s.ideal_band || '',
      s.current_avg_book != null ? s.current_avg_book : '',
      s.segment_avg_pcid != null ? s.segment_avg_pcid : '',
      s.median_book != null ? s.median_book : '',
      s.assigned_accounts != null ? s.assigned_accounts : '',
      s.revenue_90d != null ? s.revenue_90d : '',
      s.avg_pqr_per_rep != null ? s.avg_pqr_per_rep : '',
      s.segment_avg_pqr != null ? s.segment_avg_pqr : '',
      s.coverage_peak_accounts != null ? s.coverage_peak_accounts : '',
      s.median_impact_calls_per_account != null ? s.median_impact_calls_per_account : '',
      s.coverage_at_inflection != null ? s.coverage_at_inflection : '',
      actionShort_(s.action_note),
    ]);
  });

  if (rows.length > 0) {
    sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  }

  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#e8f0fe')
    .setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 90);
  sheet.setColumnWidth(headers.length, 320);
}

/** Optional paste target — row 1 headers match headcount-dashboard.csv / Markets tab aliases. */
function writeMarketsTemplateTab_(ss) {
  var sheet = ss.getSheetByName(MARKETS_TEMPLATE_TAB_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MARKETS_TEMPLATE_TAB_NAME);
  } else {
    sheet.clear();
  }

  var headers = [
    'country', 'segment', 'market',
    'ideal_pcid', 'optimal_hc', 'current_reps', 'current_avg_book', 'assigned_accounts',
    'hc_gap', 'recommendation',
    'revenue_90d', 'segment_avg_pcid', 'avg_pqr_per_rep', 'segment_avg_pqr',
    'coverage_peak_accounts', 'median_impact_calls_per_account', 'coverage_at_inflection',
    'growth_peak_accounts', 'growth_peak_pct', 'jv_plateau_book_max', 'jv_plateau_rev_per_job',
  ];

  var csvLabels = [
    'Country', 'Segment', 'Market',
    'Ideal PCID (accounts/rep)', 'Ideal headcount', 'Current reps', 'Avg PCID per rep', 'Assigned accounts',
    'Headcount gap', 'HC recommendation',
    'Revenue 90d ($)', 'Segment avg PCID', 'Avg PQR per rep ($)', 'Segment avg PQR ($)',
    'Coverage inflection book max', 'Median impact calls/account', 'Coverage at inflection',
    'Growth peak (accounts/rep)', 'Growth peak %', 'JV plateau book max', 'JV plateau $/job',
  ];

  var rows = [
    ['Markets tab template — copy row 3+ from docs/data/headcount-dashboard.csv (or warehouse export) into a tab named Markets, then HQ Dashboard → Refresh dashboards.'],
    headers,
    csvLabels,
  ];

  sheet.getRange(1, 1, rows.length, headers.length).setValues(padRows_(rows, headers.length));
  sheet.getRange(1, 1, 1, headers.length).merge()
    .setBackground('#fff8e1').setFontSize(10).setWrap(true);
  sheet.getRange(2, 1, 2, headers.length)
    .setBackground('#e8f0fe').setFontWeight('bold').setFontSize(9);
  sheet.getRange(3, 1, 3, headers.length)
    .setBackground('#f5f5f6').setFontSize(8).setFontColor('#5f6368');
  sheet.setFrozenRows(2);
  sheet.setColumnWidth(1, 72);
  sheet.setColumnWidth(3, 88);
  sheet.setColumnWidth(11, 120);
}

function actionShort_(text) {
  var s = String(text || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length > 80) return s.slice(0, 77) + '…';
  return s;
}

function padRows_(rows, numCols) {
  return rows.map(function (r) {
    var out = [];
    for (var c = 0; c < numCols; c++) {
      out.push(r[c] != null ? r[c] : '');
    }
    return out;
  });
}

function optimalHcFormulaText_(assigned, ideal, result) {
  if (assigned == null || ideal == null) return '—';
  return 'ROUND(' + Math.round(assigned) + ' ÷ ' + ideal + ') = ' + (result != null ? result : '?');
}

function gapFormulaText_(current, optimal, result) {
  if (current == null || optimal == null) return '—';
  return current + ' − ' + optimal + ' = ' + (result != null ? result : '?');
}

function addFormulaText_(optimal, current, result) {
  if (optimal == null || current == null) return '—';
  return 'MAX(0, ' + optimal + ' − ' + current + ') = ' + (result != null ? result : 0);
}

function overFormulaText_(current, optimal, result) {
  if (current == null || optimal == null) return '—';
  return 'MAX(0, ' + current + ' − ' + optimal + ') = ' + (result != null ? result : 0);
}

function recommendationRuleText_(current, optimal) {
  if (current == null || optimal == null) return '—';
  if (current < optimal * 0.90) return 'current < 90% of optimal → Hire';
  if (current > optimal * 1.10) return 'current > 110% of optimal → Optimize';
  return 'within ±10% of optimal → Hold';
}

function recSortOrder_(rec) {
  var r = String(rec || '').toLowerCase();
  if (r.indexOf('hire') >= 0) return 0;
  if (r.indexOf('optimize') >= 0) return 1;
  return 2;
}

/** Multi-line explanation of why ideal PCID is the target. */
function buildIdealBookWhyDetail_(idealPcid, band, avgBook, medianBook, currentReps, assigned, tab, rollup, country, modelEngine) {
  var lines = [];

  if (tab.ideal_pcid != null) {
    lines.push('SOURCE: Markets tab override — ideal ' + tab.ideal_pcid + ' PCIDs (analyst/warehouse target, not Rep_Level median).');
    if (tab.optimal_book_primary) {
      lines.push(String(tab.optimal_book_primary));
    }
  } else if (idealPcid && band && medianBook != null) {
    lines.push(
      'SOURCE: Rep_Level median book → PCID bucket → band midpoint.',
      'Median book across ' + (rollup.rep_count || currentReps || '?') + ' reps = ' + medianBook + ' PCIDs.',
      'That falls in the ' + band.label + ' band → ideal target = band midpoint ' + idealPcid + ' PCIDs.',
      'We use median (not average) so a few very large books do not pull the target up.'
    );
    if (avgBook != null && Math.abs(avgBook - medianBook) >= 5) {
      lines.push(
        'Avg book (' + Math.round(avgBook * 10) / 10 + ') differs from median (' + medianBook + ') — a few outsized books are skewing the mean.'
      );
    }
  } else if (!idealPcid) {
    lines.push('No ideal PCID — add Rep_Level rows or ideal_pcid on a Markets tab.');
    return lines;
  }

  if (tab.growth_peak_accounts != null && tab.growth_peak_pct != null) {
    lines.push(
      'GROWTH: Revenue growth peaks around ' + tab.growth_peak_accounts + ' PCIDs/rep (' +
      formatPct_(tab.growth_peak_pct) + ' median quarterly)' +
      (tab.growth_decline_above_pcid ? '; softens above ~' + tab.growth_decline_above_pcid + ' PCIDs.' : '.')
    );
  } else if (idealPcid && band) {
    lines.push('GROWTH: Ideal ' + idealPcid + ' sits in ' + band.label + ' — largest bucket before growth typically plateaus (add growth_peak_* on Markets tab for exact curve).');
  }

  if (tab.jv_plateau_book_max != null && tab.jv_plateau_rev_per_job != null) {
    lines.push('$/JOB: Plateaus near ' + tab.jv_plateau_book_max + ' PCIDs (~$' + Math.round(tab.jv_plateau_rev_per_job * 100) / 100 + '/job) — bigger books add little job value.');
  }

  if (tab.coverage_peak_accounts != null) {
    lines.push('COVERAGE: Impact calls/account peak near ~' + tab.coverage_peak_accounts + ' PCIDs/rep.');
  }

  if (avgBook != null && idealPcid != null && currentReps != null) {
    var delta = Math.round((avgBook - idealPcid) * 10) / 10;
    if (delta > 5) {
      lines.push('TODAY: Avg ' + avgBook + ' PCIDs/rep is ' + delta + ' above ideal — segment books are oversized vs target.');
    } else if (delta < -5) {
      lines.push('TODAY: Avg ' + avgBook + ' PCIDs/rep is ' + Math.abs(delta) + ' below ideal — room to grow books toward target.');
    } else {
      lines.push('TODAY: Avg ' + avgBook + ' PCIDs/rep is near ideal ' + idealPcid + ' across ' + currentReps + ' reps.');
    }
  }

  if (!tab.growth_peak_accounts && modelEngine && modelEngine.length && country) {
    var region = countryToRegion_(country);
    for (var i = 0; i < modelEngine.length; i++) {
      if (modelEngine[i].region === region && modelEngine[i].avg_growth != null) {
        lines.push('REGION (' + region + '): avg growth ' + formatPct_(modelEngine[i].avg_growth) + ' from Model_Engine.');
        break;
      }
    }
  }

  return lines;
}

/** Explains Hire / Hold / Optimize from the math in the sheet. */
function buildHcRecWhy_(rec, currentReps, optimalHc, hcGap, assigned, idealPcid) {
  var lines = [];
  if (assigned != null && idealPcid) {
    lines.push('Math: ' + Math.round(assigned) + ' assigned PCIDs ÷ ' + idealPcid + ' ideal = ' + (optimalHc != null ? optimalHc : '?') + ' optimal HC.');
  } else if (optimalHc != null) {
    lines.push('Optimal HC = ' + optimalHc + ' reps (from Markets tab or assigned ÷ ideal).');
  }
  if (currentReps != null && optimalHc != null && hcGap != null) {
    lines.push('Current ' + currentReps + ' reps − optimal ' + optimalHc + ' = gap ' + hcGap + '.');
  }
  var r = String(rec || 'Hold');
  if (hcGap != null) {
    if (hcGap < -5 || (currentReps != null && optimalHc != null && currentReps < optimalHc * 0.90)) {
      lines.push('Rule: under model (gap negative or current < 90% of optimal) → Hire. Recommendation: ' + r + '.');
    } else if (hcGap > 5 || (currentReps != null && optimalHc != null && currentReps > optimalHc * 1.10)) {
      lines.push('Rule: over model (gap positive or current > 110% of optimal) → Optimize — peel/grow books before hiring. Recommendation: ' + r + '.');
    } else {
      lines.push('Rule: within ±10% of optimal → Hold. Recommendation: ' + r + '.');
    }
  } else {
    lines.push('Recommendation: ' + r + ' (gap not computed — check assigned PCIDs and ideal).');
  }
  return lines.join('\n');
}

function sumSegmentRepsByCountry_(segments) {
  var totals = {};
  segments.forEach(function (s) {
    if (!s.country || s.current_reps == null) return;
    totals[s.country] = (totals[s.country] || 0) + Number(s.current_reps);
  });
  return totals;
}

/** Optional Markets / Dashboard tab with warehouse-style segment fields. */
function readMarketsTab_(ss) {
  var names = ['Markets', 'Market', 'Dashboard', 'Dashboard_Export', 'Findings', 'Warehouse_Export', 'headcount_dashboard'];
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
    coverage_peak_accounts: ['coverage_peak_accounts', 'coverage peak accounts', 'coverage inflection book max'],
    median_impact_calls_per_account: [
      'median_impact_calls_per_account', 'median impact calls/account', 'median impact calls per account',
    ],
    coverage_at_inflection: ['coverage_at_inflection', 'coverage at inflection'],
    revenue_90d: ['revenue_90d', 'revenue 90d', 'revenue 90d ($)', 'market revenue 90d'],
    segment_avg_pcid: ['segment_avg_pcid', 'segment avg pcid'],
    avg_pqr_per_rep: ['avg_pqr_per_rep', 'avg pqr per rep', 'avg pqr per rep ($)'],
    segment_avg_pqr: ['segment_avg_pqr', 'segment avg pqr', 'segment avg pqr ($)'],
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
    country = rollupCountry_(String(country).trim().toUpperCase());
    segment = String(segment).trim().toUpperCase();
    var marketKey = segmentMarketKey_(country, segment);
    if (!marketKey) continue;
    out.push({
      market: marketKey,
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
      median_impact_calls_per_account: parseNum_(cell_(row, col.median_impact_calls_per_account)),
      coverage_at_inflection: parseNum_(cell_(row, col.coverage_at_inflection)),
      revenue_90d: parseNum_(cell_(row, col.revenue_90d)),
      segment_avg_pcid: parseNum_(cell_(row, col.segment_avg_pcid)),
      avg_pqr_per_rep: parseNum_(cell_(row, col.avg_pqr_per_rep)),
      segment_avg_pqr: parseNum_(cell_(row, col.segment_avg_pqr)),
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
    var parts = parseMarketKey_(key);
    if (!parts) return;
    var marketKey = segmentMarketKey_(parts.country, parts.segment);
    if (!marketKey) return;
    var rollup = rollups[key] || rollups[marketKey] || {};
    var tab = marketsByKey[key] || marketsByKey[marketKey] || {};

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
    var rec = tab.recommendation || recommendFromHeadcount_(currentReps, optimalHc, tab, parts.country, modelEngine);
    var hcAction = computeHeadcountAction_(currentReps, optimalHc);
    var medianBook = rollup.median_pcid != null ? Math.round(rollup.median_pcid * 10) / 10 : null;
    var idealWhyLines = buildIdealBookWhyDetail_(
      idealPcid, band, avgBook, medianBook, currentReps, assigned, tab, rollup, parts.country, modelEngine
    );
    var hcRecWhy = buildHcRecWhy_(rec, currentReps, optimalHc, hcGap, assigned, idealPcid);
    var actionNote = buildActionNote_(rec, hcAction, currentReps, optimalHc);

    segments.push({
      market: marketKey,
      country: rollupCountry_(parts.country),
      segment: String(parts.segment).toUpperCase(),
      ideal_pcid: idealPcid,
      ideal_band: band ? band.label : null,
      ideal_book_summary: buildIdealSummary_(idealPcid, band, tab, rollup),
      ideal_why_detail: idealWhyLines.join('\n'),
      why_trends: buildWhyTrends_(idealPcid, band, avgBook, currentReps, tab, rollup, modelEngine, parts.country),
      median_book: medianBook,
      assigned_accounts: assigned != null ? Math.round(assigned) : null,
      current_avg_book: avgBook != null ? Math.round(avgBook * 10) / 10 : null,
      current_reps: currentReps != null ? Math.round(currentReps) : null,
      optimal_hc: optimalHc != null ? Math.round(optimalHc) : null,
      optimal_headcount: optimalHc != null ? Math.round(optimalHc) : null,
      hc_gap: hcGap != null ? Math.round(hcGap) : null,
      headcount_gap: hcGap != null ? Math.round(hcGap) : null,
      heads_to_add: hcAction.heads_to_add,
      heads_over: hcAction.heads_over,
      net_hc_delta: hcAction.net_delta,
      recommendation: rec,
      headcount_recommendation: rec,
      hc_rec_why: hcRecWhy,
      action_note: actionNote,
      source: tab.ideal_pcid != null ? 'markets_tab' : 'rep_level_rollup',
      revenue_90d: tab.revenue_90d != null ? tab.revenue_90d : null,
      segment_avg_pcid: tab.segment_avg_pcid != null ? tab.segment_avg_pcid : (avgBook != null ? Math.round(avgBook * 10) / 10 : null),
      avg_pqr_per_rep: tab.avg_pqr_per_rep != null ? tab.avg_pqr_per_rep : null,
      segment_avg_pqr: tab.segment_avg_pqr != null ? tab.segment_avg_pqr : null,
      coverage_peak_accounts: tab.coverage_peak_accounts != null ? tab.coverage_peak_accounts : null,
      median_impact_calls_per_account: tab.median_impact_calls_per_account != null ? tab.median_impact_calls_per_account : null,
      coverage_at_inflection: tab.coverage_at_inflection != null ? tab.coverage_at_inflection : null,
    });
  });
  return segments;
}

/** Fill revenue / PQR / coverage on segments from warehouse JSON or Markets-style sheet tab. */
function fetchHeadcountWarehouse_(ss) {
  var json = fetchHeadcountJsonFromUrl_();
  if (json && json.markets && json.markets.length) return json;
  return readWarehouseFromSheet_(ss);
}

function fetchHeadcountJsonFromUrl_() {
  try {
    var res = UrlFetchApp.fetch(HEADCOUNT_JSON_URL, {
      muteHttpExceptions: true,
      followRedirects: true,
    });
    if (res.getCode() >= 200 && res.getCode() < 300) {
      return JSON.parse(res.getContentText());
    }
  } catch (e) {
    // fall through to sheet tab
  }
  return null;
}

function readWarehouseFromSheet_(ss) {
  var names = ['Markets', 'Warehouse_Export', 'headcount_dashboard', 'Dashboard_Export', 'Dashboard'];
  for (var i = 0; i < names.length; i++) {
    var sheet = ss.getSheetByName(names[i]);
    if (!sheet) continue;
    var rows = readMarketsSheet_(sheet);
    if (!rows.length) continue;
    return {
      markets: rows.map(function (r) {
        return {
          country: r.country,
          segment: r.segment,
          revenue_90d: r.revenue_90d,
          avg_pqr_per_rep: r.avg_pqr_per_rep,
          segment_avg_pqr: r.segment_avg_pqr,
          segment_avg_pcid: r.segment_avg_pcid,
          coverage_inflection_book_max: r.coverage_peak_accounts,
          median_impact_calls_per_account: r.median_impact_calls_per_account,
          coverage_at_inflection: r.coverage_at_inflection,
        };
      }),
    };
  }
  return null;
}

function mergeWarehouseMetricsIntoSegments_(segments, warehouse) {
  if (!warehouse || !warehouse.markets) return;
  var byKey = {};
  warehouse.markets.forEach(function (m) {
    var key = segmentMarketKey_(m.country, m.segment);
    if (!key) return;
    byKey[key] = m;
  });
  segments.forEach(function (s) {
    var key = segmentMarketKey_(s.country, s.segment) || s.market;
    var w = byKey[key];
    if (!w) return;
    // Markets tab values from buildSegments_ take precedence; JSON/sheet fills gaps only.
    if (s.revenue_90d == null && w.revenue_90d != null) {
      s.revenue_90d = Math.round(Number(w.revenue_90d));
    }
    if (s.avg_pqr_per_rep == null && w.avg_pqr_per_rep != null) {
      s.avg_pqr_per_rep = Math.round(Number(w.avg_pqr_per_rep));
    }
    if (s.segment_avg_pqr == null && w.segment_avg_pqr != null) {
      s.segment_avg_pqr = Math.round(Number(w.segment_avg_pqr));
    }
    if (s.segment_avg_pcid == null && w.segment_avg_pcid != null) {
      s.segment_avg_pcid = Number(w.segment_avg_pcid);
    }
    var covPeak = w.coverage_peak_accounts != null ? w.coverage_peak_accounts : w.coverage_inflection_book_max;
    if (s.coverage_peak_accounts == null && covPeak != null) {
      s.coverage_peak_accounts = Math.round(Number(covPeak));
    }
    var medCalls = w.median_impact_calls_per_account != null
      ? w.median_impact_calls_per_account
      : w.median_impact_calls;
    if (s.median_impact_calls_per_account == null && medCalls != null) {
      s.median_impact_calls_per_account = Number(medCalls);
    }
    if (s.coverage_at_inflection == null && w.coverage_at_inflection != null) {
      s.coverage_at_inflection = Number(w.coverage_at_inflection);
    }
  });
}

function rollupRepLevel_(repRows) {
  var groups = {};
  repRows.forEach(function (r) {
    var parsed = parseRepMarketSegment_(r);
    if (!parsed || !parsed.segment) return;
    var key = segmentMarketKey_(parsed.country, parsed.segment);
    if (!key) return;
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
  if (r.team_name) {
    var fromTeam = parseTeamName_(r.team_name);
    if (fromTeam) return fromTeam;
  }
  if (r.country && r.segment) {
    return { country: rollupCountry_(String(r.country).toUpperCase()), segment: String(r.segment).toUpperCase() };
  }
  if (r.market && r.segment) {
    return { country: rollupCountry_(String(r.market).toUpperCase()), segment: String(r.segment).toUpperCase() };
  }
  if (r.market) {
    var mk = parseMarketKey_(String(r.market).toUpperCase());
    if (mk) {
      return { country: rollupCountry_(mk.country), segment: mk.segment };
    }
    return { country: rollupCountry_(String(r.market).toUpperCase()), segment: null };
  }
  return null;
}

/** GTM v2 team-name parsing — mirrors sql/_sales_segment_v2.sql */
function parseTeamName_(team) {
  var parts = String(team || '').split('-');
  if (parts.length < 2) return null;
  var country = rollupCountry_(parts[0].trim().toUpperCase());
  var segRaw = parts[1].trim();

  if (segRaw === 'MUpper' || segRaw.indexOf('MUpper') === 0) {
    return { country: country, segment: 'UMM' };
  }
  if (parts.length >= 3 && String(parts[2]).trim().toUpperCase() === 'ACCDE') {
    return { country: country, segment: 'ACC' };
  }

  var seg = segRaw.toUpperCase();
  if (KNOWN_SEGMENTS.indexOf(seg) >= 0) {
    return { country: country, segment: seg };
  }
  return null;
}

function rollupCountry_(c) {
  if (c === 'GB') return 'UK';
  if (c === 'DE' || c === 'AT' || c === 'CH') return 'DACH';
  if (c === 'BE' || c === 'NL' || c === 'LU') return 'BNL';
  if (c === 'ES' || c === 'PT') return 'IBE';
  return c;
}

/** Canonical country×segment key — must match between Rep_Level rollups and headcount.json markets. */
function segmentMarketKey_(country, segment) {
  var c = rollupCountry_(String(country || '').trim().toUpperCase());
  var seg = String(segment || '').trim().toUpperCase();
  if (!c || !seg) return null;
  return c + '-' + seg;
}

function parseMarketKey_(key) {
  var m = String(key || '').trim().toUpperCase().match(/^([A-Z]{2,5})-([A-Z]+)$/);
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
  return 'Ideal book is ~' + idealPcid + ' PCIDs per rep (' + bandLabel + ' band) — target size from sheet Rep_Level median bucket.';
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
    var me = null;
    for (var i = 0; i < modelEngine.length; i++) {
      if (modelEngine[i].region === region) { me = modelEngine[i]; break; }
    }
    if (me) {
      if (me.recommendation) {
        bullets.push('Model_Engine region ' + region + ' recommendation: ' + me.recommendation + '.');
      } else if (me.avg_growth != null) {
        bullets.push('Region ' + region + ' avg growth ' + formatPct_(me.avg_growth) + ' (Model_Engine).');
      }
    }
  }

  return bullets.slice(0, 3);
}

function computeHeadcountAction_(currentReps, optimalHc) {
  if (currentReps == null || optimalHc == null) {
    return { heads_to_add: null, heads_over: null, net_delta: null };
  }
  var cur = Math.round(currentReps);
  var opt = Math.round(optimalHc);
  var net = opt - cur;
  return {
    heads_to_add: net > 0 ? net : 0,
    heads_over: net < 0 ? -net : 0,
    net_delta: net,
  };
}

function buildActionNote_(rec, hcAction, currentReps, optimalHc) {
  var r = String(rec || 'Hold').toLowerCase();
  var add = hcAction.heads_to_add || 0;
  var over = hcAction.heads_over || 0;
  if (r.indexOf('hire') >= 0 && add > 0) {
    return 'Add ' + add + ' rep(s) to reach optimal HC ' + optimalHc + ' (currently ' + currentReps + ').';
  }
  if (r.indexOf('optimize') >= 0 && over > 0) {
    return over + ' rep(s) above model — optimize/peel books before any new hires.';
  }
  if (add > 0) {
    return 'Under model by ' + add + ' rep(s) — recommendation is ' + rec + '.';
  }
  if (over > 0) {
    return over + ' rep(s) above model — recommendation is ' + rec + '.';
  }
  return 'Headcount near model (' + currentReps + ' vs optimal ' + optimalHc + ') — no add needed.';
}

/** Warehouse-aligned: gap = current − optimal; Hire when under 90% of optimal. */
function recommendFromHeadcount_(currentReps, optimalHc, tab, country, modelEngine) {
  if (currentReps != null && optimalHc != null && optimalHc > 0) {
    var growthOk = true;
    if (tab.growth_peak_pct != null && Number(tab.growth_peak_pct) <= 0) growthOk = false;
    if (currentReps < optimalHc * 0.90 && growthOk) return 'Hire';
    if (currentReps > optimalHc * 1.10) return 'Optimize';
    return 'Hold';
  }
  if (modelEngine && modelEngine.length && country) {
    var region = countryToRegion_(country);
    for (var i = 0; i < modelEngine.length; i++) {
      if (modelEngine[i].region === region && modelEngine[i].recommendation) {
        return String(modelEngine[i].recommendation);
      }
    }
  }
  return 'Hold';
}

function recommendFromGap_(gap, country, modelEngine) {
  if (gap == null) {
    if (modelEngine && modelEngine.length && country) {
      var region = countryToRegion_(country);
      for (var i = 0; i < modelEngine.length; i++) {
        if (modelEngine[i].region === region && modelEngine[i].recommendation) {
          return String(modelEngine[i].recommendation);
        }
      }
    }
    return 'Hold';
  }
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

/** Rep_Level tab — rep_id, PCID Count, Market, Team_Name, … */
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
    var parsed = team ? parseTeamName_(team) : null;
    out.push({
      rep_id: String(repId).replace(/\.0$/, ''),
      pcid_count: parseNum_(cell_(row, col.pcid_count)),
      market: market ? rollupCountry_(String(market).trim().toUpperCase()) : (parsed ? parsed.country : null),
      team_name: team ? String(team).trim() : null,
      rep_or_director: cell_(row, col.rep_or_director) || null,
      country: market ? rollupCountry_(String(market).trim().toUpperCase()) : (parsed ? parsed.country : null),
      segment: cell_(row, col.segment) || (parsed ? parsed.segment : null),
      revenue_growth: parseNum_(cell_(row, col.revenue_growth)),
    });
  }
  return out;
}

/**
 * Capacity_Dashboard pivot: market in column J (index 9), rep count in column K (index 10).
 * Also supports header-based "Market" + "COUNTA of Rep Name" / "Number of Reps".
 */
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
    if (count !== null) totals[rollupCountry_(market.toUpperCase())] = Math.round(count);
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
    var code = market.length <= 4 ? rollupCountry_(market.toUpperCase()) : rollupCountry_(market.slice(0, 3).toUpperCase());
    totals[code] = Math.round(count);
  }
  return totals;
}

/** Model_Engine regional aggregates. */
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
