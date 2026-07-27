-- Week 1 Step 3: Base analytical dataset v0
-- Grain: team × segment × rep over 90-day window
-- Adjust date range to latest complete 90 days

WITH daily_rep_book AS (
  SELECT
    j.dl__yyyymmdd_cst AS activity_date,
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
  WHERE j.dl__yyyymmdd_cst BETWEEN '20260427' AND '20260725'  -- 90 days
    AND j.current_sales_team_name IS NOT NULL
    AND j.current_sales_team_name <> 'None'
    AND j.current_sales_rep_id IS NOT NULL
  GROUP BY 1, 2, 3, 4, 5
),

-- Distinct accounts per rep (book size) over full window
rep_accounts AS (
  SELECT
    team,
    segment,
    sales_rep_id,
    COUNT(DISTINCT parent_company_id) AS account_count
  FROM daily_rep_book
  GROUP BY 1, 2, 3
),

-- Revenue by rep: current 90d vs prior 90d for growth (update date windows)
rep_revenue_current AS (
  SELECT
    team,
    segment,
    sales_rep_id,
    SUM(revenue_usd) AS revenue_usd_90d,
    SUM(clicks) AS clicks_90d,
    SUM(apply_starts) AS apply_starts_90d
  FROM daily_rep_book
  GROUP BY 1, 2, 3
)

SELECT
  r.team,
  r.segment,
  r.sales_rep_id,
  a.account_count,
  r.revenue_usd_90d,
  r.revenue_usd_90d / NULLIF(a.account_count, 0) AS revenue_per_account,
  r.clicks_90d,
  r.apply_starts_90d,
  r.clicks_90d / NULLIF(a.account_count, 0) AS clicks_per_account,
  a.account_count AS accounts_per_rep  -- book size (account count)
FROM rep_revenue_current r
JOIN rep_accounts a
  ON r.team = a.team
 AND r.segment = a.segment
 AND r.sales_rep_id = a.sales_rep_id
ORDER BY r.team, r.segment, r.revenue_usd_90d DESC;
