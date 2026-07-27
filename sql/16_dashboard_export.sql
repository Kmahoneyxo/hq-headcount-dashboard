-- Dashboard export: headcount + FY26 book score + opp pipeline + SBS + coverage
-- Combines sql/12–15 into one row per country × segment for headcount.json
-- Run this (or Quest schedule) to refresh docs/data/headcount.json
-- See sql/16_dashboard_export.sql — supersedes sql/12 for full dashboard fields

WITH rep_meta AS (
  SELECT
    sales_rep_id,
    MAX(sales_market) AS market,
    MAX(sales_region) AS region
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
    COUNT(DISTINCT CASE WHEN j.dl__yyyymmdd_cst BETWEEN '20260427' AND '20260725'
      THEN j.agg_job_id END) AS jobs_90d,
    SUM(CASE WHEN j.dl__yyyymmdd_cst BETWEEN '20260427' AND '20260725'
      THEN j.cpc_revenue_millicents + j.cpa_revenue_millicents ELSE 0 END) / 100000.0 AS revenue_current,
    SUM(CASE WHEN j.dl__yyyymmdd_cst BETWEEN '20260128' AND '20260426'
      THEN j.cpc_revenue_millicents + j.cpa_revenue_millicents ELSE 0 END) / 100000.0 AS revenue_prior,
    MAX(cov.impact_calls_90d) AS impact_calls_90d
  FROM datalake.imhotep_iceberg.jobactivitymetrics j
  JOIN datalake.scss.client_attributes_dim_parent_attributes_current p
    ON j.current_parent_company_id = p.parent_company_id
  LEFT JOIN rep_meta m ON j.current_sales_rep_id = m.sales_rep_id
  LEFT JOIN rep_coverage cov ON j.current_sales_rep_id = cov.sales_rep_id
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
    impact_calls_90d,
    revenue_current / NULLIF(jobs_90d, 0) AS rev_per_job,
    impact_calls_90d / NULLIF(accounts_per_rep, 0) AS impact_calls_per_account,
    LEAST(GREATEST(
      (revenue_current - revenue_prior) / NULLIF(revenue_prior, 0),
      -0.5
    ), 1.0) AS revenue_growth_pct,
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
),

bucket_growth AS (
  SELECT
    segment, country, book_bucket, bucket_order, bucket_midpoint, bucket_upper,
    COUNT(DISTINCT sales_rep_id) AS rep_count,
    ROUND(APPROX_PERCENTILE(revenue_growth_pct, 0.5), 3) AS median_growth_pct
  FROM rep_filtered
  GROUP BY 1, 2, 3, 4, 5, 6
  HAVING COUNT(DISTINCT sales_rep_id) >= 5
),

peak AS (
  SELECT segment, country, MAX(median_growth_pct) AS peak_growth_pct
  FROM bucket_growth WHERE bucket_order <= 10 AND rep_count >= 20 GROUP BY 1, 2
),

with_next AS (
  SELECT b.*, p.peak_growth_pct,
    LEAD(b.median_growth_pct) OVER (PARTITION BY b.segment, b.country ORDER BY b.bucket_order) AS next_bucket_growth,
    LEAD(b.bucket_order) OVER (PARTITION BY b.segment, b.country ORDER BY b.bucket_order) AS next_bucket_order
  FROM bucket_growth b
  JOIN peak p ON b.segment = p.segment AND b.country = p.country
),

perfect_book AS (
  SELECT segment, country, book_bucket AS perfect_book_bucket,
    bucket_midpoint AS perfect_book_accounts, bucket_upper AS perfect_book_max,
    median_growth_pct AS perfect_book_growth_pct, rep_count AS reps_in_perfect_bucket
  FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY segment, country ORDER BY bucket_order DESC) AS rn
    FROM with_next
    WHERE median_growth_pct >= peak_growth_pct * 0.85
      AND (next_bucket_growth IS NULL OR next_bucket_growth <= median_growth_pct OR next_bucket_order IS NULL)
      AND median_growth_pct > 0
      AND bucket_order <= 10
      AND rep_count >= 20
  ) WHERE rn = 1
),

