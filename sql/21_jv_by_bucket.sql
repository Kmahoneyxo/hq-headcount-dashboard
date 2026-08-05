-- JV ($/job) by PCID bucket — companion to sql/16_growth_by_bucket_export.sql
-- One row per country × segment × PCID bucket with median rev_per_job.
-- Uses same bucket boundaries and filters as sql/16 opp_plateau (bucket_rev_job).
-- Join into headcount.json as jv_by_bucket[] per market (see scripts/build_market_summary.py).

WITH rep_meta AS (
  SELECT
    sales_rep_id,
    MAX(sales_market) AS market,
    MAX(sales_region) AS region
  FROM datalake.sales_data_strategy_dsa.current_parent_rep_assignment
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
    COUNT(DISTINCT j.current_parent_company_id) AS accounts_per_rep,
    COUNT(DISTINCT CASE WHEN j.dl__yyyymmdd_cst BETWEEN '20260427' AND '20260725'
      THEN j.agg_job_id END) AS jobs_90d,
    SUM(CASE WHEN j.dl__yyyymmdd_cst BETWEEN '20260427' AND '20260725'
      THEN j.cpc_revenue_millicents + j.cpa_revenue_millicents ELSE 0 END) / 100000.0 AS revenue_current,
    SUM(CASE WHEN j.dl__yyyymmdd_cst BETWEEN '20260128' AND '20260426'
      THEN j.cpc_revenue_millicents + j.cpa_revenue_millicents ELSE 0 END) / 100000.0 AS revenue_prior
  FROM datalake.imhotep_iceberg.jobactivitymetrics j
  LEFT JOIN rep_meta m ON j.current_sales_rep_id = m.sales_rep_id
  WHERE j.dl__yyyymmdd_cst BETWEEN '20260128' AND '20260725'
    AND j.current_sales_team_name IS NOT NULL
    AND j.current_sales_team_name <> 'None'
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

rep_filtered AS (
  SELECT
    segment,
    country,
    sales_rep_id,
    accounts_per_rep,
    jobs_90d,
    revenue_current / NULLIF(jobs_90d, 0) AS rev_per_job,
    CASE
      WHEN accounts_per_rep <= 10  THEN 1
      WHEN accounts_per_rep <= 20  THEN 2
      WHEN accounts_per_rep <= 30  THEN 3
      WHEN accounts_per_rep <= 40  THEN 4
      WHEN accounts_per_rep <= 50  THEN 5
      WHEN accounts_per_rep <= 65  THEN 6
      WHEN accounts_per_rep <= 80  THEN 7
      WHEN accounts_per_rep <= 100 THEN 8
      WHEN accounts_per_rep <= 125 THEN 9
      WHEN accounts_per_rep <= 150 THEN 10
      ELSE 11
    END AS bucket_order,
    CASE
      WHEN accounts_per_rep <= 10  THEN '01: 1-10'
      WHEN accounts_per_rep <= 20  THEN '02: 11-20'
      WHEN accounts_per_rep <= 30  THEN '03: 21-30'
      WHEN accounts_per_rep <= 40  THEN '04: 31-40'
      WHEN accounts_per_rep <= 50  THEN '05: 41-50'
      WHEN accounts_per_rep <= 65  THEN '06: 51-65'
      WHEN accounts_per_rep <= 80  THEN '07: 66-80'
      WHEN accounts_per_rep <= 100 THEN '08: 81-100'
      WHEN accounts_per_rep <= 125 THEN '09: 101-125'
      WHEN accounts_per_rep <= 150 THEN '10: 126-150'
      ELSE '11: 150+'
    END AS book_bucket,
    CASE
      WHEN accounts_per_rep <= 10  THEN 5
      WHEN accounts_per_rep <= 20  THEN 15
      WHEN accounts_per_rep <= 30  THEN 25
      WHEN accounts_per_rep <= 40  THEN 35
      WHEN accounts_per_rep <= 50  THEN 45
      WHEN accounts_per_rep <= 65  THEN 58
      WHEN accounts_per_rep <= 80  THEN 73
      WHEN accounts_per_rep <= 100 THEN 90
      WHEN accounts_per_rep <= 125 THEN 113
      WHEN accounts_per_rep <= 150 THEN 138
      ELSE 175
    END AS bucket_midpoint,
    CASE
      WHEN accounts_per_rep <= 10  THEN 10
      WHEN accounts_per_rep <= 20  THEN 20
      WHEN accounts_per_rep <= 30  THEN 30
      WHEN accounts_per_rep <= 40  THEN 40
      WHEN accounts_per_rep <= 50  THEN 50
      WHEN accounts_per_rep <= 65  THEN 65
      WHEN accounts_per_rep <= 80  THEN 80
      WHEN accounts_per_rep <= 100 THEN 100
      WHEN accounts_per_rep <= 125 THEN 125
      WHEN accounts_per_rep <= 150 THEN 150
      ELSE 999
    END AS bucket_upper
  FROM rep_level
  WHERE revenue_prior >= 5000
    AND jobs_90d > 0
)

SELECT
  segment,
  country,
  book_bucket,
  bucket_order,
  bucket_midpoint,
  bucket_upper,
  COUNT(DISTINCT sales_rep_id) AS rep_count,
  ROUND(APPROX_PERCENTILE(rev_per_job, 0.5), 2) AS median_rev_per_job
FROM rep_filtered
GROUP BY 1, 2, 3, 4, 5, 6
HAVING COUNT(DISTINCT sales_rep_id) >= 5
ORDER BY country, segment, bucket_order
