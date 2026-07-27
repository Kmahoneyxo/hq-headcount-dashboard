-- Coverage inflection: impact calls per account vs book size by country × segment
-- Source: rep_activity_sales.impact_calls joined to JAM book size
-- Current 90d: 20260427–20260725 | Japan excluded

WITH rep_meta AS (
  SELECT
    sales_rep_id,
    MAX(sales_market) AS market
  FROM datalake.sales_data_strategy_dsa.current_parent_rep_assignment
  GROUP BY 1
),

rep_coverage AS (
  SELECT
    sales_rep_id,
    SUM(impact_calls) AS impact_calls_90d
  FROM datalake.sales_data_strategy_dsa.rep_activity_sales
  WHERE SUBSTR(CAST(date AS VARCHAR), 1, 10) BETWEEN '2026-04-27' AND '2026-07-25'
  GROUP BY 1
),

rep_level AS (
  SELECT
    p.company_size_segment AS segment,
    COALESCE(m.market, REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-', 1)) AS country,
    j.current_sales_rep_id AS sales_rep_id,
    COUNT(DISTINCT j.current_parent_company_id) AS accounts_per_rep,
    MAX(cov.impact_calls_90d) AS impact_calls_90d
  FROM datalake.imhotep_iceberg.jobactivitymetrics j
  JOIN datalake.scss.client_attributes_dim_parent_attributes_current p
    ON j.current_parent_company_id = p.parent_company_id
  LEFT JOIN rep_meta m ON j.current_sales_rep_id = m.sales_rep_id
  LEFT JOIN rep_coverage cov ON j.current_sales_rep_id = cov.sales_rep_id
  WHERE j.dl__yyyymmdd_cst BETWEEN '20260427' AND '20260725'
    AND j.current_sales_team_name IS NOT NULL
    AND j.current_sales_team_name <> 'None'
    AND j.current_sales_rep_id IS NOT NULL
    AND COALESCE(m.market, REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-', 1), 'XX') <> 'JP'
  GROUP BY 1, 2, 3
),

rep_filtered AS (
  SELECT
    segment,
    country,
    sales_rep_id,
    accounts_per_rep,
    impact_calls_90d / NULLIF(accounts_per_rep, 0) AS impact_calls_per_account,
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
  WHERE impact_calls_90d > 0
),

bucket_coverage AS (
  SELECT
    segment,
    country,
    book_bucket,
    bucket_order,
    bucket_upper,
    COUNT(DISTINCT sales_rep_id) AS rep_count,
    ROUND(APPROX_PERCENTILE(impact_calls_per_account, 0.5), 2) AS median_impact_calls_per_account
  FROM rep_filtered
  GROUP BY 1, 2, 3, 4, 5
  HAVING COUNT(DISTINCT sales_rep_id) >= 5
),

peak AS (
  SELECT segment, country, MAX(median_impact_calls_per_account) AS peak_coverage
  FROM bucket_coverage
  GROUP BY 1, 2
),

with_next AS (
  SELECT
    b.*,
    p.peak_coverage,
    LEAD(b.median_impact_calls_per_account) OVER (PARTITION BY b.segment, b.country ORDER BY b.bucket_order) AS next_bucket_coverage
  FROM bucket_coverage b
  JOIN peak p ON b.segment = p.segment AND b.country = p.country
),

inflection AS (
  SELECT
    segment,
    country,
    book_bucket AS coverage_inflection_bucket,
    bucket_upper AS coverage_inflection_book_max,
    median_impact_calls_per_account AS coverage_at_inflection,
    rep_count AS reps_at_inflection_bucket
  FROM (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY segment, country ORDER BY bucket_order DESC) AS rn
    FROM with_next
    WHERE bucket_order <= 10
      AND median_impact_calls_per_account >= peak_coverage * 0.85
      AND (next_bucket_coverage IS NULL OR next_bucket_coverage < median_impact_calls_per_account * 0.95)
  )
  WHERE rn = 1
)

SELECT
  b.segment,
  b.country,
  b.book_bucket,
  b.rep_count,
  b.median_impact_calls_per_account,
  inf.coverage_inflection_bucket,
  inf.coverage_inflection_book_max,
  inf.coverage_at_inflection
FROM bucket_coverage b
LEFT JOIN inflection inf ON b.segment = inf.segment AND b.country = inf.country
ORDER BY b.segment, b.country, b.bucket_order;
