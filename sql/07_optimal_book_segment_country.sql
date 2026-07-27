-- Week 2 Step 2: Optimal book size analysis by segment × country
-- Buckets reps by accounts_per_rep; finds bucket with highest median revenue growth
-- Uses v1 base dataset logic inline for performance

WITH rep_meta AS (
  SELECT
    sales_rep_id,
    MAX(sales_market) AS market,
    MAX(sales_region) AS region
  FROM datalake.sales_data_strategy_dsa.current_parent_rep_assignment
  GROUP BY 1
),

current_period AS (
  SELECT
    j.current_sales_team_name AS team,
    p.company_size_segment AS segment,
    j.current_sales_rep_id AS sales_rep_id,
    j.current_parent_company_id AS parent_company_id,
    SUM(j.cpc_revenue_millicents + j.cpa_revenue_millicents) / 100000.0 AS revenue_usd
  FROM datalake.imhotep_iceberg.jobactivitymetrics j
  JOIN datalake.scss.client_attributes_dim_parent_attributes_current p
    ON j.current_parent_company_id = p.parent_company_id
  WHERE j.dl__yyyymmdd_cst BETWEEN '20260427' AND '20260725'
    AND j.current_sales_team_name IS NOT NULL
    AND j.current_sales_team_name <> 'None'
    AND j.current_sales_rep_id IS NOT NULL
  GROUP BY 1, 2, 3, 4
),

prior_period AS (
  SELECT
    j.current_sales_team_name AS team,
    p.company_size_segment AS segment,
    j.current_sales_rep_id AS sales_rep_id,
    SUM(j.cpc_revenue_millicents + j.cpa_revenue_millicents) / 100000.0 AS revenue_usd_prior
  FROM datalake.imhotep_iceberg.jobactivitymetrics j
  JOIN datalake.scss.client_attributes_dim_parent_attributes_current p
    ON j.current_parent_company_id = p.parent_company_id
  WHERE j.dl__yyyymmdd_cst BETWEEN '20260128' AND '20260426'
    AND j.current_sales_team_name IS NOT NULL
    AND j.current_sales_team_name <> 'None'
    AND j.current_sales_rep_id IS NOT NULL
  GROUP BY 1, 2, 3
),

rep_level AS (
  SELECT
    c.team,
    c.segment,
    c.sales_rep_id,
    COALESCE(m.market, REGEXP_EXTRACT(c.team, '^([A-Z]{2})-', 1)) AS country,
    COUNT(DISTINCT c.parent_company_id) AS accounts_per_rep,
    SUM(c.revenue_usd) AS revenue_usd_90d,
    MAX(p.revenue_usd_prior) AS revenue_usd_prior_90d
  FROM current_period c
  LEFT JOIN prior_period p
    ON c.team = p.team AND c.segment = p.segment AND c.sales_rep_id = p.sales_rep_id
  LEFT JOIN rep_meta m ON c.sales_rep_id = m.sales_rep_id
  GROUP BY 1, 2, 3, 4
),

bucketed AS (
  SELECT
    segment,
    country,
    sales_rep_id,
    accounts_per_rep,
    revenue_usd_90d,
    revenue_usd_prior_90d,
    (revenue_usd_90d - revenue_usd_prior_90d)
      / NULLIF(revenue_usd_prior_90d, 0) AS revenue_growth_pct,
    CASE
      WHEN accounts_per_rep <= 25 THEN '01: 1-25'
      WHEN accounts_per_rep <= 50 THEN '02: 26-50'
      WHEN accounts_per_rep <= 75 THEN '03: 51-75'
      WHEN accounts_per_rep <= 100 THEN '04: 76-100'
      WHEN accounts_per_rep <= 150 THEN '05: 101-150'
      ELSE '06: 150+'
    END AS book_size_bucket
  FROM rep_level
  WHERE revenue_usd_prior_90d > 0  -- need prior revenue for growth calc
)

SELECT
  segment,
  country,
  book_size_bucket,
  COUNT(DISTINCT sales_rep_id) AS rep_count,
  ROUND(AVG(accounts_per_rep), 1) AS avg_accounts_per_rep,
  ROUND(APPROX_PERCENTILE(revenue_growth_pct, 0.5), 3) AS median_revenue_growth_pct,
  ROUND(AVG(revenue_usd_90d / NULLIF(accounts_per_rep, 0)), 0) AS avg_rev_per_account
FROM bucketed
GROUP BY 1, 2, 3
HAVING COUNT(DISTINCT sales_rep_id) >= 5  -- minimum sample for reliability
ORDER BY segment, country, book_size_bucket;
