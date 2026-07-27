-- Week 3: Global headcount capacity model
-- Grain: team × segment
-- Balances book size, revenue growth, coverage vs targets, and SBS whitespace
-- Regional cost tier is a proxy until comp data is joined (see docs/data-sources.md)
-- Current 90d: 20260427–20260725 | Prior 90d: 20260128–20260426

WITH rep_meta AS (
  SELECT
    sales_rep_id,
    MAX(sales_rep_name) AS sales_rep_name,
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

rep_coverage AS (
  SELECT
    sales_rep_id,
    SUM(impact_calls) AS impact_calls_90d,
    SUM(total_meetings) AS total_meetings_90d
  FROM datalake.sales_data_strategy_dsa.rep_activity_sales
  WHERE SUBSTR(date, 1, 10) BETWEEN '2026-04-27' AND '2026-07-25'
  GROUP BY 1
),

rep_level AS (
  SELECT
    c.team,
    c.segment,
    c.sales_rep_id,
    COALESCE(m.market, REGEXP_EXTRACT(c.team, '^([A-Z]{2})-', 1)) AS country,
    m.region,
    COUNT(DISTINCT c.parent_company_id) AS accounts_per_rep,
    SUM(c.revenue_usd) AS revenue_usd_90d,
    MAX(p.revenue_usd_prior) AS revenue_usd_prior_90d,
    MAX(cov.impact_calls_90d) AS impact_calls_90d
  FROM current_period c
  LEFT JOIN prior_period p
    ON c.team = p.team AND c.segment = p.segment AND c.sales_rep_id = p.sales_rep_id
  LEFT JOIN rep_meta m ON c.sales_rep_id = m.sales_rep_id
  LEFT JOIN rep_coverage cov ON c.sales_rep_id = cov.sales_rep_id
  GROUP BY 1, 2, 3, 4, 5
),

rep_filtered AS (
  SELECT
    *,
    LEAST(GREATEST(
      (revenue_usd_90d - revenue_usd_prior_90d) / NULLIF(revenue_usd_prior_90d, 0),
      -0.5
    ), 1.0) AS revenue_growth_pct,
    CASE
      WHEN accounts_per_rep <= 25 THEN '01: 1-25'
      WHEN accounts_per_rep <= 50 THEN '02: 26-50'
      WHEN accounts_per_rep <= 75 THEN '03: 51-75'
      WHEN accounts_per_rep <= 100 THEN '04: 76-100'
      WHEN accounts_per_rep <= 150 THEN '05: 101-150'
      ELSE '06: 150+'
    END AS book_size_bucket,
    impact_calls_90d / NULLIF(accounts_per_rep, 0) AS impact_calls_per_account
  FROM rep_level
  WHERE revenue_usd_prior_90d >= 5000
),

-- Optimal book bucket + coverage target by segment × country
bucket_stats AS (
  SELECT
    segment,
    country,
    book_size_bucket,
    COUNT(*) AS rep_count,
    APPROX_PERCENTILE(revenue_growth_pct, 0.5) AS median_growth,
    APPROX_PERCENTILE(impact_calls_per_account, 0.5) AS median_coverage
  FROM rep_filtered
  GROUP BY 1, 2, 3
  HAVING COUNT(*) >= 5
),

benchmarks AS (
  SELECT
    segment,
    country,
    book_size_bucket AS optimal_bucket,
    median_growth AS optimal_growth,
    median_coverage AS coverage_target,
    CASE book_size_bucket
      WHEN '01: 1-25' THEN 13
      WHEN '02: 26-50' THEN 38
      WHEN '03: 51-75' THEN 63
      WHEN '04: 76-100' THEN 88
      WHEN '05: 101-150' THEN 125
      ELSE 175
    END AS optimal_book_mid,
    CASE book_size_bucket
      WHEN '01: 1-25' THEN 25
      WHEN '02: 26-50' THEN 50
      WHEN '03: 51-75' THEN 75
      WHEN '04: 76-100' THEN 100
      WHEN '05: 101-150' THEN 150
      ELSE 999
    END AS optimal_book_high,
    CASE book_size_bucket
      WHEN '01: 1-25' THEN 1
      WHEN '02: 26-50' THEN 26
      WHEN '03: 51-75' THEN 51
      WHEN '04: 76-100' THEN 76
      WHEN '05: 101-150' THEN 101
      ELSE 151
    END AS optimal_book_low
  FROM (
    SELECT *,
      ROW_NUMBER() OVER (
        PARTITION BY segment, country
        ORDER BY median_growth DESC, rep_count DESC
      ) AS rn
    FROM bucket_stats
    WHERE median_growth > 0
  )
  WHERE rn = 1
),

segment_country_context AS (
  SELECT
    segment,
    country,
    APPROX_PERCENTILE(revenue_growth_pct, 0.5) AS market_median_growth
  FROM rep_filtered
  GROUP BY 1, 2
),

-- SBS whitespace by segment (global pool available for assignment)
sbs_whitespace AS (
  SELECT
    p.company_size_segment AS segment,
    COUNT(DISTINCT j.current_parent_company_id) AS unassigned_accounts,
    SUM(j.cpc_revenue_millicents + j.cpa_revenue_millicents) / 100000.0 AS unassigned_revenue_90d
  FROM datalake.imhotep_iceberg.jobactivitymetrics j
  JOIN datalake.scss.client_attributes_dim_parent_attributes_current p
    ON j.current_parent_company_id = p.parent_company_id
  WHERE j.dl__yyyymmdd_cst BETWEEN '20260427' AND '20260725'
    AND (j.current_sales_team_name IS NULL OR j.current_sales_team_name = 'None')
  GROUP BY 1
),

team_summary AS (
  SELECT
    team,
    segment,
    country,
    MAX(region) AS region,
    COUNT(DISTINCT sales_rep_id) AS reps,
    ROUND(AVG(accounts_per_rep), 0) AS avg_book_size,
    ROUND(SUM(revenue_usd_90d), 0) AS revenue_90d,
    ROUND(SUM(revenue_usd_90d) / NULLIF(COUNT(DISTINCT sales_rep_id), 0), 0) AS revenue_per_rep,
    ROUND(APPROX_PERCENTILE(revenue_growth_pct, 0.5), 3) AS median_growth_pct,
    ROUND(APPROX_PERCENTILE(impact_calls_per_account, 0.5), 1) AS median_coverage_per_account
  FROM rep_filtered
  GROUP BY 1, 2, 3
  HAVING COUNT(DISTINCT sales_rep_id) >= 3
)

SELECT
  t.team,
  t.segment,
  t.country,
  t.region,
  -- Regional cost proxy (replace with comp data when available)
  CASE
    WHEN t.region IN ('The Americas') OR t.country = 'US' THEN 'High'
    WHEN t.region IN ('EMEA_AU_IN', 'EMEA') OR t.country IN ('UK', 'DACH', 'FR') THEN 'Medium-High'
    WHEN t.country = 'JP' THEN 'Medium'
    ELSE 'Standard'
  END AS region_cost_tier,
  t.reps,
  t.avg_book_size,
  b.optimal_book_low,
  b.optimal_book_mid,
  b.optimal_book_high,
  b.optimal_bucket,
  t.median_growth_pct,
  sc.market_median_growth,
  t.median_coverage_per_account,
  b.coverage_target,
  t.revenue_90d,
  t.revenue_per_rep,
  s.unassigned_accounts AS sbs_whitespace_accounts,
  ROUND(s.unassigned_revenue_90d, 0) AS sbs_whitespace_revenue_90d,
  -- Capacity gap: positive = room to add accounts, negative = overbooked
  ROUND(b.optimal_book_mid - t.avg_book_size, 0) AS book_gap_vs_optimal,
  -- Estimated reps needed to reach optimal book (rough)
  GREATEST(0, ROUND(
    (t.avg_book_size * t.reps) / NULLIF(b.optimal_book_mid, 0) - t.reps,
    0
  )) AS estimated_reps_to_optimal,
  CASE
    -- Market declining: do not hire unless severely under-booked with whitespace
    WHEN sc.market_median_growth < 0 AND t.avg_book_size >= b.optimal_book_low THEN 'Do Not Hire'
    -- Under-booked + growing + whitespace + coverage OK → hire
    WHEN t.avg_book_size < b.optimal_book_low
      AND t.median_growth_pct >= 0
      AND COALESCE(s.unassigned_accounts, 0) > 100
      AND t.median_coverage_per_account >= COALESCE(b.coverage_target, 0) * 0.7
      THEN 'Hire'
    -- Over-booked or coverage failing → optimize (consolidate/redistribute)
    WHEN t.avg_book_size > b.optimal_book_high
      OR t.median_coverage_per_account < COALESCE(b.coverage_target, 0) * 0.5
      THEN 'Optimize'
    -- At target, growing → hold
    WHEN t.avg_book_size BETWEEN b.optimal_book_low AND b.optimal_book_high
      AND t.median_growth_pct >= 0
      THEN 'Hold'
    -- Under-booked but no whitespace or market decline
    WHEN t.avg_book_size < b.optimal_book_low
      AND (COALESCE(s.unassigned_accounts, 0) <= 100 OR sc.market_median_growth < 0)
      THEN 'Do Not Hire'
    ELSE 'Hold'
  END AS capacity_recommendation
FROM team_summary t
LEFT JOIN benchmarks b ON t.segment = b.segment AND t.country = b.country
LEFT JOIN segment_country_context sc ON t.segment = sc.segment AND t.country = sc.country
LEFT JOIN sbs_whitespace s ON t.segment = s.segment
ORDER BY t.revenue_90d DESC;
