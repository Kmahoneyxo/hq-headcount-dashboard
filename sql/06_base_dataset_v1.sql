-- Week 2 Step 1: Base analytical dataset v1
-- Grain: team × segment × rep with growth, rep coverage, and country
-- Current 90d: 20260427–20260725 | Prior 90d: 20260128–20260426

WITH rep_meta AS (
  SELECT
    sales_rep_id,
    MAX(sales_rep_name) AS sales_rep_name,
    MAX(sales_team_name) AS dsa_team_name,
    MAX(sales_market) AS market,
    MAX(sales_region) AS region,
    MAX(sales_segment) AS dsa_segment
  FROM datalake.sales_data_strategy_dsa.current_parent_rep_assignment
  GROUP BY 1
),

current_period AS (
  SELECT
    j.current_sales_team_name AS team,
    p.company_size_segment AS segment,
    j.current_sales_rep_id AS sales_rep_id,
    j.current_parent_company_id AS parent_company_id,
    SUM(j.cpc_revenue_millicents + j.cpa_revenue_millicents) / 100000.0 AS revenue_usd,
    SUM(j.clicks) AS clicks,
    SUM(j.apply_starts) AS apply_starts
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

rep_coverage AS (
  SELECT
    sales_rep_id,
    SUM(impact_calls) AS impact_calls_90d,
    SUM(total_calls) AS total_calls_90d,
    SUM(total_meetings) AS total_meetings_90d,
    SUM(outbound_emails) AS outbound_emails_90d
  FROM datalake.sales_data_strategy_dsa.rep_activity_sales
  WHERE SUBSTR(date, 1, 10) BETWEEN '2026-04-27' AND '2026-07-25'
  GROUP BY 1
),

rep_current AS (
  SELECT
    team,
    segment,
    sales_rep_id,
    COUNT(DISTINCT parent_company_id) AS accounts_per_rep,
    SUM(revenue_usd) AS revenue_usd_90d,
    SUM(clicks) AS clicks_90d,
    SUM(apply_starts) AS apply_starts_90d
  FROM current_period
  GROUP BY 1, 2, 3
)

SELECT
  c.team,
  c.segment,
  c.sales_rep_id,
  m.sales_rep_name,
  COALESCE(m.market, REGEXP_EXTRACT(c.team, '^([A-Z]{2})-', 1)) AS country,
  m.region,
  m.market,
  c.accounts_per_rep,
  c.revenue_usd_90d,
  p.revenue_usd_prior AS revenue_usd_prior_90d,
  (c.revenue_usd_90d - p.revenue_usd_prior)
    / NULLIF(p.revenue_usd_prior, 0) AS revenue_growth_pct,
  c.revenue_usd_90d / NULLIF(c.accounts_per_rep, 0) AS revenue_per_account,
  c.clicks_90d,
  c.apply_starts_90d,
  c.clicks_90d / NULLIF(c.accounts_per_rep, 0) AS clicks_per_account,
  c.apply_starts_90d / NULLIF(c.accounts_per_rep, 0) AS apply_starts_per_account,
  cov.impact_calls_90d,
  cov.total_calls_90d,
  cov.total_meetings_90d,
  cov.outbound_emails_90d,
  cov.impact_calls_90d / NULLIF(c.accounts_per_rep, 0) AS impact_calls_per_account
FROM rep_current c
LEFT JOIN prior_period p
  ON c.team = p.team
 AND c.segment = p.segment
 AND c.sales_rep_id = p.sales_rep_id
LEFT JOIN rep_meta m
  ON c.sales_rep_id = m.sales_rep_id
LEFT JOIN rep_coverage cov
  ON c.sales_rep_id = cov.sales_rep_id
ORDER BY c.team, c.segment, c.revenue_usd_90d DESC;
