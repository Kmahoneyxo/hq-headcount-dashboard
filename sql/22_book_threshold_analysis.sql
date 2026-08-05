-- Rep-level book threshold analysis (Option A) — sql/22
-- One row per rep: PCID, revenue growth, JV, impact coverage for threshold bucketing.
-- Segment = GTM sales segment (sql/_sales_segment_v2.sql). Run on Quest prod.
-- Windows: current 90d 20260427–20260725 vs prior PQR 20260128–20260426.
-- Downstream: scripts/analyze-book-thresholds.py → book_size_threshold_analysis.xlsx

WITH rep_meta AS (
  SELECT sales_rep_id, MAX(sales_market) AS market
  FROM datalake.sales_data_strategy_dsa.current_parent_rep_assignment
  GROUP BY 1
),

rep_coverage AS (
  SELECT sales_rep_id, SUM(impact_calls) AS impact_calls_90d
  FROM datalake.sales_data_strategy_dsa.rep_activity_sales
  WHERE SUBSTR(CAST(date AS VARCHAR), 1, 10) BETWEEN '2026-04-27' AND '2026-07-25'
  GROUP BY 1
),

rep_level AS (
  SELECT
    CASE
      WHEN REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-([A-Za-z]+)-([A-Za-z]+)-', 3) = 'ACCDE' THEN 'ACC'
      WHEN REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-([A-Za-z]+)-', 2) = 'MUpper' THEN 'UMM'
      WHEN REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-([A-Za-z]+)-', 2)
        IN ('M', 'L', 'NAM', 'DCA', 'ISDCA', 'NAMDCA')
        THEN REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-([A-Za-z]+)-', 2)
    END AS segment,
    CASE
      WHEN COALESCE(m.market, REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-', 1))
        IN ('DE', 'AT', 'CH') THEN 'DACH'
      WHEN COALESCE(m.market, REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-', 1))
        IN ('BE', 'NL', 'LU') THEN 'BNL'
      WHEN COALESCE(m.market, REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-', 1)) = 'GB' THEN 'UK'
      ELSE COALESCE(m.market, REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-', 1))
    END AS country,
    j.current_sales_rep_id AS sales_rep_id,
    MAX(j.current_sales_team_name) AS sales_team_name,
    COUNT(DISTINCT j.current_parent_company_id) AS pcid_count,
    COUNT(DISTINCT CASE WHEN j.dl__yyyymmdd_cst BETWEEN '20260427' AND '20260725'
      THEN j.agg_job_id END) AS jobs_90d,
    SUM(CASE WHEN j.dl__yyyymmdd_cst BETWEEN '20260427' AND '20260725'
      THEN j.cpc_revenue_millicents + j.cpa_revenue_millicents ELSE 0 END) / 100000.0 AS revenue_90d,
    SUM(CASE WHEN j.dl__yyyymmdd_cst BETWEEN '20260128' AND '20260426'
      THEN j.cpc_revenue_millicents + j.cpa_revenue_millicents ELSE 0 END) / 100000.0 AS pqr_90d,
    MAX(cov.impact_calls_90d) AS impact_calls_90d
  FROM datalake.imhotep_iceberg.jobactivitymetrics j
  LEFT JOIN rep_meta m ON j.current_sales_rep_id = m.sales_rep_id
  LEFT JOIN rep_coverage cov ON j.current_sales_rep_id = cov.sales_rep_id
  WHERE j.dl__yyyymmdd_cst BETWEEN '20260128' AND '20260725'
    AND j.current_sales_team_name IS NOT NULL AND j.current_sales_team_name <> 'None'
    AND j.current_sales_rep_id IS NOT NULL
    AND COALESCE(m.market, REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-', 1), 'XX') <> 'JP'
    AND CASE
      WHEN REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-([A-Za-z]+)-([A-Za-z]+)-', 3) = 'ACCDE' THEN 'ACC'
      WHEN REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-([A-Za-z]+)-', 2) = 'MUpper' THEN 'UMM'
      WHEN REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-([A-Za-z]+)-', 2)
        IN ('M', 'L', 'NAM', 'DCA', 'ISDCA', 'NAMDCA')
        THEN REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-([A-Za-z]+)-', 2)
    END IS NOT NULL
  GROUP BY 1, 2, 3
)

SELECT
  country,
  segment,
  sales_rep_id,
  sales_team_name AS team,
  pcid_count,
  ROUND(revenue_90d, 1) AS revenue_90d,
  ROUND(pqr_90d, 1) AS pqr_90d,
  ROUND(LEAST(GREATEST(
    (revenue_90d - pqr_90d) / NULLIF(pqr_90d, 0),
    -0.5
  ), 1.0), 3) AS rev_growth_pct,
  jobs_90d,
  ROUND(revenue_90d / NULLIF(jobs_90d, 0), 2) AS rev_per_job,
  impact_calls_90d,
  ROUND(impact_calls_90d / NULLIF(pcid_count, 0), 2) AS impact_coverage
FROM rep_level
WHERE pqr_90d >= 5000
ORDER BY country, segment, sales_rep_id