-- Opp pipeline plateau (sql/13 logic)
bucket_rev_job AS (
  SELECT segment, country, bucket_order, bucket_upper,
    ROUND(APPROX_PERCENTILE(rev_per_job, 0.5), 2) AS median_rev_per_job,
    COUNT(DISTINCT sales_rep_id) AS rep_count
  FROM rep_filtered WHERE jobs_90d > 0
  GROUP BY 1, 2, 3, 4
  HAVING COUNT(DISTINCT sales_rep_id) >= 5
),

opp_peak AS (
  SELECT segment, country, MAX(median_rev_per_job) AS peak_rev_per_job
  FROM bucket_rev_job GROUP BY 1, 2
),

opp_with_next AS (
  SELECT b.*, p.peak_rev_per_job,
    LEAD(b.median_rev_per_job) OVER (PARTITION BY b.segment, b.country ORDER BY b.bucket_order) AS next_rev_per_job
  FROM bucket_rev_job b
  JOIN opp_peak p ON b.segment = p.segment AND b.country = p.country
),

opp_plateau AS (
  SELECT segment, country, bucket_upper AS opp_plateau_book_max,
    median_rev_per_job AS opp_plateau_rev_per_job
  FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY segment, country ORDER BY bucket_order DESC) AS rn
    FROM opp_with_next
    WHERE bucket_order <= 10
      AND median_rev_per_job >= peak_rev_per_job * 0.90
      AND (next_rev_per_job IS NULL OR next_rev_per_job < median_rev_per_job)
  ) WHERE rn = 1
),

-- Coverage inflection (sql/15 logic)
bucket_coverage AS (
  SELECT segment, country, bucket_order, bucket_upper,
    ROUND(APPROX_PERCENTILE(impact_calls_per_account, 0.5), 2) AS median_impact_calls_per_account,
    COUNT(DISTINCT sales_rep_id) AS rep_count
  FROM rep_filtered WHERE impact_calls_90d > 0
  GROUP BY 1, 2, 3, 4
  HAVING COUNT(DISTINCT sales_rep_id) >= 5
),

cov_peak AS (
  SELECT segment, country, MAX(median_impact_calls_per_account) AS peak_coverage
  FROM bucket_coverage GROUP BY 1, 2
),

cov_with_next AS (
  SELECT b.*, p.peak_coverage,
    LEAD(b.median_impact_calls_per_account) OVER (PARTITION BY b.segment, b.country ORDER BY b.bucket_order) AS next_coverage
  FROM bucket_coverage b
  JOIN cov_peak p ON b.segment = p.segment AND b.country = p.country
),

coverage_inflection AS (
  SELECT segment, country, bucket_upper AS coverage_inflection_book_max,
    median_impact_calls_per_account AS coverage_at_inflection
  FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY segment, country ORDER BY bucket_order DESC) AS rn
    FROM cov_with_next
    WHERE bucket_order <= 10
      AND median_impact_calls_per_account >= peak_coverage * 0.85
      AND (next_coverage IS NULL OR next_coverage < median_impact_calls_per_account * 0.95)
  ) WHERE rn = 1
),

market_coverage AS (
  SELECT segment, country,
    ROUND(APPROX_PERCENTILE(impact_calls_per_account, 0.5), 2) AS median_impact_calls_per_account
  FROM rep_filtered
  WHERE impact_calls_90d > 0
  GROUP BY 1, 2
),

