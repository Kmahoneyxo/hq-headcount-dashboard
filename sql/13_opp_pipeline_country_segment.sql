-- Opportunity pipeline: revenue per job vs book size by country × segment
-- Find the book-size bucket where rev/job plateaus (diminishing opp pipeline returns)
-- Current 90d: 20260427–20260725 | Prior 90d: 20260128–20260426
-- Japan excluded. Uses agg_job_id for distinct jobs per rep.

WITH rep_meta AS (
  SELECT
    sales_rep_id,
    MAX(sales_market) AS market
  FROM datalake.sales_data_strategy_dsa.current_parent_rep_assignment
  GROUP BY 1
),

rep_level AS (
  SELECT
    p.company_size_segment AS segment,
    COALESCE(m.market, REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-', 1)) AS country,
    j.current_sales_rep_id AS sales_rep_id,
    COUNT(DISTINCT j.current_parent_company_id) AS accounts_per_rep,
    COUNT(DISTINCT CASE WHEN j.dl__yyyymmdd_cst BETWEEN '20260427' AND '20260725'
      THEN j.agg_job_id END) AS jobs_90d,
    SUM(CASE WHEN j.dl__yyyymmdd_cst BETWEEN '20260427' AND '20260725'
      THEN j.cpc_revenue_millicents + j.cpa_revenue_millicents ELSE 0 END) / 100000.0 AS revenue_current,
    SUM(CASE WHEN j.dl__yyyymmdd_cst BETWEEN '20260128' AND '20260426'
      THEN j.cpc_revenue_millicents + j.cpa_revenue_millicents ELSE 0 END) / 100000.0 AS revenue_prior
  FROM datalake.imhotep_iceberg.jobactivitymetrics j
  JOIN datalake.scss.client_attributes_dim_parent_attributes_current p
    ON j.current_parent_company_id = p.parent_company_id
  LEFT JOIN rep_meta m ON j.current_sales_rep_id = m.sales_rep_id
  WHERE j.dl__yyyymmdd_cst BETWEEN '20260128' AND '20260725'
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
),

bucket_rev_job AS (
  SELECT
    segment,
    country,
    book_bucket,
    bucket_order,
    bucket_upper,
    COUNT(DISTINCT sales_rep_id) AS rep_count,
    ROUND(APPROX_PERCENTILE(rev_per_job, 0.5), 2) AS median_rev_per_job
  FROM rep_filtered
  GROUP BY 1, 2, 3, 4, 5
  HAVING COUNT(DISTINCT sales_rep_id) >= 5
),

peak AS (
  SELECT segment, country, MAX(median_rev_per_job) AS peak_rev_per_job
  FROM bucket_rev_job
  GROUP BY 1, 2
),

with_next AS (
  SELECT
    b.*,
    p.peak_rev_per_job,
    LEAD(b.median_rev_per_job) OVER (PARTITION BY b.segment, b.country ORDER BY b.bucket_order) AS next_bucket_rev_per_job,
    LEAD(b.bucket_order) OVER (PARTITION BY b.segment, b.country ORDER BY b.bucket_order) AS next_bucket_order
  FROM bucket_rev_job b
  JOIN peak p ON b.segment = p.segment AND b.country = p.country
),

plateau AS (
  SELECT
    segment,
    country,
    book_bucket AS opp_plateau_bucket,
    bucket_upper AS opp_plateau_book_max,
    median_rev_per_job AS opp_plateau_rev_per_job,
    rep_count AS reps_at_plateau_bucket
  FROM (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY segment, country ORDER BY bucket_order DESC) AS rn
    FROM with_next
    WHERE bucket_order <= 10  -- exclude 150+ outlier bucket
      AND median_rev_per_job >= peak_rev_per_job * 0.90
      AND (next_bucket_rev_per_job IS NULL OR next_bucket_rev_per_job < median_rev_per_job OR next_bucket_order IS NULL)
  )
  WHERE rn = 1
)

SELECT
  b.segment,
  b.country,
  b.book_bucket,
  b.rep_count,
  b.median_rev_per_job,
  pl.opp_plateau_bucket,
  pl.opp_plateau_book_max,
  pl.opp_plateau_rev_per_job
FROM bucket_rev_job b
LEFT JOIN plateau pl ON b.segment = pl.segment AND b.country = pl.country
ORDER BY b.segment, b.country, b.bucket_order;
