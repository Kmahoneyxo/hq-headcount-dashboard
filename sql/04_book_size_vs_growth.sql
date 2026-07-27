-- Week 1 Step 4: Book size vs revenue (team × segment rollup)
-- Buckets reps by accounts_per_rep, shows median revenue per account by bucket

WITH rep_level AS (
  SELECT
    j.current_sales_team_name AS team,
    p.company_size_segment AS segment,
    j.current_sales_rep_id AS sales_rep_id,
    COUNT(DISTINCT j.current_parent_company_id) AS accounts_per_rep,
    SUM(j.cpc_revenue_millicents + j.cpa_revenue_millicents) / 100000.0 AS revenue_usd_90d
  FROM datalake.imhotep_iceberg.jobactivitymetrics j
  JOIN datalake.scss.client_attributes_dim_parent_attributes_current p
    ON j.current_parent_company_id = p.parent_company_id
  WHERE j.dl__yyyymmdd_cst BETWEEN '20260427' AND '20260725'
    AND j.current_sales_team_name IS NOT NULL
    AND j.current_sales_team_name <> 'None'
    AND j.current_sales_rep_id IS NOT NULL
  GROUP BY 1, 2, 3
),

bucketed AS (
  SELECT
    team,
    segment,
    sales_rep_id,
    accounts_per_rep,
    revenue_usd_90d,
    CASE
      WHEN accounts_per_rep <= 25 THEN '01: 1-25'
      WHEN accounts_per_rep <= 50 THEN '02: 26-50'
      WHEN accounts_per_rep <= 100 THEN '03: 51-100'
      WHEN accounts_per_rep <= 200 THEN '04: 101-200'
      ELSE '05: 200+'
    END AS book_size_bucket
  FROM rep_level
)

SELECT
  segment,
  book_size_bucket,
  COUNT(DISTINCT sales_rep_id) AS rep_count,
  AVG(accounts_per_rep) AS avg_accounts_per_rep,
  AVG(revenue_usd_90d) AS avg_revenue_90d,
  AVG(revenue_usd_90d / NULLIF(accounts_per_rep, 0)) AS avg_revenue_per_account
FROM bucketed
GROUP BY 1, 2
ORDER BY 1, 2;