market_accounts AS (
  SELECT
    p.company_size_segment AS segment,
    COALESCE(m.market, REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-', 1)) AS country,
    COUNT(DISTINCT j.current_parent_company_id) AS assigned_accounts,
    COUNT(DISTINCT j.current_sales_rep_id) AS current_reps,
    SUM(j.cpc_revenue_millicents + j.cpa_revenue_millicents) / 100000.0 AS revenue_90d
  FROM datalake.imhotep_iceberg.jobactivitymetrics j
  JOIN datalake.scss.client_attributes_dim_parent_attributes_current p
    ON j.current_parent_company_id = p.parent_company_id
  LEFT JOIN rep_meta m ON j.current_sales_rep_id = m.sales_rep_id
  WHERE j.dl__yyyymmdd_cst BETWEEN '20260427' AND '20260725'
    AND j.current_sales_team_name IS NOT NULL AND j.current_sales_team_name <> 'None'
    AND j.current_sales_rep_id IS NOT NULL
    AND COALESCE(m.market, REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-', 1), 'XX') <> 'JP'
  GROUP BY 1, 2
),

sbs_country AS (
  SELECT
    p.company_size_segment AS segment,
    CASE
      WHEN COALESCE(p.hq_country, p.billing_country, 'XX') IN ('DE', 'AT', 'CH') THEN 'DACH'
      WHEN COALESCE(p.hq_country, p.billing_country, 'XX') IN ('BE', 'NL', 'LU') THEN 'BNL'
      WHEN COALESCE(p.hq_country, p.billing_country, 'XX') = 'GB' THEN 'UK'
      ELSE COALESCE(p.hq_country, p.billing_country, 'XX')
    END AS country,
    COUNT(DISTINCT j.current_parent_company_id) AS sbs_unassigned_accounts,
    SUM(j.cpc_revenue_millicents + j.cpa_revenue_millicents) / 100000.0 AS sbs_revenue_90d
  FROM datalake.imhotep_iceberg.jobactivitymetrics j
  JOIN datalake.scss.client_attributes_dim_parent_attributes_current p
    ON j.current_parent_company_id = p.parent_company_id
  WHERE j.dl__yyyymmdd_cst BETWEEN '20260427' AND '20260725'
    AND (j.current_sales_team_name IS NULL OR j.current_sales_team_name = 'None')
  GROUP BY 1, 2
),

latest_book_period AS (
  SELECT MAX(time_period) AS time_period
  FROM datalake.sales_data_strategy_dsa.sales_book_summary_v2
),

rep_book_score AS (
  SELECT b.rep_id,
    ROUND(AVG(b.value), 3) AS fy26_book_score,
    ROUND(100.0 * AVG(CASE WHEN b.value > 0 THEN 1.0 ELSE 0 END), 1) AS pct_book_built
  FROM datalake.sales_data_strategy_dsa.sales_book_summary_v2 b
  CROSS JOIN latest_book_period lp
  WHERE b.time_period = lp.time_period
  GROUP BY 1
),

book_score_market AS (
  SELECT rf.segment,
    CASE WHEN rf.country IN ('DE', 'AT', 'CH') THEN 'DACH' ELSE rf.country END AS country,
    COUNT(DISTINCT rf.sales_rep_id) AS reps_scored,
    ROUND(AVG(bs.fy26_book_score), 3) AS avg_fy26_book_score,
    ROUND(AVG(bs.pct_book_built), 1) AS avg_pct_book_built
  FROM rep_filtered rf
  JOIN rep_book_score bs ON rf.sales_rep_id = bs.rep_id
  GROUP BY 1, 2
),

base AS (
  SELECT
    pb.segment,
    pb.country,
    pb.perfect_book_bucket,
    pb.perfect_book_accounts AS perfect_book_target,
    pb.perfect_book_max AS perfect_book_ceiling,
    pb.perfect_book_growth_pct,
    ma.assigned_accounts,
    ma.current_reps,
    ROUND(ma.assigned_accounts * 1.0 / NULLIF(ma.current_reps, 0), 0) AS current_avg_book,
    ROUND(ma.revenue_90d, 0) AS revenue_90d,
    ROUND(ma.assigned_accounts * 1.0 / NULLIF(pb.perfect_book_accounts, 0), 0) AS optimal_headcount_assigned,
    ma.current_reps - ROUND(ma.assigned_accounts * 1.0 / NULLIF(pb.perfect_book_accounts, 0), 0) AS headcount_gap,
    CASE
      WHEN ma.current_reps < ROUND(ma.assigned_accounts * 1.0 / NULLIF(pb.perfect_book_accounts, 0), 0) * 0.90
        AND pb.perfect_book_growth_pct > 0 THEN 'Hire'
      WHEN ma.current_reps > ROUND(ma.assigned_accounts * 1.0 / NULLIF(pb.perfect_book_accounts, 0), 0) * 1.10 THEN 'Optimize'
      WHEN pb.perfect_book_growth_pct <= 0 THEN 'Do Not Hire'
      ELSE 'Hold'
    END AS headcount_recommendation,
    COALESCE(sc.sbs_unassigned_accounts, 0) AS sbs_whitespace_country,
    ROUND(COALESCE(sc.sbs_revenue_90d, 0), 0) AS sbs_revenue_90d,
    bsm.avg_fy26_book_score,
    bsm.avg_pct_book_built,
    CAST(NULL AS DOUBLE) AS fy26_target_pct_book_built,
    op.opp_plateau_book_max,
    op.opp_plateau_rev_per_job,
    ci.coverage_inflection_book_max,
    ci.coverage_at_inflection,
    mc.median_impact_calls_per_account
  FROM perfect_book pb
  JOIN market_accounts ma ON pb.segment = ma.segment AND pb.country = ma.country
  LEFT JOIN sbs_country sc ON pb.segment = sc.segment AND pb.country = sc.country
  LEFT JOIN book_score_market bsm ON pb.segment = bsm.segment AND pb.country = bsm.country
  LEFT JOIN opp_plateau op ON pb.segment = op.segment AND pb.country = op.country
  LEFT JOIN coverage_inflection ci ON pb.segment = ci.segment AND pb.country = ci.country
  LEFT JOIN market_coverage mc ON pb.segment = mc.segment AND pb.country = mc.country
)

SELECT
  b.*,
  GREATEST(0, ROUND((b.perfect_book_target - b.current_avg_book) * b.current_reps, 0)) AS headroom_accounts,
  CASE WHEN b.perfect_book_target > 0
    THEN CAST(FLOOR(COALESCE(b.sbs_whitespace_country, 0) * 1.0 / b.perfect_book_target) AS BIGINT)
    ELSE 0 END AS books_buildable_from_sbs,
  CASE
    WHEN b.opp_plateau_book_max IS NOT NULL
      AND b.current_avg_book >= b.opp_plateau_book_max * 0.95 THEN 'Plateaued'
    WHEN b.opp_plateau_book_max IS NOT NULL THEN 'Growing'
    ELSE 'Unknown'
  END AS opp_pipeline_status,
  CASE
    WHEN b.coverage_inflection_book_max IS NOT NULL
      AND b.current_avg_book > b.coverage_inflection_book_max
      AND b.median_impact_calls_per_account < b.coverage_at_inflection * 0.90 THEN 'Declining'
    WHEN b.median_impact_calls_per_account IS NOT NULL THEN 'OK'
    ELSE 'Unknown'
  END AS coverage_status,
  CASE
    WHEN b.headcount_recommendation = 'Optimize' THEN 'Optimize HC'
    WHEN b.headcount_recommendation = 'Hire'
      AND COALESCE(b.sbs_whitespace_country, 0) >= b.perfect_book_target
      THEN 'Hire + build books from SBS'
    WHEN b.headcount_recommendation = 'Hire' THEN 'Hire'
    WHEN b.current_avg_book < b.perfect_book_target * 0.90
      AND COALESCE(b.sbs_whitespace_country, 0) >= b.perfect_book_target
      THEN CONCAT('Build ', CAST(FLOOR(COALESCE(b.sbs_whitespace_country, 0) * 1.0 / b.perfect_book_target) AS VARCHAR), ' new books from SBS')
    WHEN b.current_avg_book < b.perfect_book_target * 0.90
      AND b.avg_pct_book_built < 50 THEN 'Grow books + improve FY26 score'
    WHEN b.current_avg_book < b.perfect_book_target * 0.90 THEN 'Grow books toward perfect book'
    WHEN b.avg_pct_book_built < 50 THEN 'Improve FY26 book build score'
    WHEN b.opp_plateau_book_max IS NOT NULL
      AND b.current_avg_book >= b.opp_plateau_book_max * 0.95 THEN 'Hold — opp pipeline plateaued'
    ELSE 'On track'
  END AS recommended_action
FROM base b
ORDER BY b.revenue_90d DESC;
