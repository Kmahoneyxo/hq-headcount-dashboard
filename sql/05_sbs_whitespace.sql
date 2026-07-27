-- Week 1 Step 5: SBS whitespace sizing
-- Unassigned parent companies: no sales team on JAM and/or null sales_rep_id on PCID

-- Option A: JAM — team is null (unassigned pool on activity table)
SELECT
  p.company_size_segment AS segment,
  COUNT(DISTINCT j.current_parent_company_id) AS unassigned_accounts,
  SUM(j.cpc_revenue_millicents + j.cpa_revenue_millicents) / 100000.0 AS revenue_usd_1d
FROM datalake.imhotep_iceberg.jobactivitymetrics j
JOIN datalake.scss.client_attributes_dim_parent_attributes_current p
  ON j.current_parent_company_id = p.parent_company_id
WHERE j.dl__yyyymmdd_cst = '20260725'
  AND (j.current_sales_team_name IS NULL OR j.current_sales_team_name = 'None')
GROUP BY 1
ORDER BY revenue_usd_1d DESC;

-- Option B: PCID — sales_rep_id null (master data whitespace)
SELECT
  company_size_segment AS segment,
  COUNT(*) AS unassigned_pcids,
  SUM(login_count) AS total_logins
FROM datalake.scss.client_attributes_dim_parent_attributes_current
WHERE sales_rep_id IS NULL
GROUP BY 1
ORDER BY unassigned_pcids DESC;
