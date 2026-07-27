-- Week 1 Step 1: Replicate 7/24 pipeline validation
-- JAM × PCID, team × segment, single-day snapshot
-- Run: dp-mcp execute_query (TRINO, interactive)

SELECT
  j.current_sales_team_name AS team,
  p.company_size_segment AS segment,
  COUNT(DISTINCT j.current_parent_company_id) AS accounts,
  COUNT(DISTINCT j.current_sales_rep_id) AS reps,
  SUM(j.cpc_revenue_millicents + j.cpa_revenue_millicents) / 100000.0 AS revenue_usd,
  SUM(j.applies) AS applies,
  SUM(j.connections) AS connections,
  SUM(j.clicks) AS clicks
FROM datalake.imhotep_iceberg.jobactivitymetrics j
JOIN datalake.scss.client_attributes_dim_parent_attributes_current p
  ON j.current_parent_company_id = p.parent_company_id
WHERE j.dl__yyyymmdd_cst = '20260725'  -- latest partition as of 2026-07-27
  AND j.current_sales_team_name IS NOT NULL
  AND j.current_sales_team_name <> 'None'  -- 'None' = unassigned, not NULL
GROUP BY 1, 2
ORDER BY revenue_usd DESC
LIMIT 50;
