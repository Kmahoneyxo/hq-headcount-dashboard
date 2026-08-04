-- Impact coverage for all reps — rep-level export from data lake
-- impact_calls_per_account = SUM(impact_calls) from rep_activity_sales (90d) / PCID count
-- Segment = GTM sales segment from current_sales_team_name (see sql/_sales_segment_v2.sql)
-- Run on Quest prod; output → docs/data/impact_coverage_all_reps.json

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
    COUNT(DISTINCT j.current_parent_company_id) AS accounts_per_rep,
    SUM(CASE WHEN j.dl__yyyymmdd_cst BETWEEN '20260427' AND '20260725'
      THEN j.cpc_revenue_millicents + j.cpa_revenue_millicents ELSE 0 END) / 100000.0 AS revenue_current,
    SUM(CASE WHEN j.dl__yyyymmdd_cst BETWEEN '20260128' AND '20260426'
      THEN j.cpc_revenue_millicents + j.cpa_revenue_millicents ELSE 0 END) / 100000.0 AS revenue_prior,
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
),

rep_base AS (
  SELECT
    segment, country, sales_rep_id, sales_team_name,
    accounts_per_rep AS pcid_count,
    revenue_prior AS pqr_90d,
    revenue_current AS revenue_90d,
    impact_calls_90d,
    impact_calls_90d / NULLIF(accounts_per_rep, 0) AS impact_calls_per_account
  FROM rep_level
  WHERE revenue_prior >= 5000
),

segment_benchmarks AS (
  SELECT segment, country,
    AVG(pcid_count) AS segment_avg_pcid,
    AVG(pqr_90d) AS segment_avg_pqr,
    AVG(impact_calls_per_account) AS segment_avg_coverage
  FROM rep_base
  GROUP BY 1, 2
)

SELECT
  rb.country,
  rb.segment,
  rb.sales_rep_id,
  rb.sales_team_name,
  rb.pcid_count,
  rb.impact_calls_90d,
  ROUND(rb.impact_calls_per_account, 2) AS impact_calls_per_account,
  ROUND(sb.segment_avg_coverage, 2) AS segment_avg_coverage,
  (
    (rb.pcid_count > sb.segment_avg_pcid OR rb.pqr_90d > sb.segment_avg_pqr)
    AND (rb.impact_calls_per_account < sb.segment_avg_coverage * 0.90 OR rb.revenue_90d < rb.pqr_90d)
  ) AS too_big
FROM rep_base rb
JOIN segment_benchmarks sb ON rb.segment = sb.segment AND rb.country = sb.country
ORDER BY country, segment, sales_rep_id
