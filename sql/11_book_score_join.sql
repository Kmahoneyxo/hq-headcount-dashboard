-- Book Building FY26 score join (sales_book_summary_v2)
-- Source: Book Building FY26 Tableau workbook → datalake.sales_data_strategy_dsa.sales_book_summary_v2
--
-- Methodology (FY26):
--   10 account-level flags per parent × rep (qtd_spent, sales_covered, sales_impact_covered, etc.)
--   value ∈ {-1, 0, 1} (+ fractional partials)
--   Rep score = AVG(value) across all parent × flag rows (latest time_period)
--   Pct book built = % of flags with value > 0
--
-- Join: rep_id = JAM.current_sales_rep_id

WITH latest_period AS (
  SELECT MAX(time_period) AS time_period
  FROM datalake.sales_data_strategy_dsa.sales_book_summary_v2
),

rep_book_flags AS (
  SELECT
    b.rep_id,
    b.parent_id,
    b.variable,
    b.value,
    b.sales_team_name
  FROM datalake.sales_data_strategy_dsa.sales_book_summary_v2 b
  CROSS JOIN latest_period lp
  WHERE b.time_period = lp.time_period
),

rep_book_score AS (
  SELECT
    rep_id,
    MAX(sales_team_name) AS sales_team_name,
    COUNT(DISTINCT parent_id) AS scored_accounts,
    ROUND(AVG(value), 3) AS fy26_book_score,
    ROUND(100.0 * AVG(CASE WHEN value > 0 THEN 1.0 ELSE 0 END), 1) AS pct_book_built,
    ROUND(100.0 * AVG(CASE WHEN value = 1 THEN 1.0 WHEN value = -1 THEN 0.0 END), 1) AS pct_flags_at_target
  FROM rep_book_flags
  GROUP BY 1
),

rep_meta AS (
  SELECT
    sales_rep_id,
    MAX(sales_market) AS market
  FROM datalake.sales_data_strategy_dsa.current_parent_rep_assignment
  GROUP BY 1
),

rep_market AS (
  SELECT DISTINCT
    j.current_sales_rep_id AS rep_id,
    p.company_size_segment AS segment,
    COALESCE(m.market, REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-', 1)) AS country
  FROM datalake.imhotep_iceberg.jobactivitymetrics j
  JOIN datalake.scss.client_attributes_dim_parent_attributes_current p
    ON j.current_parent_company_id = p.parent_company_id
  LEFT JOIN rep_meta m ON j.current_sales_rep_id = m.sales_rep_id
  WHERE j.dl__yyyymmdd_cst BETWEEN '20260427' AND '20260725'
    AND j.current_sales_team_name IS NOT NULL
    AND j.current_sales_team_name <> 'None'
    AND j.current_sales_rep_id IS NOT NULL
    AND COALESCE(m.market, REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-', 1)) <> 'JP'
)

SELECT
  rm.segment,
  rm.country,
  COUNT(DISTINCT rm.rep_id) AS reps_in_market,
  COUNT(DISTINCT bs.rep_id) AS reps_with_fy26_score,
  ROUND(AVG(bs.fy26_book_score), 3) AS avg_fy26_book_score,
  ROUND(AVG(bs.pct_book_built), 1) AS avg_pct_book_built,
  ROUND(AVG(bs.pct_flags_at_target), 1) AS avg_pct_flags_at_target,
  ROUND(AVG(bs.scored_accounts), 0) AS avg_scored_accounts_per_rep
FROM rep_market rm
LEFT JOIN rep_book_score bs ON rm.rep_id = bs.rep_id
GROUP BY 1, 2
HAVING COUNT(DISTINCT rm.rep_id) >= 5
ORDER BY reps_in_market DESC;
